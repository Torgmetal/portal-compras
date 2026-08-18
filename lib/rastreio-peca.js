import "server-only";
import { prisma } from "./prisma";
import { casarPerfilComOmie } from "./casar-omie";

// CASAMENTO DE RASTREABILIDADE — qual CORRIDA/LOTE foi usada em cada peça.
//
// Ideia do Vitor (18/08/2026): "de acordo com as quantidades que temos na LPC dos materiais que
// formam os conjuntos vs o que damos entrada no CMR você já não consegue destinar quais
// rastreabilidades foram usadas para cada perfil que compõe o conjunto? usando a data que foi
// entregue vs a data que foi aberto o apontamento?" — dá, e na maioria das vezes sem precisar
// de rateio nenhum: cada material costuma ter UMA corrida só na OP.
//
// DEMANDA  = peças da LPC com perfil (croqui/avulsa), com a data em que foram CORTADAS
//            (Syneco op. 10/20; fallback corteConcluidoEm / dataProducao).
// OFERTA   = entradas do CMR daquela OP (corrida, certificado, NF, pedido, peso, data).
// REGRA    = a peça só pode ter saído de material RECEBIDO ATÉ o dia em que foi cortada; entre os
//            candidatos, consome em FIFO (o mais antigo primeiro), pelo peso.
//
// ⚠ NADA DE "PROVÁVEL". A 1ª versão escolhia uma corrida por FIFO de peso quando havia mais de
// uma candidata e marcava "provável" — Vitor (18/08) barrou, com razão: "deixar como provável abre
// um precedente enorme para uma auditoria". Rastreabilidade é DEDUÇÃO ou é DESCONHECIDO; não há
// meio-termo defensável num Data Book. O peso do CMR é bruto (barra/chapa inteira) e o da peça é
// líquido — não dá pra deduzir consumo dele. Então o rateio por peso saiu do critério.
//
// Só duas coisas provam alguma coisa aqui, e as duas são fatos verificáveis no CMR:
//   1) o material só teve UMA corrida nesta OP;
//   2) quando teve mais de uma, a peça foi cortada ANTES das outras chegarem (a data elimina).
//
//   DEFINIDA     → sobrou UMA corrida candidata (por 1 ou por 2 acima). Auditável.
//   INDEFINIDA   → 2+ corridas do mesmo material já estavam na fábrica no dia do corte. NÃO se
//                  escolhe nenhuma: lista TODAS. Só quem separou a barra pode dizer qual foi.
//   SEM_CORRIDA  → o material chegou, mas o CMR não tem a corrida preenchida (falha de lançamento)
//   ESTOQUE      → a peça foi cortada ANTES de qualquer entrega desta OP → veio de sobra/estoque
//   SEM_MATERIAL → nenhuma entrada desse perfil no CMR desta OP
//
// PREMISSA declarada (e verdadeira na Torg): o material é comprado e recebido POR OP (RM por OP,
// CMR com a coluna OBRA), então o aço daquela OP é o candidato. Peça cortada antes de qualquer
// entrega cai em ESTOQUE justamente porque essa premissa não se sustenta ali.

export const SITUACAO_RASTREIO = {
  DEFINIDA: { label: "corrida definida", cor: "emerald" },
  INDEFINIDA: { label: "corrida indefinida", cor: "amber", alerta: true },
  SEM_CORRIDA: { label: "sem corrida no CMR", cor: "amber", alerta: true },
  ESTOQUE: { label: "cortada antes da entrega", cor: "amber", alerta: true },
  SEM_MATERIAL: { label: "sem material no CMR", cor: "slate", alerta: true },
};

const soDia = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);

function linhaCmr(c) {
  return {
    // Nº DA RASTREABILIDADE (coluna "ÍNDICE R" do CMR) — é por ele que o Almoxarifado/Qualidade
    // acha o material e o certificado; vem SEMPRE na frente da corrida e do lote. (Vitor 18/08.)
    rastreio: c.importRef || null,
    corrida: c.numeroCorrida || null,
    certificado: c.numeroDocumento || null,
    norma: c.norma || null,
    nf: c.nfNumero || null,
    pedido: c.pedidoCompra || null,
    fornecedor: c.fornecedor || null,
    material: c.nome,
    recebidoEm: c.dataRecebimento ? c.dataRecebimento.toISOString() : null,
    pesoKg: Number(c.pesoKg) || 0,
  };
}

