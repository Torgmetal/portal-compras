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

// tmp/extrair102.js
var import_node_fs = __toESM(require("node:fs"));

// lib/carga/ocupacao-real.js
var PASSO = 50;
function recortar(pol, eixo, limite, maior) {
  const out = [];
  for (let i = 0; i < pol.length; i++) {
    const a = pol[i], b = pol[(i + 1) % pol.length], ia = maior ? a[eixo] >= limite : a[eixo] <= limite, ib = maior ? b[eixo] >= limite : b[eixo] <= limite;
    if (ia) out.push(a);
    if (ia !== ib) {
      const t = (limite - a[eixo]) / (b[eixo] - a[eixo]);
      out.push(a.map((v, j) => v + (b[j] - v) * t));
    }
  }
  return out;
}
function ocupacaoDaMalha({ pos, idx }, o) {
  const { perm: p, giro: g } = o;
  if (!p || !idx?.length) return null;
  const pts = [], r = (g?.ang || 0) * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
  for (let i = 0; i < pos.length; i += 3) {
    const [x, y, z] = [pos[i], pos[i + 1], pos[i + 2]];
    const q = !g ? [x, y, z] : g.eixo === 2 ? [x * c - y * s, x * s + y * c, z] : g.eixo === 0 ? [x, y * c - z * s, y * s + z * c] : [x * c + z * s, y, -x * s + z * c];
    if (g) for (let j = 0; j < 3; j++) q[j] -= g.min[j];
    pts.push([q[p.X], q[p.Y], q[p.Z]]);
  }
  const mapa = /* @__PURE__ */ new Map();
  for (let i = 0; i < idx.length; i += 3) {
    const tri = [pts[idx[i]], pts[idx[i + 1]], pts[idx[i + 2]]];
    const x0 = Math.max(0, Math.floor(Math.min(...tri.map((v) => v[0])) / PASSO)), x1 = Math.min(Math.ceil(o.C / PASSO) - 1, Math.floor(Math.max(...tri.map((v) => v[0])) / PASSO));
    const z0 = Math.max(0, Math.floor(Math.min(...tri.map((v) => v[2])) / PASSO)), z1 = Math.min(Math.ceil(o.L / PASSO) - 1, Math.floor(Math.max(...tri.map((v) => v[2])) / PASSO));
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
      let pol = tri;
      for (const [e, l, m] of [[0, x * PASSO, true], [0, (x + 1) * PASSO, false], [2, z * PASSO, true], [2, (z + 1) * PASSO, false]]) {
        pol = recortar(pol, e, l, m);
        if (!pol.length) break;
      }
      if (!pol.length) continue;
      const min = Math.min(...pol.map((p2) => p2[1])), max = Math.max(...pol.map((p2) => p2[1])), k = x + "," + z, ant = mapa.get(k);
      if (ant) {
        ant.min = Math.min(ant.min, min);
        ant.max = Math.max(ant.max, max);
      } else mapa.set(k, { x: x * PASSO, z: z * PASSO, C: Math.min(PASSO, o.C - x * PASSO), L: Math.min(PASSO, o.L - z * PASSO), min, max });
    }
  }
  return { passo: PASSO, celulas: [...mapa.values()] };
}

