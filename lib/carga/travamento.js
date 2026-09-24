// Travamento: o que segura cada volume numa FRENAGEM. Vitor (24/09/2026), vendo o 3D: "esse vão pode ser um problema no
// transporte? por conta das peças terem um espaço para correr?" — e, sobre a regra proposta, "concordo, podemos adotar".
//
// Na frenagem a carga é empurrada para a frente (até 0,8 g nas normas de amarração); aço sobre caibro escorrega, e o vão
// vira impacto. Para cada volume, mede-se o vão livre À FRENTE (rumo à cabine, −x) na mesma faixa de altura e de largura:
// • até 30 cm — encostado (a folga entre volumes e um calço resolvem);
// • até 1,5 m contra outro volume, ou contra a cabeceira na altura que ela cobre — ESCORAR: 2 caibros do tamanho do vão;
// • mais que isso, ou sem nada na altura dele até a cabine (o "degrau": pilha de trás mais alta que a da frente) —
//   AMARRAR para a frente com cinta e catraca.
//
// ⚠⚠ A CABECEIRA TEM ALTURA. Resolução CONTRAN 945/2022, art. 8º, parágrafo único: é proibido rodar com carga mais alta
// que o painel frontal quando a parte de cima pode escorregar (infração do art. 235 do CTB). Encostar na cabeceira só
// segura na faixa de altura que ela cobre; acima disso, sem volume à frente na altura dele, é AMARRAR — por menor que
// seja o vão. Até 24/09 a regra tratava a cabeceira como parede até o teto da carga: na OP-118, com a cabeceira da
// graneleira (1,8 m), 10 volumes saíam como "encostados, nada a fazer" apoiados só nela acima da altura dela
// (amarrados: 19 → 29).
// A altura vem do catálogo (VEICULOS[…].cabeceira, acima do assoalho); veículo sem ela: só a camada do assoalho encosta.
//
// Função pura sobre as posições (x, y, z, fx, fz, A): serve o motor e a montagem editada à mão.
import { MEDIDAS, VEICULOS } from "./premissas";
import { temBaseDeMadeira } from "./classificar";

export const TRAVA = { folga: 300, escoraMax: 1500 };

/** O volume está no assoalho: aço sobre o caibro do piso (y até 10 cm) ou caixa/engradado/palete direto. */
export const noAssoalho = (u, madeira = MEDIDAS.MADEIRA) => u.y <= (temBaseDeMadeira(u) ? 1 : madeira + 1);

/** Altura da cabeceira acima do assoalho (mm). Lida pelo catálogo também: simulação salva antes da premissa existir. */
export const alturaDaCabeceira = (veic) => veic?.cabeceira ?? VEICULOS[veic?.chave]?.cabeceira ?? null;

const sob = (a0, a1, b0, b1) => Math.min(a1, b1) - Math.max(a0, b0);
// duas faixas se encaram quando a sobreposição passa de 30% da menor
const encara = (a0, a1, b0, b1) => sob(a0, a1, b0, b1) > 0.3 * Math.min(a1 - a0, b1 - b0);

/** A cabeceira segura o volume: ele está na faixa de altura dela — sem a altura, só se estiver no assoalho. */
export function naCabeceira(u, H, madeira = MEDIDAS.MADEIRA) {
  if (!(H > 0)) return noAssoalho(u, madeira);
  return encara(u.y, u.y + (u.fy || u.A), 0, H);
}

/**
 * @param {object[]} itens  volumes posicionados de UMA carga
 * @param {{ madeira?: number, veiculo?: object }} [op]  veiculo: dá a altura da cabeceira
 * @returns {Map<string, {tipo:"escorar"|"amarrar", vao:number, contra:string|null, cabeceira:boolean, acima?:true, alturaCabeceira?:number|null}>}
 *   só os que precisam travar
 */
export function travamentoDaCarga(itens, { madeira = MEDIDAS.MADEIRA, veiculo = null } = {}) {
  const trav = new Map(), H = alturaDaCabeceira(veiculo);
  for (const u of itens) {
    if (u.pilha) continue;
    const fz = u.fz || u.L, fy = u.fy || u.A;
    const frente = itens.filter((w) => w !== u && !w.pilha && w.x + (w.fx || w.C) <= u.x + 5
      && encara(u.z, u.z + fz, w.z, w.z + (w.fz || w.L)) && encara(u.y, u.y + fy, w.y, w.y + (w.fy || w.A)));
    const alvo = frente.reduce((m, w) => (!m || w.x + (w.fx || w.C) > m.x + (m.fx || m.C) ? w : m), null);
    const vao = Math.round(u.x - (alvo ? alvo.x + (alvo.fx || alvo.C) : 0));
    // sem volume à frente, quem segura é a cabeceira — e só na altura que ela cobre
    const acima = !alvo && !naCabeceira(u, H, madeira);
    if (vao <= TRAVA.folga && !acima) continue;
    const escora = !acima && vao <= TRAVA.escoraMax;
    trav.set(u.id, { tipo: escora ? "escorar" : "amarrar", vao, contra: alvo?.id || null, cabeceira: !alvo, ...(acima ? { acima: true, alturaCabeceira: H } : {}) });
  }
  return trav;
}

const metros = (mm) => `${(mm / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} m`;

/** Texto curto do travamento, para a tabela de volumes e o PDF. */
export function textoTravamento(t, volumeDe = () => null) {
  if (!t) return "";
  const m = metros(t.vao), alvo = t.contra ? volumeDe(t.contra) : null;
  const ateVolume = alvo != null ? `até o volume ${String(alvo).padStart(2, "0")}` : "até o volume da frente";
  if (t.tipo === "escorar") return `Escorar: 2 caibros de ${m} ${t.cabeceira ? "até a cabeceira" : ateVolume}`;
  const amarrar = "Amarrar para a frente (cinta e catraca)";
  if (t.acima) return t.alturaCabeceira ? `${amarrar}: está acima da cabeceira (${metros(t.alturaCabeceira)}), nada na frente na altura dele` : `${amarrar}: nada na frente na altura dele até a cabine`;
  return `${amarrar}: ${m} livres ${t.cabeceira ? "até a cabeceira" : ateVolume}`;
}
