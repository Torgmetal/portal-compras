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
  "Erros/desvios (convertidos em %) dentro do erro máximo admissível do equipamento",
  "Incerteza de medição compatível com a aplicação do equipamento",
  "Faixa calibrada cobre a faixa de uso do equipamento",
  "Identificação do equipamento (tag/nº de série) confere com o certificado",
  "Certificado dentro da validade / periodicidade de calibração definida",
  "Certificados dos padrões utilizados na calibração dentro da validade (rastreabilidade)",
];

// Limite de erro sugerido (% do valor nominal) quando nem o certificado nem o
// usuário definem um EMP — apenas um ponto de partida editável (a norma ISO 9001
// §7.1.5 / ISO 10012 não fixa %; o EMP é definido pela aplicação).
export const ERRO_MAX_PERCENT_SUGERIDO = 1.0;

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

// ── Conversão do erro para % (base = valor nominal do ponto) e veredito ──
const num = (v) => (typeof v === "number" && isFinite(v) ? v : (v != null && isFinite(Number(v)) ? Number(v) : null));

// Erro em % do valor nominal. No ponto zero (nominal 0/nulo) usa a faixa (span) como base.
export function erroPercent(valor, nominal, faixaMin, faixaMax) {
  const e = Math.abs(num(valor) ?? 0);
  const n = num(nominal);
  if (n && n !== 0) return (e / Math.abs(n)) * 100;
  const span = Math.abs((num(faixaMax) ?? 0) - (num(faixaMin) ?? 0));
  return span ? (e / span) * 100 : null;
}

// EMP do certificado (absoluto) convertido em % na mesma base do ponto.
export function empPercentDoPonto(empAbs, nominal, faixaMin, faixaMax) {
  const emp = num(empAbs);
  if (emp == null) return null;
  return erroPercent(emp, nominal, faixaMin, faixaMax);
}

// Avalia cada ponto: erro% (+ incerteza%) vs limite%. Retorna pontos anotados + resumo.
// limitePercent: limite do usuário (por equipamento, %). empGlobalAbs: EMP absoluto do
// certificado (fallback). Prioridade do limite efetivo do ponto: usuário → EMP do ponto → EMP global.
export function avaliarPontos(pontos = [], { limitePercent = null, empGlobalAbs = null, faixaMin = null, faixaMax = null } = {}) {
  const lista = Array.isArray(pontos) ? pontos : [];
  const out = lista.map((p) => {
    const eP = erroPercent(p.erro, p.nominal, faixaMin, faixaMax);
    const uP = p.incerteza != null ? erroPercent(p.incerteza, p.nominal, faixaMin, faixaMax) : null;
    const totalP = eP == null ? null : eP + (uP || 0);
    // limite efetivo do ponto: usuário → EMP do ponto → EMP global do cert (todos em %)
    const empPonto = empPercentDoPonto(p.emp ?? empGlobalAbs, p.nominal, faixaMin, faixaMax);
    const limite = limitePercent ?? empPonto ?? null;
    const conforme = limite == null || totalP == null ? null : totalP <= limite + 1e-9;
    return { ...p, erroPercent: eP, incertezaPercent: uP, totalPercent: totalP, limitePercent: limite, conforme };
  });
  const avaliados = out.filter((p) => p.conforme != null);
  const naoConformes = avaliados.filter((p) => p.conforme === false).length;
  return {
    pontos: out,
    totalPontos: out.length,
    avaliados: avaliados.length,
    naoConformes,
    piorErroPercent: out.reduce((m, p) => (p.totalPercent != null && p.totalPercent > m ? p.totalPercent : m), 0),
    resultado: avaliados.length === 0 ? "SEM_LIMITE" : naoConformes > 0 ? "REPROVADO" : "APROVADO",
  };
}

// Padrão (instrumento de referência) vencido? validade < dataRef (data da calibração, senão hoje).
export function padraoVencido(validade, dataRef) {
  if (!validade) return null; // sem data = indeterminado
  const v = new Date(validade); if (isNaN(v)) return null;
  const ref = dataRef ? new Date(dataRef) : new Date();
  return v < ref;
}

// Anota a validade dos padrões usados na calibração.
export function avaliarPadroes(padroes = [], dataCalibracao = null) {
  const lista = Array.isArray(padroes) ? padroes : [];
  const out = lista.map((p) => ({ ...p, vencido: padraoVencido(p.validade, dataCalibracao) }));
  return { padroes: out, vencidos: out.filter((p) => p.vencido === true).length, semData: out.filter((p) => p.vencido == null).length };
}

export const fmtPercent = (v) => (v == null ? "—" : `${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 3 })}%`);