/**
 * Casamento de rastreabilidade de UMA OP.
 * @returns {{ porMarca: Map<string, obj>, resumo: obj }}
 */
export async function rastreioDaOp(opNumero, opId) {
  const num = String(opNumero || "").trim();
  const vazio = { porMarca: new Map(), resumo: { pecas: 0, certa: 0, provavel: 0, semCorrida: 0, estoque: 0, semMaterial: 0, kgTotal: 0, kgRastreado: 0 } };
  if (!num || !opId) return vazio;

  const [cmr, pecas, ordens] = await Promise.all([
    prisma.documentoQualidade.findMany({
      where: { categoria: "MATERIAL", opNumero: num },
      select: { importRef: true, nome: true, numeroCorrida: true, numeroDocumento: true, norma: true, fornecedor: true, pedidoCompra: true, nfNumero: true, dataRecebimento: true, pesoKg: true },
      orderBy: [{ dataRecebimento: "asc" }],
    }),
    prisma.pecaConjunto.findMany({
      where: { opId, perfil: { not: null } },
      select: { marca: true, perfil: true, qte: true, pesoTotalKg: true, tipoPeca: true, corteConcluidoEm: true, dataProducao: true },
    }),
    // data em que a peça foi cortada, pelo Syneco (op. 10 Corte / 20 Preparação)
    prisma.mesOrdem.findMany({
      where: { opId, produzidoUn: { gt: 0 }, OR: [{ setor: { contains: "orte", mode: "insensitive" } }, { setor: { contains: "repara", mode: "insensitive" } }] },
      select: { item: true, dataInicio: true },
    }),
  ]);
  if (!pecas.length) return vazio;

  const cortadoEm = new Map();
  for (const o of ordens) {
    if (!o.item || !o.dataInicio) continue;
    const d = cortadoEm.get(o.item);
    if (!d || o.dataInicio < d) cortadoEm.set(o.item, o.dataInicio);
  }
  const dataDeCorte = (p) => cortadoEm.get(p.marca) || p.corteConcluidoEm || p.dataProducao || null;

  // ── perfil → entradas do CMR (uma passada de matcher por perfil distinto) ───────────────────
  const comoItens = cmr.map((c) => ({ codigo: null, descricao: c.nome, _c: c }));
  const porPerfil = new Map();
  for (const p of pecas) {
    const k = String(p.perfil).trim().toUpperCase();
    if (porPerfil.has(k)) continue;
    const hit = comoItens.length ? casarPerfilComOmie(p.perfil, comoItens) : null;
    porPerfil.set(k, hit ? cmr.filter((c) => c.nome === hit.descricao) : []);
  }

  // ── agrupa as peças pelo MATERIAL que consomem (não pelo perfil: perfis diferentes podem
  //    sair da mesma chapa/barra) e roda o FIFO dentro de cada grupo ───────────────────────────
  const grupos = new Map(); // chave do material → { entradas:[{...c, saldo}], pecas:[] }
  const semMaterial = [];
  for (const p of pecas) {
    const ents = porPerfil.get(String(p.perfil).trim().toUpperCase()) || [];
    if (!ents.length) { semMaterial.push(p); continue; }
    const chave = ents[0].nome;
    const g = grupos.get(chave) || { entradas: ents.map((c) => ({ c, saldo: Number(c.pesoKg) || 0 })), pecas: [] };
    g.pecas.push(p);
    grupos.set(chave, g);
  }

  const porMarca = new Map();
  const resumo = { pecas: pecas.length, definida: 0, porData: 0, indefinida: 0, semCorrida: 0, estoque: 0, semMaterial: semMaterial.length, kgTotal: 0, kgDefinido: 0 };
  for (const p of pecas) resumo.kgTotal += Number(p.pesoTotalKg) || 0;

  for (const p of semMaterial) {
    porMarca.set(p.marca, { situacao: "SEM_MATERIAL", perfil: p.perfil, cortadoEm: soDia(dataDeCorte(p)), usadas: [], candidatas: [] });
  }

  for (const g of grupos.values()) {
    // Confronto de QUANTIDADE do material (LPC × CMR). NÃO decide corrida nenhuma — o peso do CMR
    // é bruto (barra/chapa inteira) e o da peça é líquido, então não dá pra deduzir consumo dele.
    // Serve só pra mostrar que o CMR registra MENOS material do que as peças da LPC pedem: ou
    // ainda falta chegar, ou o recebimento não foi lançado.
    const recebidoKg = g.entradas.reduce((a, e) => a + (Number(e.c.pesoKg) || 0), 0);
    const demandaLpcKg = g.pecas.reduce((a, x) => a + (Number(x.pesoTotalKg) || 0), 0);
    const corridasNaOp = new Set(g.entradas.filter((e) => e.c.numeroCorrida).map((e) => e.c.numeroCorrida));
    const balanco = { recebidoKg: Math.round(recebidoKg), demandaLpcKg: Math.round(demandaLpcKg), demandaAcimaDoRecebido: demandaLpcKg > recebidoKg + 1 };

    for (const p of g.pecas) {
      const corte = dataDeCorte(p);
      // Candidatas = entradas do material RECEBIDAS ATÉ o dia do corte. A peça não pode ter saído
      // de aço que ainda não tinha chegado — é a única eliminação com base em fato.
      const noPrazo = g.entradas.filter((e) => !corte || !e.c.dataRecebimento || e.c.dataRecebimento <= corte);
      const base = { perfil: p.perfil, cortadoEm: soDia(corte), balanco };
      if (!noPrazo.length) {
        porMarca.set(p.marca, { situacao: "ESTOQUE", ...base, usadas: [], candidatas: g.entradas.map((e) => linhaCmr(e.c)) });
        resumo.estoque++;
        continue;
      }
      const comCorrida = noPrazo.filter((e) => e.c.numeroCorrida);
      if (!comCorrida.length) {
        porMarca.set(p.marca, { situacao: "SEM_CORRIDA", ...base, usadas: noPrazo.map((e) => linhaCmr(e.c)), candidatas: [] });
        resumo.semCorrida++;
        continue;
      }
      // Uma corrida distinta entre as candidatas (o mesmo lote pode vir em duas linhas do CMR —
      // NF/peso diferentes, mesma corrida: continua sendo uma só) → DEFINIDA, é dedução.
      const distintas = [...new Set(comCorrida.map((e) => e.c.numeroCorrida))];
      if (distintas.length === 1) {
        const escolhida = comCorrida.filter((e) => e.c.numeroCorrida === distintas[0]).map((e) => linhaCmr(e.c));
        // resolvidaPorData: o material TEM mais de uma corrida na OP, mas as outras chegaram
        // depois do corte — a data foi o que eliminou. Vale registrar: é a prova da dedução.
        const resolvidaPorData = corridasNaOp.size > 1;
        porMarca.set(p.marca, { situacao: "DEFINIDA", ...base, resolvidaPorData, usadas: escolhida, candidatas: [] });
        resumo.definida++;
        if (resolvidaPorData) resumo.porData++;
        resumo.kgDefinido += Number(p.pesoTotalKg) || 0;
        continue;
      }
      // 2+ corridas do mesmo material já estavam na fábrica no dia do corte. NÃO se escolhe:
      // lista todas. Quem separou a barra é que sabe qual foi.
      porMarca.set(p.marca, {
        situacao: "INDEFINIDA", ...base, usadas: [],
        candidatas: distintas.map((cr) => linhaCmr(comCorrida.find((e) => e.c.numeroCorrida === cr).c)),
      });
      resumo.indefinida++;
    }
  }
  return { porMarca, resumo };
}

