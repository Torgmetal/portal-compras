import "server-only";

// ─── OS CINCO PADRÕES DE PIT ──────────────────────────────────────────────────
// Vitor (26/08/2026): "o PIT é aquele documento que nasce com a proposta — nesse caso vamos
// informar qual o padrão que vamos usar na criação da proposta e com isso você já vai puxar todas
// as informações".
//
// ⚠ AS LINHAS SÃO NORMATIVAS E FORAM EXTRAÍDAS DO ARQUIVO DELE, não digitadas. Cada célula aqui é
// critério de aceitação, percentual e norma que a Qualidade responde numa auditoria; transcrever à
// mão uma tabela dessas é onde nasce o "PO 05" que virou "PO 06" e ninguém viu.
//
// ⚠ O QUE MUDA ENTRE OS PADRÕES é sobretudo o item 7 (tratamento de superfície) e a profundidade
// do END. O SNQC tem OUTRA TABELA: em vez de dividir o percentual entre TORG e CLIENTE, ele nomeia
// o RESPONSÁVEL pela inspeção ("Inspetor de Solda N2 — Qualificado e Certificado FBTS"), porque é
// o padrão de obra que exige inspetor certificado. Por isso ele tem colunas próprias.

export const PIT_PADROES = [
  {
    // ⚠ "PIT Torg" é como a casa chama o próprio padrão — os arquivos no servidor já saem assim
    // ("PIT-T094-R0 - (Padrão Torg).xlsx"). Vitor (27/08/2026): "nesse caso do PIT vamos alterar
    // esse nome para PIT Torg". O `id` continua PINTURA: é ele que está gravado em OP.pitPadrao.
    id: "PINTURA", nome: "PIT Torg", snqc: false,
    resumo: "Estrutura pintada — rugosidade, espessura seca e aderência.",
    linhas: [
      ["1", "RECEBIMENTO DE MATERIAIS", "Inspeção Visual, Dimensional e Documental", "X", "N.A.", "1", "PO 01 - Inspeção, Identificação e Rastreabilidade de Materiais", ""],
      ["2", "IDENTIFICAÇÃO / RASTREABILIDADE", "Visual", "X", "N.A.", "1", "PO 01 - Inspeção, Identificação e Rastreabilidade de Materiais", ""],
      ["3", "PREPARAÇÃO / SOLDAGEM", "Inspeção Visual de ajuste e dimensional chanfro, biseis e abertura de raiz.", "X", "N.A.", "1", "PO 03 - Detalhes de Juntas Soldadas", ""],
      ["4", "DIMENSIONAL", "Inspeção Visual e Dimensional", "X", "N.A.", "1", "PO 04 - Tolerâncias de Fabricação", ""],
      ["5", "EXECUÇÃO SOLDAS", "EPS´s / RQP´s", "DB", "N.A.", "1", "AWS D1.1", ""],
      ["", "", "Qualificação de Soldadores", "", "N.A.", "", "", ""],
      ["", "", "Certificado de Consumíveis Utilizados", "", "N.A.", "", "", ""],
      ["6", "ENSAIO NÃO DESTRUTIVOS - END", "Inspeção Visual de Solda", "RI", "N.A.", "1", "PO 06 - Ensaio Visual de Solda", ""],
      ["", "", "Inspeção por Líquido Penetrante", "RI", "N.A.", "0.1", "PO-15 Ensaio por Líquidos Penetrantes", ""],
      ["", "", "Inspeção por Ultrassom (Emendas de Topo com Penetração nas Colunas Principais)", "RI", "N.A.", "0.1", "Procedimento de Empresa Terceirizada", ""],
      ["7", "TRATAMENTO DE SUPERFÍCIE", "PINTURA LÍQUIDA — Perfil de rugosidade, medição de espessura da camada seca, visual e teste de aderência", "RI", "N.A.", "VISUAL E ESPESSURA 100% · ADERÊNCIA NBR 11003", "PO 05 - Preparação de Superfície e Pintura", ""],
      ["8", "EXPEDIÇÃO", "Inspeção Visual", "X", "N.A.", "1", "PO 08 - Embalagem e Preservação do Produto para Entrega", ""],
      ["9", "DATA BOOK", "Verificação dos documentos aplicados na obra", "DB", "N.A.", "1", "Conteúdo Padrão - Data Book - TORG", ""],
    ],
  },
  {
    id: "GALVANIZACAO", nome: "Galvanização a fogo", snqc: false,
    resumo: "Estrutura galvanizada a fogo — camada e aderência pela NBR 6323.",
    linhas: [
      ["1", "RECEBIMENTO DE MATERIAIS", "Inspeção Visual, Dimensional e Documental", "X", "N.A.", "1", "PO 01 - Inspeção, Identificação e Rastreabilidade de Materiais", ""],
      ["2", "IDENTIFICAÇÃO / RASTREABILIDADE", "Visual", "X", "N.A.", "1", "PO 01 - Inspeção, Identificação e Rastreabilidade de Materiais", ""],
      ["3", "PREPARAÇÃO / SOLDAGEM", "Inspeção Visual de ajuste e dimensional chanfro, biseis e abertura de raiz.", "X", "N.A.", "1", "PO 03 - Detalhes de Juntas Soldadas", ""],
      ["4", "DIMENSIONAL", "Inspeção Visual e Dimensional", "X", "N.A.", "1", "PO 04 - Tolerâncias de Fabricação", ""],
      ["5", "EXECUÇÃO SOLDAS", "EPS´s / RQP´s", "DB", "N.A.", "1", "AWS D1.1", ""],
      ["", "", "Qualificação de Soldadores", "", "N.A.", "", "", ""],
      ["", "", "Certificado de Consumíveis Utilizados", "", "N.A.", "", "", ""],
      ["6", "ENSAIO NÃO DESTRUTIVOS - END", "Inspeção Visual de Solda", "RI", "N.A.", "1", "PO 06 - Ensaio Visual de Solda", ""],
      ["", "", "Inspeção por Líquido Penetrante", "RI", "N.A.", "0.1", "PO-15 Ensaio por Líquidos Penetrantes", ""],
      ["", "", "Inspeção por Ultrassom (Emendas de Topo com Penetração nas Colunas Principais)", "RI", "N.A.", "0.1", "Procedimento de Empresa Terceirizada", ""],
      ["7", "TRATAMENTO DE SUPERFÍCIE", "GALVANIZAÇÃO A FOGO — Medição de espessura da camada e visual; teste de aderência", "RI", "N.A.", "CONFORME ABNT NBR 6323", "CONFORME ABNT NBR 6323", ""],
      ["8", "EXPEDIÇÃO", "Inspeção Visual", "X", "N.A.", "1", "PO 08 - Embalagem e Preservação do Produto para Entrega", ""],
      ["9", "DATA BOOK", "Verificação dos documentos aplicados na obra", "DB", "N.A.", "1", "Conteúdo Padrão - Data Book - TORG", ""],
    ],
  },
  {
    id: "GALV_PINTURA", nome: "Galvanização + pintura", snqc: false,
    resumo: "Galvanizada e depois pintada — os dois controles.",
    linhas: [
      ["1", "RECEBIMENTO DE MATERIAIS", "Inspeção Visual, Dimensional e Documental", "X", "N.A.", "1", "PO 01 - Inspeção, Identificação e Rastreabilidade de Materiais", ""],
      ["2", "IDENTIFICAÇÃO / RASTREABILIDADE", "Visual", "X", "N.A.", "1", "PO 01 - Inspeção, Identificação e Rastreabilidade de Materiais", ""],
      ["3", "PREPARAÇÃO / SOLDAGEM", "Inspeção Visual de ajuste e dimensional chanfro, biseis e abertura de raiz.", "X", "N.A.", "1", "PO 03 - Detalhes de Juntas Soldadas", ""],
      ["4", "DIMENSIONAL", "Inspeção Visual e Dimensional", "X", "N.A.", "1", "PO 04 - Tolerâncias de Fabricação", ""],
      ["5", "EXECUÇÃO SOLDAS", "EPS´s / RQP´s", "DB", "N.A.", "1", "AWS D1.1", ""],
      ["", "", "Qualificação de Soldadores", "", "N.A.", "", "", ""],
      ["", "", "Certificado de Consumíveis Utilizados", "", "N.A.", "", "", ""],
      ["6", "ENSAIO NÃO DESTRUTIVOS - END", "Inspeção Visual de Solda", "RI", "N.A.", "1", "PO 06 - Ensaio Visual de Solda", ""],
      ["", "", "Inspeção por Líquido Penetrante", "RI", "N.A.", "0.1", "PO-15 Ensaio por Líquidos Penetrantes", ""],
      ["", "", "Inspeção por Ultrassom (Emendas de Topo com Penetração nas Colunas Principais)", "RI", "N.A.", "0.1", "Procedimento de Empresa Terceirizada", ""],
      ["7", "TRATAMENTO DE SUPERFÍCIE", "GALVANIZAÇÃO A FOGO — Medição de espessura da camada e visual; teste de aderência", "RI", "N.A.", "CONFORME ABNT NBR 6323", "CONFORME ABNT NBR 6323", ""],
      ["", "", "Perfil de rugosidade, medição de espessura da camada seca, visual e teste de aderência", "RI", "N.A.", "VISUAL E ESPESSURA 100% · ADERÊNCIA NBR 11003", "PO 05 - Preparação de Superfície e Pintura", ""],
      ["8", "EXPEDIÇÃO", "Inspeção Visual", "X", "N.A.", "1", "PO 08 - Embalagem e Preservação do Produto para Entrega", ""],
      ["9", "DATA BOOK", "Verificação dos documentos aplicados na obra", "DB", "N.A.", "1", "Conteúdo Padrão - Data Book - TORG", ""],
    ],
  },
  {
    id: "SNQC", nome: "SNQC (inspetores certificados)", snqc: true,
    resumo: "Obra que exige inspetor certificado (FBTS/SNQC/ASNT), com responsável por etapa.",
    linhas: [
      ["1", "RECEBIMENTO MATÉRIA PRIMA", "Visual / Dimensional; Qualitativa / Quantitativa", "Almoxarife", "1", "RI / DB / CT", "Projeto AWS D1.1 / NBR 8800", ""],
      ["2", "PREPARAÇÃO / SOLDAGEM", "Inspeção Visual de ajuste e dimensional chanfro, biseis e abertura de raiz.", "Inspetor de Solda N1 / EVS / Dimensional", "1", "N.A.", "Projeto / Procedimento / AWS D1.1", ""],
      ["3", "VISUAL / DIMENSIONAL DE CALDEIRARIA", "Inspeção Visual e Dimensional", "Inspetor Dimensional / Inspetor de Qualidade", "1", "RI / DB", "Projeto / Procedimento / AWS D1.1", ""],
      ["4", "EXECUÇÃO SOLDAS", "Utilizar soldadores qualificados / Conforme Norma Projeto", "Inspetor de Solda N1 / N2 / EVS - Qualificado e Certificado FBTS / SNQC / ASNT", "1", "Certificados de qualificação de soldadores / DB", "Procedimento / AWS D1.1", ""],
      ["", "", "EPS´s / RQP´s", "Inspetor de Solda N2 - Qualificado e Certificado FBTS", "1", "RI / DB", "Procedimento / AWS D1.1", ""],
      ["", "", "Conforme norma de projeto", "", "", "", "", ""],
      ["", "", "Consumíveis de soldagem", "", "", "", "", ""],
      ["5", "END · ESTRUTURAS SOLDADAS PRIMÁRIAS", "Inspeção Visual de Solda", "Inspetor de Solda N1 / EVS - Qualificado e Certificado FBTS / SNQC / ASNT", "1", "RI / DB", "Procedimento / AWS D1.1", ""],
      ["", "", "Inspeção Líquido Penetrante", "Inspetor Líquido Penetrante - Qualificado e Certificado SNQC / ASNT", "20% JAPT e 20% JTPT e JASA (qualquer espessura)", "RI / DB", "Procedimento / AWS D1.1", ""],
      ["", "", "Ultrassom", "Inspetor Ultrassom - Qualificado ou Certificado SNQC / ASNT", "100% JTPT (espessura ≥ 8,00mm)", "RI / DB", "Procedimento / AWS D1.1", ""],
      ["6", "END · ESTRUTURAS SOLDADAS SECUNDÁRIAS", "Inspeção Visual de Solda", "Inspetor de Solda N1 / EVS - Qualificado e Certificado SNQC / ASNT", "1", "RI / DB", "Procedimento / AWS D1.1", ""],
      ["", "", "Inspeção Líquido Penetrante", "Inspetor Líquido Penetrante - Qualificado e Certificado SNQC / ASNT", "N.A.", "RI / DB", "Procedimento / AWS D1.1", ""],
      ["7", "PINTURA", "Perfil de Rugosidade, Medição de Espessura da camada úmida e seca das tintas, visual, teste de aderência", "Inspetor Pintura N1 - Qualificado e Certificado SNQC - CP", "1", "RI / DB", "Procedimento de pintura + Sistema de pintura do cliente", ""],
      ["8", "EXPEDIÇÃO", "Inspeção Visual", "Encarregado Expedição", "1", "Romaneio", "N.A.", ""],
      ["9", "DATA BOOK", "Verificação dos documentos aplicados na obra", "Inspetor Qualidade", "1", "DB", "N.A.", ""],
    ],
  },
  {
    id: "BASICO", nome: "Básico (escopo documental)", snqc: false,
    resumo: "Escopo documental — certificados, qualificações e relatório de pintura.",
    linhas: [
      ["1", "RECEBIMENTO MATÉRIA PRIMA", "Análise documental — Certificado de Qualidade do material", "CT", "N.A.", "1", "NBR 8800 / Certificado do fabricante", "Certificado de Qualidade (CT)"],
      ["2", "PREPARAÇÃO / SOLDAGEM", "Análise documental de EPS / procedimentos de soldagem", "DB", "N.A.", "1", "AWS D1.1 / Procedimento", "EPS / WPS"],
      ["3", "EXECUÇÃO SOLDAS", "EPS´s / RQP´s", "DB", "N.A.", "1", "AWS D1.1", "Registro de qualificação de procedimento (RQP)"],
      ["", "", "Qualificação de soldadores", "DB", "N.A.", "1", "AWS D1.1", "Certificado de qualificação de soldadores"],
      ["", "", "Certificado de consumíveis utilizados", "DB", "N.A.", "1", "AWS D1.1", "Certificado dos consumíveis"],
      ["4", "PINTURA", "Relatório de pintura — perfil de rugosidade, espessura da camada seca e aderência", "RI", "N.A.", "1", "PO 05 / NBR 11003", "Relatório de Inspeção de Pintura (RI)"],
      ["5", "EXPEDIÇÃO", "Inspeção visual / Romaneio", "X", "N.A.", "1", "PO 08 - Embalagem e Preservação", "Romaneio"],
      ["6", "DATA BOOK", "Compilação e verificação dos documentos (certificados, qualificações e relatórios de pintura)", "DB", "N.A.", "1", "Conteúdo Padrão - Data Book - TORG", "Data Book"],
    ],
  },
];

