// ENSAIO DE ADESÃO — PULL-OFF (ASTM D4541).
//
// Vitor (02/10/2026): "pode criar também, vamos deixar tudo funcionando". O modelo é o "Relatório de
// Pull-off.xlsx" (Administrativo/Modelos de Documentos/Relatórios de Inspeção da Qualidade): normas,
// adesivo e validade, peça, aparelho/modelo/pistão; as condições da fixação (URA, TA, TS, PO, data de
// fixação e de arrancamento); o esquema de pintura (espessura de 3 demãos e o total); cinco dollies com
// a adesão (MPa), a análise do rompimento (%) e a falha (adesão/coesão); a média; o laudo e a RNC.
//
// ⚠ AS FÓRMULAS SÃO AS DA PLANILHA: total = SOMA das demãos preenchidas (vazio se nenhuma); média da
// adesão = ROUND(AVERAGE(...), 2) sobre os dollies preenchidos.
// ⚠ O LAUDO É O "RESULTADO DA INSPEÇÃO" do relatório, como na poeira: o modelo não traz requisito de
// aceitação (o mínimo em MPa é do contrato/PLP), então o portal não decide sozinho — e pedir o laudo em
// dois lugares abriria espaço para o documento dizer uma coisa e a aprovação outra.
import { DOC_REFERENCIA_SUPERFICIE, numeroMedida, arredondar } from "@/lib/sais-campos";

export const N_DOLLIES = 5;
export const N_DEMAOS_PULLOFF = 3;
export const NORMA_PULLOFF = "ASTM D4541";

/** A legenda do modelo para a análise do rompimento (onde a película rompeu). */
export const LEGENDA_ROMPIMENTO = "A = Substrato   B = 1ª Demão   C = 2ª Demão   D = 3ª Demão   E = 4ª Demão   Y = Adesivo   Z = Dolly";

/**
 * A falha do modelo: na ADESÃO (entre camadas) ou na COESÃO (dentro de uma camada).
 * ⚠ E "Sem ruptura" (verificação de 02/10/2026): o dolly que não sai até o limite do aparelho, ou até o
 * mínimo exigido, é resultado válido pela ASTM D4541 — e sem a opção o inspetor tinha de escolher uma falha
 * que não aconteceu para conseguir assinar.
 */
export const SEM_RUPTURA = "Sem ruptura";
export const FALHAS = ["Adesão", "Coesão", "Adesão/Coesão", SEM_RUPTURA];

/**
 * Com o que o relatório nasce (lib/padroes-inspecao), editável como todo campo. O esquema de pintura
 * nasce do PLP da obra, quando existe (a espessura mínima de cada demão).
 */
export const PADRAO_PULLOFF = Object.freeze({
  documentoReferencia: DOC_REFERENCIA_SUPERFICIE,
  normas: NORMA_PULLOFF,
});

const texto = (v) => String(v ?? "").trim();
const num = numeroMedida;
const dataIso = (v) => /^\d{4}-\d{2}-\d{2}$/.test(texto(v));

/** As espessuras do esquema, sempre com três posições (a folha tem três demãos). */
export function esquemaPullOff(res = {}) {
  const gravadas = Array.isArray(res.esquema) ? res.esquema : [];
  return Array.from({ length: N_DEMAOS_PULLOFF }, (_, i) => texto(gravadas[i]));
}

/** Espessura total: a SOMA das demãos preenchidas; `null` se nenhuma (IF(COUNT=0,"",SUM) da planilha). */
export function espessuraTotal(res = {}) {
  const vals = esquemaPullOff(res).map(num).filter((v) => v != null);
  return vals.length ? arredondar(vals.reduce((s, v) => s + v, 0), 1) : null;
}

/** Os dollies, sempre com cinco posições (a folha tem cinco linhas). */
export function dolliesPullOff(res = {}) {
  const gravados = Array.isArray(res.dollies) ? res.dollies : [];
  return Array.from({ length: N_DOLLIES }, (_, i) => ({ numero: i + 1, ...(gravados[i] || {}) }));
}

