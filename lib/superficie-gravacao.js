// ─── O QUE SE GRAVA DOS RELATÓRIOS DE SAIS E DE POEIRA ──────────────────────────────────────────
//
// ⚠⚠ AS DUAS ROTAS DE GRAVAÇÃO SÓ GUARDAM O QUE ESTÁ NUMA LISTA FECHADA — app/api/qualidade/inspecoes/
// [id] (computador) e app/api/campo/relatorios/[id] (celular). Campo fora dela é DESCARTADO EM SILÊNCIO:
// já custou o fabricante do cabeçote do ultrassom (22/09/2026) e as leituras da pintura pelo celular.
// Os dois relatórios novos (Vitor, 02/10/2026) passam por esta regra única, chamada pelas duas rotas —
// duas listas escritas à mão divergiriam no primeiro campo novo.
import { CAMPOS_CABECALHO_SAIS, N_AMOSTRAS } from "./sais-campos";
import { CAMPOS_CABECALHO_POEIRA, TESTES_POEIRA } from "./poeira-campos";

/** Os campos de texto dos dois modelos (cabeçalho + a classificação das partículas). */
export const CAMPOS_TEXTO_SUPERFICIE = Object.freeze([
  ...new Set([...CAMPOS_CABECALHO_SAIS.map((c) => c.k), ...CAMPOS_CABECALHO_POEIRA.map((c) => c.k), "classificacao"]),
]);

// a relação de peças e os documentos de referência podem ser listas — cortados, voltariam pela metade
// (lib/campo-condicoes usa a MESMA lista no `limiteDoCampo` das duas rotas)
export const LONGOS_SUPERFICIE = Object.freeze(["peca", "documentoReferencia"]);
const limite = (k) => (LONGOS_SUPERFICIE.includes(k) ? 500 : 120);
const txt = (v, n) => (v == null || String(v).trim() === "" ? null : String(v).slice(0, n));
const classe = (v) => {
  const s = v == null ? "" : String(v).trim();
  return /^[0-5]$/.test(s) ? s : null;
};
// data do ensaio vem de <input type="date">: só "aaaa-mm-dd" de verdade entra — texto livre ali viraria
// "Invalid Date" no documento
const dataIso = (v) => {
  const s = v == null ? "" : String(v).trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T12:00:00Z`)) ? s : null;
};

/**
 * Limpa o que veio da tela. Devolve SÓ as chaves presentes no corpo — o que não veio continua como
 * estava gravado (quem chama espalha o resultado sobre `resultados`).
 */
export function limparResultadosSuperficie(r = {}) {
  const out = {};
  for (const k of CAMPOS_TEXTO_SUPERFICIE) if (r[k] !== undefined) out[k] = k === "dataInspecao" ? dataIso(r[k]) : txt(r[k], limite(k));
  if (Array.isArray(r.amostras)) {
    out.amostras = Array.from({ length: N_AMOSTRAS }, (_, i) => {
      const a = r.amostras[i] && typeof r.amostras[i] === "object" ? r.amostras[i] : {};
      return { condAgua: txt(a.condAgua, 20), condAmostra: txt(a.condAmostra, 20), densidade: txt(a.densidade, 20), hora: txt(a.hora, 10) };
    });
  }
  if (Array.isArray(r.testes)) {
    out.testes = TESTES_POEIRA.map((_, i) => {
      const t = r.testes[i] && typeof r.testes[i] === "object" ? r.testes[i] : {};
      return { local: txt(t.local, 120), quantidade: classe(t.quantidade), tamanho: classe(t.tamanho), obs: txt(t.obs, 200) };
    });
  }
  return out;
}
