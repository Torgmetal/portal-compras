// ─── A PROPOSTA DE ESTRUTURA, EM PARTES ───────────────────────────────────────
// Vitor (30/08/2026): "a proposta tem que ser emitida no nosso padrão, nossa formatação, tudo tem
// que ser como já fazemos (...) como podemos ajustar isso para ficar o mais completo e de certa
// forma conseguir selecionar alguns trechos para colocarmos ou tirarmos da proposta".
//
// Este arquivo é o catálogo. O modelo Word (`PTC-000-26-CLIENTE-OBRA-TORG-R00.docx`, na pasta
// 000-26 do SharePoint) continua sendo o documento — aqui ficam só as PARTES dele: quais trechos
// existem, quais variantes cada um tem, e quais dados a descrição da obra pede.
//
// ⚠⚠ O QUE SEPAROU AS PARTES FOI COMPARAR TRÊS DOCUMENTOS DE VERDADE, não inventar uma estrutura:
//
//   · `PTC-186-26-ORCA-MONTES-CLAROS-TORG-R04` — a proposta simples, fabricação e itens comerciais
//   · `PT-081-26-TMSA-VALE-TORG-R04` + `PC-081-26-…-R06` — a versão que o Vitor escreveu à mão para
//     a VALE, com as cláusulas que ele sentiu falta ("nossa proposta fica com várias brechas")
//   · o modelo `PTC-000-26-CLIENTE-OBRA` e sua variante `SEM MONTAGEM`
//
// A diferença entre a ORCA e a VALE não é redação: são **seções inteiras** que só existem quando
// alguém escreve à mão — pré-montagem, modularização, matriz de cálculo, extensão dos ensaios,
// premissas comerciais. São elas que dizem de quem é a responsabilidade, e é por isso que a falta
// delas vira brecha. Na ORCA dá para ver o custo disso: o cliente pediu chumbadores na base civil
// em 18/08, o texto não mudou, e hoje ninguém sabe de quem é.