/**
 * A leitura de um dolly: `{ valor, minimo }`, ou `null` se ilegível/vazia. `minimo` = o dolly NÃO rompeu e o
 * número é o limite ("> 20"): escrito com ">" (≥, >=) ou com a falha "Sem ruptura" — no celular o teclado
 * numérico não tem ">", e a falha já diz que o número é o limite.
 */
export function leituraDolly(d = {}) {
  const s = texto(d.adesao);
  const m = s.match(/^(?:>=|≥|>)\s*(.+)$/);
  const valor = num(m ? m[1] : s);
  if (valor == null) return null;
  return { valor, minimo: Boolean(m) || texto(d.falha) === SEM_RUPTURA };
}

/**
 * Média da adesão (MPa), 2 casas, sobre os dollies preenchidos (ROUND(AVERAGE(...),2)). `null` sem nenhum.
 * ⚠ O dolly sem ruptura entra PELO LIMITE (é o que se sabe dele: pelo menos aquilo) — e então a média também é
 * um mínimo (`mediaEhMinima`), e sai com ">" na frente.
 */
export function mediaAdesao(res = {}) {
  const vals = dolliesPullOff(res).map(leituraDolly).filter(Boolean).map((l) => l.valor);
  if (!vals.length) return null;
  return arredondar(vals.reduce((s, v) => s + v, 0) / vals.length, 2);
}

/** Algum dolly entrou na média pelo limite ("> N"): a média é um MÍNIMO. */
export const mediaEhMinima = (res = {}) => dolliesPullOff(res).some((d) => leituraDolly(d)?.minimo);

/** A adesão como sai no documento: "8,5", ou "> 20" para o dolly que não rompeu. */
export function adesaoImpressa(d = {}) {
  const l = leituraDolly(d);
  if (!l) return texto(d.adesao);
  const n = l.valor.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  return l.minimo ? `> ${n}` : n;
}

/** A data do ensaio é a do ARRANCAMENTO — é quando o dolly saiu e a adesão foi medida. */
export const dataDoEnsaioPullOff = (res = {}) => texto(res.dataArrancamento) || texto(res.dataFixacao);

/** O que falta para o relatório poder ir para assinatura (vazio = pode). */
export function pendenciasPullOff(rel = {}) {
  const res = rel.resultados || {};
  const faltam = [];
  const marcas = Array.isArray(rel.marcas) ? rel.marcas.filter(Boolean) : [];
  if (!marcas.length && !texto(res.peca)) faltam.push("Peça inspecionada em branco.");
  if (!texto(res.adesivo)) faltam.push("Adesivo em branco.");
  if (!texto(res.aparelho)) faltam.push("Aparelho em branco.");
  if (!dataIso(res.dataFixacao)) faltam.push("Data de fixação em branco.");
  if (!dataIso(res.dataArrancamento)) faltam.push("Data de arrancamento em branco.");
  else if (dataIso(res.dataFixacao) && res.dataArrancamento < res.dataFixacao) faltam.push("Data de arrancamento antes da fixação — confira as duas datas.");
  esquemaPullOff(res).forEach((e, i) => {
    if (e && num(e) == null) faltam.push(`Espessura da ${i + 1}ª demão ilegível — escreva só o número, em µm.`);
    else if (num(e) < 0) faltam.push(`Espessura da ${i + 1}ª demão negativa.`);
  });
  const completo = (d) => leituraDolly(d) != null && texto(d?.falha);
  const comecado = (d) => texto(d?.adesao) || texto(d?.rompimento) || texto(d?.falha);
  const dollies = dolliesPullOff(res);
  if (!dollies.some(completo)) faltam.push("Nenhum dolly completo (adesão em MPa e a falha: adesão, coesão ou sem ruptura).");
  dollies.forEach((d, i) => {
    const l = leituraDolly(d);
    if (texto(d.adesao) && !l) faltam.push(`Dolly ${i + 1}: adesão ilegível — escreva só o número, em MPa (ou "> 20" se não rompeu).`);
    else if (l && l.valor < 0) faltam.push(`Dolly ${i + 1}: adesão negativa.`);
    else if (comecado(d) && !completo(d)) faltam.push(`Dolly ${i + 1} incompleto — falta ${l ? "a falha (adesão, coesão ou sem ruptura)" : "a adesão (MPa)"}.`);
  });
  const laudo = texto(rel.resultadoInspecao).toUpperCase();
  if (laudo !== "APROVADO" && laudo !== "REPROVADO") faltam.push("Laudo não marcado — escolha aprovado ou reprovado em Resultado da inspeção.");
  return faltam;
}

