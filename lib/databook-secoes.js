// Template das 20 seções do Data Book (Portal da Qualidade — espec. PQ-00 §7).
// fonte: sistema | upload | modulo1 | entrada_a | misto
//   modulo1   = puxa documentos do Controle de Documentos (M1) pelo vínculo de OP
//   entrada_a = evidência fotográfica (captura PWA — fase futura)
//   upload    = anexo direto (fase futura)
//   sistema   = gerado pelo próprio portal
//   misto     = entrada_a + upload/sistema
// Plano JS puro (sem server-only): usado na API e no client.

export const SECOES_DATABOOK = [
  { numero: "01", titulo: "Identificação e lista mestra de documentos", norma: "NBR 16775", fonte: "sistema" },
  { numero: "02", titulo: "Desenhos as-built (fabricação e montagem)", norma: "NBR 8800:2024", fonte: "upload" },
  { numero: "03", titulo: "ARTs (projeto, fabricação, montagem, soldagem)", norma: "CREA", fonte: "modulo1" },
  { numero: "04", titulo: "Certificados de usina (MTC) c/ nº de corrida", norma: "NBR 8800:2024 An. A", fonte: "modulo1" },
  { numero: "05", titulo: "Certificado de Fixadores", norma: "ASTM F3125 / A563 / F436", fonte: "modulo1" },
  { numero: "06", titulo: "Certificados de consumíveis de solda", norma: "AWS A5.x", fonte: "modulo1" },
  { numero: "07", titulo: "EPS/WPS e RQPS/PQR", norma: "AWS D1.1", fonte: "upload" },
  { numero: "08", titulo: "Qualificação dos soldadores", norma: "AWS D1.1", fonte: "modulo1" },
  { numero: "09", titulo: "Mapa de soldagem", norma: "AWS D1.1", fonte: "upload" },
  { numero: "10", titulo: "PIT/ITP — plano de inspeção e testes", norma: "NBR 16775", fonte: "sistema" },
  { numero: "11", titulo: "Relatórios de inspeção dimensional", norma: "NBR 8800:2024", fonte: "misto" },
  { numero: "12", titulo: "Relatório de Ensaios (END)", norma: "AWS D1.1", fonte: "upload" },
  { numero: "13", titulo: "Qualificação dos inspetores de END", norma: "SNQC / ABENDI", fonte: "modulo1" },
  { numero: "14", titulo: "Tratamento de superfície e pintura (DFT)", norma: "ISO 8501-1 / 8503 / 2808", fonte: "misto" },
  { numero: "15", titulo: "Certificados / lote das tintas", norma: "Esquema de pintura", fonte: "modulo1" },
  { numero: "16", titulo: "Relatório de torque dos parafusos", norma: "NBR 8800:2024", fonte: "entrada_a" },
  { numero: "17", titulo: "Verificação topográfica (prumo/nível)", norma: "NBR 8800:2024", fonte: "misto" },
  { numero: "19", titulo: "Certificados de calibração", norma: "RBC / INMETRO", fonte: "modulo1" },
  { numero: "20", titulo: "Termo de aceite / declaração de conformidade", norma: "Contrato", fonte: "sistema" },
];

// Seção que puxa documentos do Módulo 1 (linkáveis ao data book).
export function secaoUsaModulo1(fonte) {
  return fonte === "modulo1";
}

// Seções que puxam documentos GLOBAIS da empresa (Controle de Documentos), não por
// OP: qualificação de soldador/inspetor, EPS/WPS e calibração valem para qualquer
// data book. numero → filtro de categoria/tipo do DocumentoQualidade.
export const SECAO_EMPRESA_FILTRO = {
  "07": { categoria: "SISTEMA", tipoContains: "EPS" },           // EPS/WPS e RQPS/PQR
  "08": { categoria: "FUNCIONARIOS", tipoContains: "soldador" }, // CQS de soldador
  "13": { categoria: "INSPETORES" },                             // inspetores de END
  "19": { categoria: "EQUIPAMENTOS" },                           // certificados de calibração
};

