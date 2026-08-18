import "server-only";
import { prisma } from "./prisma";

// STATUS DE COMPRA por OP — pro painel do PCP (Preparação): o material da obra já foi comprado?
// já chegou? falta comprar?
//
// FONTE DO RECEBIDO = **CMR** (planilha de rastreabilidade do Almoxarifado, importada em
// DocumentoQualidade categoria MATERIAL). Decisão do Vitor (18/08): o Omie não serve — nota que
// chega tarde e material faturado direto pro cliente que nunca gera nota nossa. O CMR é lançado
// no recebimento, fica atualizado e ainda traz corrida/lote/NF/pedido.
// FONTE DO SOLICITADO = as RMs da OP (RMItem.peso, em kg).
//
// Se a OP não tem RM lançada no portal, NÃO inventa "falta comprar": devolve SEM_RM (com alerta),
// mostrando só o que o CMR diz que chegou. (Vitor: honesto > status que mente, que é o problema
// do Omie hoje.)

export const STATUS_COMPRA = {
  RECEBIDO_TOTAL: { label: "Material recebido", cor: "emerald" },
  PARCIAL: { label: "Recebido parcial", cor: "amber" },
  AGUARDANDO_ENTREGA: { label: "Aguardando entrega", cor: "sky" },
  FALTA_COMPRAR: { label: "Falta comprar", cor: "red" },
  SEM_RM: { label: "Sem requisição lançada", cor: "slate", alerta: true },
  SEM_DADOS: { label: "Sem informação", cor: "slate" },
};

const TOL_TOTAL = 0.95; // ≥95% do solicitado = recebido total (sobra/perda de corte é normal)
// Acima disso o "solicitado" não é confiável: chegou MUITO mais que o pedido = a RM do portal
// está incompleta (parte das requisições nunca foi lançada) ou o material veio de outro ano.
// Nesses casos não mostra % (seria 845%, 912%) — trata como sem requisição confiável, mostrando
// só o que chegou. Cobre sozinho as OPs antigas (067/083/085) que o Vitor mandou desconsiderar.
const TETO_CONFIAVEL = 1.5;

/**
 * @param {string[]} opNumeros — números das OPs (formato do portal: "103", "085")
 * @returns {Map<string, {status, recebidoKg, solicitadoKg, pct, nfs, ultimoRecebimento, itensSemPedido, semRM}>}
 */
export async function statusCompraPorOp(opNumeros) {
  const out = new Map();
  const nums = [...new Set((opNumeros || []).filter(Boolean).map(String))];
  if (!nums.length) return out;

  // Recebido (CMR) — soma de peso + NFs + última entrada, por OP
  const cmr = await prisma.documentoQualidade.findMany({
    where: { categoria: "MATERIAL", opNumero: { in: nums } },
    select: { opNumero: true, pesoKg: true, nfNumero: true, dataRecebimento: true },
  });
  const rec = new Map();
  for (const d of cmr) {
    const r = rec.get(d.opNumero) || { kg: 0, nfs: new Set(), ultimo: null, linhas: 0 };
    r.kg += Number(d.pesoKg) || 0;
    r.linhas++;
    if (d.nfNumero) r.nfs.add(d.nfNumero);
    if (d.dataRecebimento && (!r.ultimo || d.dataRecebimento > r.ultimo)) r.ultimo = d.dataRecebimento;
    rec.set(d.opNumero, r);
  }

  // Solicitado (RMs do portal) — peso em kg + itens que ainda não viraram pedido
  const ops = await prisma.oP.findMany({ where: { numero: { in: nums } }, select: { id: true, numero: true } });
  const porId = new Map(ops.map((o) => [o.id, o.numero]));
  const itens = ops.length
    ? await prisma.rMItem.findMany({
        where: { rm: { opId: { in: ops.map((o) => o.id) } }, status: { not: "CANCELADO" } },
        select: { peso: true, status: true, rm: { select: { opId: true } } },
      })
    : [];
  const sol = new Map();
  for (const it of itens) {
    const num = porId.get(it.rm?.opId);
    if (!num) continue;
    const s = sol.get(num) || { kg: 0, semPedido: 0, total: 0 };
    s.kg += Number(it.peso) || 0;
    s.total++;
    if (["PENDENTE", "EM_COTACAO", "COTADO"].includes(it.status)) s.semPedido++;
    sol.set(num, s);
  }

  for (const num of nums) {
    const r = rec.get(num) || { kg: 0, nfs: new Set(), ultimo: null, linhas: 0 };
    const s = sol.get(num) || null;
    const recebidoKg = Math.round(r.kg);
    const solicitadoKg = s ? Math.round(s.kg) : 0;
    let status, pct = null;
    if (!s || solicitadoKg <= 0) {
      // sem requisição no portal — mostra só o que chegou, com alerta (não inventa "falta comprar")
      status = r.linhas > 0 ? "SEM_RM" : "SEM_DADOS";
    } else {
      pct = Math.round((recebidoKg / solicitadoKg) * 100);
      if (recebidoKg > solicitadoKg * TETO_CONFIAVEL) { status = "SEM_RM"; pct = null; }
      else if (pct >= TOL_TOTAL * 100) status = "RECEBIDO_TOTAL";
      else if (recebidoKg > 0) status = "PARCIAL";
      else if (s.semPedido > 0) status = "FALTA_COMPRAR";
      else status = "AGUARDANDO_ENTREGA";
    }
    out.set(num, {
      status, pct, recebidoKg, solicitadoKg,
      nfs: r.nfs.size, linhasCmr: r.linhas,
      ultimoRecebimento: r.ultimo ? r.ultimo.toISOString() : null,
      itensSemPedido: s?.semPedido || 0, itensRm: s?.total || 0,
      semRM: !s || solicitadoKg <= 0 || recebidoKg > solicitadoKg * TETO_CONFIAVEL,
    });
  }
  return out;
}

