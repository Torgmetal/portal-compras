var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// tmp/consolidar-romaneio2.js
var import_node_fs = __toESM(require("node:fs"));

// lib/carga/apoios.js
var temGiroSemBaseConfirmada = (u) => !!(u.rotacaoManual && (u.rotacaoManual.x % 180 || u.rotacaoManual.z % 180 || u.rotacaoManual.y % 90));
function baseCompativelParaCaixa(u, apoios, itens = [], madeira = 100) {
  if (temGiroSemBaseConfirmada(u)) return null;
  const fx = u.fx || u.C, fz = u.fz || u.L;
  return apoios.find((b) => b.tipo === "CAIXA" && !b.nadaEmCima && !b.emPe && !temGiroSemBaseConfirmada(b) && b.y <= 1 && u.kg > 0 && b.kg >= u.kg + itens.filter((p) => p.id !== u.id && p.id !== b.id && Math.abs(p.y - (b.y + (b.fy || b.A) + madeira)) <= 2 && Math.min(p.x + (p.fx || p.C), b.x + (b.fx || b.C)) > Math.max(p.x, b.x) && Math.min(p.z + (p.fz || p.L), b.z + (b.fz || b.L)) > Math.max(p.z, b.z)).reduce((s, p) => s + p.kg, 0) && u.x >= b.x - 1 && u.z >= b.z - 1 && u.x + fx <= b.x + (b.fx || b.C) + 1 && u.z + fz <= b.z + (b.fz || b.L) + 1) || null;
}

