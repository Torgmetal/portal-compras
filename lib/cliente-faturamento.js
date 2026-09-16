// ─── PEDIDOS DO CLIENTE × FATURAMENTO DA TORG (aba do portal do cliente) ───────────────────────
// Vitor (16/09/2026): "uma aba no portal do cliente para acompanhamento dos pedidos de compra dos
// clientes × nossos faturamentos (…) sincronizado o pedido do cliente mais o Omie" e, sobre o
// acesso, "nem todos devem ter acesso a essa área".
//
// ⚠⚠ DADO FINANCEIRO NUNCA SAI POR LINK, SÓ POR LOGIN COM PESSOA NOMEADA. Quem enxerga é o contato
// da OP que a Torg marcou com o papel FATURAMENTO (`OP.clienteContatos[].papeis`), e só nas obras
// em que ele é contato. O portal por token (/portal) continua sem nada financeiro.
//
// ⚠ O CASAMENTO OC ↔ OMIE É PELO CAMPO "número do pedido do cliente" DO PEDIDO DE VENDA
// (`informacoes_adicionais.numero_pedido_cliente`). É assim que a TMSA está lançada; não se digita.
// As parcelas (prevista, faturada, cancelada, atrasada) vêm do cache diário do Omie
// (lib/faturamento-cache, cron das 7h).
import { PAPEIS as _PAPEIS_REF } from "./referencias-cliente";

export const PAPEL_FATURAMENTO = "FATURAMENTO";
export const PAPEIS_CONTATO = [
  { valor: "FATURAMENTO", rotulo: "Pedidos e faturamento", descricao: "vê as OCs, previsões e notas das obras em que é contato" },
];
void _PAPEIS_REF;

/** "OC" + "OC228351-1" → "OC 228351-1"; "OC" + "232301-1" → "OC 232301-1". */
export function rotuloComCodigo(rotulo, codigo) {
  const r = String(rotulo || "").trim(), c = String(codigo || "").trim();
  if (!c) return r;
  if (!r) return c;
  const semRotulo = c.toUpperCase().startsWith(r.toUpperCase()) ? c.slice(r.length).replace(/^[\s:.-]+/, "") : c;
  return `${r} ${semRotulo || c}`;
}

/** O contato tem o papel de ver faturamento? */
export function contatoVeFaturamento(contato) {
  const p = contato?.papeis;
  return Array.isArray(p) && p.includes(PAPEL_FATURAMENTO);
}

/** "OC 232301-1", "oc232301-1", "232301-1" → "2323011" (só o que identifica, para casar dos dois lados). */
export function chaveOC(s) {
  const t = String(s || "").toUpperCase().replace(/^\s*(OC|O\.C\.|PC|AF|PEDIDO)\s*[:.-]?\s*/, "");
  return t.replace(/[^0-9A-Z]/g, "");
}

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const caixaNormal = (t) => String(t || "").toLowerCase().replace(/(^|\s)(\S)/g, (m, a, b) => a + b.toUpperCase()).replace(/\bDe\b/g, "de").replace(/\bMt\b/, "MT");
/** Descrição para o cliente quando a obra não cadastrou uma: o item do pedido de venda ("Armação de Estruturas Metálicas"). */
export function descricaoDoPedidoOmie(pv) {
  const itens = [...new Set((pv?.det || []).map((d) => String(d?.produto?.descricao || "").trim()).filter(Boolean))];
  return itens.length ? caixaNormal(itens[0]) : null;
}
const dataISO = (v) => { if (!v) return null; const m = String(v).match(/^(\d{2})\/(\d{2})\/(\d{4})$/); if (m) return `${m[3]}-${m[2]}-${m[1]}`; const d = new Date(v); return Number.isNaN(+d) ? null : d.toISOString().slice(0, 10); };

/**
 * Situação de um pedido de venda a partir das parcelas do cache do Omie.
 * @returns {{ codigo:"FATURADO"|"PARCIAL"|"VENCIDO"|"AGUARDANDO"|"CANCELADO"|"SEM_OMIE", rotulo:string }}
 */