// ─── DESCRIÇÃO DA OBRA ────────────────────────────────────────────────────────
// Vitor: "hoje fazemos o levantamento das áreas, e na proposta fazemos a descrição dessas áreas,
// colocando modulação, especificações técnicas entre outras".
//
// ⚠ OS CAMPOS SÃO OS DO MODELO, não os que eu acharia bons. Vieram um a um do
// `PTC-000-26-CLIENTE-OBRA`, incluindo a ordem e o sufixo de unidade — é assim que o documento
// emitido continua parecendo o que o Comercial já emite.
//
// ⚠⚠ E NADA DISSO ESTÁ NA LQC. Procurei os números da ORCA (plataforma 192,60 m², guarda-corpo
// 174,68 m, escada 3,20 m) nas 11 abas do estudo: não existem. Só as quantidades de telha e grade
// vêm da `QTDS ITENS COMERCIAIS`. Todo o resto é digitado na proposta a partir do levantamento —
// é a parte mais trabalhosa do documento e a única sem amarração nenhuma com o custo.
export const ELEMENTOS = [
  {
    id: "COBERTURA", nome: "Cobertura", eixos: true,
    campos: [
      { k: "area", r: "Área", un: "m²" },
      { k: "comprimento", r: "Comprimento", un: "m" },
      { k: "largura", r: "Largura", un: "m" },
      { k: "altura", r: "Pé direito/Altura", un: "m" },
      // a modulação é dois números ("6,00m x 12,00m") — o modelo escreve assim
      { k: "modulacao", r: "Modulação", un: "m", par: true },
    ],
  },
  {
    id: "FECHAMENTO", nome: "Fechamento",
    campos: [
      { k: "area", r: "Área", un: "m²" },
      { k: "alturaTelha", r: "Altura da Telha", un: "m" },
      { k: "alturaAlvenaria", r: "Altura da Alvenaria", un: "m" },
    ],
  },
  {
    id: "PLATAFORMA", nome: "Plataformas",
    campos: [
      { k: "area", r: "Área total do piso", un: "m²" },
      { k: "guardaCorpo", r: "Guarda-corpo", un: "m" },
    ],
  },
  {
    // ⚠ escada é o único que se REPETE numerado na mesma área ("ESCADA - 01", "- 02", "- 03") —
    // na ORCA a Área 300 tem nove. Por isso tem `numerado`.
    id: "ESCADA", nome: "Escada", numerado: true,
    campos: [
      { k: "altura", r: "Altura", un: "m" },
      { k: "guardaCorpo", r: "Guarda-corpo", un: "m" },
      { k: "qtd", r: "Qtd.", un: "un" },
    ],
  },
  {
    id: "GUARDA_CORPO", nome: "Guarda-corpo",
    campos: [{ k: "comprimento", r: "Comprimento", un: "m" }],
  },
  {
    id: "TELHAS_COBERTURA", nome: "Telhas de cobertura", comercial: true,
    campos: [
      { k: "area", r: "Área", un: "m²" },
      { k: "telhaSuperior", r: "Telha superior", texto: true },
      { k: "isolamento", r: "Isolamento", texto: true },
      { k: "telhaInferior", r: "Telha inferior", texto: true },
    ],
  },
  {
    id: "TELHAS_FECHAMENTO", nome: "Telhas de fechamento", comercial: true,
    campos: [
      { k: "area", r: "Área", un: "m²" },
      { k: "telha", r: "Telha", texto: true },
    ],
  },
  {
    id: "CALHAS_RUFOS", nome: "Calhas e rufos", comercial: true,
    campos: [
      { k: "calhas", r: "Calhas aço galvanizado na chapa 24 (0,65mm), com pintura em uma face: Qtd.", un: "m" },
      { k: "rufos", r: "Rufos aço galvanizado na chapa 26 (0,50mm), com pintura em uma face: Qtd.", un: "m" },
    ],
  },
  {
    id: "STEEL_DECK", nome: "Steel deck", comercial: true,
    campos: [{ k: "area", r: "Qtd.", un: "m²" }, { k: "espec", r: "Especificação", texto: true }],
  },
  {
    id: "GRADE_DEGRAUS", nome: "Grades e degraus", comercial: true,
    campos: [
      { k: "gradeArea", r: "Grades de piso — Qtd.", un: "m²" },
      { k: "gradeEspec", r: "Especificação da grade", texto: true },
      { k: "degrauQtd", r: "Degraus — Qtd.", un: "un" },
      { k: "degrauEspec", r: "Especificação do degrau", texto: true },
    ],
  },
  {
    // ⚠ obra industrial não se descreve por m² de cobertura: a VALE é descrita por FAMÍLIA
    // ("01 – APOIOS E ARTICULAÇÕES", "07 – GALERIA"), cada uma com um parágrafo técnico. É o mesmo
    // recorte das áreas do RESUMOS_EM da LQC — e é o que amarra a proposta ao estudo.
    id: "FAMILIA", nome: "Família estrutural (obra industrial)", numerado: true, descritivo: true,
    campos: [{ k: "descricao", r: "Descrição técnica", texto: true, longo: true }],
  },
];

export const ELEMENTO_POR_ID = Object.fromEntries(ELEMENTOS.map((e) => [e.id, e]));

/** A linha do documento: "- Área: 192,60m²;" — com a unidade colada, como o modelo escreve. */
export function linhaDoCampo(campo, valor) {
  if (valor === null || valor === undefined || valor === "") return null;
  if (campo.texto) return `- ${campo.r} ${valor}.`;
  const n = typeof valor === "number"
    ? valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : String(valor);
  return `- ${campo.r}: ${n}${campo.un || ""};`;
}