// tmp/calcos-contato-op102.js
var caches = /* @__PURE__ */ new WeakMap();
function alturaFaces(faces, x, z, superior) {
  let registro = caches.get(faces);
  if (!registro) {
    const bins2 = /* @__PURE__ */ new Map();
    for (const f of faces) {
      const [ax, az, bx, bz, cx, cz] = f;
      const den = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
      if (Math.abs(den) < 1e-3) continue;
      const t = { f, den, x0: Math.min(ax, bx, cx), x1: Math.max(ax, bx, cx), z0: Math.min(az, bz, cz), z1: Math.max(az, bz, cz) };
      for (let i = Math.floor(t.x0 / 200); i <= Math.floor(t.x1 / 200); i++) for (let j = Math.floor(t.z0 / 200); j <= Math.floor(t.z1 / 200); j++) {
        const k = `${i},${j}`;
        if (!bins2.has(k)) bins2.set(k, []);
        bins2.get(k).push(t);
      }
    }
    registro = { bins: bins2, cache: /* @__PURE__ */ new Map() };
    caches.set(faces, registro);
  }
  const { bins, cache } = registro;
  const chave = `${x.toFixed(2)},${z.toFixed(2)},${superior}`;
  if (cache.has(chave)) return cache.get(chave);
  let h = null;
  for (const t of bins.get(`${Math.floor(x / 200)},${Math.floor(z / 200)}`) || []) {
    if (x < t.x0 - 0.01 || x > t.x1 + 0.01 || z < t.z0 - 0.01 || z > t.z1 + 0.01) continue;
    const [ax, az, bx, bz, cx, cz, y] = t.f, den = t.den;
    const a = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / den, b = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / den;
    if (a >= -1e-6 && b >= -1e-6 && a + b <= 1.000001) h = h === null ? y : superior ? Math.max(h, y) : Math.min(h, y);
  }
  if (cache.size > 3e4) cache.clear();
  cache.set(chave, h);
  return h;
}
function alturaLocal(u, x, z, superior) {
  if (x < 0 || z < 0 || x > u.C || z > u.L) return null;
  if (u.tipo === "CAIXA" || u.tipo === "PALLET") return superior ? u.A : 0;
  if (u.facesApoio) return alturaFaces(u.facesApoio, x, z, superior);
  if (u.membros?.length) {
    let h = null;
    for (const p of u.membros) {
      const v = alturaLocal(p, x - (p.dx || 0), z - (p.dz || 0), superior);
      if (v === null) continue;
      const y = v + (p.dy || 0);
      h = h === null ? y : superior ? Math.max(h, y) : Math.min(h, y);
    }
    return h;
  }
  return null;
}
function alturaContato(u, x, z, superior) {
  if (temGiroSemBaseConfirmada(u) || u.rotacaoManual && (u.rotacaoManual.x !== 0 || u.rotacaoManual.z !== 0 || u.rotacaoManual.y % 180 !== 0)) return null;
  let a = x - u.x, b = z - u.z;
  if (u.rotacaoManual?.y % 360 === 180) {
    a = (u.fx || u.C) - a;
    b = (u.fz || u.L) - b;
  }
  if (u.girada) [a, b] = [b, u.L - a];
  const h = alturaLocal(u, a, b, superior);
  return h === null ? null : u.y + h;
}
var candidatosCache = /* @__PURE__ */ new WeakMap();
function contatosSuperiores(u, rx, lado) {
  const fx = u.fx || u.C, fz = u.fz || u.L;
  const out = [];
  for (const rz of lado === 0 ? [0.15, 0.1, 0.2, 0.05, 0.25, 0.3, 0.35, 0.4, 0.45] : [0.85, 0.9, 0.8, 0.95, 0.75, 0.7, 0.65, 0.6, 0.55]) {
    const x = rx * fx, z = rz * fz;
    const alturas = [[0, 0], [-20, -20], [20, -20], [-20, 20], [20, 20]].map(([a, b]) => alturaContato({ ...u, x: 0, y: 0, z: 0 }, x + a, z + b, false));
    if (alturas.every((v) => v !== null) && Math.max(...alturas) - Math.min(...alturas) <= 1) out.push({ x, z, h: Math.min(...alturas) });
  }
  return out;
}
function planejarCalcos(u, baixo) {
  if (temGiroSemBaseConfirmada(u) || u.rotacaoManual && (u.rotacaoManual.x !== 0 || u.rotacaoManual.z !== 0 || u.rotacaoManual.y % 180 !== 0)) return null;
  const fx = u.fx || u.C, fz = u.fz || u.L, n = 2, out = [];
  const chaveBase = u.facesApoio || u.membros || u;
  let cache = candidatosCache.get(chaveBase);
  if (!cache) {
    cache = /* @__PURE__ */ new Map();
    candidatosCache.set(chaveBase, cache);
  }
  const chave = `${fx},${fz},${u.girada}`;
  let linhas = cache.get(chave);
  if (!linhas) {
    linhas = [];
    for (let linha = 0; linha < n; linha++) {
      const alvo = 0.15 + 0.7 * linha / (n - 1), opcoes = [];
      for (const dx of [0, -0.04, 0.04, -0.08, 0.08, -0.12, 0.12, -0.14, 0.14]) {
        const rx = alvo + dx;
        if (rx * fx < 20 || (1 - rx) * fx < 20) continue;
        const esq = contatosSuperiores(u, rx, 0), dir = contatosSuperiores(u, rx, 1);
        if (esq.length && dir.length) opcoes.push({ rx, esq: esq[0], dir: dir[0] });
      }
      linhas.push(opcoes);
    }
    cache.set(chave, linhas);
  }
  if (linhas.some((opcoes) => !opcoes.length)) return null;
  for (const opcoes of linhas) {
    let escolhido = null;
    for (const opcao of opcoes) {
      const x = u.x + opcao.rx * fx, calcos = [], topoTravessa = u.y + Math.min(opcao.esq.h, opcao.dir.h), baseTravessa = topoTravessa - 100;
      let valido = true;
      if (Math.abs(opcao.esq.h - opcao.dir.h) > 100) continue;
      for (const lado of [0, 1]) {
        let contato = null;
        for (const rz of lado === 0 ? [0.1, 0.05, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45] : [0.9, 0.95, 0.85, 0.8, 0.75, 0.7, 0.65, 0.6, 0.55]) {
          const z = u.z + rz * fz, pontos = [[0, 0], [-20, -20], [20, -20], [-20, 20], [20, 20]];
          for (const b of baixo) {
            if (b.nadaEmCima || b.emPe || b.baseEmV) continue;
            const alturas = pontos.map(([a, c]) => alturaContato(b, x + a, z + c, true));
            if (alturas.some((v) => v === null) || Math.max(...alturas) - Math.min(...alturas) > 1) continue;
            const y = Math.max(...alturas), A = baseTravessa - y;
            if (A < -0.5 || A > 100) continue;
            if (baixo.some((o) => o !== b && pontos.some(([a, c]) => {
              const h = alturaContato(o, x + a, z + c, true);
              return h !== null && h > y + 1;
            }))) continue;
            contato = { x: x - 20, z: z - 20, y, C: 40, L: 40, A: Math.max(0, A), apoioId: b.id, tipo: "calcoInferior" };
            break;
          }
          if (contato) break;
        }
        if (!contato) {
          valido = false;
          break;
        }
        calcos.push(contato);
      }
      if (!valido) continue;
      for (const p of [opcao.esq, opcao.dir]) if (u.y + p.h - topoTravessa > 1) calcos.push({ x: u.x + p.x - 20, z: u.z + p.z - 20, y: topoTravessa, C: 40, L: 40, A: u.y + p.h - topoTravessa, tipo: "calcoSuperior" });
      escolhido = [{ x: x - 50, z: u.z, y: baseTravessa, C: 100, L: fz, A: 100, tipo: "travessa", contatos: calcos.filter((c) => c.tipo === "calcoInferior") }, ...calcos.filter((c) => c.A > 1)];
      break;
    }
    if (!escolhido) return null;
    out.push(...escolhido);
  }
  return out;
}

