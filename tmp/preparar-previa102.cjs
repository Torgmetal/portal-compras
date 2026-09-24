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

// tmp/preparar-previa102.js
var import_node_fs = __toESM(require("node:fs"));
var import_strict = __toESM(require("node:assert/strict"));

// lib/carga/apoios.js
var temGiroSemBaseConfirmada = (u) => !!(u.rotacaoManual && (u.rotacaoManual.x % 180 || u.rotacaoManual.z % 180 || u.rotacaoManual.y % 90));

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
            if (A < -0.5 || A > 150) continue;
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

// tmp/preparar-previa102.js
var geo = JSON.parse(import_node_fs.default.readFileSync("/tmp/carga102/geometria.json"));
var romaneios = [];
for (const n of [1, 2]) {
  const cs = JSON.parse(import_node_fs.default.readFileSync(`/tmp/carga102/previa-unica-${n}.json`));
  import_strict.default.equal(cs.length, 1);
  const c = cs[0], e = JSON.parse(import_node_fs.default.readFileSync(`/tmp/carga102/entrada-${n}.json`));
  const itens = c.itens.sort((a, b) => a.y - b.y || a.x - b.x);
  let pecas = 0;
  const esperado = new Map(e.lista.map((i) => [i.marca.toUpperCase(), i.qtd]));
  const encontrado = /* @__PURE__ */ new Map();
  for (const [i, u] of itens.entries()) {
    u.volume = i + 1;
    pecas += (u.membros || [u]).length;
    u.topoVazado = geo[u.marca]?.apoioSuperior?.plana === false;
    u.facesApoio = geo[u.marca]?.apoioSuperior?.faces;
    for (const m of u.membros || [u]) {
      encontrado.set(m.marca, (encontrado.get(m.marca) || 0) + 1);
      if (m !== u) m.facesApoio = geo[m.marca]?.apoioSuperior?.faces;
    }
    u.apoiosEstudo = u.y > 0 ? planejarCalcos(u, itens.filter((b) => b.y < u.y && u.sobre?.includes(b.id))) : [];
    u.situacaoApoio = u.y === 0 ? "Conferir cal\xE7amento no piso" : u.apoiosEstudo ? "Contatos encontrados; validar apoios" : "Apoios ainda n\xE3o definidos";
  }
  import_strict.default.deepEqual(encontrado, esperado);
  for (const u of itens) {
    import_strict.default.ok(u.x >= 0 && u.z >= 0 && u.x + u.fx <= c.veic.C && u.z + u.fz <= c.veic.L);
    import_strict.default.ok(u.y + u.A <= c.veic.alturaUtil);
  }
  for (let a = 0; a < itens.length; a++) for (let b = a + 1; b < itens.length; b++) {
    const u = itens[a], v = itens[b];
    import_strict.default.ok(!(u.x < v.x + v.fx && v.x < u.x + u.fx && u.z < v.z + v.fz && v.z < u.z + u.fz && u.y < v.y + v.A && v.y < u.y + u.A), "colis\xE3o de caixas " + u.id + " " + v.id);
  }
  for (const u of itens) {
    delete u.facesApoio;
    for (const m of u.membros || []) delete m.facesApoio;
  }
  romaneios.push({ numero: n, pecas, marcas: esperado.size, volumes: itens.length, peso: c.peso, anterior: n === 1 ? 3 : 2, hipotese: n === 2 ? "Hip\xF3tese de plataforma de 18,00 \xD7 2,90 m; disponibilidade e transporte especial n\xE3o confirmados. Ainda n\xE3o \xE9 a solu\xE7\xE3o compacta pretendida." : "Carreta de 12,40 \xD7 2,45 m. Empilhamento proposto, com apoios ainda em revis\xE3o.", carga: { itens, veiculo: c.veic, altura: c.altura, passos: itens.map((u) => u.id) } });
  console.log("romaneio", n, "pecas", pecas, "volumes", itens.length, "apoios pendentes", itens.filter((u) => u.y > 0 && !u.apoiosEstudo).length);
}
import_node_fs.default.writeFileSync("/tmp/carga102/previa-visual.json", JSON.stringify({ romaneios, geradoEm: (/* @__PURE__ */ new Date()).toISOString() }));