// ─── OS TRECHOS ───────────────────────────────────────────────────────────────
// Cada bloco é uma seção do documento. Três coisas mandam nele:
//
//   `padrao`   entra marcado, e o orçamentista desmarca se não quiser
//   `variante` a mesma seção escrita de dois jeitos — PADRAO (texto Torg) ou CONFORME_ET (amarrada
//              a uma especificação do cliente). É a diferença entre a ORCA e a VALE.
//   `montagem` só faz sentido quando o escopo inclui montagem em campo
//
// ⚠⚠ `montagem` NÃO É UMA SEÇÃO — É UMA CONDIÇÃO QUE ATRAVESSA NOVE. Comparando o modelo com a sua
// variante "SEM MONTAGEM": mudam 21 parágrafos espalhados por escopo, elaboração de projetos, ART,
// tratamento de superfície, garantias, controle de qualidade, inclusos, responsabilidades da
// contratante — mais a seção Montagem, as condições de pagamento e a tabela de horas ociosas.
// Tratar isso como um bloco só deixaria a proposta dizendo "fabricação e montagem" no escopo e
// nada sobre montagem nos inclusos.
export const CATEGORIAS = [
  { id: "ABERTURA", nome: "Abertura" },
  { id: "ESCOPO", nome: "Escopo e referências" },
  { id: "OBRA", nome: "Descrição da obra" },
  { id: "ENGENHARIA", nome: "Engenharia e normas" },
  { id: "FABRICACAO", nome: "Fabricação e materiais" },
  { id: "QUALIDADE", nome: "Qualidade" },
  { id: "CONDICOES", nome: "Condições" },
  { id: "COMERCIAL", nome: "Comercial" },
];

