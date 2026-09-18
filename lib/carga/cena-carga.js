// Cena 3D de uma carga simulada: as unidades (malha real da peça ou caixa), a embalagem (caixa de
// madeira, engradado, cavalete, cintas), os caibros entre camadas e o rótulo com o número do volume.
// Veio do protótipo do simulador (viewer.js, set/2026). Só roda no navegador.
import * as THREE from "three";
import { coberturaDaBase, temGiroSemBaseConfirmada } from "./apoios";
import { limitesRotacionados } from "./montagem-manual";

export const CORES = [0x2e86c1, 0xe67e22, 0x27ae60, 0x8e44ad, 0xc0392b, 0x16a085, 0xd35400, 0x2c3e50, 0x7f8c8d, 0xb7950b, 0x1abc9c, 0x9b59b6];
const mm = (v) => v / 1000;
const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, metalness: 0.15, ...o });

/** Malha de uma peça: a geometria real do IFC, girada como a caixa orientada e permutada para a orientação de viagem; sem malha, uma caixa. */
export function malhaPeca(p, malhas, cor, opaco = 1) {
  const g = malhas?.[p.marca];
  if (g && p.perm) { const P = p.perm, n = g.pos.length / 3, pos = new Float32Array(n * 3);
    const gi = p.giro, r = gi ? gi.ang * Math.PI / 180 : 0, c = Math.cos(r), sn = Math.sin(r);
    for (let i = 0; i < n; i++) { let x = g.pos[i * 3], y = g.pos[i * 3 + 1], z = g.pos[i * 3 + 2];
      if (gi) { let q; if (gi.eixo === 2) q = [x * c - y * sn, x * sn + y * c, z]; else if (gi.eixo === 0) q = [x, y * c - z * sn, y * sn + z * c]; else q = [x * c + z * sn, y, -x * sn + z * c];
        x = q[0] - gi.min[0]; y = q[1] - gi.min[1]; z = q[2] - gi.min[2]; }
      const v = [x, y, z]; pos[i * 3] = mm(v[P.X]); pos[i * 3 + 1] = mm(v[P.Y]); pos[i * 3 + 2] = mm(v[P.Z]); }
    const bg = new THREE.BufferGeometry(); bg.setAttribute("position", new THREE.BufferAttribute(pos, 3)); bg.setIndex(new THREE.BufferAttribute(g.idx instanceof Uint32Array ? g.idx : new Uint32Array(g.idx), 1)); bg.computeVertexNormals();
    const m = new THREE.Mesh(bg, M(cor, { metalness: 0.3, roughness: 0.55, side: THREE.DoubleSide, transparent: opaco < 1, opacity: opaco })); m.castShadow = true; return m; }
  const m = new THREE.Mesh(new THREE.BoxGeometry(mm(p.C), mm(p.A), mm(p.L)), M(cor, { transparent: true, opacity: 0.5 })); m.position.set(mm(p.C) / 2, mm(p.A) / 2, mm(p.L) / 2); return m;
}

