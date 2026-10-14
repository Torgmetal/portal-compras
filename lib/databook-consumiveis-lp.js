// ─── CERTIFICADOS DO PENETRANTE, REMOVEDOR E REVELADOR NA §06 ─────────────────────────────────────
//
// Vitor (14/10/2026): "precisamos inserir uma forma de conseguir colocar o certificado dos consumíveis dos LPs e
// reveladores — o ideal seria puxar a informação de cada relatório emitido e já puxar os certificados scaneados
// sozinho". Seção escolhida por ele: a §06, junto do arame (é seção de certificado, imprime a rastreabilidade).
//
// De onde vem cada coisa:
//   - os LOTES, dos relatórios de LP da obra ASSINADOS POR TODOS (penetrante, removedor e revelador — N.A. não conta);
//   - o CERTIFICADO, do CMR pelo lote (`numeroCorrida`), só de produto de LP (o mesmo filtro do recebimento) — um
//     lote de chapa com o mesmo texto não entra;
//   - o PDF escaneado é o do próprio lançamento do CMR: entra no volume quando o Almoxarifado digitalizar.
//
// ⚠ RECALCULA, NÃO ACUMULA — mas só no que é DELE: certificado de LP que nenhum LP assinado usa sai; o do arame
// (e qualquer outro que alguém pôs na §06) nunca é tocado. E o que alguém TIROU à mão não volta (mesma regra do
// vínculo automático de certificados — o AuditLog REMOVER_DOC_SECAO_DATABOOK).
//
// ⚠ O NOME DA §06 ACOMPANHA, como a §03 com o memorial: "…de solda e de líquido penetrante" só quando há certificado
// de LP. Livro emitido não muda (só por revisão).
import { prisma } from "./prisma";
import { estaFechado } from "./databook-revisao";
import { SECOES_DATABOOK } from "./databook-secoes";
import { DO_CMR } from "./cmr-origens";
import { certificadoDaClasse } from "./recebimento-certificados";
import { chavesDoLp } from "./recebimento-estoque";
import { assinaturaCompleta } from "./relatorio-inspecao";

export const TITULO_06 = SECOES_DATABOOK.find((s) => s.numero === "06").titulo;
export const TITULO_06_COM_LP = "Certificados de consumíveis de solda e de líquido penetrante";

const ehDeLp = (doc) => certificadoDaClasse("RECEBIMENTO_PENETRANTE", doc?.nome);
const norm = (s) => String(s ?? "").trim().toUpperCase().replace(/\s+/g, "");

export const tituloDaSecao06 = (docs) => ((docs || []).some(ehDeLp) ? TITULO_06_COM_LP : TITULO_06);

// os lotes que os LP ASSINADOS da obra usaram
async function lotesDaObra(opNumero) {
  const lps = await prisma.relatorioInspecao.findMany({
    where: { opNumero, tipo: "LP", envioAssinaturaId: { not: null } },
    select: { codigo: true, envioAssinaturaId: true, resultados: true },
  });
  const lotes = new Set();
  for (const lp of lps) {
    if (!(await assinaturaCompleta(prisma, lp.envioAssinaturaId))) continue;
    for (const k of chavesDoLp(lp)) lotes.add(k);
  }
  return lotes;
}

async function sincronizarLivro(livro, cmrLp) {
  const secao = await prisma.dataBookSecao.findFirst({
    where: { dataBookId: livro.id, numero: "06" },
    select: { id: true, titulo: true, estado: true, documentos: { select: { documentoId: true } } },
  });
  if (!secao) return 0;
  const lotes = await lotesDaObra(livro.opNumero);
  const removidos = new Set((await prisma.auditLog.findMany({
    where: { action: "REMOVER_DOC_SECAO_DATABOOK", entity: "DataBookSecao", entityId: secao.id },
    select: { diff: true },
  })).map((a) => a.diff?.documentoId).filter(Boolean));
  const querem = cmrLp.filter((d) => lotes.has(norm(d.numeroCorrida)) && !removidos.has(d.id)).map((d) => d.id);

  const ids = secao.documentos.map((d) => d.documentoId);
  const atuais = ids.length ? await prisma.documentoQualidade.findMany({ where: { id: { in: ids } }, select: { id: true, nome: true } }) : [];
  const sobram = atuais.filter((d) => ehDeLp(d) && !querem.includes(d.id)).map((d) => d.id);
  if (sobram.length) await prisma.dataBookSecaoDoc.deleteMany({ where: { secaoId: secao.id, documentoId: { in: sobram } } });
  const novos = querem.filter((id) => !ids.includes(id));
  if (novos.length) await prisma.dataBookSecaoDoc.createMany({ data: novos.map((documentoId) => ({ secaoId: secao.id, documentoId })), skipDuplicates: true });

  const ficam = [...atuais.filter((d) => !sobram.includes(d.id)), ...cmrLp.filter((d) => novos.includes(d.id))];
  const titulo = tituloDaSecao06(ficam);
  const estado = ficam.length ? "ANEXADO" : secao.estado === "ANEXADO" ? "PENDENTE" : secao.estado;
  if (titulo !== secao.titulo || estado !== secao.estado) {
    await prisma.dataBookSecao.update({ where: { id: secao.id }, data: { ...(titulo !== secao.titulo ? { titulo } : {}), ...(estado !== secao.estado ? { estado } : {}) } });
  }
  return novos.length;
}

/** Uma rodada (o cron, ou a última assinatura de um LP com `opNumero`). Devolve quantos certificados entraram. */
export async function sincronizarConsumiveisLp({ opNumero } = {}) {
  const livros = (await prisma.dataBookQualidade.findMany({
    where: opNumero ? { opNumero } : {},
    select: { id: true, opNumero: true, status: true, emitidoEm: true, revisao: true },
  })).filter((b) => b.opNumero && !estaFechado(b));
  if (!livros.length) return { livros: 0, vinculados: 0 };
  const cmrLp = (await prisma.documentoQualidade.findMany({
    where: { ...DO_CMR, ativo: true },
    select: { id: true, importRef: true, nome: true, numeroCorrida: true },
  })).filter(ehDeLp);
  let vinculados = 0;
  for (const livro of livros) vinculados += await sincronizarLivro(livro, cmrLp);
  return { livros: livros.length, vinculados };
}
