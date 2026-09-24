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

// tmp/ajustar-viga-previa102.js
var import_node_fs = __toESM(require("node:fs"));

// lib/carga/apoios.js
var temGiroSemBaseConfirmada = (u) => !!(u.rotacaoManual && (u.rotacaoManual.x % 180 || u.rotacaoManual.z % 180 || u.rotacaoManual.y % 90));

// tmp/calcos-contato-op102.js
var caches = /* @__PURE__ */ new WeakMap();
function alturaFaces(faces2, x, z, superior) {
  let registro = caches.get(faces2);
  if (!registro) {
    const bins2 = /* @__PURE__ */ new Map();
    for (const f of faces2) {
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
    caches.set(faces2, registro);
  }
  const { bins, cache } = registro;
  const chave = `${x.toFixed(2)},${z.toFixed(2)},${superior}`;
  if (cache.has(chave)) return cache.get(chave);
  let h = null;
  for (const t of bins.get(`${Math.floor(x / 200)},${Math.floor(z / 200)}`) || []) {
    if (x < t.x0 - 0.01 || x > t.x1 + 0.01 || z < t.z0 - 0.01 || z > t.z1 + 0.01) continue;
    const [ax, az, bx, bz, cx, cz, y] = t.f, den = t.den;
    const a = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / den, b2 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / den;
    if (a >= -1e-6 && b2 >= -1e-6 && a + b2 <= 1.000001) h = h === null ? y : superior ? Math.max(h, y) : Math.min(h, y);
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
  let a = x - u.x, b2 = z - u.z;
  if (u.rotacaoManual?.y % 360 === 180) {
    a = (u.fx || u.C) - a;
    b2 = (u.fz || u.L) - b2;
  }
  if (u.girada) [a, b2] = [b2, u.L - a];
  const h = alturaLocal(u, a, b2, superior);
  return h === null ? null : u.y + h;
}
var candidatosCache = /* @__PURE__ */ new WeakMap();
function contatosSuperiores(u, rx, lado) {
  const fx = u.fx || u.C, fz = u.fz || u.L;
  const out2 = [];
  for (const rz of lado === 0 ? [0.15, 0.1, 0.2, 0.05, 0.25, 0.3, 0.35, 0.4, 0.45] : [0.85, 0.9, 0.8, 0.95, 0.75, 0.7, 0.65, 0.6, 0.55]) {
    const x = rx * fx, z = rz * fz;
    const alturas = [[0, 0], [-20, -20], [20, -20], [-20, 20], [20, 20]].map(([a, b2]) => alturaContato({ ...u, x: 0, y: 0, z: 0 }, x + a, z + b2, false));
    if (alturas.every((v) => v !== null) && Math.max(...alturas) - Math.min(...alturas) <= 1) out2.push({ x, z, h: Math.min(...alturas) });
  }
  return out2;
}
function planejarCalcos(u, baixo) {
  if (temGiroSemBaseConfirmada(u) || u.rotacaoManual && (u.rotacaoManual.x !== 0 || u.rotacaoManual.z !== 0 || u.rotacaoManual.y % 180 !== 0)) return null;
  const fx = u.fx || u.C, fz = u.fz || u.L, n = 2, out2 = [];
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
          for (const b2 of baixo) {
            if (b2.nadaEmCima || b2.emPe || b2.baseEmV) continue;
            const alturas = pontos.map(([a, c]) => alturaContato(b2, x + a, z + c, true));
            if (alturas.some((v) => v === null) || Math.max(...alturas) - Math.min(...alturas) > 1) continue;
            const y = Math.max(...alturas), A = baseTravessa - y;
            if (A < -0.5 || A > 150) continue;
            if (baixo.some((o) => o !== b2 && pontos.some(([a, c]) => {
              const h = alturaContato(o, x + a, z + c, true);
              return h !== null && h > y + 1;
            }))) continue;
            contato = { x: x - 20, z: z - 20, y, C: 40, L: 40, A: Math.max(0, A), apoioId: b2.id, tipo: "calcoInferior" };
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
    out2.push(...escolhido);
  }
  return out2;
}

// tmp/ajustar-viga-previa102.js
var d = JSON.parse(import_node_fs.default.readFileSync("/tmp/carga102/previa-visual.json"));
var g = JSON.parse(import_node_fs.default.readFileSync("/tmp/carga102/geometria.json"));
var r = d.romaneios[1];
var us = r.carga.itens;
var b = us.find((u) => u.marca === "T102B45");
function faces(u) {
  u.facesApoio = g[u.marca]?.apoioSuperior?.faces;
  for (const m of u.membros || []) m.facesApoio = g[m.marca]?.apoioSuperior?.faces;
  return u;
}
faces(b);
var out = [];
for (const id of ["p19", "k0", "p50", "p35", "p14", "p9"]) {
  const orig = faces(structuredClone(us.find((u) => u.id === id)));
  let found = null, attempts = 0;
  for (const y of [400, 300, 250, 350, 450, 500]) {
    if (found) break;
    for (let x = b.x + 50; x + orig.C <= b.x + b.C; x += 250) {
      if (found) break;
      for (let z = b.z; z + orig.L <= b.z + b.L; z += 50) {
        const u = { ...orig, x, y, z, fx: orig.C, fz: orig.L, girada: false, rotacaoManual: { x: 0, y: 0, z: 0 } };
        attempts++;
        const calcos = planejarCalcos(u, [b]);
        if (calcos) {
          found = { ...u, apoiosEstudo: calcos, sobre: [b.id] };
          break;
        }
      }
    }
  }
  console.log(id, attempts, found ? { x: found.x, y: found.y, z: found.z, wood: found.apoiosEstudo.length } : null);
  if (found) out.push(found);
}
import_node_fs.default.writeFileSync("/tmp/carga102/candidatos-sobre-viga.json", JSON.stringify(out));
