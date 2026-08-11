// Avaliação de certificados de calibração (PO-20). Constantes e helpers puros
// (sem prisma / sem server-only) — usados tanto nas rotas quanto na tela.

export const numRAC = (n) => `RAC-${String(n ?? 0).padStart(3, "0")}`;

// Situação de cada critério avaliado.
export const SITUACOES = [
  { value: "CONFORME", label: "Conforme" },
  { value: "NAO_CONFORME", label: "Não conforme" },
  { value: "NA", label: "N/A" },
];

// Critérios de aceitação padrão (PO-20). Editáveis: quando o PO-20 for ajustado,
// basta atualizar esta lista — avaliações já feitas guardam o próprio snapshot.
export const CRITERIOS_CALIBRACAO_PADRAO = [
  "Certificado emitido por laboratório acreditado (RBC/CGCRE) ou com rastreabilidade ao SI",
  "Erros/desvios encontrados dentro da tolerância admissível do equipamento",
  "Incerteza de medição compatível com a aplicação do equipamento",
  "Faixa calibrada cobre a faixa de uso do equipamento",
  "Identificação do equipamento (tag/nº de série) confere com o certificado",
  "Certificado dentro da validade / periodicidade de calibração definida",
];

export const criteriosPadrao = () =>
  CRITERIOS_CALIBRACAO_PADRAO.map((c) => ({ criterio: c, situacao: "NA", observacao: "" }));

// Rótulo do critério de aceitação padrão (resumo que vai no relatório).
export const CRITERIO_ACEITACAO_PADRAO =
  "Aprovado quando todos os critérios aplicáveis estiverem Conformes, conforme PO-20. " +
  "Qualquer critério Não Conforme reprova o certificado até tratativa (recalibração, ajuste ou substituição do equipamento).";

export const CONCLUSAO = {
  PENDENTE: { label: "Pendente", cor: "bg-gray-100 text-gray-600" },
  APROVADO: { label: "Aprovado", cor: "bg-emerald-100 text-emerald-700" },
  REPROVADO: { label: "Reprovado", cor: "bg-red-100 text-red-700" },
};
export const conclusaoLabel = (c) => CONCLUSAO[c]?.label || c || "—";

// Regra do Vitor: só pode Aprovar/Reprovar depois de anexar foto do equipamento + relatório.
export const temAnexos = (av) => !!(av?.fotoEquipamentoUrl && av?.relatorioUrl);

// Sugestão automática da conclusão a partir dos critérios (o avaliador decide/confirma).
export const sugerirConclusao = (criterios = []) => {
  const list = Array.isArray(criterios) ? criterios : [];
  if (list.some((c) => c.situacao === "NAO_CONFORME")) return "REPROVADO";
  if (list.some((c) => c.situacao === "CONFORME")) return "APROVADO";
  return "PENDENTE";
};
