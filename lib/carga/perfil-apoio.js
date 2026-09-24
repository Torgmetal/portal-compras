// Apoio REAL de cada volume, lido da malha do IFC — e não da caixa envolvente.
//
// ⚠⚠ Vitor (18/09/2026, OP-102): "temos peças de pé, peças voando e não podemos enviar assim". Depois,
// quando a correção bloqueou o empilhamento em quase tudo: "o que era para ser levado em 2 caminhões vc
// transformou em 5 (…) elas podem ser colocadas uma em cima da outra, o que não pode é ficar voando as
// coisas". E em 24/09, com a OP-118 em 20 carretas de 5 peças: "volte a lógica que fizemos nos testes".
//
// A caixa envolvente é cheia; a peça não é. Um quadro deitado tem o miolo vazio, uma viga com chapa de
// ligação saliente tem o topo 20 mm acima da mesa só na ponta. Empilhar pela caixa põe o caibro no ar
// (o volume "voa"); proibir empilhar em tudo que não tem topo 100% plano (a regra de 18/09) proibiu
// 91% das marcas da OP-118. O meio-termo é o que o carregador faz: CAIBRO atravessado onde há aço de
// verdade embaixo, e CALÇO de madeira até 15 cm para nivelar (premissa CALCO do protótipo).
//
// O perfil é uma grade de colunas no referencial de VIAGEM da peça (X = comprimento C, Y = altura A,
// Z = largura L): em cada coluna, o topo e o fundo do aço. Coluna sem aço fica com topo -1.
import { MEDIDAS } from "./premissas";

export const CEL_PERFIL = 50; // mm

const girar = (x, y, z, g) => {
  if (!g) return [x, y, z];
  const r = g.ang * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
  const q = g.eixo === 2 ? [x * c - y * s, x * s + y * c, z] : g.eixo === 0 ? [x, y * c - z * s, y * s + z * c] : [x * c + z * s, y, -x * s + z * c];
  return [q[0] - g.min[0], q[1] - g.min[1], q[2] - g.min[2]];
};

/**
 * Topo e fundo do aço, coluna a coluna, na orientação de viagem (a mesma transformação que o 3D aplica).
 * Amostra cada triângulo a cada ≤ CEL/2 — pega mesa, alma em pé, chapa de ligação e aresta.
 * @param {{pos:ArrayLike<number>, idx:ArrayLike<number>}} malha  vértices e índices do IFC (mm)
 * @param {{perm:{X:number,Y:number,Z:number}, giro?:object|null, C:number, L:number, A:number}} p  peça orientada
 * @returns {{cel:number, nx:number, nz:number, topo:Float32Array, fundo:Float32Array}|null}
 */
export function perfilDaMalha(malha, p, cel = CEL_PERFIL) {
  if (!malha?.pos?.length || !malha?.idx?.length || !p?.perm || !(p.C > 0 && p.L > 0 && p.A > 0)) return null;
  const nx = Math.max(1, Math.ceil(p.C / cel)), nz = Math.max(1, Math.ceil(p.L / cel));
  const topo = new Float32Array(nx * nz).fill(-1), fundo = new Float32Array(nx * nz).fill(Infinity);
  const P = p.perm, n = malha.pos.length / 3, V = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const q = girar(malha.pos[i * 3], malha.pos[i * 3 + 1], malha.pos[i * 3 + 2], p.giro);
    V[i * 3] = q[P.X]; V[i * 3 + 1] = q[P.Y]; V[i * 3 + 2] = q[P.Z];
  }
  const marca = (x, y, z) => {
    const ix = Math.min(nx - 1, Math.max(0, Math.floor(x / cel))), iz = Math.min(nz - 1, Math.max(0, Math.floor(z / cel))), k = ix * nz + iz;
    if (y > topo[k]) topo[k] = y; if (y < fundo[k]) fundo[k] = y;
  };
  const idx = malha.idx, passo = cel / 2;
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, d = idx[t + 2] * 3;
    const lado = Math.max(Math.hypot(V[a] - V[b], V[a + 1] - V[b + 1], V[a + 2] - V[b + 2]), Math.hypot(V[a] - V[d], V[a + 1] - V[d + 1], V[a + 2] - V[d + 2]), Math.hypot(V[b] - V[d], V[b + 1] - V[d + 1], V[b + 2] - V[d + 2]));
    const N = Math.min(400, Math.max(1, Math.ceil(lado / passo)));
    for (let i = 0; i <= N; i++) for (let j = 0; j <= N - i; j++) {
      const u = i / N, v = j / N, w = 1 - u - v;
      marca(V[a] * w + V[b] * u + V[d] * v, V[a + 1] * w + V[b + 1] * u + V[d + 1] * v, V[a + 2] * w + V[b + 2] * u + V[d + 2] * v);
    }
  }
  for (let k = 0; k < topo.length; k++) if (topo[k] < 0) fundo[k] = Infinity; else { topo[k] = Math.min(p.A, Math.max(0, topo[k])); fundo[k] = Math.min(p.A, Math.max(0, fundo[k])); }
  return { cel, nx, nz, topo, fundo };
}

