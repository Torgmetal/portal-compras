// Web Worker do simulador de carga: roda o motor fora da thread da tela (uma carga grande leva
// dezenas de segundos). Entrada: { lista, geometria, perfil, prefixo, opcoes }. Saída: o resultado
// de simularCarga, ou { erro }.
import { simularCarga } from "@/lib/carga/simular";

self.onmessage = (ev) => {
  try {
    const r = simularCarga(ev.data);
    self.postMessage({ ok: true, resultado: r });
  } catch (e) {
    self.postMessage({ ok: false, erro: e?.message || String(e) });
  }
};