// EM PÉ com embalagem: os painéis giram 90° (largura vira altura) dentro de um engradado ou sobre um cavalete
function montarEmPe(u, malhas, cor) {
  const e = u.embalagem, P = new THREE.Group(); P.position.set(mm(u.x), mm(u.y), mm(u.z)); P.userData = { u, y0: mm(u.y) };
  const Wp = Math.max(...u.membros.map((p) => (p.dy || 0) + p.A));
  const R = new THREE.Group();
  if (e.deitado) R.position.set(mm(e.quadro), mm(e.base), mm(e.quadro));
  else { R.rotation.x = -Math.PI / 2; R.position.set(mm(e.quadro), mm(e.base), mm((u.L - Wp) / 2 + Wp)); }
  for (const p of u.membros) { const m = malhaPeca(p, malhas, cor); m.position.add(new THREE.Vector3(mm(p.dx || 0), mm(p.dy || 0), mm(p.dz || 0))); m.userData.item = p; m.userData.unidade = u; R.add(m); }
  P.add(R);
  const C = mm(u.C), L = mm(u.L), A = mm(u.A), q = mm(e.quadro), b = mm(e.base);
  const mad = M(0xc49a6c), madEsc = M(0x8a6a45);
  const box = (w, h, d, x, y, z, m = mad, rot) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); if (rot) o.rotation.set(...rot); o.castShadow = true; P.add(o); };
  if (e.tipo === "engradado") {
    for (const z of [q / 2, L - q / 2]) box(C, b, q, C / 2, b / 2, z, madEsc);
    const nT = Math.max(2, Math.round(C / 0.8) + 1); for (let i = 0; i < nT; i++) box(q, b, L, q / 2 + (C - q) * (i / (nT - 1)), b / 2, L / 2, madEsc);
    for (const x of [q / 2, C - q / 2]) for (const z of [q / 2, L - q / 2]) box(q, A - b, q, x, b + (A - b) / 2, z);
    for (const z of [q / 2, L - q / 2]) box(C, q, q, C / 2, A - q / 2, z); for (const x of [q / 2, C - q / 2]) box(q, q, L, x, A - q / 2, L / 2);
    const h = A - b - q, ang = Math.atan2(h, C - q); for (const z of [q / 2, L - q / 2]) box(Math.hypot(C - q, h), q * 0.8, q * 0.5, C / 2, b + q / 2 + h / 2, z, madEsc, [0, 0, ang]);
    for (const z of [q / 2, L - q / 2]) { const t = new THREE.Mesh(new THREE.BoxGeometry(C - q, A - b - q, 0.004), M(0xd9b382, { transparent: true, opacity: 0.18, side: THREE.DoubleSide })); t.position.set(C / 2, b + q / 2 + h / 2, z); P.add(t); }
  } else {
    box(C, b, q * 1.5, C / 2, b / 2, L / 2, madEsc);
    const h = A - b, meio = L / 2 - q / 2, ang = Math.atan2(meio, h), len = Math.hypot(h, meio);
    for (const x of [q + 0.05, C - q - 0.05]) { for (const s of [-1, 1]) box(q, len, q, x, b + h / 2, L / 2 + s * meio / 2, mad, [s * ang, 0, 0]); box(q, q, L, x, b + q / 2, L / 2, mad); box(q * 0.8, q * 0.8, meio, x, b + h * 0.55, L / 2, madEsc); }
    for (let x = 0.4; x < C - 0.2; x += 1.2) { const c = new THREE.Mesh(new THREE.BoxGeometry(0.05, h + 0.02, mm(Wp) + 0.06), M(0x222222)); c.position.set(x, b + h / 2, L / 2); P.add(c); }
  }
  if (e.tipo === "engradado" && e.deitado) { const tampa = new THREE.Mesh(new THREE.BoxGeometry(C, q * 0.6, L), M(0xb08650, { transparent: true, opacity: 0.6 })); tampa.position.set(C / 2, A - q * 0.3, L / 2); P.add(tampa); }
  const eb = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(C, A, L)), new THREE.LineBasicMaterial({ color: 0x8a5600 })); eb.position.set(C / 2, A / 2, L / 2); P.add(eb);
  return P;
}

