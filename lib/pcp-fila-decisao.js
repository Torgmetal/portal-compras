// Recomendações de consulta. A emissão da GRD continua validando a liberação no servidor.
export function classificarDecisaoPcp(p, setor, c = {}) {
  const total = Math.max(0, Number(p.qte) || 0);
  const feito = Math.max(
    Number(p.produzidoSyneco) || 0,
    Number(p.baixadoQtd) || 0,
    setor === "CORTE" ? Number(p.qteProduzida) || 0 : 0,
  );
  const concluida =
    p.expedida ||
    p.avancouAlem ||
    (total > 0 && feito >= total) ||
    (setor === "CORTE" && p.corteConcluidoEm);
  const saldo = concluida ? 0 : Math.max(0, total - feito);
  const base = {
    saldo,
    motivos: [],
    rs: c.rs || [],
    materialHerdado: !!c.materialHerdado,
  };
  if (concluida) return { ...base, estado: "CONCLUIDA" };
  if (p.foraDoLote)
    return {
      ...base,
      estado: "FORA_DO_LOTE",
      motivos: ["Fora da liberação do Planejamento"],
    };
  if (
    ["CANCELADA", "TERCEIRIZADO"].includes(p.status) ||
    ["CANCELADA", "TERCEIRO"].includes(p.destino)
  )
    return {
      ...base,
      estado: "FORA_DO_LOTE",
      motivos: ["Fora da fila de fabricação interna"],
    };
  const motivos = [];
  if (c.dadosCompletos === false)
    motivos.push("Atualizar conferências: consulta incompleta");
  if (p.destino === "REVISAO") motivos.push("Em revisão pela Engenharia");
  if (p.destino === "AGUARDANDO_MATERIAL") motivos.push("Aguardando material");
  if (!total) motivos.push("Conferir quantidade da peça");
  if (c.material !== true)
    motivos.push(
      c.material === false
        ? "Conferir material e R"
        : "Material e R não conferidos",
    );
  if (c.desenho !== true)
    motivos.push(
      c.desenho === false
        ? "Falta desenho de fabricação"
        : "Reconferir pasta da Engenharia",
    );
  if (setor === "CORTE" && c.maquina !== true)
    motivos.push(
      c.maquina === false
        ? "Falta arquivo de máquina"
        : "Arquivo de máquina não conferido",
    );
  if (setor === "MONTAGEM" && p.prontoMontar !== true)
    motivos.push(
      p.prontoMontar === false
        ? "Falta cortar os croquis"
        : "Conferir composição e corte dos croquis",
    );
  if (!["PROGRAMADA", "INICIADA"].includes(p.programacao?.situacao))
    motivos.push("Programar no Syneco");
  else if (p.programacao.qtdOk !== true)
    motivos.push("Conferir quantidade programada");
  // O trabalho em andamento não vira uma nova sugestão de impressão. Pendências continuam visíveis.
  if (p.grd || feito > 0 || p.programacao?.situacao === "INICIADA")
    return { ...base, estado: "EM_ANDAMENTO", motivos };
  return { ...base, estado: motivos.length ? "PENDENTE" : "LIBERAR", motivos };
}

export function ordenarDecisoesPcp(pecas) {
  const prioridade = (p) =>
    Number(p.prioridade) > 0 ? Number(p.prioridade) : Number.MAX_SAFE_INTEGER;
  return [...pecas].sort(
    (a, b) =>
      prioridade(a) - prioridade(b) ||
      (Number(b.travaConjuntos) || 0) - (Number(a.travaConjuntos) || 0) ||
      String(a.marca).localeCompare(String(b.marca), "pt-BR", {
        numeric: true,
      }),
  );
}

export const FILAS_DECISAO = {
  LIBERAR: "O que liberar agora",
  PENDENTE: "O que precisa de conferência",
  DESTRAVA: "O que destrava a montagem",
  EM_ANDAMENTO: "Já liberadas / em execução",
};
export function pertenceFilaDecisao(p, fila, decisao) {
  if (!decisao) return false;
  if (fila === "DESTRAVA")
    return (
      p.travaConjuntos > 0 &&
      !["CONCLUIDA", "FORA_DO_LOTE"].includes(decisao.estado)
    );
  return decisao.estado === fila;
}