export const PIT_PADRAO = Object.fromEntries(PIT_PADROES.map((p) => [p.id, p]));

// Cabeçalho da tabela — o SNQC tem o seu, pelo motivo do topo.
//
// ⚠⚠ OS RÓTULOS ESTAVAM TROCADOS, e foi isso que o cliente da OP-068 devolveu em 28/08/2026 ("o
// modelo de PIT que estão utilizando no portal está confuso"). As LINHAS sempre vieram na ordem do
// arquivo dele — item · escopo · o que se inspeciona · tipo TORG · tipo cliente · percentual ·
// critério · notas —, mas o cabeçalho anunciava "% TORG" sobre a coluna que traz "X"/"DB"/"RI",
// "CRITÉRIO DE ACEITAÇÃO" sobre o percentual e "EVIDÊNCIAS" sobre o critério. Quem lia o documento
// via um percentual escrito "X" e um critério de aceitação escrito "1".
//
// ⚠ TIPO DE INSPEÇÃO É UM CAMPO COM DUAS COLUNAS (TORG e cliente), e ESCOPO também (a etapa e o
// que se inspeciona nela) — é o que `PIT_GRUPOS` desenha na faixa de cima. Os rótulos com "\n"
// quebram em duas linhas: nessa largura, "PERCENTUAL AVALIADO" numa linha só invade a vizinha.
export const PIT_COLUNAS = {
  comum: ["ITEM", "ETAPA", "O QUE É INSPECIONADO", "TORG", "CLIENTE", "PERCENTUAL\nAVALIADO", "CRITÉRIO DE\nACEITAÇÃO", "NOTAS"],
  snqc: ["ITEM", "ESTRUTURA\nMETÁLICA", "TIPO DE INSPEÇÃO\n(PONTOS DE ESPERA)", "RESPONSÁVEL PELA\nINSPEÇÃO", "PERCENTUAL\nAVALIADO", "EVIDÊNCIAS /\nREGISTRO", "CRITÉRIO DE\nACEITAÇÃO", "NOTAS"],
};

