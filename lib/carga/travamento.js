// Travamento: o que segura cada volume numa FRENAGEM. Vitor (24/09/2026), vendo o 3D: "esse vão pode ser um problema no
// transporte? por conta das peças terem um espaço para correr?" — e, sobre a regra proposta, "concordo, podemos adotar".
//
// Na frenagem a carga é empurrada para a frente (até 0,8 g nas normas de amarração); aço sobre caibro escorrega, e o vão
// vira impacto. Para cada volume, mede-se o vão livre À FRENTE (rumo à cabine, −x) na mesma faixa de altura e de largura:
// • até 30 cm — encostado (a folga entre volumes e um calço resolvem);
// • até 1,5 m contra outro volume, ou contra a cabeceira quando está no assoalho — ESCORAR: 2 caibros do tamanho do vão;
// • mais que isso, ou sem nada na altura dele até a cabine (o "degrau": pilha de trás mais alta que a da frente) —
//   AMARRAR para a frente com cinta e catraca.
// Função pura sobre as posições (x, y, z, fx, fz, A): serve o motor e a montagem editada à mão.
import { MEDIDAS } from "./premissas";
import { temBaseDeMadeira } from "./classificar";

export const TRAVA = { folga: 300, escoraMax: 1500 };

/** O volume está no assoalho: aço sobre o caibro do piso (y até 10 cm) ou caixa/engradado/palete direto. */
export const noAssoalho = (u, madeira = MEDIDAS.MADEIRA) => u.y <= (temBaseDeMadeira(u) ? 1 : madeira + 1);

const sob = (a0, a1, b0, b1) => Math.min(a1, b1) - Math.max(a0, b0);

/**
 * @param {object[]} itens  volumes posicionados de UMA carga
 * @returns {Map<string, {tipo:"escorar"|"amarrar", vao:number, contra:string|null, cabeceira:boolean}>} só os que precisam travar
 */
export function travamentoDaCarga(itens, madeira = MEDIDAS.MADEIRA) {
  const trav = new Map();
  for (const u of itens) {
    if (u.pilha) continue;
    const fz = u.fz || u.L, fy = u.fy || u.A;
    const frente = itens.filter((w) => w !== u && !w.pilha && w.x + (w.fx || w.C) <= u.x + 5
      && sob(u.z, u.z + fz, w.z, w.z + (w.fz || w.L)) > 0.3 * Math.min(fz, w.fz || w.L)
      && sob(u.y, u.y + fy, w.y, w.y + (w.fy || w.A)) > 0.3 * Math.min(fy, w.fy || w.A));
    const alvo = frente.reduce((m, w) => (!m || w.x + (w.fx || w.C) > m.x + (m.fx || m.C) ? w : m), null);
    const vao = Math.round(u.x - (alvo ? alvo.x + (alvo.fx || alvo.C) : 0));
    if (vao <= TRAVA.folga) continue;
    // contra a cabeceira só no assoalho: lá em cima não há parede para escorar
    const escora = vao <= TRAVA.escoraMax && (alvo || noAssoalho(u, madeira));
    trav.set(u.id, { tipo: escora ? "escorar" : "amarrar", vao, contra: alvo?.id || null, cabeceira: !alvo });
  }
  return trav;
}

/** Texto curto do travamento, para a tabela de volumes e o PDF. */
export function textoTravamento(t, volumeDe = () => null) {
  if (!t) return "";
  const m = `${(t.vao / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} m`, alvo = t.contra ? volumeDe(t.contra) : null;
  const ate = t.cabeceira ? "até a cabeceira" : alvo != null ? `até o volume ${String(alvo).padStart(2, "0")}` : "até o volume da frente";
  if (t.tipo === "escorar") return `Escorar: 2 caibros de ${m} ${ate}`;
  return `Amarrar para a frente (cinta e catraca): ${m} livres ${t.cabeceira ? "até a cabine, nada na altura dele" : ate}`;
}
