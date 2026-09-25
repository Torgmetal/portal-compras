// O aviso do data book depois de criar um relatório — puro, usado na tela.
//
// ⚠ Com "só relatório assinado entra no data book" (Vitor, 25/09/2026), ficar de fora na criação é o
// normal: a última assinatura é que põe o relatório no livro. O ⚠ fica para o que é problema de
// verdade (OP sem data book, seção que não existe).
const tituloDe = (v) => (v?.secaoTitulo ? ` (${v.secaoTitulo})` : "");

export function textoDoVinculo(v) {
  if (v?.vinculado) return `Entrou na seção ${v.secao} do data book${tituloDe(v)}.`;
  if (v?.aguardaAssinatura) return `Entra na seção ${v.secao} do data book${tituloDe(v)} quando todos assinarem.`;
  const motivo = String(v?.motivo || "seção não encontrada").replace(/\.$/, "");
  return `⚠ Não entrou no data book: ${motivo}.`;
}