export function secaoUsaEmpresa(numero) {
  return Object.prototype.hasOwnProperty.call(SECAO_EMPRESA_FILTRO, numero);
}

// `where` do Prisma para os documentos da empresa de uma seção. Inclui docs SEM
// validade (ex.: CQS de soldador, que valem por continuidade — nunca "vencem").
export function whereDocsEmpresa(numero) {
  const f = SECAO_EMPRESA_FILTRO[numero];
  if (!f) return null;
  const where = { ativo: true, categoria: f.categoria };
  if (f.tipoContains) where.tipo = { contains: f.tipoContains, mode: "insensitive" };
  return where;
}

// ── Classificação de certificados de material por grupo ───────────────────────
// Os certificados (categoria MATERIAL) misturam aço estrutural, tintas e fixadores.
// Cada um vai pra uma seção diferente do data book: §04 estrutural, §05 fixadores,
// §15 tintas. Classifica pelo NOME do material.
const RX_TINTA = /(TINTA|DILUENTE|THINNER|TINNER|PRIMER|ESMALTE|EPOXI|EPOXY|POLIURET|ZARCAO|VERNIZ|SOLVENTE|INDUSDUR|INDUSTHANE|INDUSLUX|JOTUN|HEMPEL|CATALIS|ENDURECEDOR|FUNDO ZINC|GALVITE)/i;
const RX_FIXADOR = /(PARAF|PORCA|ARRUELA|CHUMBADOR|FIXADOR|TIRANTE|PRISIONEIRO|\bPINO\b|BARRA ROSC)/i;

export function classificarMaterial(nome) {
  const n = String(nome || "");
  if (RX_TINTA.test(n)) return "TINTA";
  if (RX_FIXADOR.test(n)) return "FIXADOR";
  return "ESTRUTURAL";
}

// Seção (modulo1, por OP) → grupo de material que ela puxa. As demais seções modulo1
// (06 consumíveis etc.) não filtram por grupo (puxam por vínculo manual).
export const GRUPO_POR_SECAO = { "04": "ESTRUTURAL", "05": "FIXADOR", "15": "TINTA" };

export const GRUPO_MATERIAL_LABEL = {
  "04": "certificados de material (aço)",
  "05": "certificados de fixadores",
  "15": "certificados de tintas",
};

// ── Procedimentos (SISTEMA) por seção ─────────────────────────────────────────
// Os procedimentos da Torg (PO-xx, PI-QUA-xx, POI) são documentos globais (SISTEMA).
// Cada seção do data book lista os procedimentos aplicáveis ao seu processo —
// casamento pelo NOME do procedimento. O usuário pode ajustar (vincular/desvincular).
export const SECAO_PROCEDIMENTOS = {
  "02": [/\bPO-?02\b/i, /fabrica[çc]/i],                                  // Fabricação de estruturas
  "04": [/\bPO-?01\b/i, /IIRM/i, /recebimento/i],                        // Inspeção/recebimento de material
  "06": [/\bPO-?03\b/i, /soldagem/i],                                    // Soldagem (consumíveis)
  "07": [/\bPO-?03\b/i, /soldagem/i],                                    // EPS/WPS
  "09": [/\bPO-?03\b/i, /soldagem/i],                                    // Mapa de soldagem
  "11": [/\bPO-?04\b/i, /toler[âa]ncia/i],                               // Tolerâncias de fabricação (dimensional)
  "12": [/\bPO-?06\b/i, /\bPO-?15\b/i, /PI-?QUA-?00[23]/i, /visual/i, /penetrante/i, /(ultrass|US AWS)/i], // END
  "14": [/\bPO-?05\b/i, /POI ?0?5/i, /pintura/i, /superf[íi]cie/i, /(pintor|jatista)/i],                   // Pintura/jato
  "20": [/\bPO-?0[78]\b/i, /(transporte|embalagem|embarque)/i, /n[ãa]o ?conform/i, /FORM ?32/i],           // Expedição/aceite
};

