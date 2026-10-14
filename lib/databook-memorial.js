// ─── MEMORIAL DE CÁLCULO NA §03 — O NOME DA SEÇÃO ACOMPANHA ─────────────────────────────────────
//
// Vitor (14/10/2026): o memorial de cálculo entra no data book, "pode ser na seção 3, porém temos
// obras que terá o memorial e outros não terá, então precisamos ver bem como será o nome dessa
// seção". Escolha dele: o nome MUDA SOZINHO — "ARTs e memorial de cálculo" quando há memorial
// anexado, o nome de sempre quando não há. Um título fixo prometeria ao cliente um documento que
// metade das obras não tem.
//
// ⚠ SINCRONIZADO NA LEITURA, não em cada rota que anexa. São mais de dez caminhos que mexem em
// `DataBookSecaoDoc` (anexar, navegar, mover, puxar…); acertar o nome quando o livro é ABERTO na tela
// e quando é GERADO cobre todos eles, inclusive os que vierem. Livro emitido não muda (só por revisão).
import { estaFechado } from "./databook-revisao";
import { SECOES_DATABOOK } from "./databook-secoes";

export const TITULO_03 = SECOES_DATABOOK.find((s) => s.numero === "03").titulo;
export const TITULO_03_COM_MEMORIAL = "ARTs e memorial de cálculo";

const RX_MEMORIAL = /memorial|mem[oó]ria\s+de\s+c[aá]lculo/i;

/** O documento é o memorial? Pelo nome do arquivo (é como ele chega da pasta da Engenharia). */
export const ehMemorial = (doc) => RX_MEMORIAL.test(String(doc?.nome || ""));

export const tituloDaSecao03 = (docs) => ((docs || []).some(ehMemorial) ? TITULO_03_COM_MEMORIAL : TITULO_03);

/** Acerta o nome da §03 de um livro aberto. Devolve o nome que vale (ou null sem §03 / livro fechado). */
export async function sincronizarTitulo03(db, book) {
  if (!book || estaFechado(book)) return null;
  const secao = await db.dataBookSecao.findFirst({
    where: { dataBookId: book.id, numero: "03" },
    select: { id: true, titulo: true, documentos: { select: { documentoId: true } } },
  });
  if (!secao) return null;
  const ids = secao.documentos.map((d) => d.documentoId);
  const docs = ids.length ? await db.documentoQualidade.findMany({ where: { id: { in: ids } }, select: { id: true, nome: true } }) : [];
  const titulo = tituloDaSecao03(docs);
  if (titulo !== secao.titulo) await db.dataBookSecao.update({ where: { id: secao.id }, data: { titulo } });
  return titulo;
}
