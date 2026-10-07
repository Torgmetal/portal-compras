// ─── OS RECEBIMENTOS NASCEM DOS CERTIFICADOS DO CMR, NÃO DE PEÇAS ─────────────────────────────
//
// Vitor (07/10/2026), para a QWS: "relatório de recebimento de tintas: está para selecionar as peças, mas
// nesse eu preciso apenas selecionar os certificados das tintas e diluentes"; e criar o recebimento de
// penetrante e revelador e o de arame de solda, "selecionar apenas os certificados deles, sem peças".
//
// ⚠ O QUE SE RECEBE JÁ ESTÁ NO CMR: o Almoxarifado lança produto, fornecedor, NF, pedido, nº do certificado,
// lote/corrida, validade e o PDF do certificado. Escolher o certificado traz tudo isso sem redigitar — o
// relatório guarda uma CÓPIA (snapshot), como o tipo da peça no dimensional: o documento registra o que
// foi conferido no dia, e uma correção posterior no CMR não reescreve relatório assinado.
//
// ⚠ NEM TUDO ESTÁ NO CMR. Medido em 07/10/2026: do líquido penetrante só o REVELADOR (Metalcheck D-70,
// R 261266) foi lançado — penetrante e removedor não. Por isso a classe só ORDENA a lista; a busca acha
// qualquer lançamento, e a tela permite incluir item à mão.
import { classificarMaterial } from "./databook-secoes";
import { tipoDoProduto } from "./plp";
import { preencherDoCmr } from "./recebimento-tinta-campos";

export const TIPOS_RECEBIMENTO = Object.freeze(["RECEBIMENTO_TINTA", "RECEBIMENTO_PENETRANTE", "RECEBIMENTO_ARAME"]);
export const ehRecebimento = (tipo) => TIPOS_RECEBIMENTO.includes(tipo);

/**
 * Quantos certificados cabem num relatório. ⚠ O de tintas é o modelo do SGQ, com os lotes de TRÊS
 * componentes (A, B e C — base, endurecedor e diluente); os outros têm uma linha por certificado.
 */
export const MAX_CERTIFICADOS = Object.freeze({ RECEBIMENTO_TINTA: 3, RECEBIMENTO_PENETRANTE: 40, RECEBIMENTO_ARAME: 40 });

/** Como a tela chama o que cada recebimento procura. */
export const ROTULO_CLASSE = Object.freeze({
  RECEBIMENTO_TINTA: "tintas, endurecedores e diluentes",
  RECEBIMENTO_PENETRANTE: "penetrante, revelador e removedor",
  RECEBIMENTO_ARAME: "arames e eletrodos de solda",
});

// ⚠ o penetrante não tem grupo em `classificarMaterial` (cai em ESTRUTURAL): o nome do produto e as marcas
// do ensaio (Metalcheck VP-30 / E-59 / D-70, Magnaflux, Spotcheck, Zyglo) é que dizem
const RX_LP = /(PENETRANTE|REVELADOR|REMOVEDOR|METALCHECK|MAGNAFLUX|SPOTCHECK|ZYGLO|\bVP-?30\b|\bE-?59\b|\bD-?70\b)/i;

/** O certificado deste nome é do que este recebimento confere? (ordena a lista; não esconde nada) */
export function certificadoDaClasse(tipo, nome) {
  const n = String(nome || "");
  if (tipo === "RECEBIMENTO_TINTA") return classificarMaterial(n) === "TINTA";
  if (tipo === "RECEBIMENTO_PENETRANTE") return RX_LP.test(n);
  if (tipo === "RECEBIMENTO_ARAME") return classificarMaterial(n) === "CONSUMIVEL";
  return false;
}

const texto = (v) => (v == null ? "" : String(v).trim());
const dia = (d) => {
  if (!d) return "";
  const x = d instanceof Date ? d : new Date(d);
  return Number.isNaN(x.getTime()) ? "" : x.toISOString().slice(0, 10);
};
const fmtQtd = (n) => Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 2 });

/**
 * A linha do relatório a partir de um lançamento do CMR (`DocumentoQualidade`).
 * ⚠ PESO VENCE QUANTIDADE: o arame chega pesado ("2.160 kg") e o CMR guarda 0 na quantidade; a tinta e o
 * diluente chegam em unidades (20 galões) e sem peso.
 * ⚠ As marcas (visual, dimensional, documentação) e o nº da RNC nascem em branco: são do inspetor.
 */
