// ─── RECEBIMENTO DE ESTOQUE: ARAME E PENETRANTE SEM OP ───────────────────────────────────────────
//
// ⚠⚠ Vitor (14/10/2026): "ele pede para selecionar a OP — o que não pode ser, pois o Arame será usado
// para várias obras", e depois "para o relatório de líquido penetrante e revelador também". O arame
// entra no CMR sem OP (lib/consumivel-solda.js) e o penetrante é o mesmo frasco para todos os LP:
// amarrar o recebimento a UMA obra obrigava a escolher uma ao acaso e deixava as outras sem ele.
//
// O relatório nasce de ESTOQUE (`opNumero = "EST"`, código RRA-EST-001) e, ASSINADO POR TODOS (a
// mesma regra dos outros — lib/relatorio-inspecao.js), entra na §12 de cada data book aberto cuja obra
// USOU o que ele recebeu:
//   - ARAME pelo R: os R que `consumiveisDaOP` aponta — o arame vigente na data em que cada conjunto
//     foi soldado, o MESMO cálculo do carimbo do desenho e da §06.
//   - PENETRANTE pelo LOTE: os lotes de penetrante, removedor e revelador gravados nos relatórios de
//     LP da obra.
// Uma obra que usou dois lotes recebe os dois relatórios. Obra sem RRA não é problema: quem monta o
// data book cria o recebimento depois (Vitor, 14/10/2026), e o cron das horas comerciais o distribui.
//
// ⚠ O vínculo é RECALCULADO, não acumulado: assinado e usado → entra; qualquer outro caso → sai (só de
// livro aberto — emitido só muda por revisão, lib/databook-revisao.js).
import { prisma } from "./prisma";
import { estaFechado } from "./databook-revisao";
import { consumiveisDaOP } from "./consumivel-solda";
import { assinaturaCompleta } from "./relatorio-inspecao";

import { OP_ESTOQUE, TIPOS_ESTOQUE, ehDeEstoque } from "./recebimento-certificados";
export { OP_ESTOQUE, TIPOS_ESTOQUE, ehDeEstoque };
export const SECAO_ESTOQUE = "12";

const norm = (s) => String(s ?? "").trim().toUpperCase().replace(/\s+/g, "");
const valido = (s) => s && !/^(N\.?A\.?|-+|—)$/.test(s);

/** O que o recebimento recebeu: R (arame) ou lote (penetrante). */
export function chavesDoRecebimento(rel) {
  const itens = Array.isArray(rel?.resultados?.itens) ? rel.resultados.itens : [];
  const campo = rel?.tipo === "RECEBIMENTO_PENETRANTE" ? "lote" : "r";
  return new Set(itens.map((i) => norm(i?.[campo])).filter(valido));
}

/** Os lotes que um relatório de LP usou. */
export function chavesDoLp(lp) {
  const r = lp?.resultados || {};
  return new Set([r.penetranteLote, r.removedorLote, r.reveladorLote].map(norm).filter(valido));
}

async function usoDaObra(livro, tipos) {
  const uso = new Set();
  if (tipos.has("RECEBIMENTO_ARAME")) {
    const opId = livro.opId || (await prisma.oP.findFirst({ where: { numero: livro.opNumero }, select: { id: true } }))?.id;
    for (const c of opId ? await consumiveisDaOP(opId) : []) if (valido(norm(c.rastreio))) uso.add(norm(c.rastreio));
  }
  if (tipos.has("RECEBIMENTO_PENETRANTE")) {
    const lps = await prisma.relatorioInspecao.findMany({ where: { opNumero: livro.opNumero, tipo: "LP" }, select: { resultados: true } });
    for (const lp of lps) for (const k of chavesDoLp(lp)) uso.add(k);
  }
  return uso;
}

// o documento que representa o recebimento nos livros — um só, ligado a vários
async function documentoDoRecebimento(rel, tituloSecao) {
  const dados = {
    nome: `${rel.codigo} — ${rel.titulo || (rel.tipo === "RECEBIMENTO_ARAME" ? "Recebimento de arame de solda" : "Recebimento de penetrante e revelador")}`,
    tipo: `Anexo — ${tituloSecao}`, categoria: "RELATORIO", origem: "inspecao_campo",
    numeroDocumento: rel.codigo, arquivoUrl: `/api/qualidade/inspecoes/${rel.id}/pdf`,
    opNumero: null, dataEmissao: rel.emitidoEm || new Date(), ativo: true,
  };
  if (rel.documentoId) {
    await prisma.documentoQualidade.update({ where: { id: rel.documentoId }, data: dados }).catch(() => {});
    return rel.documentoId;
  }
  const doc = await prisma.documentoQualidade.create({ data: dados, select: { id: true } });
  await prisma.relatorioInspecao.update({ where: { id: rel.id }, data: { documentoId: doc.id } });
  return doc.id;
}

