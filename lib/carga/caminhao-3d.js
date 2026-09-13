// Caminhão procedural para o visualizador de carga (three.js). Veio do protótipo do simulador (set/2026).
// Assoalho da carroceria em y = 0; solo em y = -assoalho. X da frente para trás (cavalo em x < 0), Z = largura, Y para cima.
// Cavalo mecânico 6x2 cabine avançada com dormitório (proporções Scania R / Volvo FH): para-brisa inclinado, grade, faróis,
// retrovisores, degraus, tanques, quinta roda, mangueiras; semirreboque carga seca 3 eixos com pescoço, pés de apoio, para-lamas.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

const mat = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, metalness: 0.2, ...o });
const COR_CABINE = 0x0d6cae; // torg-blue
const pintura = () => mat(COR_CABINE, { roughness: 0.3, metalness: 0.28 });
const ESCURO = mat(0x1d2124, { roughness: 0.85, metalness: 0.05 }), CHASSI = mat(0x2b3138, { roughness: 0.7, metalness: 0.15 });
const CROMO = mat(0xd9dee3, { metalness: 0.92, roughness: 0.18 }), ALUMINIO = mat(0xc4cbd2, { metalness: 0.78, roughness: 0.33, side: THREE.DoubleSide }), ACO_RODA = mat(0xdde2e6, { metalness: 0.55, roughness: 0.4 });
const VIDRO = mat(0x1a2e40, { roughness: 0.06, metalness: 0.55, transparent: true, opacity: 0.86 });
const LARANJA = mat(0xff8a1e, { emissive: 0xff6a00, emissiveIntensity: 0.5 }), VERMELHO = mat(0xd62828, { emissive: 0x7a0a0a, emissiveIntensity: 0.6 }), BRANCO = mat(0xf2f5f8, { roughness: 0.4 });
const FAROL = mat(0xeef3ff, { emissive: 0xcfe0ff, emissiveIntensity: 0.55, roughness: 0.2, metalness: 0.3 });
const rbox = (w, h, d, r = 0.05) => new RoundedBoxGeometry(w, h, d, 4, r);
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cil = (r, h, n = 24) => new THREE.CylinderGeometry(r, r, h, n);

let PNEU = null;
function materialPneu() {
  if (PNEU) return PNEU;
  const cv = document.createElement("canvas"); cv.width = 32; cv.height = 64; const c = cv.getContext("2d");
  c.fillStyle = "#b9b9b9"; c.fillRect(0, 0, 32, 64); c.fillStyle = "#ffffff"; c.fillRect(0, 25, 32, 14); // banda de rodagem mais clara que o flanco
  c.fillStyle = "#2e2e2e"; c.fillRect(0, 28, 32, 2); c.fillRect(0, 34, 32, 2); c.fillRect(10, 25, 4, 14); c.fillRect(26, 25, 4, 14); // sulcos circunferenciais e transversais
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(40, 1); t.colorSpace = THREE.SRGBColorSpace;
  PNEU = mat(0x1a1c1f, { roughness: 0.95, metalness: 0, map: t, side: THREE.DoubleSide }); return PNEU;
}

