import "server-only";
import { num, celula, linha, montarTabela } from "./docx-tabela";

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

const COLUNAS = [
  { w: 700, r: "Item", al: "center" },
  { w: 4300, r: "Descrição", al: "left" },
  { w: 600, r: "un.", al: "center" },
  { w: 1400, r: "Quant.", al: "right" },
  { w: 1300, r: "Unit. R$", al: "right" },
  { w: 1481, r: "Valor R$", al: "right" },
];

// ⚠ as primitivas (Arial 10 pt, borda sz 4, 9781 dxa) moram em lib/docx-tabela — a tabela do
// cronograma usa exatamente as mesmas, e duas cópias divergem na primeira edição.

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

  return montarTabela(COLUNAS, linhas);
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

// ─── A TABELA DE IMPOSTOS E FATURAMENTO ───────────────────────────────────────
// Vitor (30/08/2026): "a informação do faturamento direto é muito relevante, pois isso tem que ser
// destacado na proposta; quando for faturamento Torg aí você informa sobre o faturamento Torg".
//
// ⚠⚠ NA PROPOSTA DE VERDADE ISSO É UMA TABELA, NÃO UM PARÁGRAFO. Abrindo a PTC-186-26 por dentro,
// são TRÊS planilhas embutidas: preço, impostos/faturamento e o PIT. A de impostos tem
// Descrição | % | Valor | CFOP | PIS | COFINS | ICMS | ISS, com o direto separado do Torg e o Torg
// aberto em sinal, projeto e industrialização. Escrever isso em prosa perde a informação que o
// cliente usa: qual CFOP, qual alíquota, sobre qual parcela.
const COL_FAT = [
  { w: 2600, r: "Descrição", al: "left" },
  { w: 700, r: "%", al: "center" },
  { w: 1700, r: "Valor R$", al: "right" },
  { w: 1000, r: "CFOP", al: "center" },
  { w: 800, r: "PIS", al: "center" },
  { w: 900, r: "COFINS", al: "center" },
  { w: 900, r: "ICMS", al: "center" },
  { w: 800, r: "ISS", al: "center" },
];

const pct = (v) => (v || v === 0 ? `${num(v, 2)}%` : "-");

/**
 * Impostos e faturamento.
 *
 * ⚠ AS PARCELAS SAEM DO ESTUDO, NÃO DE UM PADRÃO FIXO. Vitor: "nos pagamentos precisamos deixar
 * alinhado conforme decidirmos na LQC, e você só traz para a proposta". Sinal/projeto/
 * industrialização em 25/15/60 é o mais comum, mas é decisão de cada obra — travar aqui faria a
 * proposta contradizer o estudo que a gerou.
 */
export function tabelaDeFaturamento(resultado, parcelas = null) {
  const direto = Number(resultado?.custoDireto) || 0;
  const torg = Number(resultado?.preco) || 0;
  if (!torg && !direto) return null;

  const linhas = [linha(COL_FAT.map((c) => celula({ w: c.w, texto: c.r, al: "center", negrito: true })))];
  const cel = (vals, negrito = false) => linha(COL_FAT.map((c, i) => celula({ w: c.w, texto: vals[i] ?? "", al: c.al, negrito })));

  if (direto > 0) {
    linhas.push(cel(["FATURAMENTO DIRETO", "", num(direto), "", "", "", "", ""], true));
    linhas.push(cel(["Material adquirido pela CONTRATANTE", "100,00%", num(direto), "-", pct(1.65), pct(7.6), pct(7), "-"]));
  }
  if (torg > 0) {
    linhas.push(cel(["FATURAMENTO TORG", "", num(torg), "", "", "", "", ""], true));
    const padrao = [
      { nome: "SINAL", p: 25, cfop: "6101", icms: 12, iss: null },
      { nome: "PROJETO", p: 15, cfop: "701", icms: null, iss: 2 },
      { nome: "INDUSTRIALIZAÇÃO", p: 60, cfop: "6101", icms: 12, iss: null },
    ];
    for (const x of (parcelas?.length ? parcelas : padrao)) {
      linhas.push(cel([x.nome, pct(x.p), num((torg * x.p) / 100), x.cfop || "-",
                       pct(1.65), pct(7.6), x.icms ? pct(x.icms) : "-", x.iss ? pct(x.iss) : "-"]));
    }
    linhas.push(cel(["", "", num(torg), "", "", "", "", ""], true));
  }

  return montarTabela(COL_FAT, linhas);
}

/**
 * O pedaço tem um objeto embutido (planilha colada no Word)?
 *
 * ⚠⚠ É POR ISSO QUE A TABELA VELHA SOBRAVA. Vitor: "você precisa excluir a anterior que estava". O
 * modelo 000-26 carrega DUAS planilhas Excel embutidas como exemplo — preço e impostos — e elas
 * seguiam no documento gerado, ao lado das tabelas novas. Quem abrisse veria os números de outra
 * obra logo acima dos da sua.
 */
export const temObjetoEmbutido = (xml) => /<w:object[\s>]|OLEObject/.test(xml);