// tmp/encaixe-piso-op102.js
var CEL = 50;
function retangulos(u) {
  if (u.tipo === "PECA" && u.ocupacao?.celulas?.length) return u.ocupacao.celulas;
  return [{ x: 0, z: 0, C: u.C, L: u.L }];
}
function mascara(u, girada, virada) {
  const ocupados = /* @__PURE__ */ new Set();
  for (const r of retangulos(u)) {
    let x = girada ? u.L - r.z - r.L : r.x, z = girada ? r.x : r.z;
    const C = girada ? r.L : r.C, L = girada ? r.C : r.L;
    if (virada) {
      x = (girada ? u.L : u.C) - x - C;
      z = (girada ? u.C : u.L) - z - L;
    }
    for (let a = Math.floor(x / CEL); a < Math.ceil((x + C) / CEL); a++) for (let b = Math.floor(z / CEL); b < Math.ceil((z + L) / CEL); b++) ocupados.add(a + "," + b);
  }
  return [...ocupados].map((k) => k.split(",").map(Number));
}
function encaixarNoPiso(ordem, veic2, preferirOriginal = true) {
  const nx = Math.floor(veic2.C / CEL), nz = Math.floor(veic2.L / CEL), cargas = [];
  let livres = [];
  for (const u of ordem) {
    const opcoes = [false, true].filter((g2) => !g2 || u.C + 60 <= veic2.L).flatMap((g2) => [false, true].map((v) => ({ g: g2, v, fx: g2 ? u.L : u.C, fz: g2 ? u.C : u.L, mask: mascara(u, g2, v) })));
    let posto = false;
    for (let ci = 0; ci <= cargas.length; ci++) {
      if (ci === cargas.length) {
        cargas.push({ itens: [], peso: 0, altura: 0, veic: veic2, veicKey: veic2.chave, zonaGC: 0, pilhas: [] });
        livres.push(new Uint8Array(nx * nz));
      }
      const c = cargas[ci], map = livres[ci];
      if (c.peso + u.kg > veic2.pesoMax) continue;
      if (u.tipo === "CAIXA" && !u.soChao) {
        let empilhada = false;
        for (const b of c.itens.filter((b2) => b2.tipo === "CAIXA" && b2.y === 0 && !c.itens.some((a) => a.sobre?.includes(b2.id)))) {
          const cand = { ...u, x: b.x, z: b.z, y: b.A + 100, fx: u.C, fz: u.L, girada: false };
          if (cand.y + u.A <= veic2.alturaUtil && baseCompativelParaCaixa(cand, [b], c.itens, 100)) {
            Object.assign(u, { x: b.x, z: b.z, y: cand.y, fx: u.C, fz: u.L, girada: false, rotacaoManual: { x: 0, y: 0, z: 0 }, nivelPilha: 1, sobre: [b.id], pilha: false });
            delete u.semLugar;
            c.itens.push(u);
            c.peso += u.kg;
            c.altura = Math.max(c.altura, u.y + u.A);
            empilhada = true;
            break;
          }
        }
        if (empilhada) {
          posto = true;
          break;
        }
      }
      let melhor = null;
      for (const op of opcoes) {
        if (u.A > veic2.alturaUtil) continue;
        for (let x = 1; x * CEL + op.fx + 30 <= veic2.C; x++) for (let z = 1; z * CEL + op.fz + 30 <= veic2.L; z++) {
          const score = x * CEL + op.fx + z * 0.01 + (preferirOriginal && op.g ? veic2.C : 0);
          if (melhor && score >= melhor.score) continue;
          if (op.mask.some(([a, b]) => map[(a + x) * nz + b + z])) continue;
          melhor = { x, z, score, ...op };
        }
      }
      if (!melhor && u.tipo === "PECA" && u.facesApoio && !u.soChao && !u.emPe) {
        for (const b of c.itens) {
          if (b.nadaEmCima || b.emPe || b.tipo === "CAIXA" || b.classe === 3) continue;
          for (const g2 of [false, true]) for (const rx of [0, 0.5, 1]) for (const rz of [0, 0.5, 1]) {
            if (posto) continue;
            const fx = g2 ? u.L : u.C, fz = g2 ? u.C : u.L;
            if (fx > b.fx || fz > b.fz) continue;
            const x = Math.ceil((b.x + (b.fx - fx) * rx) / CEL) * CEL, z = Math.ceil((b.z + (b.fz - fz) * rz) / CEL) * CEL;
            if (x + fx + 30 > veic2.C || z + fz + 30 > veic2.L) continue;
            const baixo = c.itens.filter((d) => d.x < x + fx && d.x + d.fx > x && d.z < z + fz && d.z + d.fz > z);
            const y = alturaDeEncaixe(u, x, z, g2, c.itens, nx, nz);
            if (y <= 0) continue;
            if (y + u.A > veic2.alturaUtil) continue;
            const cand = { ...u, x, y, z, fx, fz, girada: g2, rotacaoManual: { x: 0, y: 0, z: 0 } };
            const calcos = planejarCalcos(cand, baixo);
            if (!calcos) continue;
            Object.assign(u, cand, { calcos, sobre: baixo.map((d) => d.id), nivelPilha: 1, pilha: false });
            delete u.semLugar;
            c.itens.push(u);
            c.peso += u.kg;
            c.altura = Math.max(c.altura, y + u.A);
            posto = true;
            break;
          }
          if (posto) break;
        }
        if (posto) break;
      }
      if (melhor) {
        const { x, z, g: g2, v, fx, fz, mask } = melhor;
        Object.assign(u, { x: x * CEL, z: z * CEL, y: 0, fx, fz, girada: g2, rotacaoManual: { x: 0, y: v ? 180 : 0, z: 0 }, nivelPilha: 0, sobre: [], pilha: false });
        delete u.semLugar;
        for (const [a, b] of mask) for (let da = -1; da <= 1; da++) for (let db = -1; db <= 1; db++) {
          const xx = a + x + da, zz = b + z + db;
          if (xx >= 0 && xx < nx && zz >= 0 && zz < nz) map[xx * nz + zz] = 1;
        }
        c.itens.push(u);
        c.peso += u.kg;
        c.altura = Math.max(c.altura, u.A);
        posto = true;
        break;
      }
      if (!c.itens.length) {
        cargas.pop();
        livres.pop();
        break;
      }
    }
    if (!posto) u.semLugar = true;
  }
  return cargas;
}
var cacheAlturas = /* @__PURE__ */ new WeakMap();
function alturasLocais(u, girada = false, virada = false) {
  let cache = cacheAlturas.get(u);
  if (!cache) {
    cache = /* @__PURE__ */ new Map();
    cacheAlturas.set(u, cache);
  }
  const chave = `${girada},${virada}`;
  if (cache.has(chave)) return cache.get(chave);
  const mapa = /* @__PURE__ */ new Map(), rs = u.tipo === "PECA" && u.ocupacao?.celulas?.length ? u.ocupacao.celulas : [{ x: 0, z: 0, C: u.C, L: u.L, min: 0, max: u.A }];
  for (const r of rs) {
    let x = girada ? u.L - r.z - r.L : r.x, z = girada ? r.x : r.z;
    const C = girada ? r.L : r.C, L = girada ? r.C : r.L;
    if (virada) {
      x = (girada ? u.L : u.C) - x - C;
      z = (girada ? u.C : u.L) - z - L;
    }
    for (let a = Math.floor(x / CEL); a < Math.ceil((x + C) / CEL); a++) for (let b = Math.floor(z / CEL); b < Math.ceil((z + L) / CEL); b++) {
      const k = a + "," + b, ant = mapa.get(k);
      if (ant) {
        ant.min = Math.min(ant.min, r.min);
        ant.max = Math.max(ant.max, r.max);
      } else mapa.set(k, { a, b, min: r.min, max: r.max });
    }
  }
  const out = [...mapa.values()];
  cache.set(chave, out);
  return out;
}
function alturaDeEncaixe(u, x, z, girada, itens, nx, nz) {
  const alt = new Float64Array(nx * nz);
  alt.fill(-Infinity);
  for (const b of itens) for (const r of alturasLocais(b, b.girada, b.rotacaoManual?.y === 180)) {
    const a = Math.floor(b.x / CEL) + r.a, c = Math.floor(b.z / CEL) + r.b;
    if (a >= 0 && a < nx && c >= 0 && c < nz) alt[a * nz + c] = Math.max(alt[a * nz + c], b.y + r.max);
  }
  let y = 0;
  for (const r of alturasLocais(u, girada)) {
    const a = Math.floor(x / CEL) + r.a, b = Math.floor(z / CEL) + r.b;
    if (a >= 0 && a < nx && b >= 0 && b < nz && Number.isFinite(alt[a * nz + b])) y = Math.max(y, alt[a * nz + b] + 100 - r.min);
  }
  return Math.ceil(y);
}

