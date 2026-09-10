// Referências conferidas em documentos externos pertencem ao embarque, não à revisão da LE.
// Preserva somente metadados documentados; nunca transfere baixas/status para uma nova quantidade.
export function preservarReferenciasRomaneio(novas, anteriores) {
  const chave = (m) => String(m?.marca || '').trim().toUpperCase();
  const porMarca = new Map((Array.isArray(anteriores) ? anteriores : []).map(m => [chave(m), m]));
  return novas.map(m => {
    const anterior = porMarca.get(chave(m));
    if (m.romaneio || !anterior?.romaneio || !anterior.romaneioFonteSharepoint?.length) return m;
    return {
      ...m,
      romaneio: anterior.romaneio,
      dataExpedicao: anterior.dataExpedicao ?? null,
      romaneioFonteSharepoint: anterior.romaneioFonteSharepoint,
    };
  });
}
