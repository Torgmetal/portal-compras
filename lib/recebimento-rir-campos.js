// ─── RECEBIMENTO POR CERTIFICADO: PENETRANTE/REVELADOR (RRP) E ARAME DE SOLDA (RRA) ──────────────
//
// Vitor (07/10/2026), para a QWS: criar o recebimento de penetrante e revelador e o de arame de solda,
// "selecionar apenas os certificados deles, sem peças". O modelo de RIR que veio junto é de um concorrente
// e "é apenas um modelo para saber as informações necessárias" — o documento é da Torg.
//
// O que o RIR registra, por item recebido: NF e item da NF, certificado e/ou lote, pedido de compra,
// descrição do produto, quantidade, a inspeção feita (visual, dimensional e dos documentos — aprovado,
// reprovado ou não aplicável) e o nº da RNC quando reprova. Uma linha por CERTIFICADO, que vem do CMR
// (lib/recebimento-certificados) e o inspetor confere e corrige.
//
// ⚠⚠ O RESULTADO segue a regra do recebimento de tintas (lib/recebimento-tinta-campos): item reprovado ou
// validade vencida EXIGEM reprovar; reprovar com tudo aprovado é permitido (produto trocado, embalagem sem
// identificação…), com o motivo nas observações — sem essa saída o relatório ficaria preso.
import { dataReferenciaRecebimento, dataCurtaBR } from "./recebimento-tinta-campos";

/** As três inspeções de cada item, na ordem do modelo. `curto` é o cabeçalho da coluna no PDF. */
export const INSPECOES_RIR = Object.freeze([
  { k: "visual", rotulo: "Visual", curto: "VIS." },
  { k: "dimensional", rotulo: "Dimensional", curto: "DIM." },
  { k: "documentos", rotulo: "Documentação", curto: "DOC." },
]);
/** A = aprovado · R = reprovado · NA = não aplicável (o arame não tem dimensional a conferir, por exemplo). */
export const MARCAS_RIR = Object.freeze(["A", "R", "NA"]);
export const rotuloMarca = (v) => (v === "NA" ? "N.A." : MARCAS_RIR.includes(v) ? v : "");

/** Teto de itens por relatório — a lista de escolha também para aqui. */
export const N_ITENS_RIR = 40;

/** Os campos de texto de cada item, com o teto que as rotas gravam. */
export const CAMPOS_ITEM_RIR = Object.freeze([
  { k: "descricao", rotulo: "Descrição do produto", max: 200 },
  { k: "fornecedor", rotulo: "Fornecedor", max: 80 },
  { k: "nf", rotulo: "NF", max: 30 },
  { k: "itemNf", rotulo: "Item da NF", max: 10 },
  { k: "certificado", rotulo: "Certificado", max: 60 },
  { k: "lote", rotulo: "Lote / corrida", max: 60 },
  { k: "pc", rotulo: "Pedido de compra", max: 30 },
  { k: "quantidade", rotulo: "Quantidade", max: 30 },
  { k: "rnc", rotulo: "Nº da RNC", max: 30 },
]);
// o que veio do CMR e não se edita na tela, mas tem de sobreviver às gravações
const CAMPOS_ORIGEM = Object.freeze([{ k: "docId", max: 40 }, { k: "r", max: 20 }]);

/** O cabeçalho, para a tela, o celular e o PDF — a mesma lista. */
export const CAMPOS_CABECALHO_RIR = Object.freeze([
  { k: "contrato", rotulo: "Contrato" },
  { k: "localAplicacao", rotulo: "Local de aplicação" },
  { k: "dataInspecao", rotulo: "Data do recebimento", data: true },
]);

const texto = (v) => String(v ?? "").trim();
const dataIso = (v) => {
  const m = texto(v).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
};
const marca = (v) => {
  const s = texto(v).toUpperCase().replace(/\./g, "");
  return MARCAS_RIR.includes(s) ? s : "";
};

/** Os itens gravados, normalizados e numerados (1, 2, 3…). */
export function itensRir(res = {}) {
  const lista = Array.isArray(res.itens) ? res.itens : [];
  return lista.filter((i) => i && typeof i === "object").map((i, n) => ({
    ...Object.fromEntries([...CAMPOS_ITEM_RIR, ...CAMPOS_ORIGEM].map((c) => [c.k, texto(i[c.k])])),
    validade: dataIso(i.validade) ? texto(i.validade) : "",
    ...Object.fromEntries(INSPECOES_RIR.map((c) => [c.k, marca(i[c.k])])),
    numero: n + 1,
  }));
}