/** Os títulos que abrem sobre mais de uma coluna, como no modelo do cliente. */
export const PIT_GRUPOS = {
  comum: [{ t: "ESCOPO DE INSPEÇÃO", de: 1, ate: 2 }, { t: "TIPO DE INSPEÇÃO", de: 3, ate: 4 }],
  snqc: null,
};

/**
 * O percentual como PORCENTAGEM. Vitor recebeu do cliente (28/08/2026): "o % de cada inspeção é
 * importantíssimo para certificar a abrangência" — e a planilha dele guarda 1 e 0,1 com formato de
 * porcentagem, que o Excel mostra como 100% e 10%. O portal imprimia o número cru: a coluna dizia
 * "1" onde deveria dizer "100%", e "0.1" onde deveria dizer "10%".
 *
 * ⚠ SÓ NÚMERO PURO VIRA %. "VISUAL E ESPESSURA 100% · ADERÊNCIA NBR 11003" e "N.A." são texto do
 * documento e saem como estão.
 */
export const pctAvaliado = (v) => {
  const t = String(v ?? "").trim();
  if (!t) return t;
  const n = Number(t.replace(",", "."));
  if (!Number.isFinite(n) || n < 0 || n > 1) return t;
  return `${Number((n * 100).toFixed(2))}%`;
};

// A legenda é parte do documento: sem ela, "DB" e "RI" na tabela não querem dizer nada.
export const PIT_LEGENDA = [
  ["CT", "Certificado de Qualidade"],
  ["DB", "Documento para o Data Book"],
  ["RI", "Relatório de Inspeção"],
  ["H", "Hold Point (ponto de espera)"],
  ["X", "Inspeção sem registro"],
  ["N.A.", "Não aplicável"],
];
export const PIT_LEGENDA_SNQC = [
  ["JTPT", "Junta de topo com penetração total"],
  ["JAPT", "Junta de ângulo com penetração total"],
  ["JASA", "Junta de ângulo com solda em ângulo"],
];