export function linhaDoCertificado(doc = {}) {
  const peso = Number(doc.pesoKg), qtd = Number(doc.quantidade);
  return {
    docId: texto(doc.id),
    r: texto(doc.importRef ?? doc.indiceR),
    descricao: texto(doc.nome),
    fornecedor: texto(doc.fornecedor),
    nf: texto(doc.nfNumero),
    itemNf: "",
    pc: texto(doc.pedidoCompra),
    certificado: texto(doc.numeroDocumento),
    lote: texto(doc.numeroCorrida),
    validade: dia(doc.dataValidade),
    quantidade: peso > 0 ? `${fmtQtd(peso)} kg` : qtd > 0 ? fmtQtd(qtd) : "",
    recebidoEm: dia(doc.dataRecebimento),
    opNumero: doc.opNumero ?? null,
    temPdf: !!(doc.arquivoUrl || doc.sharepointUrl),
    norma: texto(doc.norma),
    visual: "", dimensional: "", documentos: "", rnc: "",
  };
}

/** Qual componente do recebimento de tintas: B = endurecedor/catalisador, C = diluente, A = a tinta. */
export function componenteDaTinta(nome) {
  const n = String(nome || "").toUpperCase();
  if (/ENDURECEDOR|CATALIS|COMPONENTE B|COMP\.? ?B/.test(n)) return "B";
  if (/DILUENTE|THINNER|TINNER|SOLVENTE|REDUTOR/.test(n)) return "C";
  return "A";
}

/**
 * Os certificados escolhidos, em A/B/C, no formato que `preencherDoCmr` (lib/recebimento-tinta-campos) lê.
 * ⚠ Posição já ocupada não perde o certificado: ele vai para a próxima livre, na ordem A, B, C — duas tintas
 * no mesmo relatório é escolha de quem conferiu, e sumir com uma delas seria pior que a posição "errada".
 */
/** A posição (A, B, C ou null quando não sobra) de cada certificado, na ordem da lista — a tela e a criação usam esta. */
export function componentesDosCertificados(linhas = []) {
  const ocupados = new Set();
  const pos = linhas.map((l) => {
    const c = componenteDaTinta(l.descricao);
    if (ocupados.has(c)) return null;
    ocupados.add(c);
    return c;
  });
  return pos.map((c) => {
    if (c) return c;
    const livre = ["A", "B", "C"].find((x) => !ocupados.has(x));
    if (livre) ocupados.add(livre);
    return livre || null;
  });
}

export function lotesDaTinta(linhas = []) {
  const posicoes = componentesDosCertificados(linhas);
  const escolhidos = Object.fromEntries(linhas.map((l, i) => [posicoes[i], l]).filter(([c]) => c));
  return Object.fromEntries(Object.entries(escolhidos).map(([c, l]) => [c, {
    produto: l.descricao, tipo: tipoDoProduto(l.descricao), fabricante: l.fornecedor || null,
    lote: l.lote || null, validade: l.validade || null, certificado: l.certificado || null, norma: l.norma || null,
    quantidade: l.quantidade || null,
  }]));
}

/** A cópia do certificado que fica no relatório de tintas, sem os campos de inspeção (que lá não existem). */
const copiaDoCertificado = ({ visual: _v, dimensional: _d, documentos: _doc, rnc: _rnc, itemNf: _item, temPdf: _pdf, ...resto }) => resto;

/**
 * O recebimento de tintas que nasce dos certificados escolhidos: material, fabricante, certificado e norma da
 * tinta (componente A), os lotes A/B/C com validade e QUANTIDADE do CMR, e a cópia dos certificados — o
 * modelo do SGQ tem um só "nº do certificado", e sem a cópia o do endurecedor e o do diluente se perderiam.
 */
export function resultadosDaTinta(linhas = [], base = {}) {
  if (!linhas.length) return base;
  const escolhidos = lotesDaTinta(linhas);
  // ⚠ por cima do que o relatório já nasce trazendo (o padrão da obra): o CMR só PREENCHE o que está vazio
  const res = preencherDoCmr(base, escolhidos);
  const lotes = (res.lotes || []).map((l, i) => {
    const e = escolhidos[["A", "B", "C"][i]];
    return e?.quantidade && !texto(l.quantidade) ? { ...l, quantidade: e.quantidade } : l;
  });
  return { ...res, lotes, certificados: linhas.map(copiaDoCertificado) };
}

/**
 * A ordem da lista de escolha: primeiro o que é da classe (o arame no recebimento de arame), depois o que
 * foi recebido PARA ESTA OBRA, e dentro disso o mais recente — o certificado que se confere hoje costuma ser
 * o da última entrega.
 */
export function ordenarCertificados(lista = [], { tipo, opNumero } = {}) {
  const op = String(opNumero || "").replace(/^0+/, "");
  const peso = (l) => (certificadoDaClasse(tipo, l.descricao) ? 2 : 0) + (op && String(l.opNumero || "").replace(/^0+/, "") === op ? 1 : 0);
  return [...lista].sort((a, b) => peso(b) - peso(a) || String(b.recebidoEm || "").localeCompare(String(a.recebidoEm || "")));
}