/**
 * Rastreabilidade de um CONJUNTO: as corridas dos CROQUIS que o compõem — é isso que o Vitor
 * pediu ("quais rastreabilidades foram usadas para cada perfil que compõe o conjunto").
 * Conjunto sem croqui (avulsa/GC) devolve o rastreio da própria marca.
 */
export async function rastreioDoConjunto(opNumero, opId, marcaConjunto) {
  const { porMarca } = await rastreioDaOp(opNumero, opId);
  const links = await prisma.conjuntoCroqui.findMany({
    where: { conjunto: { opId, marca: marcaConjunto } },
    select: { croqui: { select: { marca: true, perfil: true, qte: true, pesoTotalKg: true } } },
  });
  if (!links.length) {
    const r = porMarca.get(marcaConjunto);
    return r ? [{ marca: marcaConjunto, ...r }] : [];
  }
  return links
    .map((l) => ({ marca: l.croqui.marca, perfil: l.croqui.perfil, qte: l.croqui.qte, pesoTotalKg: l.croqui.pesoTotalKg, ...(porMarca.get(l.croqui.marca) || { situacao: "SEM_MATERIAL", usadas: [], candidatas: [] }) }))
    .sort((a, b) => String(a.marca).localeCompare(String(b.marca), "pt-BR", { numeric: true }));
}