export function secaoUsaProcedimentos(numero) {
  return Object.prototype.hasOwnProperty.call(SECAO_PROCEDIMENTOS, numero);
}

export function procedimentoCasaSecao(nome, numero) {
  const pats = SECAO_PROCEDIMENTOS[numero];
  if (!pats) return false;
  const n = String(nome || "");
  return pats.some((rx) => rx.test(n));
}

// `where` do Prisma dos documentos de procedimento (SISTEMA / tipo "Procedimento").
// Exclui EPS/RQPS (tipo próprio) e a certificação ISO.
export function whereProcedimentos() {
  return { ativo: true, categoria: "SISTEMA", tipo: { contains: "Procedimento", mode: "insensitive" } };
}

// ── PIT / ITP (§10) — Plano de Inspeção e Testes, editável no portal ──────────
// A §10 não puxa documento: o PIT é montado no próprio portal (tabela) e renderizado
// no PDF. Guardado em DataBookSecao.conteudoJson = { itens: [ {…colunas} ] }.
export const PIT_COLUNAS = [
  { key: "etapa", label: "Etapa / Atividade" },
  { key: "caracteristica", label: "Característica" },
  { key: "metodo", label: "Método de inspeção" },
  { key: "criterio", label: "Critério de aceitação" },
  { key: "frequencia", label: "Frequência" },
  { key: "registro", label: "Registro" },
  { key: "responsavel", label: "Responsável" },
];

export const PIT_PADRAO = [
  { etapa: "Recebimento de material", caracteristica: "Identificação e certificado (corrida)", metodo: "Visual / documental (IIRM)", criterio: "Conforme MTC e norma do projeto", frequencia: "100%", registro: "IIRM (PO-01)", responsavel: "Inspetor / Almoxarifado" },
  { etapa: "Preparação de juntas", caracteristica: "Geometria do chanfro e limpeza", metodo: "Visual / gabarito", criterio: "AWS D1.1 / EPS aplicável", frequencia: "100%", registro: "—", responsavel: "Soldador / Inspetor" },
  { etapa: "Soldagem", caracteristica: "Parâmetros e sequência (EPS)", metodo: "Visual (VT)", criterio: "AWS D1.1 §6 / EPS", frequencia: "100%", registro: "Relatório de solda (PO-06)", responsavel: "Inspetor de solda" },
  { etapa: "Ensaios não destrutivos (END)", caracteristica: "Descontinuidades em soldas", metodo: "LP / US (conforme PIT)", criterio: "AWS D1.1 — critérios de aceitação", frequencia: "Conforme % contratual", registro: "Relatório de END (PO-15 / PI-QUA)", responsavel: "Inspetor N2" },
  { etapa: "Inspeção dimensional", caracteristica: "Dimensões e tolerâncias", metodo: "Medição (trena/paquímetro/nível)", criterio: "NBR 8800 / PO-04", frequencia: "Por peça / amostragem", registro: "Relatório dimensional", responsavel: "Inspetor" },
  { etapa: "Preparação de superfície", caracteristica: "Grau de limpeza e perfil", metodo: "Visual / fita de rugosidade", criterio: "ISO 8501-1 Sa 2½ / ISO 8503", frequencia: "100%", registro: "Relatório de jato (PO-05)", responsavel: "Inspetor de pintura" },
  { etapa: "Pintura", caracteristica: "Espessura de película (DFT)", metodo: "Medição (ISO 2808)", criterio: "Esquema de pintura do projeto", frequencia: "Conforme plano", registro: "Relatório de DFT", responsavel: "Inspetor de pintura" },
  { etapa: "Torque de parafusos", caracteristica: "Aperto das conexões", metodo: "Torquímetro", criterio: "NBR 8800", frequencia: "Conforme plano", registro: "Relatório de torque", responsavel: "Inspetor" },
  { etapa: "Liberação / expedição", caracteristica: "Conformidade final e embalagem", metodo: "Visual / check list", criterio: "FORM 32 / pedido", frequencia: "100%", registro: "Check list de embarque (FORM 32)", responsavel: "Inspetor / Expedição" },
];

