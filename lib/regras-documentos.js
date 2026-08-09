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
    validadeMeses: null, // sem validade fixa — renovada a cada entrega de EPI (Vitor 09/08)
    descricao: "Registro de fornecimento de EPIs conforme NR-6. Sem validade fixa.",
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
    dispensavel: true, // só quem opera máquinas; RH dispensa por funcionário
  },
  {
    tipo: "NR_35",
    nome: "NR-35 (Trabalho em Altura)",
    categoria: "TREINAMENTO",
    obrigatorioPara: "MONTAGEM_EXTERNA", // só a Montagem Externa trabalha em altura (Vitor 08/08)
    validadeMeses: 24,
    descricao: "Obrigatório para trabalho acima de 2m — montadores e auxiliares de montagem externa. Reciclagem bienal.",
    referenciaCCT: "Cláusula 24 — Medidas de Proteção",
    dispensavel: true, // dentro da Montagem Externa, o RH pode dispensar quem não sobe
  },
  // NR-33 (Espaço Confinado) e NR-10 (Eletricidade) foram REMOVIDAS: a Torg não realiza
  // esses trabalhos/treinamentos (Vitor 08/08), então não entram na conformidade CCT.

  // ── DOCUMENTOS DA EMPRESA ────────────────────────────
  {
    tipo: "PCMSO",
    nome: "PCMSO (Programa de Controle Médico)",
    categoria: "SAUDE_SEGURANCA",
    obrigatorioPara: "EMPRESA",
    validadeMeses: 12,
    descricao: "Programa anual de saúde ocupacional. NR-7.",
    referenciaCCT: "Cláusula 30 — Profissionais de Segurança e Medicina do Trabalho",
  },
  {
    tipo: "PGR",
    nome: "PGR (Programa de Gerenciamento de Riscos)",
    categoria: "SAUDE_SEGURANCA",
    obrigatorioPara: "EMPRESA",
    validadeMeses: 24,
    descricao: "Substituiu o PPRA. Avaliação e gestão de riscos ocupacionais. NR-1.",
    referenciaCCT: "Cláusula 35d — Análise preliminar de risco / PPRA",
  },
  {
    tipo: "LTCAT",
    nome: "LTCAT (Laudo Técnico Condições Ambientais)",
    categoria: "SAUDE_SEGURANCA",
    obrigatorioPara: "EMPRESA",
    validadeMeses: 12,
    descricao: "Laudo técnico para fins de aposentadoria especial.",
    referenciaCCT: "NR-15 / Lei 8.213/91",
  },
  {
    tipo: "ANALISE_AGUA",
    nome: "Análise Bacteriológica da Água",
    categoria: "SAUDE_SEGURANCA",
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
// Comparados sobre o nome do setor JÁ normalizado (minúsculo, sem acento) — por isso
// os termos aqui são sem acento. "solda" cobre Solda e Soldagem; "preparacao"/"acabamento"
// foram incluídos (Vitor 08/08: são produção e devem exigir as NRs).
export const SETORES_PRODUCAO = [
  "producao", "fabrica", "fabricacao",
  "montagem", "solda", "soldagem", "preparacao", "corte", "acabamento",
  "usinagem", "caldeiraria", "serralheria", "pintura", "jato", "almoxarifado",
  "manutencao", "expedicao", "operacional", "campo",
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
    if (r.obrigatorioPara === "MONTAGEM_EXTERNA") return norm(nomeSetor).includes("montagem externa");
    return false;
  });
}

/** Retorna regras de documentos da empresa */
export function regrasEmpresa() {
  return REGRAS_DOCUMENTOS.filter((r) => r.obrigatorioPara === "EMPRESA");
}

/**
 * Status de um documento perante uma regra: retorna { encontrado, documento, status },
 * status ∈ OK | VENCENDO (≤30 dias) | VENCIDO | AUSENTE. Fonte única do "tem o documento
 * em dia?" — usada na tela de Compliance de Documentos e no indicador de Atendimento.
 */
export function checarRegraDocumento(regra, documentos) {
  const docs = (documentos || [])
    .filter((d) => d.tipo === regra.tipo && d.ativo !== false)
    .sort((a, b) => (b.dataValidade ? new Date(b.dataValidade).getTime() : 0) - (a.dataValidade ? new Date(a.dataValidade).getTime() : 0));
  if (docs.length === 0) return { encontrado: false, documento: null, status: "AUSENTE" };
  const doc = docs[0];
  if (!regra.validadeMeses) return { encontrado: true, documento: doc, status: "OK" };
  if (!doc.dataValidade) return { encontrado: true, documento: doc, status: "VENCIDO" };
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const validade = new Date(doc.dataValidade); validade.setHours(0, 0, 0, 0);
  const dias = Math.ceil((validade - hoje) / 86400000);
  if (dias < 0) return { encontrado: true, documento: doc, status: "VENCIDO" };
  if (dias <= 30) return { encontrado: true, documento: doc, status: "VENCENDO" };
  return { encontrado: true, documento: doc, status: "OK" };
}

/** Dispensado das exigências de documentos da CCT? Terceiro (PJ, contrato ≠ CLT) ou Diretoria. */
export function dispensadoDocumentos(tipoContrato, nomeSetor) {
  return tipoContrato !== "CLT" || norm(nomeSetor) === "diretoria";
}

/** Tipos de documento que a Expedição/RH pode dispensar por funcionário (NR-10, NR-33). */
export const TIPOS_DISPENSAVEIS = REGRAS_DOCUMENTOS.filter((r) => r.dispensavel).map((r) => r.tipo);

/** true se o tipo de documento pode ser dispensado por funcionário */
export function ehDispensavel(tipo) {
  return TIPOS_DISPENSAVEIS.includes(tipo);
}
