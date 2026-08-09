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
  // ── Comercial (Vendas) — lidos da planilha RELATÓRIO_PROPOSTAS (SharePoint), aba Indicadores ──
  { id: "conversao_propostas", processo: "COMERCIAL", nome: "Taxa de Conversão de Propostas",
    oQueMede: "Eficiência em transformar propostas enviadas em contratos fechados", comoSeMede: "(Propostas fechadas ÷ propostas enviadas) × 100 — linha GERAL, por quantidade",
    meta: { dir: "min", valor: 15, unidade: "%" }, freq: "Mensal", fonte: "parcial", nota: "Lido da planilha RELATÓRIO_PROPOSTAS (SharePoint › Comercial › 1. Orçamento), aba Indicadores, linha GERAL “Taxa de Conversão por Qtd”. Preenchida à mão pelo Comercial." },
  { id: "ciclo_medio_vendas", processo: "COMERCIAL", nome: "Ciclo Médio de Vendas",
    oQueMede: "Tempo médio entre a solicitação da proposta e o fechamento do contrato", comoSeMede: "Soma dos dias até o fechamento ÷ nº de propostas fechadas no mês (linha GERAL)",
    meta: { dir: "max", valor: 60, unidade: "dias" }, freq: "Mensal", fonte: "parcial", nota: "Lido da planilha RELATÓRIO_PROPOSTAS (SharePoint › Comercial › 1. Orçamento), aba Indicadores, linha GERAL “Ciclo Médio de Venda”." },
  { id: "csat", processo: "COMERCIAL", nome: "Satisfação do Cliente (CSAT)",
    oQueMede: "Percepção do cliente sobre prazo, qualidade e atendimento", comoSeMede: "Média das notas da pesquisa de satisfação",
    meta: { dir: "min", valor: 85, unidade: "%" }, freq: "Trimestral", fonte: "pendente", nota: "Precisa da pesquisa de satisfação (CSAT) no portal." },

  // ── Engenharia ──
  { id: "aderencia_prazo_projeto", processo: "ENGENHARIA", nome: "Aderência ao Prazo de Entrega do Projeto",
    oQueMede: "% de projetos entregues na data acordada (cronograma)", comoSeMede: "(Tarefas de engenharia concluídas no prazo ÷ concluídas) × 100",
    meta: { dir: "min", valor: 92, unidade: "%" }, freq: "Mensal", fonte: "auto", nota: "Depende de a data real de conclusão estar preenchida no cronograma." },
  { id: "erros_projeto", processo: "ENGENHARIA", nome: "Erros de Projeto (RNC)",
    oQueMede: "RNCs de projeto detectadas na fábrica/obra", comoSeMede: "Nº de RNCs com área de Engenharia/Projeto no período",
    meta: { dir: "max", valor: 0, unidade: "RNCs" }, freq: "Mensal", fonte: "parcial", nota: "Contagem das RNCs de Engenharia/Projeto. Para virar o % da ISO (≤1%) falta definir o denominador (o que conta como “projeto liberado”)." },

  // ── Compras ──
  { id: "retorno_orcamento", processo: "COMPRAS", nome: "Retorno de Orçamento",
    oQueMede: "Tempo médio de resposta das cotações", comoSeMede: "Média de dias úteis entre a solicitação e a resposta da cotação",
    meta: { dir: "max", valor: 4, unidade: "dias úteis" }, freq: "Mensal", fonte: "auto" },
  { id: "compras_fornecedor_b", processo: "COMPRAS", nome: "Compras de fornecedores nível “B”",
    oQueMede: "% de compras com fornecedores homologados (IQF ≥ 75%)", comoSeMede: "(Valor comprado de fornecedores IQF ≥ 75% ÷ total comprado) × 100",
    meta: { dir: "min", valor: 85, unidade: "%" }, freq: "Mensal", fonte: "parcial", nota: "% do valor comprado de fornecedores com IQF ≥ 75% (avaliação automática). A perna de entrega ainda depende da sync do Omie." },

  // ── Produção ──
  { id: "prazo_fabricacao", processo: "PRODUCAO", nome: "Cumprimento dos Prazos de Fabricação",
    oQueMede: "% do peso planejado do mês que foi expedido", comoSeMede: "(Peso expedido no mês ÷ peso das OPs previstas para o mês) × 100",
    meta: { dir: "min", valor: 95, unidade: "%" }, freq: "Mensal", fonte: "parcial", nota: "Planejado = peso real das OPs com previsão de conclusão no mês (precisa da LE/LPC importada); realizado = peso dos romaneios emitidos. Vale de ago/2026 (início do registro de expedido)." },
  { id: "retrabalho", processo: "PRODUCAO", nome: "Retrabalho",
    oQueMede: "% do peso retrabalhado sobre a produção do mês", comoSeMede: "(Peso retrabalhado nas RNCs ÷ peso produzido/cortado no mês) × 100",
    meta: { dir: "max", valor: 2, unidade: "%" }, freq: "Mensal", fonte: "auto", nota: "Peso das RNCs com disposição Retrabalhar ÷ peso cortado no mês (Preparação/Syneco)." },

  // ── Qualidade ──
  { id: "rnc_cliente", processo: "QUALIDADE", nome: "Índice de RNCs Recebidas do Cliente",
    oQueMede: "Nº de RNCs pertinentes recebidas do cliente no ano", comoSeMede: "Total de RNCs de cliente pertinentes acumulado no ano (meta ≤ 8 no ano)",
    meta: { dir: "max", valor: 8, unidade: "RNCs" }, freq: "Anual", fonte: "auto" },
  { id: "recorrencia_nc", processo: "QUALIDADE", nome: "Recorrência de Não Conformidades",
    oQueMede: "% de NCs que voltaram a ocorrer após ação corretiva", comoSeMede: "(NCs marcadas como recorrentes ÷ total de NCs) × 100",
    meta: { dir: "max", valor: 5, unidade: "%" }, freq: "Mensal", fonte: "auto" },
  { id: "plano_auditorias", processo: "QUALIDADE", nome: "Cumprimento do Plano de Auditorias Internas",
    oQueMede: "% de auditorias internas executadas vs. planejado", comoSeMede: "(Auditorias realizadas ÷ auditorias planejadas) × 100",
    meta: { dir: "min", valor: 100, unidade: "%" }, freq: "Anual", fonte: "auto" },
  { id: "plano_calibracao", processo: "QUALIDADE", nome: "Cumprimento do Plano de Calibração",
    oQueMede: "% de equipamentos com calibração em dia", comoSeMede: "(Equipamentos com calibração vigente ÷ total) × 100 — vigência cobre o mês inteiro",
    meta: { dir: "min", valor: 100, unidade: "%" }, freq: "Mensal", fonte: "auto" },

  // ── RH e Segurança ──
  { id: "atendimento_competencias", processo: "RH", nome: "Atendimento das Competências",
    oQueMede: "% de colaboradores com as competências da função atendidas", comoSeMede: "(Colaboradores no Prontuário Eletrônico com todos os documentos obrigatórios do setor em dia ÷ colaboradores no Prontuário) × 100",
    meta: { dir: "min", valor: 50, unidade: "%" }, freq: "Trimestral", fonte: "parcial", nota: "Fonte única: Prontuário Eletrônico (SharePoint) — certificados de treinamento (NR-12, NR-35, Integração, Ficha EPI) + documentos do RH (ASO etc.), validade = data do certificado + reciclagem da NR. Cobertura: só colaboradores que já estão no prontuário (migração em curso). Dispensados PJ/Diretoria e NRs dispensadas por função ficam de fora. Mês atual = foto de hoje; meses anteriores reconstruídos pela janela de validade." },
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