// tmp/consolidar-romaneio2.js
var sim = JSON.parse(import_node_fs.default.readFileSync("/tmp/carga102/config.json")).sims[1];
var g = JSON.parse(import_node_fs.default.readFileSync("/tmp/carga102/geometria.json"));
var orig = sim.cargas.flatMap((c) => c.itens);
var veic = sim.cargas[0].veiculo;
var seed = 5;
var best = 99;
var rand = () => {
  seed = seed * 1664525 + 1013904223 >>> 0;
  return seed / 4294967296;
};
for (let k = 0; k < 600; k++) {
  const us = orig.map((u) => ({ ...u, ocupacao: g[u.rotulo]?.ocupacao, facesApoio: void 0 }));
  const maior = us.find((u) => u.rotulo === "T102B45");
  const outros = us.filter((u) => u !== maior).map((u) => ({ u, key: u.C * u.L * (0.05 + rand() * 2) })).sort((a, b) => b.key - a.key).map((x) => x.u);
  const cs = encaixarNoPiso([maior, ...outros], veic, k % 2 === 0);
  const score = cs.length + (cs.at(-1)?.itens.length || 0) / 100;
  if (score < best) {
    best = score;
    console.log(k, cs.length, cs.map((c) => c.itens.length));
    import_node_fs.default.writeFileSync("/tmp/carga102/romaneio2-consolidacao.json", JSON.stringify(cs));
  }
  if (cs.length === 1) break;
}
