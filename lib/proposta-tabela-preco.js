import "server-only";

// ─── A PLANILHA DE QUANTIDADE E PREÇO ─────────────────────────────────────────
// Vitor (30/08/2026): "no item 2.1 você não conseguiu trazer a planilha comercial da LQC, é aí que
// você precisa trabalhar".
//
// ⚠⚠ E O MOTIVO É QUE ELA NÃO EXISTE NO MODELO. As cinco tabelas do `PTC-000-26` são A/C,
// Referência, Revisão, Horas ociosas e Assinatura — nenhuma de preço. Hoje o Comercial COLA a
// tabela da LQC no Word à mão, e é justamente a colagem que perde o vínculo: a proposta passa a
// ter um preço que ninguém consegue rastrear até o estudo que o gerou.
//
// Aqui a tabela é CONSTRUÍDA a partir do `resultado` do estudo — o mesmo cálculo que fecha o BDI.
// Se o estudo mudar, a próxima emissão muda junto.
//
// ⚠ O estilo é copiado da tabela de horas ociosas do próprio modelo: Arial 10pt, borda simples
// sz 4, largura 9781 dxa. Tabela construída "no capricho" mas com outra fonte denuncia documento
// gerado por máquina na hora em que o cliente compara com a proposta anterior.

const LARGURA = 9781;
const COLUNAS = [
  { w: 700, r: "Item", al: "center" },
  { w: 4300, r: "Descrição", al: "left" },
  { w: 600, r: "un.", al: "center" },
  { w: 1400, r: "Quant.", al: "right" },
  { w: 1300, r: "Unit. R$", al: "right" },
  { w: 1481, r: "Valor R$", al: "right" },
];

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const num = (v, casas = 2) =>
  Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });

const FONTE = '<w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:sz w:val="20"/><w:szCs w:val="20"/>';

function celula({ w, texto, al = "left", negrito = false }) {
  const rPr = `<w:rPr>${FONTE}${negrito ? "<w:b/><w:bCs/>" : ""}</w:rPr>`;
  return `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/></w:tcPr>`
    + `<w:p><w:pPr><w:jc w:val="${al}"/>${rPr}</w:pPr>`
    + `<w:r>${rPr}<w:t xml:space="preserve">${esc(texto)}</w:t></w:r></w:p></w:tc>`;
}

const linha = (celulas) => `<w:tr>${celulas.join("")}</w:tr>`;

/**
 * A tabela de preço, a partir do resultado do estudo.
 *
 * @param {object} resultado  `EstudoFabricacao.resultado` — usa `porArea`
 * @param {object} opcoes     { titulo, descricao }
 * @returns {string|null} XML da tabela, ou null quando não há o que mostrar
 *
 * ⚠ ÁREA SEM PESO NÃO VIRA LINHA. O estudo guarda o levantamento inteiro, inclusive área
 * desmarcada do escopo (peso zero). Uma linha "0,00 kg — R$ 0,00" numa proposta comercial faz o
 * cliente perguntar o que é aquilo, e a resposta é "nada".
 */
export function tabelaDePreco(resultado, { titulo = "FORNECIMENTO DE ESTRUTURAS METÁLICAS", item = "1" } = {}) {
  const areas = (resultado?.porArea || []).filter((a) => Number(a.pesoKg) > 0);
  if (!areas.length) return null;

  const linhas = [
    // cabeçalho
    linha(COLUNAS.map((c) => celula({ w: c.w, texto: c.r, al: "center", negrito: true }))),
    // o grupo
    linha([
      celula({ w: COLUNAS[0].w, texto: item, al: "center", negrito: true }),
      celula({ w: COLUNAS[1].w, texto: titulo, negrito: true }),
      ...COLUNAS.slice(2).map((c) => celula({ w: c.w, texto: "", al: c.al })),
    ]),
  ];

  let total = 0;
  areas.forEach((a, i) => {
    total += Number(a.preco) || 0;
    linhas.push(linha([
      celula({ w: COLUNAS[0].w, texto: `${item}.${i + 1}`, al: "center" }),
      celula({ w: COLUNAS[1].w, texto: `Fornecimento das estruturas metálicas ${a.area}` }),
      celula({ w: COLUNAS[2].w, texto: "kg", al: "center" }),
      celula({ w: COLUNAS[3].w, texto: num(a.pesoKg), al: "right" }),
      celula({ w: COLUNAS[4].w, texto: num(a.precoPorKg), al: "right" }),
      celula({ w: COLUNAS[5].w, texto: num(a.preco), al: "right" }),
    ]));
  });

  linhas.push(linha([
    celula({ w: COLUNAS[0].w, texto: "", al: "center" }),
    celula({ w: COLUNAS[1].w, texto: "SUBTOTAL", negrito: true }),
    celula({ w: COLUNAS[2].w, texto: "", al: "center" }),
    celula({ w: COLUNAS[3].w, texto: num(areas.reduce((s, a) => s + (Number(a.pesoKg) || 0), 0)), al: "right", negrito: true }),
    celula({ w: COLUNAS[4].w, texto: "", al: "right" }),
    celula({ w: COLUNAS[5].w, texto: num(total), al: "right", negrito: true }),
  ]));

  const bordas = ["top", "left", "bottom", "right", "insideH", "insideV"]
    .map((b) => `<w:${b} w:val="single" w:sz="4" w:space="0" w:color="000000"/>`).join("");
  return `<w:tbl><w:tblPr><w:tblW w:w="${LARGURA}" w:type="dxa"/>`
    + `<w:tblBorders>${bordas}</w:tblBorders>`
    + `<w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="1" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/>`
    + `</w:tblPr><w:tblGrid>${COLUNAS.map((c) => `<w:gridCol w:w="${c.w}"/>`).join("")}</w:tblGrid>`
    + linhas.join("") + `</w:tbl>`;
}

/**
 * As frases de faturamento.
 *
 * ⚠⚠ Vitor: "a informação do faturamento direto é muito relevante, isso tem que ser destacado na
 * proposta; quando for faturamento Torg aí você informa sobre o faturamento Torg". Não é detalhe
 * fiscal: material em faturamento direto o CLIENTE compra e paga ao fornecedor — se a proposta não
 * disser isso com todas as letras, ele entende que está tudo no preço da Torg. Na ORCA são
 * R$ 1.015.681,78 nessa condição, 8,4% da venda.
 */
export function frasesDeFaturamento(resultado) {
  const torg = Number(resultado?.custoTorg) || 0;
  const direto = Number(resultado?.custoDireto) || 0;
  if (!torg && !direto) return [];
  const out = [];
  if (direto > 0) {
    out.push(
      "FATURAMENTO DIRETO AO CLIENTE: os itens assim identificados nesta planilha serão faturados "
      + "diretamente pelo fornecedor à CONTRATANTE, que responde pelo pagamento, pelo recebimento e "
      + "pelos tributos incidentes. O valor correspondente NÃO integra o faturamento da TORG."
    );
    out.push(
      `Valor previsto em faturamento direto: R$ ${num(direto)}.`
    );
  }
  if (torg > 0) {
    out.push(
      `FATURAMENTO TORG: R$ ${num(torg)}, compreendendo os itens fornecidos e faturados pela TORG, `
      + "com os tributos já considerados nos preços unitários desta proposta."
    );
  }
  return out;
}
