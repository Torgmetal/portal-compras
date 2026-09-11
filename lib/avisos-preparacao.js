// Grupos exclusivos: uma marca sem os dois arquivos aparece no primeiro aviso.
export const materialResolvido = (p) => ["ENTREGUE", "NA_OP"].includes(p?.material)
  || (p?.material === "ESTOQUE" && !!p?.materialRInformado);

export function avisosPreparacao(pecas) {
  const resumir = (itens) => ({ itens, marcas: itens.length, quantidade: itens.reduce((n, p) => n + (Number(p.qte) || 0), 0) });
  return {
    semDesenho: resumir(pecas.filter((p) => p.temDesenho === false)),
    semMaquina: resumir(pecas.filter((p) => p.temDesenho === true && p.temMaquina === false)),
  };
}