export const BLOCOS = [
  // ── escopo e referências ──
  { id: "ESCOPO", cat: "ESCOPO", titulo: "Escopo", padrao: true, obrigatorio: true, doc: ["PT", "PC"],
    nota: "A frase de abertura muda com o escopo: 'cálculo estrutural' ou 'cálculo de ligações', e 'fabricação' ou 'fabricação e montagem'." },

  // ⚠ ESTE É O BLOCO QUE MAIS FECHA BRECHA, e ele não existe na ORCA. Na VALE o Vitor listou os 9
  // documentos do cliente por código e revisão (ET-M-412, PIT TPR00751-008-00103, check lists).
  // Citar a ESPECIFICAÇÃO que rege a obra — não só os desenhos — é o que decide uma discussão
  // depois: o que foi orçado foi o que aquele documento, naquela revisão, exigia.
  { id: "DOCUMENTOS_REF", cat: "ESCOPO", titulo: "Documentos referentes", padrao: true, doc: ["PT", "PC"],
    fonte: "3.Documentos da pasta do orçamento",
    nota: "Especificações técnicas, PIT e check lists do cliente, com código e revisão." },

  { id: "PROJETOS_REF", cat: "ESCOPO", titulo: "Projetos referentes", padrao: true, doc: ["PT", "PC"],
    fonte: "2.Projetos da pasta do orçamento",
    nota: "Os desenhos que serviram de base, com revisão." },

  { id: "DESCRICAO_OBRA", cat: "OBRA", titulo: "Descrição da obra", padrao: true, doc: ["PT"],
    nota: "Montada a partir dos elementos lançados (ver ELEMENTOS)." },
  { id: "DESCRICAO_TECNICA", cat: "OBRA", titulo: "Descrição técnica dos itens", padrao: true, doc: ["PT"],
    nota: "Os quatro parágrafos sobre plataformas, guarda-corpos, escadas e coberturas." },
  { id: "ITENS_COMERCIAIS", cat: "OBRA", titulo: "Telhas, rufos, steel deck, grades e degraus", padrao: true, doc: ["PT"],
    fonte: "QTDS ITENS COMERCIAIS da LQC" },

  // ── as seções que só existem na versão escrita à mão ──
  { id: "PRE_MONTAGEM", cat: "FABRICACAO", titulo: "Pré-montagem", padrao: false, doc: ["PT"],
    nota: "Cenários com peso e % sobre a base, metodologia por família e a regra de precificação separada. Sem isso a pré-montagem some do preço e aparece na fábrica." },
  { id: "MODULARIZACAO", cat: "FABRICACAO", titulo: "Modularização", padrao: false, doc: ["PT"],
    nota: "Envelope de transporte e o % parafusado/soldado de cada família. É o que define quanto sai soldado de fábrica." },
  { id: "PREMISSAS_CALCULO", cat: "ENGENHARIA", titulo: "Escopo e premissas do cálculo estrutural", padrao: false, doc: ["PT"],
    nota: "A matriz de quem calcula o quê, por família, e o que fica de fora. Na VALE é o que separou barras de ligações." },

  // ── engenharia ──
  { id: "NORMAS", cat: "ENGENHARIA", titulo: "Normas utilizadas", padrao: true, doc: ["PT"] },
  { id: "ELABORACAO_PROJETOS", cat: "ENGENHARIA", titulo: "Elaborações dos projetos", padrao: true, doc: ["PT"],
    variantes: ["PADRAO", "COM_BIM"],
    nota: "A variante COM_BIM acrescenta modelo tridimensional, IFC 4.0 e a codificação/templates do cliente." },
  { id: "ART", cat: "ENGENHARIA", titulo: "Anotação de responsabilidade técnica", padrao: true, doc: ["PT"], montagem: "muda" },

  // ── fabricação ──
  { id: "MATERIAIS", cat: "FABRICACAO", titulo: "Materiais empregados", padrao: true, doc: ["PT"],
    variantes: ["PADRAO", "CONFORME_ET"],
    nota: "PADRÃO usa parafusos eletrolíticos A325/A307. CONFORME_ET troca por galvanizados a fogo classes 8.8/5.8/10.9 e acrescenta perfis soldados e pinos — foi o caso da VALE." },
  { id: "TRATAMENTO", cat: "FABRICACAO", titulo: "Tratamento de superfície", padrao: true, doc: ["PT"],
    variantes: ["PADRAO", "CONFORME_ET"], montagem: "muda", fonte: "MC_TINTAS da LQC",
    nota: "CONFORME_ET amarra à especificação do cliente (ET-M-412 Rev.01 na VALE) e inclui a cláusula de alteração do esquema na fase de detalhamento." },
  { id: "DIMENSIONAMENTO", cat: "FABRICACAO", titulo: "Dimensionamento e resistência", padrao: true, doc: ["PT"] },

  // ── qualidade ──
  { id: "CONTROLE_QUALIDADE", cat: "QUALIDADE", titulo: "Controle de qualidade", padrao: true, doc: ["PT"],
    variantes: ["PADRAO", "CONFORME_PIT"], montagem: "muda",
    nota: "CONFORME_PIT declara atendimento ao PIT do cliente e fixa a EXTENSÃO dos ensaios (US e LP em %), pull-off, salinidade e os pontos de parada. Sem o percentual, 'ensaios inclusos' não quer dizer nada." },
  { id: "PIT_ANEXO", cat: "QUALIDADE", titulo: "Anexo — Plano de Inspeção e Testes", padrao: false, doc: ["PT"],
    fonte: "3.Documentos (PIT do cliente) ou o PIT padrão Torg" },

  // ── condições ──
  { id: "GARANTIAS", cat: "CONDICOES", titulo: "Garantias", padrao: true, doc: ["PT"], montagem: "muda" },
  { id: "CONSIDERACOES", cat: "CONDICOES", titulo: "Considerações gerais", padrao: true, doc: ["PT"] },
  { id: "PRAZO", cat: "CONDICOES", titulo: "Prazo de execução", padrao: true, doc: ["PT", "PC"],
    nota: "Hoje sai sempre 'conforme cronograma a ser desenvolvido após aprovação'. Nenhuma das 5 revisões da ORCA tinha prazo." },
  { id: "INCLUSOS", cat: "CONDICOES", titulo: "Inclusos", padrao: true, obrigatorio: true, doc: ["PT"], montagem: "muda" },
  { id: "EXCLUSOS", cat: "CONDICOES", titulo: "Exclusos", padrao: true, obrigatorio: true, doc: ["PT"], montagem: "muda" },
  { id: "RESP_CONTRATANTE", cat: "CONDICOES", titulo: "Responsabilidades da contratante", padrao: true, doc: ["PT"], montagem: "muda" },
  { id: "MONTAGEM", cat: "CONDICOES", titulo: "Montagem", padrao: false, doc: ["PT"], montagem: "so" },

  // ── comercial ──
  { id: "PLANILHA_PRECO", cat: "COMERCIAL", titulo: "Planilha de quantidade e preço", padrao: true, obrigatorio: true, doc: ["PC"],
    fonte: "PLANILHA COMERCIAL da LQC" },
  { id: "PREMISSAS_COMERCIAIS", cat: "COMERCIAL", titulo: "Premissas comerciais", padrao: false, doc: ["PC"],
    nota: "Base do quantitativo, reajuste de matéria-prima e combustível, mudança tributária, critério de medição, revisão de projeto depois de iniciada a fabricação e quando se fatura. Sete cláusulas na VALE; na ORCA, notas soltas." },
  { id: "NOTAS_COMERCIAIS", cat: "COMERCIAL", titulo: "Notas", padrao: true, doc: ["PC"] },
  { id: "IMPOSTOS", cat: "COMERCIAL", titulo: "Impostos e faturamento", padrao: true, doc: ["PC"], fonte: "BDI da LQC" },
  { id: "MEDICOES", cat: "COMERCIAL", titulo: "Medições", padrao: true, doc: ["PC"], montagem: "muda" },
  { id: "PAGAMENTO", cat: "COMERCIAL", titulo: "Condições de pagamento", padrao: true, obrigatorio: true, doc: ["PC"], montagem: "muda" },
  { id: "HORAS_OCIOSAS", cat: "COMERCIAL", titulo: "Horas ociosas", padrao: false, doc: ["PC"], montagem: "so",
    nota: "A tabela de R$/hora por função — só faz sentido com equipe em campo." },
  { id: "VALIDADE", cat: "COMERCIAL", titulo: "Validade da proposta", padrao: true, obrigatorio: true, doc: ["PC"],
    nota: "A ORCA saiu com 5 dias e venceu no meio da negociação." },
  { id: "ASSINATURA", cat: "COMERCIAL", titulo: "Assinatura das partes", padrao: true, doc: ["PT", "PC"] },
];