export function situacaoDoPedido(pedidoCache, hoje = new Date()) {
  if (!pedidoCache) return { codigo: "SEM_OMIE", rotulo: "Aguardando lançamento" };
  const parcelas = pedidoCache.parcelas || [];
  const vivas = parcelas.filter((p) => !/cancel/i.test(p.situacao || ""));
  const faturado = num(pedidoCache.faturado);
  const aFaturar = num(pedidoCache.aFaturar);
  if (parcelas.length && !vivas.length) return { codigo: "CANCELADO", rotulo: "Cancelado" };
  if (aFaturar <= 0.01 && faturado > 0) return { codigo: "FATURADO", rotulo: "Faturado" };
  const h = hoje.toISOString().slice(0, 10);
  // ⚠ "Não Faturado" também contém "fatur": a parcela pendente é a que NÃO começa com faturado/encerrado/cancelado
  const pendente = (p) => !/^(faturad|encerrad|cancelad)/i.test(String(p.situacao || "").trim());
  const vencida = vivas.some((p) => p.atrasado || (pendente(p) && dataISO(p.dataPrevisao) && dataISO(p.dataPrevisao) < h));
  if (faturado > 0) return { codigo: "PARCIAL", rotulo: vencida ? "Parcial · saldo vencido" : "Faturado em parte", vencida };
  return vencida ? { codigo: "VENCIDO", rotulo: "Previsão vencida", vencida } : { codigo: "AGUARDANDO", rotulo: "Aguardando faturamento", vencida: false };
}

/**
 * Cruza as referências do cliente (OCs cadastradas na OP e nos aditivos) com os pedidos de venda do
 * Omie (medições, que carregam a OC) e as parcelas do cache diário. Pura: testável sem banco.
 * @param {{ referencias:Array, medicoes:Array, aditivos:Array, cacheObra:object|null, hoje?:Date }} p
 */
