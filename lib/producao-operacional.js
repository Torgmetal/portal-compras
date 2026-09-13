// Apresentação operacional: conserva as regras e os saldos das fontes existentes.
export const ETAPAS = {
  CORTE: "Corte",
  MONTAGEM: "Montagem",
  SOLDA: "Solda",
  ACABAMENTO: "Acabamento",
  JATO: "Jato",
  PINTURA: "Pintura",
  EXPEDICAO: "Expedição",
};
export const numero = (v) => Math.max(0, Number(v) || 0);
export function resumirPeca(p) {
  const total = numero(p.qte);
  const feito = Math.max(numero(p.produzidoSyneco), numero(p.baixadoQtd));
  const saldo = Math.max(0, total - feito);
  const motivos = [];
  if (p.destino === "AGUARDANDO_MATERIAL") motivos.push("Aguardando material");
  if (p.destino === "REVISAO") motivos.push("Em revisão");
  if (p.destino === "CANCELADA") motivos.push("Cancelada");
  if (p.destino === "TERCEIRO") motivos.push("Com terceiro");
  if (p.prontoMontar === false) motivos.push("Croquis pendentes");
  if (p.foraDoLote) motivos.push("Fora do lote liberado");
  if (p.avancouAlem && saldo > 0)
    motivos.push("Conciliar apontamento da etapa anterior");
  const situacao =
    p.avancouAlem && saldo > 0
      ? "CONCILIAR"
      : saldo === 0 && total > 0
        ? "CONCLUIDA"
        : motivos.length
          ? "PENDENCIA"
          : feito > 0 || p.programacao?.situacao === "INICIADA"
            ? "EM_ANDAMENTO"
            : "A_INICIAR";
  const proxima =
    situacao === "CONCILIAR"
      ? "Conferir apontamentos; não repetir a operação"
      : situacao === "CONCLUIDA"
        ? "Conferir próxima etapa"
        : motivos[0] ||
          (p.programacao?.situacao === "LIBERADA_SEM_ORDEM"
            ? "Conferir lançamento da ordem"
            : p.programacao?.situacao === "NAO_LANCADA"
              ? "Conferir programação no PCP"
              : "Conferir programação e desenho desta etapa");
  return { total, feito, saldo, motivos, situacao, proxima };
}
export function agruparMateriais(pecas) {
  const grupos = new Map();
  for (const p of pecas) {
    const perfil = String(p.perfil || "Sem perfil informado").trim();
    const chave = perfil.toUpperCase();
    if (!grupos.has(chave))
      grupos.set(chave, {
        perfil,
        unidades: 0,
        marcas: [],
        rastreios: [],
        recebido: false,
      });
    const g = grupos.get(chave);
    g.unidades += numero(p.qte);
    g.marcas.push(p);
    g.recebido ||= p.material?.recebido === true;
    const r = p.material?.rastreio;
    if (r && !g.rastreios.some((x) => x.rastreio === r))
      g.rastreios.push({
        rastreio: r,
        corrida: p.material.corrida,
        nf: p.material.nf,
      });
  }
  return [...grupos.values()];
}
