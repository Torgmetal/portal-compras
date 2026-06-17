// Seções padrão para organizar os documentos de uma auditoria (na tela interna e no
// portal do cliente). Plano JS puro — usado no client, no Torguinho e no endpoint.
// Seções alinhadas ao formulário de qualificação de fornecedor GQ-FQ-003 (10 áreas
// que o cliente audita), pra o portal espelhar 1:1 o que o auditor confere.
export const SECOES_AUDITORIA = [
  "Sistema de Gestão e Certificações",
  "Projeto e Engenharia",
  "Rastreabilidade de Materiais",
  "Controle de Processo e Fabricação",
  "Qualificação de Soldadores",
  "Monitoramento e Medição",
  "Qualificação de Inspetores",
  "Instrumentos Calibrados",
  "Controle de Documentos",
  "Aquisição e Fornecedores",
  "Não Conformidade e Ações",
  "Armazenamento e Expedição",
  "Segurança, Saúde e Meio Ambiente",
  "Outros",
];

const MAP_CAT = {
  SISTEMA: "Controle de Processo e Fabricação", // procedimentos PO-xx dominam
  FUNCIONARIOS: "Qualificação de Soldadores", // CQS de soldador
  INSPETORES: "Qualificação de Inspetores",
  EQUIPAMENTOS: "Instrumentos Calibrados", // certificados de calibração
  MATERIAL: "Rastreabilidade de Materiais",
};

// Categoria do DocumentoQualidade → seção sugerida na auditoria.
export function secaoPorCategoria(categoria) {
  return MAP_CAT[categoria] || "Outros";
}

// Ordena as seções na ordem padrão; desconhecidas vão pro fim (antes de "Sem seção").
export function ordenarSecoes(nomes) {
  const idx = (n) => { const i = SECOES_AUDITORIA.indexOf(n); return i === -1 ? 998 : i; };
  return [...nomes].sort((a, b) => idx(a) - idx(b) || a.localeCompare(b));
}

// Checklist do GQ-FQ-003: documentos/evidências exigidos pelo auditor, agrupados pelas
// 10 áreas. A equipe marca o status por auditoria (progresso até 100%).
export const REQUISITOS_GQFQ003 = [
  { id: "iso9001", secao: "Sistema de Gestão e Certificações", label: "Certificado ISO 9001 (escopo pretendido)" },
  { id: "analise_critica", secao: "Sistema de Gestão e Certificações", label: "Procedimento de análise crítica do pedido/contrato" },
  { id: "plano_qualidade", secao: "Sistema de Gestão e Certificações", label: "Plano da Qualidade (modelo/exemplo)" },
  { id: "controle_mudancas", secao: "Sistema de Gestão e Certificações", label: "Procedimento de controle de mudanças" },
  { id: "comunicacao_cliente", secao: "Sistema de Gestão e Certificações", label: "Sistemática de comunicação com o cliente" },

  { id: "engenheiros_crea", secao: "Projeto e Engenharia", label: "Relação de engenheiros + CREA válido" },
  { id: "resp_tecnico", secao: "Projeto e Engenharia", label: "Responsável Técnico + ART/CREA" },
  { id: "experiencia", secao: "Projeto e Engenharia", label: "Comprovação de experiência (portfólio de obras)" },

  { id: "proc_rastreabilidade", secao: "Rastreabilidade de Materiais", label: "Procedimento de identificação e rastreabilidade (corridas)" },
  { id: "mtc", secao: "Rastreabilidade de Materiais", label: "Certificados de matéria-prima (MTC) com nº de corrida" },

  { id: "proc_fabricacao", secao: "Controle de Processo e Fabricação", label: "Procedimentos de fabricação (PO-xx)" },
  { id: "eps_rqps", secao: "Controle de Processo e Fabricação", label: "EPS/WPS e RQPS/PQR (processos especiais)" },
  { id: "cqs", secao: "Qualificação de Soldadores", label: "Certificados de qualificação de soldadores (CQS)" },
  { id: "manutencao", secao: "Controle de Processo e Fabricação", label: "Procedimento + registros de manutenção preventiva" },
  { id: "capacidade", secao: "Controle de Processo e Fabricação", label: "Capacidade produtiva (ton/mês) e movimentação de carga" },
  { id: "cinco_s", secao: "Controle de Processo e Fabricação", label: "Registros de 5S / organização" },

  { id: "pit", secao: "Monitoramento e Medição", label: "PIT — Plano de Inspeção e Testes" },
  { id: "end", secao: "Monitoramento e Medição", label: "Procedimentos e relatórios de END (VT/LP/US)" },
  { id: "inspetores", secao: "Qualificação de Inspetores", label: "Certificados de qualificação dos inspetores (END/pintura)" },
  { id: "calibracao", secao: "Instrumentos Calibrados", label: "Certificados de calibração + procedimento de controle" },
  { id: "rdo", secao: "Monitoramento e Medição", label: "RDO / histograma de mão de obra" },

  { id: "controle_docs", secao: "Controle de Documentos", label: "Procedimento de controle de documentos e registros (obsoletos/revisões)" },

  { id: "aval_fornecedores", secao: "Aquisição e Fornecedores", label: "Procedimento + planilha de avaliação de fornecedores" },
  { id: "insp_recebimento", secao: "Aquisição e Fornecedores", label: "Procedimento de inspeção de recebimento (IIRM)" },

  { id: "rnc", secao: "Não Conformidade e Ações", label: "Procedimento de RNC / ação corretiva e preventiva + registros" },

  { id: "romaneio_embalagem", secao: "Armazenamento e Expedição", label: "Procedimento de romaneio, embalagem e preservação" },

  { id: "ohsas", secao: "Segurança, Saúde e Meio Ambiente", label: "Certificação OHSAS 18001 / sistema de SST (ou N/A)" },
  { id: "tec_seguranca", secao: "Segurança, Saúde e Meio Ambiente", label: "Técnico de Segurança + legislação SST aplicável" },
  { id: "iso14001", secao: "Segurança, Saúde e Meio Ambiente", label: "Certificação ISO 14001 / sistema ambiental (ou N/A)" },
];

// Requisitos (linhas) de uma seção/área.
export function requisitosDaSecao(secao) {
  return REQUISITOS_GQFQ003.filter((r) => r.secao === secao);
}
export function labelRequisito(id) {
  return REQUISITOS_GQFQ003.find((r) => r.id === id)?.label || null;
}

export const STATUS_REQUISITO = {
  PENDENTE: { label: "Pendente", cor: "bg-gray-100 text-torg-gray" },
  ATENDIDO: { label: "Atendido", cor: "bg-emerald-100 text-emerald-700" },
  PARCIAL: { label: "Parcial", cor: "bg-amber-100 text-amber-700" },
  NA: { label: "N/A", cor: "bg-slate-100 text-slate-500" },
};