// lib/carga/apoio-malha.js
function superficieSuperior(malha, orientacao) {
  const { pos, idx } = malha, { perm: P, giro, C, L, A } = orientacao;
  if (!P || !(C > 0 && L > 0 && A > 0) || !idx?.length) return { plana: false, fracao: 0 };
  const pontos = new Float64Array(pos.length), r = (giro?.ang || 0) * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
  for (let i = 0; i < pos.length; i += 3) {
    const [x, y, z] = [pos[i], pos[i + 1], pos[i + 2]];
    const q = !giro ? [x, y, z] : giro.eixo === 2 ? [x * c - y * s, x * s + y * c, z] : giro.eixo === 0 ? [x, y * c - z * s, y * s + z * c] : [x * c + z * s, y, -x * s + z * c];
    if (giro) for (let j = 0; j < 3; j++) q[j] -= giro.min[j];
    pontos[i] = q[P.X];
    pontos[i + 1] = q[P.Y];
    pontos[i + 2] = q[P.Z];
  }
  const faces = [];
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i] * 3, b = idx[i + 1] * 3, d = idx[i + 2] * 3;
    const ys = [pontos[a + 1], pontos[b + 1], pontos[d + 1]];
    if (Math.max(...ys) - Math.min(...ys) <= 0.5) faces.push([pontos[a], pontos[a + 2], pontos[b], pontos[b + 2], pontos[d], pontos[d + 2], ys[0]]);
  }
  const nx = 20, nz = 10, coberta = new Uint8Array(nx * nz), passoX = C / nx, passoZ = L / nz;
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i] * 3, b = idx[i + 1] * 3, d = idx[i + 2] * 3;
    if ([a, b, d].some((k) => Math.abs(pontos[k + 1] - A) > 2)) continue;
    const ax = pontos[a], az = pontos[a + 2], bx = pontos[b], bz = pontos[b + 2], dx = pontos[d], dz = pontos[d + 2];
    const den = (bz - dz) * (ax - dx) + (dx - bx) * (az - dz);
    if (Math.abs(den) < 1e-6) continue;
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx, dx) / passoX)), x1 = Math.min(nx - 1, Math.floor(Math.max(ax, bx, dx) / passoX));
    const z0 = Math.max(0, Math.floor(Math.min(az, bz, dz) / passoZ)), z1 = Math.min(nz - 1, Math.floor(Math.max(az, bz, dz) / passoZ));
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
      const px = (x + 0.5) * passoX, pz = (z + 0.5) * passoZ;
      const u = ((bz - dz) * (px - dx) + (dx - bx) * (pz - dz)) / den, v = ((dz - az) * (px - dx) + (ax - dx) * (pz - dz)) / den;
      if (u >= -1e-6 && v >= -1e-6 && u + v <= 1 + 1e-6) coberta[x * nz + z] = 1;
    }
  }
  const quadrantes = [0, 0, 0, 0];
  let total = 0;
  for (let x = 0; x < nx; x++) for (let z = 0; z < nz; z++) if (coberta[x * nz + z]) {
    total++;
    quadrantes[(x >= 10 ? 2 : 0) + (z >= 5 ? 1 : 0)]++;
  }
  return { plana: total >= 160 && quadrantes.every((n) => n >= 25), fracao: total / (nx * nz), faces };
}