async function tirar(documentoId, secao) {
  await prisma.dataBookSecaoDoc.deleteMany({ where: { documentoId: { in: [documentoId] }, secao: { dataBookId: secao.dataBookId } } });
  if (secao.estado === "ANEXADO" && !(await prisma.dataBookSecaoDoc.count({ where: { secaoId: secao.id } }))) {
    await prisma.dataBookSecao.update({ where: { id: secao.id }, data: { estado: "PENDENTE" } });
  }
}

// assinado por todos segue; o resto sai de todo livro aberto
async function separarAssinados(rels, abertos) {
  const assinados = [];
  for (const rel of rels) {
    if (await assinaturaCompleta(prisma, rel.envioAssinaturaId)) { assinados.push(rel); continue; }
    if (rel.documentoId && abertos.length) {
      await prisma.dataBookSecaoDoc.deleteMany({ where: { documentoId: { in: [rel.documentoId] }, secao: { dataBookId: { in: abertos } } } });
    }
  }
  return assinados;
}

// a §12 de um livro: entra o que a obra usou, sai o que não usou
async function distribuirNaSecao(secao, livro, { assinados, docs, tipos }) {
  const uso = await usoDaObra(livro, tipos);
  const entram = [];
  for (const rel of assinados) {
    if ([...chavesDoRecebimento(rel)].some((k) => uso.has(k))) entram.push(docs.get(rel.id));
    else await tirar(docs.get(rel.id), secao);
  }
  if (!entram.length) return 0;
  await prisma.dataBookSecaoDoc.createMany({ data: entram.map((documentoId) => ({ secaoId: secao.id, documentoId })), skipDuplicates: true });
  if (secao.estado !== "ANEXADO") await prisma.dataBookSecao.update({ where: { id: secao.id }, data: { estado: "ANEXADO" } });
  return entram.length;
}

/**
 * Recalcula onde estão os recebimentos de estoque. Sem argumento, todos (o cron); com `relatorioId`,
 * só aquele (a última assinatura, a edição). Devolve quantos vínculos ficaram.
 */
export async function sincronizarRecebimentosDeEstoque({ relatorioId } = {}) {
  const rels = await prisma.relatorioInspecao.findMany({
    where: { opNumero: OP_ESTOQUE, tipo: { in: [...TIPOS_ESTOQUE] }, ...(relatorioId ? { id: relatorioId } : {}) },
  });
  if (!rels.length) return { relatorios: 0, vinculos: 0 };
  const livros = (await prisma.dataBookQualidade.findMany({
    select: { id: true, opNumero: true, opId: true, status: true, emitidoEm: true, revisao: true },
  })).filter((b) => !estaFechado(b));
  const abertos = livros.map((b) => b.id);
  const secoes = await prisma.dataBookSecao.findMany({
    where: { dataBookId: { in: abertos }, numero: SECAO_ESTOQUE }, select: { id: true, dataBookId: true, titulo: true, estado: true },
  });
  const assinados = await separarAssinados(rels, abertos);
  if (!assinados.length || !secoes.length) return { relatorios: rels.length, vinculos: 0 };

  const tipos = new Set(assinados.map((r) => r.tipo));
  const docs = new Map();
  for (const rel of assinados) docs.set(rel.id, await documentoDoRecebimento(rel, secoes[0].titulo));
  let vinculos = 0;
  for (const secao of secoes) vinculos += await distribuirNaSecao(secao, livros.find((b) => b.id === secao.dataBookId), { assinados, docs, tipos });
  return { relatorios: rels.length, vinculos };
}

/** O `vincularNoDataBook` de um recebimento de estoque — mesma resposta, vários livros. */
export async function vincularRecebimentoDeEstoque(rel) {
  const r = await sincronizarRecebimentosDeEstoque({ relatorioId: rel.id });
  return r.vinculos
    ? { vinculado: true, secao: SECAO_ESTOQUE, livros: r.vinculos }
    : { vinculado: false, secao: SECAO_ESTOQUE, motivo: "recebimento de estoque: entra, assinado, no data book das obras que usaram o R/lote" };
}
