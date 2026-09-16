// A parte que toca o banco da aba "Pedidos e faturamento" do cliente (a regra pura está em
// lib/cliente-faturamento.js).
import "server-only";
import { prisma } from "./prisma";
import { lerCacheFaturamento } from "./faturamento-cache";
import { contatoVeFaturamento, cruzarPedidos } from "./cliente-faturamento";
import { notasDasParcelas } from "./notas-omie";

const soNum = (n) => String(n ?? "").replace(/\D/g, "").padStart(3, "0");
const SELECT_OP = { id: true, numero: true, cliente: true, obra: true, status: true, refCliente: true, clienteContatos: true, kickoff: { select: { pedidoCompraCliente: true } } };

/**
 * Tudo que identifica a obra para o CLIENTE, de todas as fontes: referências cadastradas (com o
 * rótulo dele), o texto livre da OP, a OC do Kick Off e o que está gravado nos pedidos de venda.
 * Vitor (16/09/2026): "trazer todos os dados do cliente, TPR, ETC, OC, tudo que for possível".
 */
export function identificacaoDaObra(op, referencias, medicoes) {
  const por = (papel) => referencias.filter((r) => r.papel === papel).map((r) => ({ rotulo: r.rotulo, codigo: r.codigo, aditivoId: r.aditivoId || null }));
  const nosPedidos = [...new Set((medicoes || []).flatMap((m) => { const ia = m.payload?.pedido_venda_produto?.informacoes_adicionais || {}; return [ia.dados_adicionais_nf, ia.numero_pedido_cliente ? `OC ${ia.numero_pedido_cliente}` : null]; }).map((x) => String(x || "").replace(/\s*\|\s*/g, " · ").trim()).filter(Boolean))];
  return {
    projetos: por("PROJETO"), pedidos: por("PEDIDO"), itens: por("ITEM"), tags: por("TAG"), outros: por("OUTRO"),
    texto: op.refCliente || null,
    pedidoKickoff: op.kickoff?.pedidoCompraCliente || null,
    nosPedidos,
  };
}

/** As OPs em que este e-mail é contato COM o papel FATURAMENTO. */
export async function opsComFaturamentoPara(email) {
  const e = String(email || "").trim().toLowerCase();
  if (!e) return [];
  // JSONB @> [{"email": …}] casa o objeto que contém a chave; o papel é conferido em JS
  const ops = await prisma.oP.findMany({
    where: { clienteContatos: { array_contains: [{ email: e }] } },
    select: SELECT_OP,
    orderBy: { numero: "asc" },
  });
  // o e-mail pode estar gravado com outra caixa
  const todas = ops.length ? ops : await prisma.oP.findMany({ where: { clienteContatos: { not: { equals: [] } } }, select: SELECT_OP, orderBy: { numero: "asc" } });
  return todas.filter((op) => (Array.isArray(op.clienteContatos) ? op.clienteContatos : []).some((c) => String(c?.email || "").toLowerCase() === e && contatoVeFaturamento(c)));
}

/**
 * Tudo da aba para um e-mail: obras (com as linhas OC × Omie), totais e a hora da sincronização.
 * `temAcesso: false` quando o e-mail não tem o papel em obra nenhuma.
 */
export async function faturamentoDoCliente(email) {
  const ops = await opsComFaturamentoPara(email);
  if (!ops.length) return { temAcesso: false, obras: [], totais: null, sincronizadoEm: null };
  const cache = await lerCacheFaturamento();
  const porNumero = new Map(((cache?.obras) || []).map((o) => [soNum(o.numeroOp), o]));
  const obras = [];
  for (const op of ops) {
    const [referencias, medicoes, aditivos] = await Promise.all([
      prisma.oPReferencia.findMany({ where: { opId: op.id }, orderBy: { ordem: "asc" } }),
      prisma.oPMedicao.findMany({ where: { opId: op.id }, orderBy: { numeroPedidoOmie: "asc" }, select: { numeroPedidoOmie: true, data: true, valorBruto: true, aditivoId: true, payload: true } }),
      prisma.aditivo.findMany({ where: { opId: op.id }, select: { id: true, numero: true, descricao: true, status: true } }),
    ]);
    const cacheObra = porNumero.get(soNum(op.numero)) || null;
    // o número da NF de cada parcela faturada (guardado; consulta o Omie só para as novas)
    const faturadas = (cacheObra?.pedidos || []).flatMap((p) => (p.parcelas || []).filter((x) => /^faturad/i.test(x.situacao || "")).map((x) => ({ codigoPedido: x.codigoPedido, numero: p.numero })));
    const nfPorCodigo = await notasDasParcelas(faturadas).catch(() => new Map());
    const { linhas, totais } = cruzarPedidos({ referencias, medicoes, aditivos, cacheObra, nfPorCodigo });
    const projetos = referencias.filter((r) => r.papel === "PROJETO").map((r) => `${r.rotulo} ${r.codigo}`);
    obras.push({
      opNumero: op.numero, obra: op.obra, cliente: op.cliente, status: op.status, projetos, refCliente: op.refCliente,
      identificacao: identificacaoDaObra(op, referencias, medicoes),
      pctFaturado: totais.contratado ? Math.round((totais.faturado / totais.contratado) * 100) : 0,
      linhas, totais,
    });
  }
  const totais = obras.reduce((t, o) => ({ pedidos: t.pedidos + o.totais.pedidos, contratado: t.contratado + o.totais.contratado, faturado: t.faturado + o.totais.faturado, aFaturar: t.aFaturar + o.totais.aFaturar, vencido: t.vencido + o.totais.vencido }), { pedidos: 0, contratado: 0, faturado: 0, aFaturar: 0, vencido: 0 });
  return { temAcesso: true, obras, totais, sincronizadoEm: cache?.atualizadoEm || null };
}
