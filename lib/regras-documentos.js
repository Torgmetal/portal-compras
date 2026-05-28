/**
 * Regras de documentos obrigatórios baseadas na CCT SINDIMAQ/SINAEES 2025-2027
 * e Normas Regulamentadoras aplicáveis à indústria metalúrgica.
 *
 * obrigatorioPara:
 *   "TODOS"    → todo funcionário CLT ativo
 *   "PRODUCAO" → quem está em setor de produção / operacional
 *   "EMPRESA"  → documento da empresa (sem vínculo com funcionário)
 */

export const REGRAS_DOCUMENTOS = [
  // ── POR FUNCIONÁRIO (TODOS CLT) ──────────────────────
  {
    tipo: "ASO",
    nome: "ASO (Atestado de Saúde Ocupacional)",
    categoria: "SAUDE_SEGURANCA",
    obrigatorioPara: "TODOS",
    validadeMeses: 12,
    descricao: "Exame admissional, periódico e demissional. NR-7 / PCMSO.",
    referenciaCCT: "Cláusulas 24, 29 — Medidas de Proteção / Exames Médicos",
  },
  {
    tipo: "INTEGRACAO",
    nome: "Integração de Segurança",
    categoria: "TREINAMENTO",
    obrigatorioPara: "TODOS",
    validadeMeses: null, // feito 1x na admissão
    descricao: "Treinamento de integração obrigatório para novos colaboradores.",
    referenciaCCT: "Cláusula 24 — Medidas de Proteção",
  },
  {
    tipo: "FICHA_EPI",
    nome: "Ficha de Entrega de EPI",
    categoria: "SAUDE_SEGURANCA",
    obrigatorioPara: "TODOS",
    validadeMeses: 12,
    descricao: "Registro de fornecimento de EPIs conforme NR-6.",
    referenciaCCT: "Cláusula 35 — Proteção ao Trabalhador / EPIs",
  },

  // ── POR FUNCIONÁRIO (PRODUÇÃO / OPERACIONAL) ─────────
  {
    tipo: "NR_12",
    nome: "NR-12 (Segurança em Máquinas)",
    categoria: "TREINAMENTO",
    obrigatorioPara: "PRODUCAO",
    validadeMeses: 24,
    descricao: "Treinamento obrigatório para operadores de máquinas.",
    referenciaCCT: "Cláusula 31 — Prevenção de Acidentes com Prensas e Máquinas",
  },
  {
    tipo: "NR_35",
    nome: "NR-35 (Trabalho em Altura)",
    categoria: "TREINAMENTO",
    obrigatorioPara: "PRODUCAO",
    validadeMeses: 24,
    descricao: "Obrigatório para trabalho acima de 2m. Reciclagem bienal.",
    referenciaCCT: "Cláusula 24 — Medidas de Proteção",
  },
  {
    tipo: "NR_33",
    nome: "NR-33 (Espaço Confinado)",
    categoria: "TREINAMENTO",
    obrigatorioPara: "PRODUCAO",
    validadeMeses: 12,
    descricao: "Obrigatório para quem acessa espaços confinados. Reciclagem anual.",
    referenciaCCT: "Cláusula 24 — Medidas de Proteção",
  },
  {
    tipo: "NR_10",
    nome: "NR-10 (Segurança com Eletricidade)",
    categoria: "TREINAMENTO",
    obrigatorioPara: "PRODUCAO",
    validadeMeses: 24,
    descricao: "Obrigatório para quem trabalha em instalações elétricas. Reciclagem bienal.",
    referenciaCCT: "Cláusula 24 — Medidas de Proteção",
  },

  // ── DOCUMENTOS DA EMPRESA ────────────────────────────
  {
    tipo: "PCMSO",
    nome: "PCMSO (Programa de Controle Médico)",
    categoria: "EMPRESA",
    obrigatorioPara: "EMPRESA",
    validadeMeses: 12,
    descricao: "Programa anual de saúde ocupacional. NR-7.",
    referenciaCCT: "Cláusula 30 — Profissionais de Segurança e Medicina do Trabalho",
  },
  {
    tipo: "PGR",
    nome: "PGR (Programa de Gerenciamento de Riscos)",
    categoria: "EMPRESA",
    obrigatorioPara: "EMPRESA",
    validadeMeses: 24,
    descricao: "Substituiu o PPRA. Avaliação e gestão de riscos ocupacionais. NR-1.",
    referenciaCCT: "Cláusula 35d — Análise preliminar de risco / PPRA",
  },
  {
    tipo: "LTCAT",
    nome: "LTCAT (Laudo Técnico Condições Ambientais)",
    categoria: "EMPRESA",
    obrigatorioPara: "EMPRESA",
    validadeMeses: 12,
    descricao: "Laudo técnico para fins de aposentadoria especial.",
    referenciaCCT: "NR-15 / Lei 8.213/91",
  },
  {
    tipo: "ANALISE_AGUA",
    nome: "Análise Bacteriológica da Água",
    categoria: "EMPRESA",
    obrigatorioPara: "EMPRESA",
    validadeMeses: 6,
    descricao: "Análise semestral obrigatória da água potável oferecida aos trabalhadores.",
    referenciaCCT: "Cláusula 28 — Água Potável",
  },
  {
    tipo: "ALVARA",
    nome: "Alvará de Funcionamento",
    categoria: "EMPRESA",
    obrigatorioPara: "EMPRESA",
    validadeMeses: 12,
    descricao: "Licença municipal para funcionamento do estabelecimento.",
    referenciaCCT: "Legislação municipal",
  },
  {
    tipo: "AVCB",
    nome: "AVCB (Auto de Vistoria do Corpo de Bombeiros)",
    categoria: "EMPRESA",
    obrigatorioPara: "EMPRESA",
    validadeMeses: 36,
    descricao: "Certificado de conformidade com normas de prevenção de incêndio.",
    referenciaCCT: "Legislação estadual",
  },
];

// Setores considerados "produção" para regras PRODUCAO
export const SETORES_PRODUCAO = [
  "producao", "produção", "fabrica", "fábrica", "fabricacao", "fabricação",
  "montagem", "soldagem", "corte", "usinagem", "caldeiraria", "serralheria",
  "pintura", "jato", "almoxarifado", "manutencao", "manutenção", "expedicao",
  "expedição", "operacional", "campo",
];

const norm = (s) => (s || "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Verifica se um setor é considerado "produção" */
export function isSetorProducao(nomeSetor) {
  const n = norm(nomeSetor);
  return SETORES_PRODUCAO.some((s) => n.includes(s));
}

/** Retorna regras aplicáveis a um funcionário, dado o nome do setor */
export function regrasParaFuncionario(nomeSetor) {
  const producao = isSetorProducao(nomeSetor);
  return REGRAS_DOCUMENTOS.filter((r) => {
    if (r.obrigatorioPara === "EMPRESA") return false;
    if (r.obrigatorioPara === "TODOS") return true;
    if (r.obrigatorioPara === "PRODUCAO") return producao;
    return false;
  });
}

/** Retorna regras de documentos da empresa */
export function regrasEmpresa() {
  return REGRAS_DOCUMENTOS.filter((r) => r.obrigatorioPara === "EMPRESA");
}
