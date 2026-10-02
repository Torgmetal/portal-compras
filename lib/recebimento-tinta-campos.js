// INSPEÇÃO DE RECEBIMENTO DE TINTAS.
//
// Vitor (02/10/2026): "pode criar também, vamos deixar tudo funcionando". O modelo é o "Relatório de
// Recebimento de Tintas.xlsx" (Administrativo/Modelos de Documentos/Relatórios de Inspeção da
// Qualidade): OP, cliente, contrato, local/equipamento/estado; material, norma, fabricante e o nº do
// certificado de análise química; os lotes A/B/C com a quantidade; fabricação e validade por componente;
// o tamanho do lote e da amostra; e os nove itens da embalagem, cada um aprovado ou reprovado.
//
// ⚠ O MATERIAL JÁ ESTÁ NO CMR: produto, fornecedor, lote, validade e certificado entram no recebimento do
// almoxarifado. A tela oferece os lotes da obra para escolher (A, B e C) em vez de redigitar — o que veio
// de lá só PREENCHE; o inspetor confere e corrige.
// ⚠⚠ O RESULTADO: item reprovado ou lote vencido EXIGEM reprovar. Mas os nove itens são só da EMBALAGEM —
// reprova-se também por produto trocado, falta de certificado… Por isso reprovar com tudo aprovado é
// permitido, com o motivo nas observações. Até a verificação de 02/10/2026 a regra era "o resultado tem de
// bater com os itens", e lote vencido com os nove itens aprovados não tinha saída: REPROVADO "não batia",
// APROVADO era "lote vencido aprovado" — o relatório ficava preso para sempre.
// ⚠ O rodapé do modelo traz "www.novusconsultoria.com.br" — resto da consultoria que fez a planilha, não
// informação do documento. Não é impresso.

export const COMPONENTES = ["A", "B", "C"];

/** Os nove itens inspecionados na embalagem, na ordem e com o texto do modelo. */
export const ITENS_RECEBIMENTO = Object.freeze([
  "Deficiência ou Excesso de Enchimento",
  "Fechamento Imperfeito",
  "Vazamento ou Exsudação",
  "Amassamento",
  "Rasgos ou Cortes",
  "Falta ou Insegurança da Alça",
  "Embalagem de Frasco ou Garrafão Deficiente",
  "Mau Estado de Conservação",
  "Marcação Deficiente",
]);

/** Onde a tinta é recebida — sugestão, não trava. */
export const LOCAL_PADRAO = "Almoxarifado Torg Metal";

/** Com o que o relatório nasce (lib/padroes-inspecao), editável como todo campo. */
export const PADRAO_RECEBIMENTO = Object.freeze({ localEquipamento: LOCAL_PADRAO });