function montarDeitada(u, malhas, cor) {
  const g = new THREE.Group();
  for (const p of u.membros) { const m = malhaPeca(p, malhas, cor); m.position.add(new THREE.Vector3(mm(p.dx || 0), mm(p.dy || 0), mm(p.dz || 0))); m.userData.item = p; m.userData.unidade = u; g.add(m); }
  if (u.tipo === "PACOTE") { for (let x = 0.3; x < mm(u.C); x += 1.2) { const c = new THREE.Mesh(new THREE.BoxGeometry(0.05, mm(u.A) + 0.02, mm(u.L) + 0.02), M(0x222222)); c.position.set(x, mm(u.A) / 2, mm(u.L) / 2); g.add(c); }
    const e = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(mm(u.C), mm(u.A), mm(u.L))), new THREE.LineBasicMaterial({ color: 0x333333 })); e.position.set(mm(u.C) / 2, mm(u.A) / 2, mm(u.L) / 2); g.add(e); }
  if (u.tipo === "PALLET" || u.tipo === "CAIXA") { const b = mm(u.base || 150);
    for (const z of [0.05, mm(u.L) / 2, mm(u.L) - 0.05]) { const t = new THREE.Mesh(new THREE.BoxGeometry(mm(u.C), b * 0.65, 0.1), M(0xb08650)); t.position.set(mm(u.C) / 2, b * 0.33, z); g.add(t); }
    for (let x = 0.06; x < mm(u.C); x += 0.16) { const t = new THREE.Mesh(new THREE.BoxGeometry(0.1, b * 0.25, mm(u.L)), M(0xc49a6c)); t.position.set(x, b * 0.85, mm(u.L) / 2); g.add(t); }
    if (u.tipo === "CAIXA") { const q = 0.05, H = mm(u.A) - b; // caixa: montantes, tampa de madeira, laterais translúcidas
      for (const x of [q / 2, mm(u.C) - q / 2]) for (const z of [q / 2, mm(u.L) - q / 2]) { const p = new THREE.Mesh(new THREE.BoxGeometry(q, H, q), M(0xa5825a)); p.position.set(x, b + H / 2, z); g.add(p); }
      const tampa = new THREE.Mesh(new THREE.BoxGeometry(mm(u.C), q, mm(u.L)), M(0xb08650)); tampa.position.set(mm(u.C) / 2, b + H - q / 2, mm(u.L) / 2); g.add(tampa);
      const cx2 = new THREE.Mesh(new THREE.BoxGeometry(mm(u.C) - q, H - q, mm(u.L) - q), M(0xd9b382, { transparent: true, opacity: 0.3 })); cx2.position.set(mm(u.C) / 2, b + (H - q) / 2, mm(u.L) / 2); g.add(cx2); }
    else { const cx2 = new THREE.Mesh(new THREE.BoxGeometry(mm(u.C), mm(u.A) - b, mm(u.L)), M(0xd9b382, { transparent: true, opacity: 0.22 })); cx2.position.set(mm(u.C) / 2, b + (mm(u.A) - b) / 2, mm(u.L) / 2); g.add(cx2); } }
  g.position.set(mm(u.x), mm(u.y), mm(u.z)); g.userData = { u, y0: mm(u.y) };
  return g;
}

/** Grupo 3D de uma unidade posicionada (cor pela camada). */
export function montarUnidade(u, malhas) {
  const cor = CORES[(u.camada || 0) % CORES.length];
  const base = u.rotacaoManual ? {...u, x:0, y:0, z:0} : u;
  const g = (u.emPe || u.tipo === "ENGRADADO") ? montarEmPe(base, malhas, cor) : montarDeitada(base, malhas, cor);
  if (u.girada) { g.rotation.y = -Math.PI / 2; g.position.x += mm(u.L); } // atravessada: comprimento vira Z, largura vira X
  if (u.rotacaoManual) {
    const r=u.rotacaoManual, min=limitesRotacionados(u,r).min, grupo=new THREE.Group();
    grupo.add(g);grupo.rotation.set(r.x*Math.PI/180,r.y*Math.PI/180,r.z*Math.PI/180,"XYZ");
    grupo.position.set(mm(u.x-min[0]),mm(u.y-min[1]),mm(u.z-min[2]));grupo.userData={u,y0:mm(u.y)};return grupo;
  }
  return g;
}

/**
 * Caibros atravessados sob uma unidade que não está no chão — SÓ onde há apoio embaixo. Um caibro desenhado no vão
 * entre duas peças de baixo é um caibro que cai; o carregador põe o caibro em cima da peça, não no ar.
 * Vitor (13/09/2026): "alguns pacotes parece que estão sem os apoios em todas as extremidades".
 * @param {object} u  unidade; @param {number} madeira  seção do caibro (mm); @param {object[]} baixo  unidades sob ela (u.sobre)
 */