// Rastreabilidade completa de UMA OP (o que abre ao clicar no chip): corrida/lote, certificado,
// NF, pedido, fornecedor e data — direto do CMR.
export async function rastreabilidadeDaOp(opNumero) {
  const num = String(opNumero || "").trim();
  if (!num) return [];
  const linhas = await prisma.documentoQualidade.findMany({
    where: { categoria: "MATERIAL", opNumero: num },
    orderBy: [{ dataRecebimento: "desc" }],
    select: {
      importRef: true, nome: true, numeroCorrida: true, numeroDocumento: true, norma: true,
      fornecedor: true, pedidoCompra: true, nfNumero: true, dataRecebimento: true,
      pesoKg: true, quantidade: true, arquivoUrl: true, sharepointUrl: true,
    },
  });
  return linhas.map((l) => ({
    // rastreio = "ÍNDICE R" do CMR: o número que identifica a entrada. Vem na frente de tudo.
    rastreio: l.importRef,
    material: l.nome, corrida: l.numeroCorrida, certificado: l.numeroDocumento, norma: l.norma,
    fornecedor: l.fornecedor, pedido: l.pedidoCompra, nf: l.nfNumero,
    recebidoEm: l.dataRecebimento ? l.dataRecebimento.toISOString() : null,
    pesoKg: l.pesoKg, quantidade: l.quantidade,
    arquivo: l.arquivoUrl || l.sharepointUrl || null,
  }));
}

// MATERIAL POR PEÇA (painel de Liberar): pra cada PERFIL das peças da OP, diz se o material
// correspondente JÁ CHEGOU (existe entrada no CMR daquela obra) — o corte precisa saber peça a
// peça, não só um resumo da OP. Vitor 18/08: "o status do material deveria aparecer na frente de
// cada item". Devolve Map<perfilUpper, { recebido, nf, dataRecebimento, material, pesoKg }>.
export async function materialPorPerfil(opNumero, perfis) {
  const out = new Map();
  const num = String(opNumero || "").trim();
  const lista = [...new Set((perfis || []).filter(Boolean).map((x) => String(x).trim()))];
  if (!num || !lista.length) return out;

  const { casarPerfilComOmie } = await import("./casar-omie");
  const entradas = await prisma.documentoQualidade.findMany({
    where: { categoria: "MATERIAL", opNumero: num },
    select: {
      importRef: true, nome: true, nfNumero: true, dataRecebimento: true, pesoKg: true, quantidade: true,
      numeroCorrida: true, numeroDocumento: true, norma: true, fornecedor: true, pedidoCompra: true,
    },
    orderBy: { dataRecebimento: "desc" },
  });
  if (!entradas.length) return out;

  // o matcher fala a língua de {codigo, descricao}; o CMR traz o material em `nome`
  const comoItens = entradas.map((e) => ({ codigo: null, descricao: e.nome, _e: e }));
  const rastro = (e) => ({
    rastreio: e.importRef || null, // "ÍNDICE R" do CMR — o nº da rastreabilidade
    material: e.nome,
    nf: e.nfNumero || null,
    corrida: e.numeroCorrida || null,
    certificado: e.numeroDocumento || null,
    norma: e.norma || null,
    fornecedor: e.fornecedor || null,
    pedido: e.pedidoCompra || null,
    dataRecebimento: e.dataRecebimento ? e.dataRecebimento.toISOString() : null,
    pesoKg: e.pesoKg ?? null,
    quantidade: e.quantidade ?? null,
  });
  for (const perfil of lista) {
    const hit = casarPerfilComOmie(perfil, comoItens);
    if (!hit) continue;
    // O mesmo perfil pode ter chegado em VÁRIAS entradas (corridas/NFs diferentes) — a rastreabilidade
    // da peça precisa de todas. `entradas` já vem da mais recente pra mais antiga.
    const iguais = comoItens.filter((c) => c.descricao === hit.descricao).map((c) => c._e);
    const e = iguais[0];
    out.set(perfil.toUpperCase(), {
      recebido: true,
      ...rastro(e),
      // soma o que chegou daquele material nesta OP (todas as entradas do CMR)
      totalKg: iguais.reduce((a, x) => a + (Number(x.pesoKg) || 0), 0),
      entradas: iguais.map(rastro), // rastreabilidade completa daquele item (corrida/lote, NF, pedido…)
    });
  }
  return out;
}
