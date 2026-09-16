// ─── REFERÊNCIAS DO CLIENTE: gravação e leitura ───────────────────────────────
// A parte pura (papéis, rótulos, árvore ↔ linhas) mora em lib/referencias-cliente.js. Aqui é o que
// toca o banco: o cadastro mínimo do cliente, a troca das linhas de um escopo (OP ou aditivo) e o
// recálculo de `OP.refCliente`, que os documentos ao cliente imprimem.
import "server-only";
import { prisma } from "./prisma";
import { DICIONARIOS_INICIAIS, agruparReferencias, montarRefCliente, nomeClienteNormalizado, planificarReferencias, termosEfetivos } from "./referencias-cliente";

/** Dicionário inicial de um cliente pelo nome (TMSA, DANPOWER, MARKO, VALMET…), ou null. */
export function dicionarioInicialDe(nome) {
  const n = nomeClienteNormalizado(nome).toUpperCase();
  if (!n) return null;
  for (const [chave, termos] of Object.entries(DICIONARIOS_INICIAIS)) {
    const k = chave.toUpperCase();
    if (n === k || n.startsWith(k) || k.startsWith(n.split(" ")[0]) && n.split(" ")[0].length >= 4) return termos;
  }
  return null;
}

/**
 * O cliente pelo nome como está em `OP.cliente`. Cria o cadastro mínimo se não existir (com o
 * dicionário inicial quando o nome é conhecido) — o cadastro nasce da própria OP.
 */
export async function clientePorNome(nome, { criar = true, tx = prisma } = {}) {
  const n = nomeClienteNormalizado(nome);
  if (!n) return null;
  const existente = await tx.cliente.findFirst({ where: { nome: { equals: n, mode: "insensitive" } } });
  if (existente || !criar) return existente;
  return tx.cliente.create({ data: { nome: n, termos: dicionarioInicialDe(n) } });
}

/** Termos efetivos de uma OP (pelo `clienteId` ou pelo nome). */
export async function termosDaOP(op, { tx = prisma } = {}) {
  const cli = op?.clienteId
    ? await tx.cliente.findUnique({ where: { id: op.clienteId } })
    : await clientePorNome(op?.cliente, { criar: false, tx });
  return { cliente: cli, termos: termosEfetivos(cli?.termos) };
}

/**
 * Troca as referências de UM escopo — as da OP (aditivoId null) ou as de um aditivo — e recalcula
 * `OP.refCliente` com tudo o que a OP tem. Devolve as linhas gravadas.
 * @param {{ opId:string, aditivoId?:string|null, entrada:object, termos?:object, tx?:object }} p
 */
export async function salvarReferencias({ opId, aditivoId = null, entrada, termos = null, tx = prisma }) {
  const linhas = planificarReferencias(entrada, termos);
  await tx.oPReferencia.deleteMany({ where: { opId, aditivoId } });
  const criadas = [];
  // pais primeiro (PROJETO/PEDIDO/OUTRO), depois ITEM/TAG apontando para o id do pedido
  for (const l of linhas.filter((x) => x.paiIndice == null)) {
    const { paiIndice, ...dados } = l;
    criadas[linhas.indexOf(l)] = await tx.oPReferencia.create({ data: { ...dados, opId, aditivoId } });
  }
  for (const l of linhas.filter((x) => x.paiIndice != null)) {
    const { paiIndice, ...dados } = l;
    const pai = criadas[paiIndice];
    criadas[linhas.indexOf(l)] = await tx.oPReferencia.create({ data: { ...dados, opId, aditivoId, paiId: pai?.id || null } });
  }
  await recalcularRefCliente(opId, tx);
  return criadas.filter(Boolean);
}

/** `OP.refCliente` = PROJETOs + PEDIDOs de toda a OP (base e aditivos). Sem linhas, não mexe no texto manual. */
export async function recalcularRefCliente(opId, tx = prisma) {
  const todas = await tx.oPReferencia.findMany({ where: { opId }, orderBy: [{ aditivoId: "asc" }, { ordem: "asc" }] });
  const texto = montarRefCliente(todas);
  if (texto) await tx.oP.update({ where: { id: opId }, data: { refCliente: texto.slice(0, 500) } });
  return texto;
}

/** Tudo da OP, agrupado: `base` (contrato) e `aditivos` (por id), mais os termos do cliente. */
export async function referenciasDaOP(opId, { tx = prisma } = {}) {
  const op = await tx.oP.findUnique({ where: { id: opId }, select: { id: true, cliente: true, clienteId: true, refCliente: true } });
  if (!op) return null;
  const [{ cliente, termos }, linhas] = await Promise.all([termosDaOP(op, { tx }), tx.oPReferencia.findMany({ where: { opId }, orderBy: { ordem: "asc" } })]);
  const base = agruparReferencias(linhas.filter((l) => !l.aditivoId));
  const aditivos = {};
  for (const l of linhas.filter((l) => l.aditivoId)) (aditivos[l.aditivoId] ||= []).push(l);
  for (const k of Object.keys(aditivos)) aditivos[k] = agruparReferencias(aditivos[k]);
  return { cliente: cliente ? { id: cliente.id, nome: cliente.nome } : null, termos, refCliente: op.refCliente, base, aditivos };
}