// lib/carga/premissas.js
var CAIXA_MAD = { compMax: 2e3, kgMax: 60, Lint: 800, base: 100, parede: 40, tampaAlt: 40, alturaMax: 600, kgTotal: 1e3, tipo: "CAIXA", rotulo: "Caixa de madeira", minPorMarca: 6 };
var CAIXA_VALE_PALETE = { compMax: 2e3, kgMax: 60, Lint: 1e3, base: 140, parede: 40, tampaAlt: 40, alturaMax: 600, kgTotal: 1e3, tipo: "CAIXA", rotulo: "Caixa sobre palete", minPorMarca: 1 };
var REGRAS = { niveisMax: 99, pesadoSobreLeve: "alerta", delicadoSobreDelicado: true, engradadoEmpilha: true, apoioMin: 0.6 };
var PERFIS = {
  economico: { ...REGRAS, chave: "economico", nome: "Econ\xF4mico", feixesCurtos: true, compartilharMiudos: true, lqc: "ECONOMICA", resumo: "Pacotes amarrados com cintas e madeira, guarda-corpo deitado em pacote, vigas em feixe cintado, mi\xFAdos em caixa de madeira fechada, sem prote\xE7\xE3o extra de pintura.", gc: "melhor", planos: "pacote", miudos: CAIXA_MAD, protecao: "nenhuma", tempoExtra: 0 },
  recomendado: { ...REGRAS, chave: "recomendado", nome: "Padr\xE3o", feixesCurtos: true, compartilharMiudos: true, lqc: "PADRAO", resumo: "Guarda-corpo em p\xE9 em engradado quando reduz viagem, vigas em feixe cintado, cantoneira sob toda cinta em pe\xE7a pintada, mi\xFAdos em caixa de madeira fechada.", gc: "melhor2", planos: "pacote", miudos: CAIXA_MAD, protecao: "cantoneiras", tempoExtra: 1 },
  exigente: { ...REGRAS, chave: "exigente", nome: "Refor\xE7ada", lqc: "REFORCADA", resumo: "Tudo embalado: guarda-corpo em p\xE9 em engradado, chapas e contraventamentos em engradado deitado, vigas em feixe cintado, mi\xFAdos em caixa de madeira, cantoneira e manta.", gc: "engradado", planos: "engradado", miudos: CAIXA_MAD, protecao: "cantoneiras+manta", tempoExtra: 3 },
  vale: { ...REGRAS, chave: "vale", nome: "Especificada (TMSA/Vale)", lqc: "ESPECIFICADA", resumo: "Dentro da especifica\xE7\xE3o TMSA/Hydro: feixe at\xE9 2 t e 12 m, mi\xFAdo em caixa sobre palete, guarda-corpo em engradado deitado, grade em engradado, madeira fumigada, um volume numerado por embalagem.", gc: "engradadoDeitado", planos: "engradado", grades: "engradado", miudos: CAIXA_VALE_PALETE, minPorMarca: 6, pac: { kgMax: 2e3, compMax: 12e3 }, protecao: "cantoneiras+manta", tempoExtra: 2, madeiraTratada: 1.35 }
};

// lib/carga/classificar.js
var ehFamiliaChapa = (desc) => /CHAPA|GRADE|GUARDA|G\.?\s*C\b|PISO|PLATAFORMA|TALA|DEGRAU|ESCADA|PAINEL|FECHAMENTO|TELHA/i.test(desc || "");