const texto = (v) => String(v ?? "").trim();
// data de CALENDÁRIO, não só o formato: "2026-02-30" passava e saía "30/02/2026" no documento
const dataIso = (v) => {
  const m = texto(v).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
};
// o dia em São Paulo, "aaaa-mm-dd" (meia-noite UTC ainda é o dia anterior aqui)
const diaSaoPaulo = (d) => {
  const x = d instanceof Date ? d : new Date(d);
  if (d == null || Number.isNaN(x.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(x);
};
/** "aaaa-mm-dd" → dd/mm/aaaa, sem passar por fuso (meia-noite UTC em São Paulo é o dia anterior). */
export const dataCurtaBR = (v) => (dataIso(v) ? texto(v).split("-").reverse().join("/") : texto(v));

/** Os lotes, sempre com as três posições do modelo (A, B e C). */
export function lotesRecebimento(res = {}) {
  const gravados = Array.isArray(res.lotes) ? res.lotes : [];
  return COMPONENTES.map((c, i) => ({ componente: c, ...(gravados[i] || {}) }));
}

/** O que cada um dos nove itens recebeu: "A", "R" ou "" (em branco). */
export function checklistRecebimento(res = {}) {
  const c = res.checklist && typeof res.checklist === "object" ? res.checklist : {};
  return ITENS_RECEBIMENTO.map((item, i) => ({ numero: i + 1, item, valor: ["A", "R"].includes(String(c[i + 1] || "").toUpperCase()) ? String(c[i + 1]).toUpperCase() : "" }));
}

/** O resultado que os nove itens dão: APROVADO, REPROVADO ou "" enquanto falta item. */
export function resultadoDoChecklist(res = {}) {
  const itens = checklistRecebimento(res);
  if (itens.some((i) => i.valor === "R")) return "REPROVADO";
  return itens.every((i) => i.valor === "A") ? "APROVADO" : "";
}

/**
 * A data contra a qual a validade é conferida — a MESMA que o PDF imprime em DATA DO RECEBIMENTO: a digitada,
 * ou, vazia, o dia da emissão (ou da criação) em São Paulo.
 * ⚠⚠ NUNCA "HOJE": o PDF é gerado de novo a cada pedido (data book, link de assinatura). Contra hoje, um
 * relatório assinado passava a dizer "vencida" depois que a validade vencesse, ao lado de uma data do
 * recebimento anterior a ela — e a trava acusava "lote vencido aprovado" num relatório que estava limpo.
 */
export function dataReferenciaRecebimento(rel = {}) {
  const res = rel.resultados || {};
  return dataIso(res.dataInspecao) ? texto(res.dataInspecao) : diaSaoPaulo(rel.emitidoEm || rel.createdAt || new Date());
}

/** Lotes com validade vencida na data do recebimento (ou, sem ela, na data de referência dada). */
export function lotesVencidos(res = {}, refIso = "") {
  const ref = dataIso(res.dataInspecao) ? texto(res.dataInspecao) : dataIso(refIso) ? refIso : "";
  if (!ref) return [];
  return lotesRecebimento(res).filter((l) => texto(l.lote) && dataIso(l.validade) && l.validade < ref);
}

const listaVencidos = (vencidos) => vencidos.map((l) => `${l.componente} (validade ${dataCurtaBR(l.validade)})`).join(", ");

/**
 * O resultado que os itens e as validades EXIGEM: REPROVADO com item reprovado ou lote vencido; APROVADO com
 * os nove aprovados e nada vencido (reprovar ainda é permitido, com o motivo); "" enquanto falta item.
 */
export function resultadoExigidoRecebimento(rel = {}) {
  const res = rel.resultados || {};
  if (lotesVencidos(res, dataReferenciaRecebimento(rel)).length) return "REPROVADO";
  return resultadoDoChecklist(res);
}

/** O que falta para o relatório poder ir para assinatura (vazio = pode). */
export function pendenciasRecebimento(rel = {}) {
  const res = rel.resultados || {};
  const faltam = [];
  if (!texto(res.material)) faltam.push("Material em branco.");
  if (!texto(res.fabricante)) faltam.push("Fabricante em branco.");
  const lotes = lotesRecebimento(res);
  if (!lotes.some((l) => texto(l.lote))) faltam.push("Nenhum lote informado (A, B ou C).");
  lotes.forEach((l) => {
    if (!texto(l.lote) && (texto(l.quantidade) || dataIso(l.validade) || dataIso(l.fabricacao))) faltam.push(`Componente ${l.componente} com dados mas sem o nº do lote.`);
  });
  const itens = checklistRecebimento(res);
  const semMarca = itens.filter((i) => !i.valor).map((i) => i.numero);
  if (semMarca.length) faltam.push(`Marque aprovado ou reprovado nos itens: ${semMarca.join(", ")}.`);
  const reprovados = itens.filter((i) => i.valor === "R").map((i) => i.numero);
  const vencidos = lotesVencidos(res, dataReferenciaRecebimento(rel));
  const marcado = texto(rel.resultadoInspecao).toUpperCase();
  if (marcado === "REC") faltam.push("REC (exame complementar) não se aplica ao recebimento — marque aprovado ou reprovado.");
  else if (marcado !== "APROVADO" && marcado !== "REPROVADO") faltam.push("Resultado da inspeção não marcado (aprovado ou reprovado).");
  else if (marcado === "APROVADO") {
    if (reprovados.length) faltam.push(`Aprovado com item reprovado (${reprovados.join(", ")}) — o resultado tem de ser REPROVADO.`);
    if (vencidos.length) faltam.push(`Lote vencido aprovado: componente ${listaVencidos(vencidos)} — o resultado tem de ser REPROVADO.`);
  } else if (!reprovados.length && !vencidos.length && !semMarca.length && !texto(rel.observacoes)) {
    faltam.push("Reprovado com os nove itens aprovados e nenhum lote vencido — escreva o motivo nas observações.");
  }
  return faltam;
}

/**
 * Avisos (não travas). ⚠ A VALIDADE EM BRANCO AVISA, NÃO TRAVA: há componente sem validade no rótulo (um
 * diluente, por exemplo), e a trava obrigaria a inventar uma data — "garanta que nada fique travado"
 * (Vitor, 02/10/2026). O documento sai com a célula vazia, à vista de quem assina.
 */
export function avisosRecebimento(rel = {}) {
  return lotesRecebimento(rel.resultados || {}).filter((l) => texto(l.lote) && !dataIso(l.validade))
    .map((l) => `Componente ${l.componente} sem validade — confira o rótulo (a célula sai em branco no relatório).`);
}

/** Os campos do cabeçalho, para a tela e o celular — a MESMA lista nos dois. `max` = o que as rotas gravam. */
export const CAMPOS_CABECALHO_RECEBIMENTO = Object.freeze([
  { k: "contrato", rotulo: "Contrato", grupo: "identificacao" },
  { k: "localEquipamento", rotulo: "Local / equipamento / estado", grupo: "identificacao", sugestoes: [LOCAL_PADRAO] },
  { k: "dataInspecao", rotulo: "Data do recebimento", grupo: "identificacao", data: true },
  { k: "material", rotulo: "Material", grupo: "material", obrigatorio: true },
  { k: "norma", rotulo: "Norma", grupo: "material" },
  { k: "fabricante", rotulo: "Fabricante", grupo: "material", obrigatorio: true },
  { k: "certificado", rotulo: "Nº do certificado de análise química", grupo: "material" },
  { k: "tamanhoLote", rotulo: "Tamanho do lote", grupo: "amostragem" },
  { k: "tamanhoAmostra", rotulo: "Tamanho da(s) amostra(s)", grupo: "amostragem" },
]);

export const GRUPOS_CABECALHO_RECEBIMENTO = Object.freeze([
  { id: "identificacao", titulo: "Identificação" },
  { id: "material", titulo: "Material" },
  { id: "amostragem", titulo: "Amostragem" },
]);

/** O que o PDF imprime: o valor gravado, ou o padrão quando o campo ficou vazio. */
export function camposCabecalhoRecebimento(rel = {}) {
  const res = rel.resultados || {};
  return { ...res, localEquipamento: texto(res.localEquipamento) || LOCAL_PADRAO };
}

/**
 * Preenche o recebimento a partir dos lotes do CMR escolhidos para A, B e C (o que a rota do PLP devolve
 * em `tintas`: produto, tipo, fabricante, lote, validade, certificado, norma). Só PREENCHE: o que já foi
 * digitado no cabeçalho fica, e o lote/validade da posição só mudam quando o CMR traz um valor.
 * ⚠ Material, certificado e norma são os da TINTA — o componente A. Escolher só o B (o endurecedor, para
 * corrigir o lote dele) não pode transformar "ENDURECEDOR…" no material do relatório.
 */
export function preencherDoCmr(res = {}, escolhidos = {}) {
  const lotes = lotesRecebimento(res).map(({ componente, ...resto }) => resto);
  let algum = null;
  COMPONENTES.forEach((c, i) => {
    const t = escolhidos[c];
    if (!t) return;
    algum = algum || t;
    const validade = String(t.validade ?? "").slice(0, 10);
    lotes[i] = { ...lotes[i], lote: texto(t.lote) || lotes[i].lote || "", validade: dataIso(validade) ? validade : lotes[i].validade || "" };
  });
  if (!algum) return res;
  const tinta = escolhidos.A || null;
  return {
    ...res,
    material: texto(res.material) || texto(tinta?.tipo) || texto(tinta?.produto) || "",
    fabricante: texto(res.fabricante) || texto(algum.fabricante) || "",
    certificado: texto(res.certificado) || texto(tinta?.certificado) || "",
    norma: texto(res.norma) || texto(tinta?.norma) || "",
    lotes,
  };
}