/** Avisos (não travas): o adesivo vencido na data da fixação — a colagem é a base do ensaio. */
export function avisosPullOff(rel = {}) {
  const res = rel.resultados || {};
  const v = texto(res.validadeAdesivo), fix = texto(res.dataFixacao);
  if (dataIso(v) && dataIso(fix) && v < fix) return [`Adesivo vencido na data da fixação (validade ${v.split("-").reverse().join("/")}) — confira o lote do adesivo.`];
  return [];
}

/**
 * Os campos do cabeçalho, para a tela e o celular — a MESMA lista nos dois. `max` = o que as rotas gravam.
 * `sugestoes` = lista da casa como sugestão (datalist); o campo sempre aceita outro valor.
 */
export const CAMPOS_CABECALHO_PULLOFF = Object.freeze([
  { k: "documentoReferencia", rotulo: "Documento de referência", grupo: "identificacao", max: 500 },
  { k: "ordemCompra", rotulo: "Ordem de compra", grupo: "identificacao" },
  { k: "normas", rotulo: "Normas", grupo: "informacoes", sugestoes: [NORMA_PULLOFF] },
  { k: "adesivo", rotulo: "Adesivo", grupo: "informacoes", obrigatorio: true },
  { k: "validadeAdesivo", rotulo: "Validade do adesivo", grupo: "informacoes", data: true },
  { k: "peca", rotulo: "Peça inspecionada", grupo: "informacoes", max: 500 },
  { k: "aparelho", rotulo: "Aparelho", grupo: "informacoes", obrigatorio: true },
  { k: "apModelo", rotulo: "Modelo", grupo: "informacoes" },
  { k: "pistao", rotulo: "Pistão", grupo: "informacoes" },
  { k: "ura", rotulo: "URA (%)", grupo: "condicoes", numero: true },
  { k: "ta", rotulo: "TA (°C)", grupo: "condicoes", numero: true },
  { k: "ts", rotulo: "TS (°C)", grupo: "condicoes", numero: true },
  { k: "po", rotulo: "PO (°C)", grupo: "condicoes", numero: true },
  { k: "dataFixacao", rotulo: "Data da fixação", grupo: "condicoes", data: true, obrigatorio: true },
  { k: "dataArrancamento", rotulo: "Data do arrancamento", grupo: "condicoes", data: true, obrigatorio: true },
  { k: "rncNumero", rotulo: "RNC nº", grupo: "laudo" },
]);

export const GRUPOS_CABECALHO_PULLOFF = Object.freeze([
  { id: "identificacao", titulo: "Identificação" },
  { id: "informacoes", titulo: "Informações" },
  { id: "condicoes", titulo: "Condições da fixação e climáticas" },
  { id: "laudo", titulo: "Laudo" },
]);

/** O que o PDF imprime: o valor gravado, ou o padrão quando o campo ficou vazio. */
export function camposCabecalhoPullOff(rel = {}) {
  const res = rel.resultados || {};
  const marcas = Array.isArray(rel.marcas) ? rel.marcas.filter(Boolean) : [];
  return {
    ...res,
    peca: texto(res.peca) || marcas.join(", "),
    normas: texto(res.normas) || NORMA_PULLOFF,
    norma: texto(res.normas) || NORMA_PULLOFF,
  };
}