// lib/carga/geometria.js
var rot = (p, eixo, r) => {
  const c = Math.cos(r), s = Math.sin(r);
  const [x, y, z] = p;
  return eixo === 2 ? [x * c - y * s, x * s + y * c, z] : eixo === 0 ? [x, y * c - z * s, y * s + z * c] : [x * c + z * s, y, -x * s + z * c];
};
function caixaOrientada(pos) {
  const n = pos.length / 3, passo = Math.max(1, Math.floor(n / 4e3)), pts = [];
  for (let i = 0; i < n; i += passo) pts.push([pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]]);
  let melhor = null;
  for (const eixo of [0, 1, 2]) for (let g = 0; g < 180; g += 2) {
    const r = g * Math.PI / 180;
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (const p of pts) {
      const q = rot(p, eixo, r);
      for (let a = 0; a < 3; a++) {
        if (q[a] < min[a]) min[a] = q[a];
        if (q[a] > max[a]) max[a] = q[a];
      }
    }
    const d = max.map((v, i) => v - min[i]), vol = d[0] * d[1] * d[2];
    if (!melhor || vol < melhor.vol * 0.995) melhor = { eixo, ang: g, vol, dimsEixos: d.map(Math.round), min: min.map(Math.round) };
  }
  if (!melhor) return null;
  const obb = { eixo: melhor.eixo, ang: melhor.ang, dimsEixos: melhor.dimsEixos, min: melhor.min };
  const iC = obb.dimsEixos.indexOf(Math.max(...obb.dimsEixos));
  if (iC !== 1) {
    const faixa = [Infinity, Infinity, Infinity];
    for (let i = 0; i < pos.length; i += 3) {
      const q = rot([pos[i], pos[i + 1], pos[i + 2]], obb.eixo, obb.ang * Math.PI / 180).map((v, a) => v - obb.min[a]);
      const t = q[iC] / obb.dimsEixos[iC], f = t < 0.2 ? 0 : t > 0.8 ? 2 : t > 0.4 && t < 0.6 ? 1 : -1;
      if (f >= 0) faixa[f] = Math.min(faixa[f], q[1]);
    }
    const limiar = Math.max(80, obb.dimsEixos[1] * 0.2);
    obb.baseEmV = faixa.every(Number.isFinite) && faixa[0] - faixa[1] > limiar && faixa[2] - faixa[1] > limiar;
  }
  return obb;
}
var UP = 1;
function orientarPeca(desc, dimsEixos, obb, orientacao = "") {
  let d = dimsEixos.slice(), perm = null;
  const deitarLongarina = !orientacao && /LONGARINA/i.test(desc) && obb?.baseEmV;
  const chapa = orientacao === "deitar" || deitarLongarina ? true : orientacao === "almaVertical" ? false : ehFamiliaChapa(desc);
  if (!chapa) {
    const iC = d.indexOf(Math.max(...d));
    let iA, iL;
    if (iC === UP) {
      const outros = [0, 1, 2].filter((i) => i !== UP);
      iA = d[outros[0]] >= d[outros[1]] ? outros[0] : outros[1];
      iL = outros.find((i) => i !== iA);
    } else {
      iA = UP;
      iL = [0, 1, 2].find((i) => i !== iC && i !== UP);
    }
    if (d[iA] > 1.5 * d[iL] && (d[iA] > 800 || !orientacao && !/VIGA|COLUNA|PERFIL|LONGARINA/i.test(desc))) {
      const t = iA;
      iA = iL;
      iL = t;
    }
    perm = { X: iC, Z: iL, Y: iA };
    d = [d[iC], d[iL], d[iA]];
  } else {
    const ord = [0, 1, 2].sort((a, b) => d[b] - d[a]);
    perm = { X: ord[0], Z: ord[1], Y: ord[2] };
    d = [d[ord[0]], d[ord[1]], d[ord[2]]];
  }
  return { C: Math.round(d[0]), L: Math.round(d[1]), A: Math.round(d[2]), perm, giro: obb ? { eixo: obb.eixo, ang: obb.ang, min: obb.min } : null, almaVertical: !chapa, baseEmV: /LONGARINA/i.test(desc) && !!obb?.baseEmV };
}