export function cruzarPedidos({ referencias = [], medicoes = [], aditivos = [], cacheObra = null, hoje = new Date(), nfPorCodigo = null }) {
  const numAditivo = new Map((aditivos || []).map((a) => [a.id, a.numero]));
  const filhosDe = (id) => (referencias || []).filter((r) => r.paiId === id);
  const linhas = [];
  const porChave = new Map();
  for (const r of (referencias || []).filter((x) => x.papel === "PEDIDO")) {
    const filhos = filhosDe(r.id);
    const linha = {
      oc: r.codigo, rotulo: r.rotulo || "Pedido", chave: chaveOC(r.codigo), descricao: r.descricao || null,
      itens: filhos.filter((f) => f.papel === "ITEM").map((f) => f.codigo), tags: filhos.filter((f) => f.papel === "TAG").map((f) => f.codigo),
      aditivo: r.aditivoId ? numAditivo.get(r.aditivoId) ?? null : null,
      contratado: r.valor != null ? num(r.valor) : null, pedidosOmie: [], avisos: [], origem: "OP",
    };
    linhas.push(linha);
    if (linha.chave) porChave.set(linha.chave, linha);
  }
  const cachePedidos = new Map(((cacheObra?.pedidos) || []).map((p) => [String(p.numero), p]));
  for (const m of medicoes || []) {
    const pv = m.payload?.pedido_venda_produto || {};
    const ocOmie = pv.informacoes_adicionais?.numero_pedido_cliente || null;
    const chave = chaveOC(ocOmie);
    let linha = chave ? porChave.get(chave) : null;
    if (!linha) {
      linha = { oc: ocOmie, rotulo: "OC", chave, descricao: descricaoDoPedidoOmie(pv), referenciaNF: pv.informacoes_adicionais?.dados_adicionais_nf || null, itens: [], tags: [], aditivo: m.aditivoId ? numAditivo.get(m.aditivoId) ?? null : null, contratado: null, pedidosOmie: [], avisos: [], origem: "OMIE" };
      // ⚠ texto para o CLIENTE: o problema é nosso (falta a OC no nosso pedido), e é assim que se diz
      linha.avisos.push(ocOmie ? "Este pedido ainda não está ligado ao cadastro da obra na Torg — o valor e as notas estão corretos." : "A Torg ainda não registrou o número da sua OC neste pedido; o valor e as notas estão corretos.");
      linhas.push(linha);
      if (chave) porChave.set(chave, linha);
    }
    const pc = cachePedidos.get(String(m.numeroPedidoOmie)) || null;
    const sit = situacaoDoPedido(pc, hoje);
    linha.pedidosOmie.push({
      numero: String(m.numeroPedidoOmie), previsao: dataISO(pv.cabecalho?.data_previsao || m.data), valor: num(pc?.faturado) + num(pc?.aFaturar) || num(m.valorBruto),
      faturado: num(pc?.faturado), aFaturar: pc ? num(pc.aFaturar) : num(m.valorBruto), atrasado: !!sit.vencida,
      situacao: sit, dadosNF: pv.informacoes_adicionais?.dados_adicionais_nf || null, sincronizado: !!pc,
      parcelas: (pc?.parcelas || []).map((p) => { const nf = nfPorCodigo?.get?.(String(p.codigoPedido || "")) || null; return { valor: num(p.valor), situacao: p.situacao || "", data: dataISO(p.dataPrevisao), atrasado: !!p.atrasado, codigoPedido: p.codigoPedido != null ? String(p.codigoPedido) : null, nf }; }),
    });
  }
  for (const l of linhas) {
    l.valorOmie = l.pedidosOmie.reduce((s, p) => s + p.valor, 0);
    l.faturado = l.pedidosOmie.reduce((s, p) => s + p.faturado, 0);
    l.aFaturar = l.pedidosOmie.reduce((s, p) => s + p.aFaturar, 0);
    l.contratado = l.contratado ?? (l.valorOmie || null);
    if (l.contratado != null && l.valorOmie && Math.abs(l.contratado - l.valorOmie) > 1) l.avisos.push(`Valor no Omie (${l.valorOmie.toFixed(2)}) difere do cadastrado na obra (${l.contratado.toFixed(2)}).`);
    const sits = l.pedidosOmie.map((p) => p.situacao.codigo);
    l.situacao = !sits.length ? { codigo: "SEM_OMIE", rotulo: "Aguardando lançamento" }
      : sits.every((s) => s === "FATURADO") ? { codigo: "FATURADO", rotulo: "Faturado" }
      : sits.includes("VENCIDO") || sits.includes("PARCIAL") && l.pedidosOmie.some((p) => p.atrasado) ? { codigo: "VENCIDO", rotulo: l.faturado > 0 ? "Parcial · saldo vencido" : "Previsão vencida" }
      : sits.includes("PARCIAL") ? { codigo: "PARCIAL", rotulo: "Faturado em parte" }
      : sits.every((s) => s === "CANCELADO") ? { codigo: "CANCELADO", rotulo: "Cancelado" }
      : { codigo: "AGUARDANDO", rotulo: "Aguardando faturamento" };
    l.proximaPrevisao = l.pedidosOmie.filter((p) => p.aFaturar > 0 && p.previsao).map((p) => p.previsao).sort()[0] || null;
    // as notas já emitidas (parcelas faturadas), na ordem da data — é o que o cliente confere com o financeiro dele
    // a data que vale é a da EMISSÃO da nota (ConsultarNF); a da parcela é só a prevista
    l.notas = l.pedidosOmie.flatMap((p) => p.parcelas.filter((x) => /^faturad/i.test(x.situacao)).map((x) => ({ data: x.nf?.dataEmissao || x.data, valor: x.valor, pedido: p.numero, numero: x.nf?.numero || null, serie: x.nf?.serie || null, chave: x.nf?.chave || null }))).sort((a, b) => String(a.data).localeCompare(String(b.data)));
    l.canceladas = l.pedidosOmie.reduce((n, p) => n + p.parcelas.filter((x) => /^cancelad/i.test(x.situacao)).length, 0);
    const h = hoje.toISOString().slice(0, 10);
    const pendentesVencidas = l.pedidosOmie.flatMap((p) => p.parcelas.filter((x) => !/^(faturad|encerrad|cancelad)/i.test(x.situacao) && x.data && x.data < h).map((x) => x.data)).sort();
    l.vencidaDesde = pendentesVencidas[0] || (l.situacao.codigo === "VENCIDO" ? l.proximaPrevisao : null);
  }
  const totais = {
    pedidos: linhas.length,
    contratado: linhas.reduce((s, l) => s + (l.contratado || 0), 0),
    faturado: linhas.reduce((s, l) => s + l.faturado, 0),
    aFaturar: linhas.reduce((s, l) => s + l.aFaturar, 0),
    vencido: linhas.filter((l) => l.situacao.codigo === "VENCIDO").reduce((s, l) => s + l.aFaturar, 0),
  };
  return { linhas, totais };
}
