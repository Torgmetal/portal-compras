// Veículos e frete do simulador: a configuração gravada (ConfigCarga) por cima das premissas do código.
// Devolve sempre o catálogo completo — o que não foi configurado vem do padrão.
import { FRETE, ORDEM_VEIC, VEICULOS } from "./premissas";

export const CAMPOS_VEICULO = ["nome", "C", "L", "alturaUtil", "pesoMax", "assoalho"];

/** @param {{veiculos?:object[], frete?:object}|null} cfg  linha da ConfigCarga */
export function catalogoDeVeiculos(cfg) {
  const porChave = new Map((cfg?.veiculos || []).map((v) => [v.chave, v]));
  const veiculos = {}, frete = { ...FRETE, ...(cfg?.frete || {}) };
  for (const [k, padrao] of Object.entries(VEICULOS)) {
    const v = porChave.get(k) || {};
    if (v.ativo === false && k !== "carreta" && k !== "carreta14") continue; // carreta é a base do empacotador e a de 14 m leva as peças longas: nunca saem
    const n = (x, d) => (Number.isFinite(Number(x)) && Number(x) > 0 ? Number(x) : d);
    veiculos[k] = { chave: k, nome: v.nome || padrao.nome, C: n(v.C, padrao.C), L: n(v.L, padrao.L), alturaUtil: n(v.alturaUtil, padrao.alturaUtil), pesoMax: n(v.pesoMax, padrao.pesoMax), assoalho: n(v.assoalho, padrao.assoalho) };
    if (Number.isFinite(Number(v.frete)) && Number(v.frete) > 0) frete[k] = Number(v.frete);
  }
  return { veiculos, frete, ordem: ORDEM_VEIC.filter((k) => veiculos[k]) };
}

/** Linhas para a tela: padrão + o que está gravado, com `ativo` e `frete` por veículo. */
export function linhasDeConfiguracao(cfg) {
  const porChave = new Map((cfg?.veiculos || []).map((v) => [v.chave, v]));
  return Object.values(VEICULOS).map((p) => { const v = porChave.get(p.chave) || {}; return { chave: p.chave, nome: v.nome || p.nome, C: v.C || p.C, L: v.L || p.L, alturaUtil: v.alturaUtil || p.alturaUtil, pesoMax: v.pesoMax || p.pesoMax, assoalho: v.assoalho || p.assoalho, frete: v.frete || (cfg?.frete || {})[p.chave] || FRETE[p.chave], ativo: v.ativo !== false || p.chave === "carreta" || p.chave === "carreta14", padrao: { ...p, frete: FRETE[p.chave] } }; });
}