/** Perfis das peças de uma simulação (uma vez por marca e orientação), por id da peça. */
export function perfisDasPecas(pecas, malhas) {
  const porId = new Map(), cache = new Map();
  if (!malhas) return porId;
  for (const p of pecas) {
    if (p.semCaixa || p.manual || p.desmontada || !p.temGeo || !malhas[p.marca]) continue;
    const chave = `${p.marca}|${p.C}|${p.L}|${p.A}|${JSON.stringify(p.perm)}|${JSON.stringify(p.giro)}`;
    if (!cache.has(chave)) cache.set(chave, perfilDaMalha(malhas[p.marca], p));
    const pf = cache.get(chave); if (pf) porId.set(p.id, pf);
  }
  return porId;
}

// volume embalado (caixa, engradado, palete, em pé): a tampa é cheia
const cheio = (u) => u.tipo === "CAIXA" || u.tipo === "ENGRADADO" || u.tipo === "PALLET" || !!u.emPe;

/**
 * Perfil do VOLUME inteiro na grade da carroceria, para uma posição de encaixe (girada ou não).
 * Célula (a, b) do retângulo ocupado → topo e fundo do aço relativos ao fundo do volume (u.y);
 * topo -1 = coluna sem aço (vão do quadro, sobra da caixa envolvente).
 * @param {object} u  unidade (C, L, A, membros com dx/dy/dz)
 * @param {Map<string, object>} perfis  perfil por id da peça (perfisDasPecas)
 * @param {{cel:number, cx:number, cz:number, girada:boolean, folga:number}} g
 */
export function perfilNaGrade(u, perfis, { cel, cx, cz, girada, folga }) {
  const topo = new Float32Array(cx * cz).fill(-1), fundo = new Float32Array(cx * cz).fill(Infinity);
  // (lx, lz) no referencial da unidade → célula da grade; girada: C corre ao longo de Z (igual ao 3D)
  const marcar = (lx, lz, t, f) => {
    const X = girada ? u.L - lz : lx, Z = girada ? lx : lz;
    const a = Math.floor((X + folga / 2) / cel), b = Math.floor((Z + folga / 2) / cel);
    if (a < 0 || b < 0 || a >= cx || b >= cz) return; const k = a * cz + b;
    if (t > topo[k]) topo[k] = t; if (f < fundo[k]) fundo[k] = f;
  };
  const bloco = (x0, z0, C, L, t, f) => { for (let x = x0 + 5; x < x0 + C; x += Math.min(25, cel / 2)) for (let z = z0 + 5; z < z0 + L; z += Math.min(25, cel / 2)) marcar(x, z, t, f); };
  if (cheio(u) || !perfis?.size) { bloco(0, 0, u.C, u.L, u.A, 0); return { topo, fundo }; }
  for (const m of u.membros || [u]) {
    const pf = perfis.get(m.id), dx = m.dx || 0, dy = m.dy || 0, dz = m.dz || 0;
    if (!pf) { bloco(dx, dz, m.C, m.L, dy + m.A, dy); continue; }
    for (let ix = 0; ix < pf.nx; ix++) for (let iz = 0; iz < pf.nz; iz++) {
      const k = ix * pf.nz + iz; if (pf.topo[k] < 0) continue;
      // cada coluna do perfil conta na célula do SEU centro: aço que só raspa o canto da célula não é apoio dela
      marcar(dx + (ix + 0.5) * pf.cel, dz + (iz + 0.5) * pf.cel, dy + pf.topo[k], dy + pf.fundo[k]);
    }
  }
  return { topo, fundo };
}

/** Quantas células da largura o caibro cobre: a largura do volume + 3 cm de cada lado, arredondada para a célula
 *  mais próxima. A célula arredondada para cima passaria da borda — e o aço do VIZINHO que cai nela não está
 *  debaixo do caibro. O 3D desenha o caibro exatamente nestas células. */
export const celulasDoCaibro = (fz, cel, cz) => Math.min(cz, Math.max(1, Math.floor((fz + MEDIDAS.FOLGA) / cel + 0.5)));

