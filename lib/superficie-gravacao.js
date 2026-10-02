// ─── O QUE SE GRAVA DOS RELATÓRIOS DA FAMÍLIA DA PINTURA (SAIS, POEIRA, PULL-OFF, RECEBIMENTO DE TINTAS) ──
//
// ⚠⚠ AS DUAS ROTAS DE GRAVAÇÃO SÓ GUARDAM O QUE ESTÁ NUMA LISTA FECHADA — app/api/qualidade/inspecoes/
// [id] (computador) e app/api/campo/relatorios/[id] (celular). Campo fora dela é DESCARTADO EM SILÊNCIO:
// já custou o fabricante do cabeçote do ultrassom (22/09/2026) e as leituras da pintura pelo celular.
// Os relatórios novos (Vitor, 02/10/2026) passam por esta regra única, chamada pelas duas rotas —
// duas listas escritas à mão divergiriam no primeiro campo novo.
import { CAMPOS_CABECALHO_SAIS, N_AMOSTRAS } from "./sais-campos";
import { CAMPOS_CABECALHO_POEIRA, TESTES_POEIRA } from "./poeira-campos";
import { CAMPOS_CABECALHO_PULLOFF, N_DOLLIES, N_DEMAOS_PULLOFF } from "./pulloff-campos";
import { CAMPOS_CABECALHO_RECEBIMENTO, COMPONENTES, ITENS_RECEBIMENTO } from "./recebimento-tinta-campos";

/** Os tipos que gravam por esta regra (as duas rotas chamam `limparResultadosSuperficie` para eles). */
export const TIPOS_GRAVACAO_PROPRIA = Object.freeze(["SAIS", "POEIRA", "PULL_OFF", "RECEBIMENTO_TINTA"]);

// o que é de cada modelo: os campos do cabeçalho e as listas. ⚠ A tela do celular manda as chaves da FAMÍLIA
// inteira (lib/campo-condicoes), e sem isto o pull-off guardava amostras, testes, lotes e os nove itens nulos
// dos outros três modelos (verificação de 02/10/2026)
const DO_TIPO = {
  SAIS: { campos: CAMPOS_CABECALHO_SAIS.map((c) => c.k), listas: ["amostras"] },
  POEIRA: { campos: [...CAMPOS_CABECALHO_POEIRA.map((c) => c.k), "classificacao"], listas: ["testes"] },
  PULL_OFF: { campos: CAMPOS_CABECALHO_PULLOFF.map((c) => c.k), listas: ["dollies", "esquema"] },
  RECEBIMENTO_TINTA: { campos: CAMPOS_CABECALHO_RECEBIMENTO.map((c) => c.k), listas: ["lotes", "checklist"] },
};

/** Os campos de texto dos modelos (cabeçalhos + a classificação das partículas da poeira). */
export const CAMPOS_TEXTO_SUPERFICIE = Object.freeze([
  ...new Set([
    ...CAMPOS_CABECALHO_SAIS, ...CAMPOS_CABECALHO_POEIRA, ...CAMPOS_CABECALHO_PULLOFF, ...CAMPOS_CABECALHO_RECEBIMENTO,
  ].map((c) => c.k).concat("classificacao")),
]);

// a relação de peças e os documentos de referência podem ser listas — cortados, voltariam pela metade
// (lib/campo-condicoes usa a MESMA lista no `limiteDoCampo` das duas rotas)
export const LONGOS_SUPERFICIE = Object.freeze(["peca", "documentoReferencia"]);
// as datas dos modelos vêm de <input type="date">: só "aaaa-mm-dd" de verdade entra
const DATAS = new Set([...CAMPOS_CABECALHO_SAIS, ...CAMPOS_CABECALHO_POEIRA, ...CAMPOS_CABECALHO_PULLOFF, ...CAMPOS_CABECALHO_RECEBIMENTO]
  .filter((c) => c.data).map((c) => c.k));
const limite = (k) => (LONGOS_SUPERFICIE.includes(k) ? 500 : 120);
const txt = (v, n) => (v == null || String(v).trim() === "" ? null : String(v).slice(0, n));
const classe = (v) => {
  const s = v == null ? "" : String(v).trim();
  return /^[0-5]$/.test(s) ? s : null;
};
// texto livre num campo de data viraria "Invalid Date" no documento
// ⚠ data de CALENDÁRIO: o Date do JS vira "2026-02-30" em 02/03 sem reclamar, e o documento saía "30/02/2026"
const dataIso = (v) => {
  const s = v == null ? "" : String(v).trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] ? s : null;
};
const ar = (v) => (["A", "R"].includes(String(v ?? "").trim().toUpperCase()) ? String(v).trim().toUpperCase() : null);
const obj = (v) => (v && typeof v === "object" ? v : {});

/**
 * Limpa o que veio da tela. Devolve SÓ as chaves presentes no corpo — o que não veio continua como
 * estava gravado (quem chama espalha o resultado sobre `resultados`).
 * ⚠ As listas (amostras, testes, dollies, esquema, lotes) e o checklist são ESTRUTURA: no laço de texto
 * das rotas virariam "[object Object]".
 */
export function limparResultadosSuperficie(r = {}, tipo = null) {
  const out = {};
  const doTipo = DO_TIPO[tipo];
  const lista = (k) => (!doTipo || doTipo.listas.includes(k)) && r[k] !== undefined;
  for (const k of doTipo ? doTipo.campos : CAMPOS_TEXTO_SUPERFICIE) if (r[k] !== undefined) out[k] = DATAS.has(k) ? dataIso(r[k]) : txt(r[k], limite(k));
  if (lista("amostras") && Array.isArray(r.amostras)) {
    out.amostras = Array.from({ length: N_AMOSTRAS }, (_, i) => {
      const a = obj(r.amostras[i]);
      return { condAgua: txt(a.condAgua, 20), condAmostra: txt(a.condAmostra, 20), densidade: txt(a.densidade, 20), hora: txt(a.hora, 10) };
    });
  }
  if (lista("testes") && Array.isArray(r.testes)) {
    out.testes = TESTES_POEIRA.map((_, i) => {
      const t = obj(r.testes[i]);
      return { local: txt(t.local, 120), quantidade: classe(t.quantidade), tamanho: classe(t.tamanho), obs: txt(t.obs, 200) };
    });
  }
  // pull-off: os cinco dollies e as três demãos do esquema
  if (lista("dollies") && Array.isArray(r.dollies)) {
    out.dollies = Array.from({ length: N_DOLLIES }, (_, i) => {
      const d = obj(r.dollies[i]);
      return { adesao: txt(d.adesao, 20), rompimento: txt(d.rompimento, 60), falha: txt(d.falha, 30) };
    });
  }
  if (lista("esquema") && Array.isArray(r.esquema)) out.esquema = Array.from({ length: N_DEMAOS_PULLOFF }, (_, i) => txt(r.esquema[i], 20));
  // recebimento de tintas: os lotes A/B/C e os nove itens da embalagem
  if (lista("lotes") && Array.isArray(r.lotes)) {
    out.lotes = COMPONENTES.map((_, i) => {
      const l = obj(r.lotes[i]);
      return { lote: txt(l.lote, 60), quantidade: txt(l.quantidade, 30), fabricacao: dataIso(l.fabricacao), validade: dataIso(l.validade) };
    });
  }
  if (lista("checklist")) {
    const c = obj(r.checklist);
    out.checklist = Object.fromEntries(ITENS_RECEBIMENTO.map((_, i) => [i + 1, ar(c[i + 1])]));
  }
  return out;
}
