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

// tmp/diagnostico-contactos.js
var import_node_fs = __toESM(require("node:fs"));

// lib/carga/premissas.js
var VEICULOS = {
  hr: { chave: "hr", nome: "Hyundai HR (carroceria 3,10 m)", C: 3100, L: 1900, alturaUtil: 1800, pesoMax: 1800, assoalho: 850 },
  tresquartos: { chave: "tresquartos", nome: "3/4 - VUC (carroceria 5,00 m)", C: 5e3, L: 2150, alturaUtil: 2200, pesoMax: 3500, assoalho: 1e3 },
  toco: { chave: "toco", nome: "Toco 4x2 (carroceria 6,50 m)", C: 6500, L: 2450, alturaUtil: 2400, pesoMax: 6e3, assoalho: 1200 },
  truck: { chave: "truck", nome: "Truck 6x2 (carroceria 8,50 m)", C: 8500, L: 2450, alturaUtil: 2600, pesoMax: 12e3, assoalho: 1250 },
  carreta: { chave: "carreta", nome: "Carreta 3 eixos (carga seca)", C: 12400, L: 2450, alturaUtil: 2900, pesoMax: 25e3, assoalho: 1350 },
  carreta14: { chave: "carreta14", nome: "Carreta especial 14 m", C: 14e3, L: 2450, alturaUtil: 2900, pesoMax: 25e3, assoalho: 1350 }
};
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
var ACO = 785e-8;
function caixaEstimada(desc, kg) {
  const d = String(desc || "").toUpperCase(), k = Number(kg) || 0;
  if (k <= 0) return null;
  const clamp = (v, a, b) => Math.round(Math.min(b, Math.max(a, v)));
  if (/ESCADA/.test(d)) return [clamp(k / (ACO * 600 * 150 * 0.04), 1500, 6e3), 150, 600];
  if (/CONTRA\s*PESO|LASTRO/.test(d)) {
    const s = Math.cbrt(k / ACO);
    return [clamp(s, 80, 1e3), clamp(s, 80, 1e3), clamp(s, 80, 1e3)];
  }
  if (k <= 10 || /ROLDANA|BATENTE|PINO|BUCHA|ROSCAD|PARAFUS|PORCA|ARRUELA/.test(d)) return [300, 80, 150];
  return [clamp(k / (ACO * 100 * 100 * 0.3), 300, 12e3), 100, 100];
}
function expandirPecas(lista, geometria = {}, ajustes = {}) {
  const pecas = [];
  let seq = 0;
  for (const p of lista) {
    const marca = String(p.marca || "").toUpperCase(), g = geometria[marca], aj = ajustes[marca] || null;
    const manual = aj?.medidas ? [aj.medidas.C, aj.medidas.A, aj.medidas.L] : null;
    const dims = manual || g?.obb?.dimsEixos || g?.dimsEixos, estimada = !dims ? caixaEstimada(p.desc, p.kgUn) : null;
    const o = dims ? orientarPeca(p.desc, dims, manual ? null : g?.obb || null, aj?.orientacao) : estimada ? orientarPeca(p.desc, estimada, null, aj?.orientacao) : null;
    for (let i = 0; i < (p.qtd || 1); i++) {
      const base = { id: `p${seq++}`, marca, desc: p.desc || "", kg: Number(p.kgUn) || 0, nivel: p.nivel || 0, nivelNome: p.nivelNome || null, tipoSeq: p.tipoSeq || 2, aj };
      pecas.push(o ? { ...base, ...o, facesApoio: !aj?.orientacao && !manual ? g?.apoioSuperior?.faces : void 0, ocupacao: !aj?.orientacao && !manual ? g?.ocupacao : void 0, topoVazado: g?.apoioSuperior ? !!aj?.orientacao || !!manual || !g.apoioSuperior.plana : void 0, temGeo: !manual && !!g?.temGeo, aproximada: !!manual || !g?.obb, estimada: !!estimada, manual: !!manual } : { ...base, semCaixa: true });
    }
  }
  desmontarContraventamentos(pecas);
  return pecas;
}
function desmontarContraventamentos(pecas) {
  const carr = VEICULOS.carreta;
  for (let i = pecas.length - 1; i >= 0; i--) {
    const u = pecas[i];
    if (u.semCaixa || !/CONTRAVENT/i.test(u.desc || "") || u.L <= carr.L || u.A > 60) continue;
    const diag = Math.round(Math.hypot(u.C, u.L)), sec = Math.max(26, u.A);
    const barra = (k) => ({ ...u, id: `${u.id}d${k}`, desc: `${u.desc} (desmontado: barra ${k}/2 de ${(diag / 1e3).toFixed(1)} m)`, kg: u.kg / 2, C: diag, L: sec, A: sec, giro: null, temGeo: false, desmontada: true });
    pecas.splice(i, 1, barra(1), barra(2));
  }
}

// lib/carga/apoios.js
var temGiroSemBaseConfirmada = (u) => !!(u.rotacaoManual && (u.rotacaoManual.x % 180 || u.rotacaoManual.z % 180 || u.rotacaoManual.y % 90));

// lib/carga/calcos-contato.js
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
  if (temGiroSemBaseConfirmada(u) || u.rotacaoManual && Object.values(u.rotacaoManual).some((v) => v !== 0)) return null;
  let a = x - u.x, b = z - u.z;
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
  if (temGiroSemBaseConfirmada(u) || u.rotacaoManual && Object.values(u.rotacaoManual).some((v) => v !== 0)) return null;
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

// tmp/diagnostico-contactos.js
var e = JSON.parse(import_node_fs.default.readFileSync("/tmp/carga102/entrada-1.json"));
var ps = expandirPecas(e.lista, e.geometria);
console.log(ps.map((p) => ({ m: p.marca, C: p.C, L: p.L, A: p.A, faces: p.facesApoio?.length, g: p.giro?.ang })));
var matches = [];
for (const p of ps) {
  const u = { ...p, x: 0, z: 0, y: p.A + 100 };
  if (planejarCalcos(u, [{ ...p, x: 0, z: 0, y: 0 }])) matches.push(p.marca);
}
console.log("auto empilha", matches);
