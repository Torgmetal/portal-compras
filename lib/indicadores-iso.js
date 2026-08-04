// Definição canônica dos Indicadores da Qualidade (ISO 9001) — o "gêmeo digital"
// da planilha INDICADORES DA QUALIDADE_ACOMPANHAMENTO. Fonte única de verdade:
// nome, o que mede, como se mede, meta e DE ONDE o portal tira o número.
//
// fonte:
//   "auto"     → calculado de um registro real do portal (à prova de fraude)
//   "parcial"  → calculável, com ressalva de dado (ver `nota`)
//   "pendente" → ainda não há onde registrar no portal (precisa de módulo novo)
//
// meta.dir: "min" (quanto maior melhor, ≥) | "max" (quanto menor melhor, ≤)

export const PROCESSOS = ["COMERCIAL", "ENGENHARIA", "COMPRAS", "PRODUCAO", "QUALIDADE", "RH"];
export const PROCESSO_LABEL = {
  COMERCIAL: "Comercial", ENGENHARIA: "Engenharia", COMPRAS: "Compras",
  PRODUCAO: "Produção", QUALIDADE: "Qualidade", RH: "Recursos Humanos e Segurança",
};

export const INDICADORES_ISO = [
  // ── Comercial ──
  { id: "conversao_propostas", processo: "COMERCIAL", nome: "Taxa de Conversão de Propostas",
    oQueMede: "Eficiência em transformar propostas em contratos fechados", comoSeMede: "(Propostas fechadas ÷ propostas com desfecho) × 100",
    meta: { dir: "min", valor: 15, unidade: "%" }, freq: "Mensal", fonte: "auto" },
  { id: "aderencia_prazo_proposta", processo: "COMERCIAL", nome: "Aderência ao Prazo de Entrega da Proposta",
    oQueMede: "Cumprimento do prazo interno de resposta ao cliente", comoSeMede: "(Propostas enviadas dentro do prazo interno ÷ total enviado) × 100",
    meta: { dir: "min", valor: 95, unidade: "%" }, freq: "Mensal", fonte: "parcial", nota: "Prazo interno assumido em 5 dias úteis (configurável)." },
  { id: "csat", processo: "COMERCIAL", nome: "Satisfação do Cliente (CSAT)",
    oQueMede: "Percepção do cliente sobre prazo, qualidade e atendimento", comoSeMede: "Média das notas da pesquisa de satisfação",
    meta: { dir: "min", valor: 85, unidade: "%" }, freq: "Trimestral", fonte: "pendente", nota: "Precisa da pesquisa de satisfação (CSAT) no portal." },

  // ── Engenharia ──
  { id: "aderencia_prazo_projeto", processo: "ENGENHARIA", nome: "Aderência ao Prazo de Entrega do Projeto",
    oQueMede: "% de projetos entregues na data acordada (cronograma)", comoSeMede: "(Tarefas de engenharia concluídas no prazo ÷ concluídas) × 100",
    meta: { dir: "min", valor: 92, unidade: "%" }, freq: "Mensal", fonte: "auto", nota: "Depende de a data real de conclusão estar preenchida no cronograma." },
  { id: "erros_projeto", processo: "ENGENHARIA", nome: "Índice de Erros de Projeto (RNC)",
    oQueMede: "Qualidade e assertividade do projeto antes da execução", comoSeMede: "(Nº de erros/RNC de projeto ÷ projetos liberados) × 100",
    meta: { dir: "max", valor: 1, unidade: "%" }, freq: "Mensal", fonte: "pendente", nota: "Precisa do registro de Não Conformidades (RNC)." },

  // ── Compras ──
  { id: "retorno_orcamento", processo: "COMPRAS", nome: "Retorno de Orçamento",
    oQueMede: "Tempo médio de resposta das cotações", comoSeMede: "Média de dias úteis entre a solicitação e a resposta da cotação",
    meta: { dir: "max", valor: 4, unidade: "dias úteis" }, freq: "Mensal", fonte: "auto" },
  { id: "compras_fornecedor_b", processo: "COMPRAS", nome: "Compras de fornecedores nível “B”",
    oQueMede: "% de compras com fornecedores homologados (IQF ≥ 75%)", comoSeMede: "(Valor comprado de fornecedores IQF ≥ 75% ÷ total comprado) × 100",
    meta: { dir: "min", valor: 85, unidade: "%" }, freq: "Mensal", fonte: "pendente", nota: "Precisa da avaliação de fornecedores (IQF)." },

  // ── Produção ──
  { id: "prazo_fabricacao", processo: "PRODUCAO", nome: "Cumprimento dos Prazos de Fabricação",
    oQueMede: "% de OPs concluídas dentro do período planejado", comoSeMede: "(OPs concluídas no prazo ÷ OPs concluídas) × 100",
    meta: { dir: "min", valor: 90, unidade: "%" }, freq: "Mensal", fonte: "parcial", nota: "Depende de a data real de conclusão da OP estar preenchida." },
  { id: "retrabalho", processo: "PRODUCAO", nome: "Retrabalho",
    oQueMede: "% de peças que precisaram de retrabalho", comoSeMede: "(Peças retrabalhadas ÷ peças produzidas) × 100",
    meta: { dir: "max", valor: 1.5, unidade: "%" }, freq: "Mensal", fonte: "pendente", nota: "O Syneco entrega retrabalho zerado — precisa de captura real." },

  // ── Qualidade ──
  { id: "rnc_cliente", processo: "QUALIDADE", nome: "Índice de RNCs Recebidas do Cliente",
    oQueMede: "Nº de RNCs emitidas pelo cliente por falhas no produto/serviço", comoSeMede: "Nº de RNCs pertinentes recebidas do cliente no período",
    meta: { dir: "max", valor: 8, unidade: "RNCs" }, freq: "Mensal", fonte: "pendente", nota: "Precisa do registro de Não Conformidades (RNC)." },
  { id: "recorrencia_nc", processo: "QUALIDADE", nome: "Recorrência de Não Conformidades",
    oQueMede: "% de NCs que voltaram a ocorrer após ação corretiva", comoSeMede: "(NCs recorrentes ÷ total de NCs) × 100",
    meta: { dir: "max", valor: 5, unidade: "%" }, freq: "Mensal", fonte: "pendente", nota: "Precisa do registro de Não Conformidades (RNC)." },
  { id: "plano_auditorias", processo: "QUALIDADE", nome: "Cumprimento do Plano de Auditorias Internas",
    oQueMede: "% de auditorias internas executadas vs. planejado", comoSeMede: "(Auditorias realizadas ÷ auditorias planejadas) × 100",
    meta: { dir: "min", valor: 100, unidade: "%" }, freq: "Semestral", fonte: "auto" },
  { id: "plano_calibracao", processo: "QUALIDADE", nome: "Cumprimento do Plano de Calibração",
    oQueMede: "% de instrumentos calibrados dentro do prazo", comoSeMede: "(Instrumentos calibrados no prazo ÷ total) × 100",
    meta: { dir: "min", valor: 100, unidade: "%" }, freq: "Mensal", fonte: "pendente", nota: "Precisa do registro de instrumentos e calibração." },

  // ── RH e Segurança ──
  { id: "atendimento_competencias", processo: "RH", nome: "Atendimento das Competências",
    oQueMede: "% de colaboradores com as competências da função atendidas", comoSeMede: "(Colaboradores com competências atendidas ÷ avaliados) × 100",
    meta: { dir: "min", valor: 50, unidade: "%" }, freq: "Trimestral", fonte: "auto", nota: "Preenche conforme o RH lança as avaliações na Matriz de Competências." },
  { id: "absenteismo", processo: "RH", nome: "Absenteísmo",
    oQueMede: "% de horas de ausência sobre as horas previstas", comoSeMede: "(Horas de ausência ÷ horas previstas) × 100",
    meta: { dir: "max", valor: 2, unidade: "%" }, freq: "Mensal", fonte: "parcial", nota: "Hoje considera afastamentos formais; o ideal é a falta do ponto." },
  { id: "turnover", processo: "RH", nome: "Turnover (Taxa de Rotatividade)",
    oQueMede: "Rotatividade de pessoal no mês", comoSeMede: "((admissões + desligamentos) ÷ 2 ÷ nº médio de colaboradores) × 100",
    meta: { dir: "max", valor: 3, unidade: "%" }, freq: "Mensal", fonte: "auto" },
  { id: "acidentes_afastamento", processo: "RH", nome: "Índice de acidente com afastamento",
    oQueMede: "Nº de acidentes de trabalho com afastamento", comoSeMede: "Nº de acidentes com afastamento no período",
    meta: { dir: "max", valor: 0, unidade: "acidentes" }, freq: "Mensal", fonte: "auto" },
];

// Farol vs meta. Retorna "verde" | "amarelo" | "vermelho" | null (sem dado).
export function farol(valor, meta) {
  if (valor == null || Number.isNaN(valor)) return null;
  const { dir, valor: alvo } = meta;
  if (dir === "min") {
    if (valor >= alvo) return "verde";
    if (valor >= alvo * 0.9) return "amarelo";
    return "vermelho";
  }
  // max (≤)
  if (valor <= alvo) return "verde";
  if (alvo === 0) return valor === 0 ? "verde" : "vermelho";
  if (valor <= alvo * 1.1) return "amarelo";
  return "vermelho";
}

export const FAROL_COR = {
  verde: { bg: "#e7f5ee", fg: "#1e9e6a", dot: "#1e9e6a", label: "Na meta" },
  amarelo: { bg: "#fff6e6", fg: "#b45309", dot: "#f4801f", label: "Atenção" },
  vermelho: { bg: "#fdeaea", fg: "#b91c1c", dot: "#dc2626", label: "Fora da meta" },
};

export const metaTexto = (m) => `${m.dir === "min" ? "≥" : "≤"} ${String(m.valor).replace(".", ",")}${m.unidade === "%" ? "%" : " " + m.unidade}`;