export const BLOCO_POR_ID = Object.fromEntries(BLOCOS.map((b) => [b.id, b]));

// ─── OS TRÊS DOCUMENTOS ───────────────────────────────────────────────────────
// Vitor: "precisamos de uma PT e PC para ficar completo, e em alguns casos será necessário a PTC".
//
// ⚠ Não são três documentos: são três montagens da mesma base. Capa, escopo, documentos e projetos
// referentes se repetem nos três — na VALE a PT-R04 e a PC-R06 trazem as mesmas listas.
//
// ⚠⚠ E A REVISÃO É POR DOCUMENTO, não por proposta: na VALE a técnica parou no R04 enquanto a
// comercial seguiu até o R06 ("ajuste comercial após reunião"). Amarrar as duas obrigaria a
// reemitir a técnica a cada rodada de preço — e reemitir técnica é o que abre discussão de escopo.
export const TIPOS_PROPOSTA = [
  { id: "PT", nome: "Proposta Técnica", prefixo: "PT" },
  { id: "PC", nome: "Proposta Comercial", prefixo: "PC" },
  { id: "PTC", nome: "Proposta Técnica e Comercial", prefixo: "PTC" },
];

/** Os blocos que entram num tipo de documento. */
export function blocosDoTipo(tipo) {
  const quer = tipo === "PTC" ? ["PT", "PC"] : [tipo];
  return BLOCOS.filter((b) => b.doc.some((d) => quer.includes(d)));
}

/** "PTC-186-26-R04" — o número como o Comercial escreve. */
export function numeroDaProposta({ tipo = "PTC", orcamento, revisao = 0 }) {
  const [num, ano] = String(orcamento || "000-00").split("-");
  return `${tipo}-${num}-${ano}-R${String(revisao).padStart(2, "0")}`;
}

/** Blocos válidos para o escopo, já resolvendo a condição de montagem. */
export function blocosAplicaveis({ tipo = "PTC", comMontagem = false } = {}) {
  return blocosDoTipo(tipo).filter((b) => (b.montagem === "so" ? comMontagem : true));
}

/** A seleção inicial: o que vem marcado quando a proposta nasce. */
export function selecaoPadrao({ tipo = "PTC", comMontagem = false } = {}) {
  const sel = {};
  for (const b of blocosAplicaveis({ tipo, comMontagem })) {
    sel[b.id] = { incluso: !!b.padrao || !!b.obrigatorio, variante: b.variantes?.[0] || null };
  }
  return sel;
}