export function montarCaibros(u, madeira, baixo = []) {
  const out = [], matMad = M(0xb08650);
  if (!(u.y > 0) || temGiroSemBaseConfirmada(u)) return out;
  const fx = u.fx || (u.girada ? u.L : u.C), fz = u.fz || (u.girada ? u.C : u.L), n = Math.max(2, Math.round(mm(fx) / 1.5) + 1);
  const topoBaixo = u.y - madeira; // onde o caibro se apoia
  const apoios = baixo.filter((b) => Math.abs(b.y + (b.fy || b.A) - topoBaixo) <= 2 && !b.baseEmV && !b.topoVazado && !temGiroSemBaseConfirmada(b)).map((b) => [b.x, b.x + (b.fx || b.C), b.z, b.z + (b.fz || b.L)]);
  const apoiado = (x) => coberturaDaBase({x:x-madeira/2,z:u.z,fx:madeira,fz},apoios.map(([x0,x1,z0,z1])=>({x:x0,z:z0,fx:x1-x0,fz:z1-z0}))).suficiente;
  const usados = [];
  for (let k = 0; k < n; k++) {
    let x = u.x + 150 + (fx - 300) * (k / (n - 1)); // posição nominal, em mm
    if (!apoiado(x)) { // desloca até o apoio mais próximo dentro de ±75 cm; sem apoio, não desenha
      let melhor = null;
      for (const [x0, x1] of apoios) for (const cand of [Math.max(x0 + 40, u.x + 60), Math.min(x1 - 40, u.x + fx - 60)]) if (cand >= u.x + 60 && cand <= u.x + fx - 60 && Math.abs(cand - x) <= 750 && apoiado(cand) && (melhor == null || Math.abs(cand - x) < Math.abs(melhor - x))) melhor = cand;
      if (melhor == null) continue; x = melhor;
    }
    if (usados.some((v) => Math.abs(v - x) < 200)) continue; usados.push(x);
    const m = new THREE.Mesh(new THREE.BoxGeometry(mm(madeira), mm(madeira), mm(fz) + 0.1), matMad); m.position.set(mm(x), mm(u.y) - mm(madeira) / 2, mm(u.z) + mm(fz) / 2); m.userData.pilhaDe = u.id; m.castShadow = true; out.push(m);
  }
  return out;
}

/** Número do volume na cor da camada — tamanho FIXO na tela (não cresce ao aproximar) e discreto. Vitor (13/09/2026): "a numeração atrapalha a visualização". */
export function rotuloVolume(u, tamanho = 0.05) {
  const cv = document.createElement("canvas"); cv.width = 128; cv.height = 128; const ctx = cv.getContext("2d");
  const cor = "#" + CORES[(u.camada || 0) % CORES.length].toString(16).padStart(6, "0");
  ctx.beginPath(); ctx.arc(64, 64, 54, 0, Math.PI * 2); ctx.fillStyle = cor; ctx.globalAlpha = 0.82; ctx.fill(); ctx.globalAlpha = 1; ctx.lineWidth = 6; ctx.strokeStyle = "#ffffff"; ctx.stroke();
  ctx.fillStyle = "#ffffff"; ctx.font = "bold 66px Arial"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(String(u.volume), 64, 68);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), depthTest: false, depthWrite: false, transparent: true, sizeAttenuation: false })); sp.renderOrder = 999;
  sp.scale.set(tamanho, tamanho, 1); // fração da altura da tela
  const fr = 0.3 + 0.4 * ((u.volume * 7) % 5) / 4; // espalha ao longo do volume para rótulos de peças compridas não se empilharem
  sp.position.set(mm(u.x + (u.fx || u.C) * fr), mm(u.y + (u.fy || u.A)) + 0.12, mm(u.z + (u.fz || u.L) / 2));
  return sp;
}

export const MATERIAL_CINZA = new THREE.MeshStandardMaterial({ color: 0xc9cfd6, roughness: 0.9, metalness: 0, transparent: true, opacity: 0.88, side: THREE.DoubleSide });