/**
 * O que as rotas gravam da lista (as duas: computador e celular). Campo fora daqui é descartado; marca
 * inválida vira nula; data só de calendário; no máximo `N_ITENS_RIR` itens.
 */
export function limparItensRir(lista) {
  if (!Array.isArray(lista)) return [];
  const txt = (v, n) => (v == null || String(v).trim() === "" ? null : String(v).slice(0, n));
  return lista.slice(0, N_ITENS_RIR).filter((i) => i && typeof i === "object").map((i) => ({
    ...Object.fromEntries([...CAMPOS_ITEM_RIR, ...CAMPOS_ORIGEM].map((c) => [c.k, txt(i[c.k], c.max)])),
    validade: dataIso(i.validade) ? texto(i.validade) : null,
    ...Object.fromEntries(INSPECOES_RIR.map((c) => [c.k, marca(i[c.k]) || null])),
  }));
}

/** Itens com validade vencida na data do recebimento — a MESMA data que o PDF imprime (nunca "hoje"). */
export function itensVencidosRir(rel = {}) {
  const ref = dataReferenciaRecebimento(rel);
  return itensRir(rel.resultados || {}).filter((i) => i.validade && i.validade < ref);
}

const reprovado = (i) => INSPECOES_RIR.some((c) => i[c.k] === "R");
const completo = (i) => INSPECOES_RIR.every((c) => i[c.k]);

/** O resultado que os itens EXIGEM: REPROVADO com algum R ou validade vencida; APROVADO com tudo marcado; "" enquanto falta. */
export function resultadoExigidoRir(rel = {}) {
  const itens = itensRir(rel.resultados || {});
  if (!itens.length) return "";
  if (itens.some(reprovado) || itensVencidosRir(rel).length) return "REPROVADO";
  return itens.every(completo) ? "APROVADO" : "";
}

const lista = (ns) => ns.join(", ");

/** O que falta para o relatório poder ir para assinatura (vazio = pode). */
export function pendenciasRir(rel = {}) {
  const itens = itensRir(rel.resultados || {});
  const faltam = [];
  if (!itens.length) faltam.push("Nenhum item recebido — escolha os certificados do CMR ou inclua o item à mão.");
  itens.filter((i) => !i.descricao).forEach((i) => faltam.push(`Item ${i.numero} sem descrição do produto.`));
  const semMarca = itens.filter((i) => !completo(i)).map((i) => i.numero);
  if (semMarca.length) faltam.push(`Marque visual, dimensional e documentação (A, R ou N.A.) nos itens: ${lista(semMarca)}.`);

  const reprovados = itens.filter(reprovado).map((i) => i.numero);
  const vencidos = itensVencidosRir(rel);
  const marcado = texto(rel.resultadoInspecao).toUpperCase();
  if (marcado === "REC") faltam.push("REC (exame complementar) não se aplica ao recebimento — marque aprovado ou reprovado.");
  else if (marcado !== "APROVADO" && marcado !== "REPROVADO") faltam.push("Resultado da inspeção não marcado (aprovado ou reprovado).");
  else if (marcado === "APROVADO") {
    if (reprovados.length) faltam.push(`Aprovado com item reprovado (${lista(reprovados)}) — o resultado tem de ser REPROVADO.`);
    if (vencidos.length) faltam.push(`Aprovado com validade vencida no item ${lista(vencidos.map((i) => `${i.numero} (${dataCurtaBR(i.validade)})`))} — o resultado tem de ser REPROVADO.`);
  } else if (itens.length && !reprovados.length && !vencidos.length && !semMarca.length && !texto(rel.observacoes)) {
    faltam.push("Reprovado sem item reprovado nem validade vencida — escreva o motivo nas observações.");
  }
  return faltam;
}

/**
 * Avisos (não travas). ⚠ Item sem nº de certificado AVISA: há eletrodo lançado no CMR com certificado
 * "N/A", e a trava obrigaria a inventar um número — o inspetor marca a documentação e o documento sai
 * com a célula vazia, à vista de quem assina.
 */
export function avisosRir(rel = {}) {
  return itensRir(rel.resultados || {})
    .filter((i) => !i.certificado || /^N\/?A$/i.test(i.certificado))
    .map((i) => `Item ${i.numero} sem nº de certificado — confira a documentação do produto.`);
}
