// A escolha é feita uma vez e persistida: revisão não troca a identidade do book.
export function templateInicial(book) {
  if (book.templateVisual) return book.templateVisual;
  const fechado = ['EMITIDO', 'EM_ASSINATURA', 'ENVIADO_CLIENTE', 'ACEITO'].includes(book.status);
  return fechado || book.emitidoEm || book.revisao > 0 || book.revisoes?.length || book.teveRevisao || book.teveAssinatura
    ? 'LEGADO' : 'TORG_2026';
}
export const usaTemplateNovo = (book) => book?.templateVisual === 'TORG_2026';