/**
 * Onde vão os caibros de um volume empilhado, e se eles têm aço embaixo.
 * Caibro a cada ~1,5 m (a mesma conta da madeira), cada um podendo correr até 75 cm para achar aço;
 * os das pontas ficam na ponta (até 20% do comprimento, entre 30 cm e 1,5 m). O caibro encosta no aço do
 * volume (onde ele fica mais baixo naquela faixa) e atravessa a largura inteira — então nada de baixo pode
 * furar a faixa dele. Está APOIADO quando há aço embaixo a até CALCO (15 cm de calço, "o carregador nivela
 * com caibro + cunha") e o ponto onde o volume encosta cai ENTRE os apoios de baixo (apoio de um lado só é
 * gangorra). O volume está apoiado com as duas pontas e `minimo` dos caibros apoiados.
 * @param {{apoio:Float32Array, NZ:number, ix:number, iz:number, cx:number, cz:number, cel:number, fx:number, fz:number, y:number,
 *   pg:{topo:Float32Array, fundo:Float32Array}, rigido?:boolean, minimo?:number, calco?:number}} o  rigido = volume embalado
 *   (feixe cintado, pacote, caixa, engradado): o peso entra no meio da largura, não nos pontos em que encosta
 * @returns {{ ok:boolean, fracao:number, assentado:number, linhas:Array<{a:number, y0:number, celulas:number[]}> }}
 */
export function caibrosApoiados({ apoio, NZ, ix, iz, cx, cz, cel, fx, fz, y, pg, rigido = false, minimo = 0.6, calco = MEDIDAS.CALCO }) {
  const MAD = MEDIDAS.MADEIRA, n = Math.max(2, Math.round(fx / 1500) + 1), largura = Math.max(1, Math.round(MAD / cel));
  const nb = celulasDoCaibro(fz, cel, cz);
  const ponta = Math.max(1, Math.round(Math.min(1500, Math.max(300, 0.2 * fx)) / cel)), corre = Math.max(1, Math.round(750 / cel));
  const avaliar = (a) => { // faixa [a, a+largura) atravessada
    let minF = Infinity, maxT = 0;
    for (let da = 0; da < largura && a + da < cx; da++) for (let b = 0; b < nb; b++) {
      const f = pg.fundo[(a + da) * cz + b]; if (f < minF) minF = f;
      const t = apoio[(ix + a + da) * NZ + iz + b]; if (t > maxT) maxT = t;
    }
    if (minF === Infinity) return null; // o volume não tem aço nesta faixa: caibro aqui não segura nada
    const y0 = y + minF - MAD; if (maxT > y0 + 1) return null; // o aço de baixo fura a faixa do caibro
    let s0 = Infinity, s1 = -1, soma = 0, nC = 0; const celulas = [];
    for (let da = 0; da < largura && a + da < cx; da++) for (let b = 0; b < nb; b++) {
      if (pg.fundo[(a + da) * cz + b] <= minF + 20) { soma += b; nC++; }
      const k = (ix + a + da) * NZ + iz + b;
      // apoio é AÇO de outro volume: caibro com calço até o assoalho é peça no chão ocupando mal o assoalho
      if (apoio[k] > 0 && y0 - apoio[k] <= calco) { celulas.push(k); if (b < s0) s0 = b; if (b > s1) s1 = b; }
    }
    // o caibro é uma viga atravessada: o peso entra onde o volume encosta (no meio, se é um volume embalado) e tem de
    // cair ENTRE os apoios de baixo
    const carga = rigido ? (MEDIDAS.FOLGA / 2 + fz / 2) / cel - 0.5 : soma / nC;
    return celulas.length && s0 <= carga && s1 >= carga ? { celulas, y0: Math.round(y0) } : null;
  };
  const linhas = [], usados = [];
  for (let i = 0; i < n; i++) {
    const nominal = Math.min(cx - largura, Math.max(0, Math.round((150 + (fx - 300) * (i / (n - 1))) / cel)));
    let lo = Math.max(0, nominal - corre), hi = Math.min(cx - largura, nominal + corre);
    if (i === 0) { lo = 0; hi = Math.min(hi, ponta); } else if (i === n - 1) { lo = Math.max(lo, cx - largura - ponta); hi = cx - largura; }
    let achou = null;
    for (let d = 0; d <= Math.max(nominal - lo, hi - nominal) && !achou; d++) for (const a of d ? [nominal - d, nominal + d] : [nominal]) {
      if (a < lo || a > hi || usados.some((u) => Math.abs(u - a) * cel < 200)) continue;
      const c = avaliar(a); if (c) { achou = { a, ...c }; break; }
    }
    if (achou) { usados.push(achou.a); linhas.push(achou); } else if (i === 0 || i === n - 1) return { ok: false, fracao: 0, assentado: 0, linhas: [] };
  }
  // quanto do fundo do volume fica a até um caibro + calço do aço de baixo (desempate: a pilha mais assentada)
  let perto = 0, total = 0;
  for (let a = 0; a < cx; a++) for (let b = 0; b < cz; b++) { const f = pg.fundo[a * cz + b]; if (f === Infinity) continue; total++; if (y + f - apoio[(ix + a) * NZ + iz + b] <= MAD + calco) perto++; }
  const ok = linhas.length >= Math.ceil(n * minimo - 1e-9);
  return { ok, fracao: linhas.length / n, assentado: total ? perto / total : 0, linhas };
}
