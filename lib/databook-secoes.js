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
  { numero: "05", titulo: "Certificados de parafusaria", norma: "ASTM F3125 / A563 / F436", fonte: "modulo1" },
  { numero: "06", titulo: "Certificados de consumíveis de solda", norma: "AWS A5.x", fonte: "modulo1" },
  { numero: "07", titulo: "EPS/WPS e RQPS/PQR", norma: "AWS D1.1", fonte: "upload" },
  { numero: "08", titulo: "Qualificação dos soldadores", norma: "AWS D1.1", fonte: "modulo1" },
  { numero: "09", titulo: "Mapa de soldagem", norma: "AWS D1.1", fonte: "upload" },
  { numero: "10", titulo: "PIT/ITP — plano de inspeção e testes", norma: "NBR 16775", fonte: "upload" },
  { numero: "11", titulo: "Relatórios de inspeção dimensional", norma: "NBR 8800:2024", fonte: "misto" },
  { numero: "12", titulo: "Relatórios de END (VT/LP/PM/US/RX)", norma: "AWS D1.1", fonte: "upload" },
  { numero: "13", titulo: "Qualificação dos inspetores de END", norma: "SNQC / ABENDI", fonte: "modulo1" },
  { numero: "14", titulo: "Tratamento de superfície e pintura (DFT)", norma: "ISO 8501-1 / 8503 / 2808", fonte: "misto" },
  { numero: "15", titulo: "Certificados / lote das tintas", norma: "Esquema de pintura", fonte: "modulo1" },
  { numero: "16", titulo: "Relatório de torque dos parafusos", norma: "NBR 8800:2024", fonte: "entrada_a" },
  { numero: "17", titulo: "Verificação topográfica (prumo/nível)", norma: "NBR 8800:2024", fonte: "misto" },
  { numero: "18", titulo: "RNCs e concessões aprovadas", norma: "NBR 16775", fonte: "misto" },
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
  "13": { categoria: "FUNCIONARIOS", tipoContains: "inspetor" }, // inspetores de END
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