// lib/carga/geometria-ifc.js
var limpaTag = (v) => String(v?.value ?? v ?? "").replace(/\(\?\)/g, "").trim().toUpperCase();
var limpaNome = (s) => String(s || "").toUpperCase().replace(/\s+/g, " ").trim();
function casarMarcas(conjuntos, pedidos) {
  const porTag = /* @__PURE__ */ new Map(), porNome = /* @__PURE__ */ new Map();
  for (const c of conjuntos) {
    if (c.tag && !porTag.has(c.tag)) porTag.set(c.tag, c);
    const n = limpaNome(c.nome);
    if (!n) continue;
    if (!porNome.has(n)) porNome.set(n, []);
    porNome.get(n).push(c);
  }
  const instancia = /* @__PURE__ */ new Map(), casadasPeloNome = [];
  for (const p of pedidos) {
    const marca = limpaTag(typeof p === "string" ? p : p.marca), desc = limpaNome(typeof p === "string" ? "" : p.desc);
    if (!marca || instancia.has(marca)) continue;
    const c = porTag.get(marca);
    if (c && (!desc || limpaNome(c.nome) === desc)) {
      instancia.set(marca, c.id);
      continue;
    }
    const candidatos = desc ? porNome.get(desc) || [] : [];
    const especifico = /\d/.test(desc) || new Set(candidatos.map((x) => x.tag)).size === 1;
    if (candidatos.length && especifico) {
      instancia.set(marca, candidatos[0].id);
      casadasPeloNome.push(marca);
      continue;
    }
    if (c) instancia.set(marca, c.id);
  }
  return { instancia, porNome: casadasPeloNome };
}
async function geometriaDoIfc(bytes, marcas, progresso = () => {
}) {
  const W = await import("/Users/vitorcosta/dev/portal-compras/node_modules/web-ifc/web-ifc-api-node.js");
  const api = new W.IfcAPI();
  api.SetWasmPath("/Users/vitorcosta/dev/portal-compras/node_modules/web-ifc/", true);
  await api.Init();
  const pedidos = marcas.map((m) => typeof m === "string" ? { marca: m } : m);
  const quero = new Set(pedidos.map((m) => String(m.marca).toUpperCase()));
  let model = -1;
  try {
    progresso("Abrindo o modelo\u2026", 0.05);
    model = api.OpenModel(bytes, { COORDINATE_TO_ORIGIN: false });
    const asmTag = /* @__PURE__ */ new Map(), asmDe = /* @__PURE__ */ new Map(), conjuntos = [];
    const asms = api.GetLineIDsWithType(model, W.IFCELEMENTASSEMBLY);
    for (let i = 0; i < asms.size(); i++) {
      const id = asms.get(i), l = api.GetLine(model, id);
      const tag = limpaTag(l.Tag) || limpaTag(l.Name);
      asmTag.set(id, tag);
      conjuntos.push({ id, tag, nome: limpaTag(l.Name) });
    }
    const rels = api.GetLineIDsWithType(model, W.IFCRELAGGREGATES);
    for (let i = 0; i < rels.size(); i++) {
      const r = api.GetLine(model, rels.get(i));
      const pai = r.RelatingObject?.value;
      if (!asmTag.has(pai)) continue;
      for (const o of r.RelatedObjects || []) asmDe.set(o.value, pai);
    }
    const casadas = casarMarcas(conjuntos, pedidos), porNome = new Set(casadas.porNome);
    const instanciaDaMarca = /* @__PURE__ */ new Map();
    for (const [marca, id] of casadas.instancia) instanciaDaMarca.set(marca, `A${id}`);
    const todos = [];
    api.StreamAllMeshes(model, (m) => todos.push(m.expressID));
    const geo = /* @__PURE__ */ new Map();
    const querInst = new Set(instanciaDaMarca.values());
    let feito = 0;
    for (let s = 0; s < todos.length; s += 50) {
      api.StreamMeshes(model, todos.slice(s, s + 50), (mesh) => {
        const line = api.GetLine(model, mesh.expressID);
        if (line.type === W.IFCMECHANICALFASTENER) return;
        const id = mesh.expressID, asm = asmDe.get(id);
        let chave = null;
        if (asm != null) chave = `A${asm}`;
        else {
          const tag = limpaTag(line.Tag);
          if (quero.has(tag)) {
            if (!instanciaDaMarca.has(tag)) {
              instanciaDaMarca.set(tag, `E${id}`);
              querInst.add(`E${id}`);
            }
            if (instanciaDaMarca.get(tag) === `E${id}`) chave = `E${id}`;
          }
        }
        if (!chave || !querInst.has(chave)) return;
        const g = geo.get(chave) || { pos: [], idx: [] };
        for (let j = 0; j < mesh.geometries.size(); j++) {
          const pl = mesh.geometries.get(j), ge = api.GetGeometry(model, pl.geometryExpressID);
          try {
            const v = api.GetVertexArray(ge.GetVertexData(), ge.GetVertexDataSize()), ix = api.GetIndexArray(ge.GetIndexData(), ge.GetIndexDataSize());
            const m = pl.flatTransformation, base = g.pos.length / 3;
            for (let k = 0; k < v.length; k += 6) {
              const x = v[k], y = v[k + 1], z = v[k + 2];
              g.pos.push(m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]);
            }
            for (let k = 0; k < ix.length; k++) g.idx.push(base + ix[k]);
          } finally {
            ge.delete();
          }
        }
        geo.set(chave, g);
      });
      feito += 50;
      if (feito % 500 === 0) {
        progresso(`Lendo a geometria\u2026 ${Math.min(100, Math.round(100 * feito / todos.length))} %`, 0.1 + 0.6 * Math.min(1, feito / todos.length));
        await new Promise((r) => setTimeout(r, 0));
      }
    }
    let ext = 0;
    for (const g of geo.values()) {
      const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
      for (let k = 0; k < g.pos.length; k += 3) for (let a = 0; a < 3; a++) {
        min[a] = Math.min(min[a], g.pos[k + a]);
        max[a] = Math.max(max[a], g.pos[k + a]);
      }
      ext = Math.max(ext, ...max.map((v, i) => v - min[i]));
    }
    const escala = ext < 500 ? 1e3 : 1;
    const geometria = {}, malhas = {};
    let n = 0;
    for (const [tag, chave] of instanciaDaMarca) {
      const g = geo.get(chave);
      if (!g || !g.pos.length) continue;
      const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
      for (let k = 0; k < g.pos.length; k += 3) for (let a = 0; a < 3; a++) {
        min[a] = Math.min(min[a], g.pos[k + a]);
        max[a] = Math.max(max[a], g.pos[k + a]);
      }
      const pos = new Float32Array(g.pos.length);
      for (let k = 0; k < g.pos.length; k += 3) for (let a = 0; a < 3; a++) pos[k + a] = Math.round((g.pos[k + a] - min[a]) * escala);
      const obb = caixaOrientada(pos);
      geometria[tag] = { obb, dimsEixos: max.map((v, i) => Math.round((v - min[i]) * escala)), temGeo: true, porNome: porNome.has(tag) || void 0 };
      malhas[tag] = { pos, idx: new Uint32Array(g.idx) };
      const desc = pedidos.find((p) => String(p.marca).toUpperCase() === tag)?.desc || "";
      geometria[tag].ocupacao = ocupacaoDaMalha(malhas[tag], orientarPeca(desc, obb?.dimsEixos || geometria[tag].dimsEixos, obb));
      geometria[tag].apoioSuperior = superficieSuperior(malhas[tag], orientarPeca(desc, obb?.dimsEixos || geometria[tag].dimsEixos, obb));
      if (++n % 20 === 0) {
        progresso(`Medindo as pe\xE7as\u2026 ${n} de ${instanciaDaMarca.size}`, 0.7 + 0.3 * n / instanciaDaMarca.size);
        await new Promise((r) => setTimeout(r, 0));
      }
    }
    const faltantes = [...quero].filter((m) => !geometria[m]);
    return { geometria, malhas, faltantes, porNome: [...porNome].filter((m) => geometria[m]) };
  } finally {
    if (model >= 0) api.CloseModel(model);
  }
}

// tmp/extrair102.js
(async () => {
  const ps = JSON.parse(import_node_fs.default.readFileSync("/tmp/carga102/previos.json"));
  const pedidos = ps.flatMap((p) => p.itens.map((i) => ({ marca: i.marca, desc: i.descricao })));
  const g = await geometriaDoIfc(new Uint8Array(import_node_fs.default.readFileSync("/tmp/carga102/modelo-0.ifc")), pedidos);
  import_node_fs.default.writeFileSync("/tmp/carga102/geometria.json", JSON.stringify(g.geometria));
  import_node_fs.default.writeFileSync("/tmp/carga102/malhas.json", JSON.stringify(Object.fromEntries(Object.entries(g.malhas).map(([k, v]) => [k, { pos: Array.from(v.pos), idx: Array.from(v.idx) }]))));
  console.log({ marcas: Object.keys(g.geometria).length, faltantes: g.faltantes });
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