export function montarCaminhao(scene, v) {
  const C = v.C / 1000, L = v.L / 1000, chave = v.chave || "carreta", rigido = !/^carreta/.test(chave);
  const solo = rigido ? -(v.assoalho || 1250) / 1000 : -1.35, zc = L / 2;
  const g = new THREE.Group(); scene.add(g);
  const add = (geo, m, x, y, z, rot) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); if (rot) o.rotation.set(...rot); o.castShadow = o.receiveShadow = true; g.add(o); return o; };

  // ── roda: pneu torneado com flanco bojudo e banda de rodagem; aro com prato REBAIXADO (côncavo), furos de ventilação,
  //    círculo de 10 porcas e cubo saliente — o que se vê de um caminhão de verdade é o prato fundo, não um disco chapado ──
  const roda = (x, z, r, w, lado, aro = ALUMINIO) => {
    const perfil = [[0.55, -0.36], [0.62, -0.44], [0.74, -0.5], [0.9, -0.5], [0.97, -0.45], [1, -0.36], [1, 0], [1, 0.36], [0.97, 0.45], [0.9, 0.5], [0.74, 0.5], [0.62, 0.44], [0.55, 0.36]].map(([a, b]) => new THREE.Vector2(a * r, b * w));
    add(new THREE.LatheGeometry(perfil, 48), materialPneu(), x, solo + r, z, [Math.PI / 2, 0, 0]);
    const y = solo + r, zf = z + lado * 0.36 * w, prof = lado * 0.3 * w, zd = zf - prof; // zf = borda externa do aro, zd = fundo do prato
    add(new THREE.CylinderGeometry(0.545 * r, 0.545 * r, 0.74 * w, 40, 1, true), aro, x, y, z, [Math.PI / 2, 0, 0]); // tambor (visto por dentro do prato)
    add(new THREE.TorusGeometry(0.56 * r, 0.012, 8, 40), aro, x, y, zf); // flange
    add(cil(0.545 * r, 0.025, 40), aro, x, y, zd, [Math.PI / 2, 0, 0]); // prato
    for (let i = 0; i < 8; i++) { const a = (i + 0.5) / 8 * Math.PI * 2; add(cil(0.055 * r, 0.006, 16), ESCURO, x + Math.cos(a) * 0.4 * r, y + Math.sin(a) * 0.4 * r, zd + lado * 0.015, [Math.PI / 2, 0, 0]); }
    for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; add(cil(0.02, 0.035, 8), CROMO, x + Math.cos(a) * 0.29 * r, y + Math.sin(a) * 0.29 * r, zd + lado * 0.03, [Math.PI / 2, 0, 0]); }
    add(cil(0.2 * r, 0.2 * w, 28), mat(0x8a9198, { metalness: 0.6, roughness: 0.45 }), x, y, zd + lado * 0.1 * w, [Math.PI / 2, 0, 0]); // cubo
    add(cil(0.1 * r, 0.03, 20), CROMO, x, y, zd + lado * 0.21 * w, [Math.PI / 2, 0, 0]); // tampa do cubo
  };
  const eixo = (x, r, w, duplo = true, aro = ALUMINIO) => { add(cil(0.075, L - 0.3, 12), CHASSI, x, solo + r, zc, [Math.PI / 2, 0, 0]); // o eixo termina DENTRO do cubo, nunca atravessa a roda
    for (const s of [-1, 1]) { const zo = zc + s * (L / 2 - w / 2 + 0.02); roda(x, zo, r, w, s, aro); if (duplo) roda(x, zo - s * (w + 0.02), r, w, -s, aro); } };
  // para-lama: meia-casca ABERTA sobre a roda (θ de π/2 a 3π/2 fica em cima depois de girar o eixo Y→Z)
  const arco = (x, r, largura, m = ESCURO) => { for (const s of [-1, 1]) add(new THREE.CylinderGeometry(r + 0.1, r + 0.1, largura, 24, 1, true, Math.PI / 2, Math.PI), mat(0x1d2124, { roughness: 0.85, side: THREE.DoubleSide }), x, solo + r, zc + s * (L / 2 + 0.02), [Math.PI / 2, 0, 0]); };

  // ── cabine avançada: casca extrudada do perfil lateral (para-brisa inclinado, teto arredondado), vidros, portas, grade, faróis… ──
  const cabine = ({ xFrente, piso, teto, comp, larg, dormitorio }) => {
    const h = teto - piso, bev = 0.07;
    const P = [[0.05, 0], [0.02, 0.30], [0.045, 0.34], [0.19, 0.79], [0.27, 0.91], [0.42, 0.98], [0.62, 1], [0.96, 1], [1, 0.95], [1, 0]].map(([a, b]) => [xFrente + a * comp, piso + b * h]);
    const shape = new THREE.Shape(); P.forEach(([x, y], i) => (i ? shape.lineTo(x, y) : shape.moveTo(x, y))); shape.closePath();
    const casca = new THREE.ExtrudeGeometry(shape, { depth: larg - 2 * bev, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 4, steps: 1 });
    casca.translate(0, 0, -(larg - 2 * bev) / 2); add(casca, pintura(), 0, 0, zc);
    // para-brisa (segmento P2→P3) e moldura preta
    const [x2, y2] = P[2], [x3, y3] = P[3]; const dx = x3 - x2, dy = y3 - y2, len = Math.hypot(dx, dy), nx = -dy / len, ny = dx / len, th = Math.atan2(dy, dx) - Math.PI / 2;
    const mx = (x2 + x3) / 2, my = (y2 + y3) / 2;
    add(box(0.02, len - 0.06, larg - 0.34), ESCURO, mx + nx * (bev + 0.004), my + ny * (bev + 0.004), zc, [0, 0, th]);
    add(box(0.02, len - 0.18, larg - 0.5), VIDRO, mx + nx * (bev + 0.014), my + ny * (bev + 0.014), zc, [0, 0, th]);
    // quebra-sol
    add(rbox(0.42, 0.05, larg - 0.2, 0.02), pintura(), x3 + 0.12 + nx * bev, y3 + 0.12, zc, [0, 0, th]);
    // frente baixa: painel da grade com friso cromado, emblema, faróis, para-choque, placa, degraus
    const xf = P[1][0] - bev, yg = piso + h * 0.19;
    add(box(0.03, h * 0.19, larg - 0.5), ESCURO, xf - 0.005, yg, zc);
    for (let i = -1; i <= 1; i++) add(box(0.02, 0.03, larg - 0.6), CROMO, xf - 0.02, yg + i * h * 0.055, zc);
    add(rbox(0.03, 0.12, 0.26, 0.03), BRANCO, xf - 0.03, piso + h * 0.31, zc);
    for (const s of [-1, 1]) { const zl = zc + s * (larg / 2 - 0.36);
      add(rbox(0.05, 0.22, 0.48, 0.02), FAROL, xf - 0.015, piso + h * 0.085, zl); add(box(0.05, 0.06, 0.48), LARANJA, xf - 0.015, piso + h * 0.085 - 0.16, zl);
      add(cil(0.06, 0.03, 16), FAROL, xf - 0.2, piso - 0.28, zc + s * (larg / 2 - 0.55), [0, 0, Math.PI / 2]); }
    add(rbox(0.44, 0.5, larg + 0.06, 0.06), ESCURO, xf + 0.06, piso - 0.22, zc);
    add(box(0.3, 0.1, larg - 0.3), mat(0x0f1113), xf + 0.1, piso - 0.5, zc);
    add(box(0.02, 0.13, 0.42), BRANCO, xf - 0.17, piso - 0.12, zc);
    for (const s of [-1, 1]) { const zd = zc + s * (larg / 2 - 0.22);
      add(box(0.44, 0.05, 0.4), ESCURO, xFrente + 0.62, piso - 0.62, zd); add(box(0.44, 0.05, 0.4), ESCURO, xFrente + 0.62, piso - 0.31, zd);
      add(box(0.44, 0.34, 0.04), ESCURO, xFrente + 0.62, piso - 0.46, zc + s * (larg / 2 - 0.42)); }
    // portas: frisos, vidro, maçaneta; janela do dormitório; retrovisores
    const x1 = xFrente + comp * 0.22, xd2 = xFrente + comp * 0.66, yTopo = piso + h * 0.77;
    for (const s of [-1, 1]) { const zs = zc + s * (larg / 2), FRISO = mat(0x083a5e);
      add(box(0.018, yTopo - piso - 0.05, 0.012), FRISO, x1, (yTopo + piso) / 2, zs + s * 0.004); add(box(0.018, yTopo - piso - 0.05, 0.012), FRISO, xd2, (yTopo + piso) / 2, zs + s * 0.004);
      add(box(xd2 - x1, 0.018, 0.012), FRISO, (x1 + xd2) / 2, piso + 0.04, zs + s * 0.004);
      const wj = xd2 - x1 - 0.2, hj = h * 0.3, xj = (x1 + xd2) / 2 + 0.04, yj = piso + h * 0.6;
      add(box(wj + 0.07, hj + 0.07, 0.012), ESCURO, xj, yj, zs + s * 0.004); add(box(wj, hj, 0.014), VIDRO, xj, yj, zs + s * 0.01);
      add(rbox(0.17, 0.04, 0.03, 0.01), CROMO, xd2 - 0.22, piso + h * 0.4, zs + s * 0.02);
      if (dormitorio) { const wd = xFrente + comp - xd2 - 0.3, xdm = xd2 + 0.15 + wd / 2, yd = piso + h * 0.6, hd = h * 0.2; add(box(wd + 0.06, hd + 0.06, 0.012), ESCURO, xdm, yd, zs + s * 0.004); add(box(wd, hd, 0.014), VIDRO, xdm, yd, zs + s * 0.01); }
      const ze = zs + s * 0.42, xe = xFrente + 0.42;
      add(box(0.04, 0.04, 0.42), ESCURO, xe, piso + h * 0.82, zs + s * 0.21); add(box(0.04, 0.04, 0.42), ESCURO, xe, piso + h * 0.52, zs + s * 0.21);
      add(rbox(0.2, h * 0.28, 0.14, 0.03), ESCURO, xe, piso + h * 0.67, ze); add(box(0.01, h * 0.25, 0.11), CROMO, xe + 0.105, piso + h * 0.67, ze);
      add(rbox(0.18, h * 0.1, 0.14, 0.03), ESCURO, xe, piso + h * 0.44, ze); add(box(0.01, h * 0.08, 0.11), CROMO, xe + 0.095, piso + h * 0.44, ze);
      // extensor lateral atrás da porta (defletor)
      if (dormitorio) add(box(0.5, h * 0.8, 0.04), pintura(), xFrente + comp + 0.2, piso + h * 0.47, zs - s * 0.1, [0, s * 0.14, 0]); }
    // teto: luzes de posição laranja, buzinas, defletor de ar
    for (let i = -2; i <= 2; i++) add(rbox(0.1, 0.06, 0.16, 0.02), LARANJA, xFrente + comp * 0.4, teto - 0.02, zc + i * larg * 0.18);
    for (const s of [-1, 1]) add(cil(0.055, 0.55, 14), CROMO, xFrente + comp * 0.7, teto + 0.05, zc + s * 0.45, [0, 0, Math.PI / 2]);
    if (dormitorio) { const xa = xFrente + comp * 0.5, xb = xFrente + comp + 0.04; const sh = new THREE.Shape(); sh.moveTo(xa, teto - 0.06); sh.lineTo(xb, teto + 0.38); sh.lineTo(xb, teto - 0.06); sh.closePath();
      const def = new THREE.ExtrudeGeometry(sh, { depth: larg - 0.36, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 2 }); def.translate(0, 0, -(larg - 0.36) / 2); add(def, pintura(), 0, 0, zc); }
    add(cil(0.012, 0.6, 6), ESCURO, xFrente + comp * 0.8, teto + 0.3, zc + larg * 0.4);
  };

  // ── carroceria aberta (comum a todos): assoalho de tábuas sobre travessas, guardas laterais com fueiros, lanternas, faixa refletiva ──
  const madeira = (i) => mat(i % 2 ? 0x8f6d46 : 0x9c7a52, { roughness: 0.92, metalness: 0 });
  add(box(C, 0.1, L), CHASSI, C / 2, -0.1, zc);
  for (let x = 0.12; x < C; x += 0.25) add(box(0.22, 0.05, L), madeira(Math.round(x * 4)), x, -0.025, zc);
  for (let x = 0.45; x < C; x += 1.25) add(box(0.08, 0.12, L - 0.2), CHASSI, x, -0.2, zc);
  const GALV = mat(0x9aa4ae, { metalness: 0.6, roughness: 0.45 });
  for (const s of [-1, 1]) { const z = zc + s * (L / 2 + 0.02); add(box(C, 0.1, 0.04), GALV, C / 2, -0.06, z);
    for (let x = 0.2; x < C; x += 1.24) add(rbox(0.09, 0.66, 0.06, 0.02), GALV, x, 0.31, z); add(box(C, 0.05, 0.04), GALV, C / 2, 0.62, z); add(box(C, 0.04, 0.04), GALV, C / 2, 0.32, z); }
  for (const s of [-1, 1]) for (let x = 0.3; x < C; x += 0.6) add(box(0.28, 0.05, 0.006), mat(x % 1.2 < 0.6 ? 0xe74c3c : 0xf4f6f8, { emissive: x % 1.2 < 0.6 ? 0x3a0a0a : 0x222222 }), x, -0.1, zc + s * (L / 2 + 0.003));
  for (const s of [-1, 1]) add(box(0.4, 0.5, 0.02), mat(0x111), C - 0.5, solo + 0.25, zc + s * (L / 2 - 0.3));

  if (!rigido) {
    // ── semirreboque: longarinas com pescoço baixo, mesa e pino-rei, pés de apoio, barras laterais, 3 eixos, para-lama corrido, para-choque ──
    const xPesc = 3.3;
    for (const s of [-1, 1]) { const z = zc + s * 0.5;
      add(box(xPesc, 0.1, 0.14), CHASSI, xPesc / 2, -0.2, z); add(box(C - xPesc + 0.15, 0.36, 0.14), CHASSI, (C + xPesc) / 2 + 0.05, -0.33, z); add(box(0.5, 0.36, 0.14), CHASSI, xPesc + 0.1, -0.33, z, [0, 0, 0]); }
    add(box(1.3, 0.02, 1.2), CHASSI, 1.4, -0.26, zc); add(cil(0.04, 0.12, 12), CROMO, 1.4, -0.33, zc);
    for (let x = xPesc + 0.6; x < C - 0.3; x += 1.25) add(box(0.08, 0.3, 0.9), CHASSI, x, -0.35, zc);
    for (const s of [-1, 1]) { const z = zc + s * 0.75; const yTop = -0.51, yPe = solo + 0.12, hL = yTop - yPe;
      add(box(0.12, hL, 0.12), CHASSI, 4.3, yTop - hL / 2, z); add(box(0.3, 0.05, 0.3), CHASSI, 4.3, yPe - 0.025, z);
      add(box(1.1, 0.14, 0.06), GALV, (4.3 + C - 4.2) / 2 - 0.3, solo + 0.95, zc + s * (L / 2 + 0.03)); }
    add(box(0.06, 0.06, 1.5), CHASSI, 4.3, solo + 0.55, zc); add(cil(0.015, 0.4, 8), CHASSI, 4.55, solo + 0.6, zc + 0.9, [0, 0, Math.PI / 2]);
    for (const s of [-1, 1]) for (let x = 5.0; x < C - 4.6; x += 2.4) add(box(Math.min(2.2, C - 4.6 - x), 0.09, 0.06), GALV, x + Math.min(2.2, C - 4.6 - x) / 2, solo + 0.95, zc + s * (L / 2 + 0.03));
    add(box(0.6, 0.45, 0.5), ESCURO, 5.6, -0.8, zc - L / 2 + 0.1); // caixa de ferramentas
    const r = 0.53, w = 0.3; for (const x of [C - 3.7, C - 2.45, C - 1.2]) { eixo(x, r, w, true, ACO_RODA); arco(x, r, 0.44); }
    for (const s of [-1, 1]) { add(box(4.0, 0.04, 0.46), ESCURO, C - 2.45, solo + 2 * r + 0.13, zc + s * (L / 2 + 0.02)); add(box(0.02, 0.55, 0.42), mat(0x111), C - 1.2 + r + 0.08, solo + 0.32, zc + s * (L / 2 + 0.02)); }
    add(new THREE.LatheGeometry([[0.55, -0.36], [0.74, -0.5], [0.9, -0.5], [1, -0.36], [1, 0.36], [0.9, 0.5], [0.74, 0.5], [0.55, 0.36]].map(([a, b]) => new THREE.Vector2(a * r, b * w)), 40), materialPneu(), 6.8, -0.85, zc); add(cil(0.545 * r, 0.7 * w, 32), ACO_RODA, 6.8, -0.85, zc); // estepe deitado sob o assoalho
    // para-choque traseiro (barra anti-intrusão): viga contínua com faixas refletivas vermelho/branco e dois suportes
    add(box(0.12, 0.14, L + 0.3), CHASSI, C + 0.1, solo + 0.55, zc);
    for (let i = 0; i < 10; i++) add(box(0.01, 0.1, (L + 0.3) / 10 - 0.01), i % 2 ? mat(0xd9dee3, { emissive: 0x333333 }) : mat(0xe03030, { emissive: 0x4a0a0a }), C + 0.165, solo + 0.55, zc - (L + 0.3) / 2 + (L + 0.3) * (i + 0.5) / 10);
    for (const s of [-1, 1]) add(box(0.1, 0.55, 0.1), CHASSI, C + 0.05, solo + 0.83, zc + s * 0.5);
    for (const s of [-1, 1]) { const z = zc + s * (L / 2 - 0.35); add(rbox(0.1, 0.14, 0.34, 0.02), VERMELHO, C + 0.05, -0.08, z); add(rbox(0.1, 0.1, 0.14, 0.02), LARANJA, C + 0.05, -0.24, z - s * 0.1); add(rbox(0.1, 0.1, 0.14, 0.02), BRANCO, C + 0.05, -0.24, z + s * 0.1); }
    // ── cavalo mecânico 6x2 ──
    const xF = 1.4 - 4.55, rC = 0.51, wC = 0.3, comp = 2.3, larg = 2.5, piso = solo + 1.05, teto = solo + 3.9;
    for (const s of [-1, 1]) add(box(6.3, 0.28, 0.09), CHASSI, xF + 3.45, solo + 0.81, zc + s * 0.48);
    for (const x of [1.0, 2.4, 3.6, 4.95, 6.15]) add(box(0.1, 0.26, 0.96), CHASSI, xF + x, solo + 0.81, zc);
    add(box(0.1, 0.3, 2.1), CHASSI, xF + 6.6, solo + 0.81, zc); for (const s of [-1, 1]) { add(rbox(0.06, 0.14, 0.3, 0.02), VERMELHO, xF + 6.66, solo + 0.83, zc + s * 0.85); add(rbox(0.06, 0.1, 0.12, 0.02), LARANJA, xF + 6.66, solo + 0.83, zc + s * 0.6); }
    eixo(xF + 1.42, rC, wC, false); arco(xF + 1.42, rC, 0.42); for (const x of [4.4, 5.75]) { eixo(xF + x, rC, wC); }
    for (const s of [-1, 1]) { add(box(2.5, 0.04, 0.46), ESCURO, xF + 5.07, solo + 2 * rC + 0.13, zc + s * (L / 2 + 0.02)); add(box(0.02, 0.5, 0.42), mat(0x111), xF + 5.75 + rC + 0.08, solo + 0.3, zc + s * (L / 2 + 0.02)); }
    for (const x of [4.4, 5.75]) arco(xF + x, rC, 0.44);
    for (const s of [-1, 1]) { const z = zc + s * 0.95; add(cil(0.32, 1.4, 28), ALUMINIO, xF + 2.9, solo + 0.72, z, [0, 0, Math.PI / 2]); for (const xs of [2.45, 3.35]) add(new THREE.TorusGeometry(0.33, 0.02, 8, 32), ESCURO, xF + xs, solo + 0.72, z, [0, Math.PI / 2, 0]); }
    add(box(1.0, 0.3, 0.42), CHASSI, xF + 3.0, solo + 0.55, zc); // silencioso
    add(box(1.3, 0.03, 1.5), mat(0x30363c, { roughness: 0.8 }), xF + 3.2, solo + 0.96, zc); // passadiço
    // quinta roda: pedestais, mesa com rampa, e as mangueiras até o semirreboque
    for (const s of [-1, 1]) add(box(0.7, 0.1, 0.16), CHASSI, xF + 4.55, solo + 1.0, zc + s * 0.4);
    add(box(0.95, 0.07, 1.05), mat(0x3a4046, { metalness: 0.5, roughness: 0.5 }), xF + 4.55, solo + 1.085, zc);
    for (const s of [-1, 1]) add(box(0.3, 0.07, 0.35), mat(0x3a4046), xF + 5.05, solo + 1.07, zc + s * 0.33, [0, 0, 0.35]);
    const tubo = (pts, m, rr = 0.025) => add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))), 40, rr, 8), m, 0, 0, 0);
    [[0.25, 0xd62828], [0, 0xf1c40f], [-0.25, 0x111111]].forEach(([dz, cor]) => tubo([[xF + comp + 0.02, solo + 2.05, zc + dz], [xF + comp + 0.35, solo + 2.5, zc + dz], [xF + comp + 0.8, solo + 2.2, zc + dz], [xF + comp + 1.0, solo + 1.5, zc + dz], [0.2, -0.3, zc + dz]], mat(cor, { roughness: 0.6 })));
    cabine({ xFrente: xF, piso, teto, comp, larg, dormitorio: true });
    return { grupo: g, solo };
  }
  // ── caminhão rígido: chassi contínuo sob a carroceria, cabine simples (sem dormitório) sobre o eixo dianteiro ──
  const D = { hr: [1.7, 1.75, 1.55, 0.36], tresquartos: [1.9, 2.1, 1.85, 0.42], toco: [2.1, 2.4, 2.25, 0.5], truck: [2.1, 2.4, 2.25, 0.5] }[chave] || [2.1, 2.4, 2.25, 0.5];
  const [comp, larg, h, r] = D, w = Math.max(0.2, r * 0.55), piso = -0.28, xF = -0.35 - comp;
  for (const s of [-1, 1]) add(box(C - xF + 0.2, 0.28, 0.09), CHASSI, (C + xF) / 2 + 0.1, -0.36, zc + s * Math.min(0.48, L / 2 - 0.35));
  for (const x of chave === "truck" ? [C - 1.3, C - 2.6] : [C - 1.4]) { eixo(x, r, w, true); arco(x, r, 0.4); }
  eixo(xF + comp * 0.62, r, w, false); arco(xF + comp * 0.62, r, 0.4);
  for (const s of [-1, 1]) add(cil(0.2, 0.9, 20), ALUMINIO, Math.min(1.3, C / 3), solo + r + 0.1, zc + s * (L / 2 - 0.05), [0, 0, Math.PI / 2]);
  add(box(0.1, 0.3, L - 0.3), CHASSI, C + 0.05, -0.36, zc); for (const s of [-1, 1]) { add(rbox(0.06, 0.14, 0.3, 0.02), VERMELHO, C + 0.11, -0.34, zc + s * (L / 2 - 0.35)); }
  cabine({ xFrente: xF, piso, teto: piso + h, comp, larg, dormitorio: false });
  return { grupo: g, solo };
}