// ── Relatórios da pasta do servidor (§11 dimensional, §12 END) ────────────────
// Os relatórios ficam em pastas fixas do SGQ (Produção), nomeados com o código Tekla
// da OP (DM_064_26_T67, VS_067_26_T67). Puxa por OP casando o código no nome.
export const SECAO_RELATORIOS_SERVIDOR = {
  "11": { pastas: ["Produção/2. SGQ/Dimensional/PDF", "Produção/2. SGQ/Dimensional"], categoria: "RELATORIO", tipo: "Relatório dimensional", label: "relatórios dimensionais" },
  "12": { pastas: ["Produção/2. SGQ/Visual de Solda/PDF", "Produção/2. SGQ/Visual de Solda", "Produção/2. SGQ/LP/PDF", "Produção/2. SGQ/LP"], categoria: "RELATORIO", tipo: "Relatório de ensaios (END)", label: "relatórios de ensaios (END)" },
};

export function secaoUsaRelatoriosServidor(numero) {
  return Object.prototype.hasOwnProperty.call(SECAO_RELATORIOS_SERVIDOR, numero);
}

// Casa um nome de arquivo ao código Tekla da OP. "067" → procura "T67" (sem zeros à
// esquerda) seguido de não-dígito — pega T67, T67A, T67B (sub-obras) mas não T670.
export function arquivoCasaOP(nome, opNumero) {
  const num = String(parseInt(opNumero, 10));
  if (!num || num === "NaN") return false;
  return new RegExp(`T0*${num}(?![0-9])`, "i").test(String(nome || ""));
}

// ── Agrupamento do PDF (dossiê estilo cliente) ────────────────────────────────
// O PDF do data book reorganiza as seções na taxonomia do dossiê de qualidade:
// I Controle da Qualidade · II Procedimentos de Soldagem · III Calibração · IV Embarque.
// O modelo de 20 seções (e o linkar de docs no portal) NÃO muda — só a saída em PDF.
export const GRUPOS_DATABOOK = [
  { romano: "I", titulo: "CONTROLE DA QUALIDADE" },
  { romano: "II", titulo: "PROCEDIMENTOS DE SOLDAGEM" },
  { romano: "III", titulo: "CERTIFICADOS DE CALIBRAÇÃO" },
  { romano: "IV", titulo: "LIBERAÇÃO DE EMBARQUE" },
];

const GRUPO_DE_SECAO = {
  "02": "I", "03": "I", "04": "I", "05": "I", "06": "I", "10": "I", "11": "I",
  "12": "I", "13": "I", "14": "I", "15": "I", "16": "I", "17": "I",
  "07": "II", "08": "II", "09": "II",
  "19": "III",
  "20": "IV",
};

export function grupoDaSecao(numero) {
  return GRUPO_DE_SECAO[numero] || "I";
}

export const FONTE_LABEL = {
  sistema: "Sistema",
  upload: "Upload",
  modulo1: "Controle de Documentos",
  entrada_a: "Evidência (foto)",
  misto: "Evidência + upload",
};

export const ESTADO_DATABOOK = {
  PENDENTE: { label: "Pendente", cor: "bg-gray-100 text-torg-gray" },
  ANEXADO: { label: "Anexado", cor: "bg-emerald-100 text-emerald-700" },
  NA: { label: "N/A", cor: "bg-slate-100 text-slate-500" },
};

// Monta as 20 seções iniciais (para o nested create ao criar o data book —
// dataBookId é implícito na relação, por isso não entra aqui).
export function montaSecoesIniciais() {
  return SECOES_DATABOOK.map((s, i) => ({
    numero: s.numero,
    titulo: s.titulo,
    norma: s.norma,
    fonte: s.fonte,
    ordem: i,
    estado: "PENDENTE",
  }));
}
