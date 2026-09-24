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

// tmp/previa-unica102.js
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
var LEGAL = { larguraMax: 2600, alturaTotalMax: 4400, compCarretaEspecial: 14e3 };
var EMB = {
  engradado: { rotulo: "engradado refor\xE7ado", quadro: 60, base: 120, tampa: 60, largMax: 620, kgMax: 600, kgProprio: 45 },
  cavalete: { rotulo: "cavalete (A-frame) com cal\xE7os e cintas", quadro: 80, base: 120, tampa: 0, largMin: 700, kgMax: 3e3, kgProprio: 60 }
};
var MEDIDAS = { MADEIRA: 100, FOLGA: 60, GAP: 12, CEL: 100, CALCO: 150, CALCO_FUSAO: 300, JANELA: 4 };
var PAC = { secaoMax: 500, compMin: 800, larguraMax: 1200, alturaMax: 600, kgMax: 2500 };
var CAIXA_MAD = { compMax: 2e3, kgMax: 60, Lint: 800, base: 100, parede: 40, tampaAlt: 40, alturaMax: 600, kgTotal: 1e3, tipo: "CAIXA", rotulo: "Caixa de madeira", minPorMarca: 6 };
var PAC_GC = { alturaMax: 500, kgMax: 600 };
var PAC_GRADE = { alturaMax: 500, kgMax: 1200 };
var GRADE_CARGA = { teto: 2400, apoioMin: 0.8 };
var CAIXA_VALE_PALETE = { compMax: 2e3, kgMax: 60, Lint: 1e3, base: 140, parede: 40, tampaAlt: 40, alturaMax: 600, kgTotal: 1e3, tipo: "CAIXA", rotulo: "Caixa sobre palete", minPorMarca: 1 };
var REGRAS = { niveisMax: 99, pesadoSobreLeve: "alerta", delicadoSobreDelicado: true, engradadoEmpilha: true, apoioMin: 0.6 };
var PERFIS = {
  economico: { ...REGRAS, chave: "economico", nome: "Econ\xF4mico", feixesCurtos: true, compartilharMiudos: true, lqc: "ECONOMICA", resumo: "Pacotes amarrados com cintas e madeira, guarda-corpo deitado em pacote, vigas em feixe cintado, mi\xFAdos em caixa de madeira fechada, sem prote\xE7\xE3o extra de pintura.", gc: "melhor", planos: "pacote", miudos: CAIXA_MAD, protecao: "nenhuma", tempoExtra: 0 },
  recomendado: { ...REGRAS, chave: "recomendado", nome: "Padr\xE3o", feixesCurtos: true, compartilharMiudos: true, lqc: "PADRAO", resumo: "Guarda-corpo em p\xE9 em engradado quando reduz viagem, vigas em feixe cintado, cantoneira sob toda cinta em pe\xE7a pintada, mi\xFAdos em caixa de madeira fechada.", gc: "melhor2", planos: "pacote", miudos: CAIXA_MAD, protecao: "cantoneiras", tempoExtra: 1 },
  exigente: { ...REGRAS, chave: "exigente", nome: "Refor\xE7ada", lqc: "REFORCADA", resumo: "Tudo embalado: guarda-corpo em p\xE9 em engradado, chapas e contraventamentos em engradado deitado, vigas em feixe cintado, mi\xFAdos em caixa de madeira, cantoneira e manta.", gc: "engradado", planos: "engradado", miudos: CAIXA_MAD, protecao: "cantoneiras+manta", tempoExtra: 3 },
  vale: { ...REGRAS, chave: "vale", nome: "Especificada (TMSA/Vale)", lqc: "ESPECIFICADA", resumo: "Dentro da especifica\xE7\xE3o TMSA/Hydro: feixe at\xE9 2 t e 12 m, mi\xFAdo em caixa sobre palete, guarda-corpo em engradado deitado, grade em engradado, madeira fumigada, um volume numerado por embalagem.", gc: "engradadoDeitado", planos: "engradado", grades: "engradado", miudos: CAIXA_VALE_PALETE, minPorMarca: 6, pac: { kgMax: 2e3, compMax: 12e3 }, protecao: "cantoneiras+manta", tempoExtra: 2, madeiraTratada: 1.35 }
};

// lib/carga/classificar.js
var ehGC = (u) => /G\.?\s*C\b|GUARDA|CORRIM/i.test(u.desc || "");
var ehDegrau = (u) => /DEGRAU/i.test(u.desc || "");
var ehGrade = (u) => !ehGC(u) && (/GRADE/i.test(u.desc || "") || ehDegrau(u)) && u.A <= 120;
var ehPequena = (u) => !ehGC(u) && !ehGrade(u) && u.C <= CAIXA_MAD.compMax && u.kg <= CAIXA_MAD.kgMax;
var ehBarra = (u) => !ehGC(u) && !ehGrade(u) && !ehPequena(u) && (u.L <= PAC.secaoMax && u.A <= PAC.secaoMax || u.kg <= 100 && u.L <= 500 && u.A <= 500) && u.C >= PAC.compMin;
var ehPlana = (u) => !ehGC(u) && !ehGrade(u) && !ehPequena(u) && !ehBarra(u) && u.A <= 60 && u.kg <= 20 && u.C >= 800;
var ehPainel = (u) => u.A <= Math.max(120, 0.35 * u.L) && u.L >= 600;
var ehQuadroVazado = (u) => u.tipo === "PECA" && /P[ÓO]RTICO|TRELI|ESCADA|QUADRO|ARMA[CÇ][AÃ]O|CONTRAVENT/i.test(u.desc || "") && u.L >= 600;
var ehFamiliaChapa = (desc) => /CHAPA|GRADE|GUARDA|G\.?\s*C\b|PISO|PLATAFORMA|TALA|DEGRAU|ESCADA|PAINEL|FECHAMENTO|TELHA/i.test(desc || "");
var classe = (u) => u.tipo === "CAIXA" || u.tipo === "ENGRADADO" ? 0 : u.tipo === "PALLET" || /GRADE|DEGRAU|G\.?\s*C\b|GUARDA/i.test(u.rotulo || u.desc || "") || u.A <= 15 ? 3 : u.kg >= 80 || /COLUNA|VIGA|TRELI|P[ÓO]RTICO/i.test(u.desc || u.rotulo || "") ? 1 : 2;
var m3 = (u) => `${(u.C / 1e3).toFixed(2)} \xD7 ${(u.L / 1e3).toFixed(2)} \xD7 ${(u.A / 1e3).toFixed(2)} m`;
function faseDaMarca(marca, prefixo) {
  const m = String(marca || "").toUpperCase();
  const rx = prefixo ? new RegExp(`^${prefixo}([A-Z])`) : /^T\d+([A-Z])/;
  const r = m.match(rx);
  return r ? r[1] : "?";
}

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
      pecas.push(o ? { ...base, ...o, topoVazado: g?.apoioSuperior ? !!aj?.orientacao || !!manual || !g.apoioSuperior.plana : void 0, temGeo: !manual && !!g?.temGeo, aproximada: !!manual || !g?.obb, estimada: !!estimada, manual: !!manual } : { ...base, semCaixa: true });
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

// lib/carga/unidades.js
var { GAP } = MEDIDAS;
var faseDe = (fr) => {
  const f = String(fr).split("/")[0];
  return f === "?" ? "itens fora do modelo" : `fase ${f}`;
};
var frenteDe = (u, ctx) => faseDaMarca(u.marca, ctx.prefixo) + (ctx.sequencia ? `/N${u.nivel || 0}` : "");
var cabeEmPe = (u, tipo, veic) => {
  const e = EMB[tipo], alt = e.base + u.L + e.tampa;
  return alt <= veic.alturaUtil && alt + veic.assoalho <= LEGAL.alturaTotalMax && u.kg <= e.kgMax && u.C + 2 * e.quadro <= veic.C;
};
function porEmPe(u, tipo) {
  const e = EMB[tipo], alturaPainel = u.L, espessura = u.A, largura = Math.max(espessura + 2 * e.quadro, e.largMin || 0);
  Object.assign(u, {
    emPe: true,
    posicao: "em p\xE9",
    tipo: tipo === "engradado" ? "ENGRADADO" : u.tipo,
    C: u.C + 2 * e.quadro,
    L: largura,
    A: e.base + alturaPainel + e.tampa,
    kg: u.kg + e.kgProprio,
    embalagem: { tipo, rotulo: e.rotulo, quadro: e.quadro, base: e.base, tampa: e.tampa, alturaPainel, espessura, kgProprio: e.kgProprio },
    classe: tipo === "engradado" ? 0 : 1
  });
  u.aviso = `em p\xE9 em ${e.rotulo} ${m3(u)}`;
}
function porEngradadoDeitado(u) {
  const e = EMB.engradado;
  Object.assign(u, {
    tipo: "ENGRADADO",
    C: u.C + 2 * e.quadro,
    L: u.L + 2 * e.quadro,
    A: e.base + u.A + e.tampa,
    kg: u.kg + e.kgProprio,
    classe: 0,
    embalagem: { tipo: "engradado", deitado: true, rotulo: "engradado refor\xE7ado (deitado)", quadro: e.quadro, base: e.base, tampa: e.tampa, kgProprio: e.kgProprio }
  });
  u.aviso = `deitado em engradado refor\xE7ado ${m3(u)}`;
}
function empilhar(lista, novo, { cap, kgMax, col = 1 }, unidades) {
  let at = null;
  for (const u of lista) {
    if (!at || at.membros.length >= at.cap || at.kg + u.kg > kgMax) {
      const pA = u.A + GAP;
      at = { ...novo(u), membros: [], kg: 0, cap: col * Math.max(1, Math.floor(cap / pA)), col, pA, C: 0, L: 0, A: 0 };
      unidades.push(at);
    }
    const i = at.membros.length;
    u.dx = 0;
    u.dz = i % col * (u.L + GAP);
    u.dy = Math.floor(i / col) * at.pA;
    at.membros.push(u);
    at.kg += u.kg;
    at.C = Math.max(at.C, u.C);
    at.L = Math.max(at.L, u.dz + u.L);
    at.A = Math.max(at.A, u.dy + u.A);
  }
}
var agrupar = (lista, chave) => {
  const g = /* @__PURE__ */ new Map();
  for (const u of lista) {
    const k = chave(u);
    (g.get(k) || g.set(k, []).get(k)).push(u);
  }
  return g;
};
function pacotesGuardaCorpo(pecas, ctx, gcModo, unidades, seq) {
  const espMax = gcModo === "engradado" ? PAC_GC.alturaMax : PAC_GC.alturaMax, kgMax = PAC_GC.kgMax;
  const g = agrupar(pecas.filter(ehGC).sort((a, b) => b.A - a.A || b.C - a.C), (u) => `${frenteDe(u, ctx)}|${Math.ceil(u.C / 2e3) * 2}`);
  for (const [kk, lista] of g) {
    const [fr, k] = kk.split("|");
    empilhar(lista, () => ({ id: `g${seq.n++}`, tipo: "PACOTE", gc: true, frente: fr, rotulo: `Pacote guarda-corpo ${faseDe(fr)} ~${k} m`, delicado: true }), { cap: espMax, kgMax }, unidades);
  }
}
function pacotesGrade(pecas, ctx, unidades, seq) {
  const g = agrupar(pecas.filter(ehGrade).sort((a, b) => b.A - a.A || b.C - a.C || b.L - a.L), (u) => `${frenteDe(u, ctx)}|${ehDegrau(u) ? "DEG" : "GR"}|${Math.ceil(u.C / 1e3)}|${Math.ceil(u.L / 500) * 0.5}`);
  for (const [kk, lista] of g) {
    const [fr, tp, k, kl] = kk.split("|"), deg = tp === "DEG", col = deg ? 4 : 1;
    empilhar(lista, (u) => ({ id: `r${seq.n++}`, tipo: "PACOTE", grade: true, degrau: deg, frente: fr, rotulo: `${deg ? "Pacote de degraus" : "Pacote grade de piso"} ${faseDe(fr)} ~${k} \xD7 ${deg ? ((col * u.L + (col - 1) * GAP) / 1e3).toFixed(1) : kl} m`, delicado: true }), { cap: PAC_GRADE.alturaMax, kgMax: PAC_GRADE.kgMax, col }, unidades);
  }
  const sobras = unidades.filter((p) => p.grade && !p.degrau && p.membros.length <= 3).sort((a, b) => b.C * b.L - a.C * a.L);
  for (const p of sobras) {
    const alvo = unidades.filter((q) => q !== p && q.grade && !q.degrau && q.frente === p.frente && q.membros.length > 3 && q.C >= p.C && q.L >= p.L && q.kg + p.kg <= PAC_GRADE.kgMax && q.A + p.membros.reduce((t, m) => t + m.A + GAP, 0) <= PAC_GRADE.alturaMax + 150).sort((a, b) => a.C * a.L - b.C * b.L)[0];
    if (!alvo) continue;
    for (const m of [...p.membros].sort((x, y) => y.C * y.L - x.C * x.L)) {
      m.dx = 0;
      m.dz = 0;
      m.dy = alvo.A + GAP;
      alvo.membros.push(m);
      alvo.kg += m.kg;
      alvo.A = m.dy + m.A;
    }
    unidades.splice(unidades.indexOf(p), 1);
  }
}
function pacotesPlanosEFeixes(pecas, ctx, PAC_P, unidades, seq, forcaFeixe = []) {
  const barra = (u) => ehBarra(u) && u.C <= (PAC_P.compMax || Infinity);
  const planas = agrupar(pecas.filter(ehPlana).sort((a, b) => b.A - a.A || b.C - a.C), (u) => `${frenteDe(u, ctx)}|${u.desc || "CHAPA"}|${Math.ceil(u.C / 2e3) * 2}`);
  for (const [k, lista] of planas) {
    const [fr, fam, comp] = k.split("|");
    empilhar(lista, () => ({ id: `f${seq.n++}`, tipo: "PACOTE", plano: true, frente: fr, rotulo: `Pacote ${faseDe(fr)} \xB7 ${fam} ~${comp} m` }), { cap: PAC.alturaMax, kgMax: PAC_P.kgMax }, unidades);
  }
  const barras = agrupar(pecas.filter(barra).concat(forcaFeixe).sort((a, b) => b.L - a.L || b.A - a.A || b.C - a.C), (u) => `${frenteDe(u, ctx)}|${u.desc || "BARRA"}|${Math.ceil(u.C / 2e3) * 2}`);
  for (const [k, lista] of barras) {
    const [fr, fam, comp] = k.split("|");
    let at = null;
    for (const u of lista) {
      if (!at || at.membros.length >= at.cap || at.kg + u.kg > PAC_P.kgMax) {
        const pL = Math.max(...lista.map((p) => p.L)) + GAP, pA = Math.max(...lista.map((p) => p.A)) + GAP, cols = Math.max(1, Math.floor(PAC.larguraMax / pL));
        at = { id: `k${seq.n++}`, tipo: "PACOTE", frente: fr, rotulo: `Feixe cintado ${faseDe(fr)} \xB7 ${fam} ~${comp} m`, membros: [], kg: 0, cap: cols * Math.max(1, Math.floor(PAC.alturaMax / pA)), cols, pL, pA, C: 0, L: 0, A: 0 };
        unidades.push(at);
      }
      const i = at.membros.length, col = i % at.cols, row = Math.floor(i / at.cols);
      u.dx = 0;
      u.dz = col * at.pL;
      u.dy = row * at.pA;
      at.membros.push(u);
      at.kg += u.kg;
      at.C = Math.max(at.C, u.C);
      at.L = Math.max(at.L, u.dz + u.L);
      at.A = Math.max(at.A, u.dy + u.A);
    }
  }
  for (const p of unidades.filter((x) => x.tipo === "PACOTE" && !x.gc && !x.plano && !x.grade && x.membros.length === 1)) {
    const u = p.membros[0];
    delete u.dx;
    delete u.dy;
    delete u.dz;
    unidades.splice(unidades.indexOf(p), 1);
    unidades.push({ ...u, tipo: "PECA", rotulo: u.marca, membros: [u] });
  }
  return barra;
}
function caixasDeMiudos(pecas, ctx, perfil, unidades, seq, entra = ehPequena) {
  const niveisCaixa = perfil.miudosGrande ? [{ CM: perfil.miudos, sel: (u) => u.C <= perfil.miudos.compMax && u.L <= perfil.miudos.limites.L && u.A <= perfil.miudos.limites.A && u.kg <= perfil.miudos.kgMax }, { CM: perfil.miudosGrande, sel: (u) => !(u.C <= perfil.miudos.compMax && u.L <= perfil.miudos.limites.L && u.A <= perfil.miudos.limites.A && u.kg <= perfil.miudos.kgMax) }] : [{ CM: perfil.miudos, sel: () => true }];
  for (const { CM, sel } of niveisCaixa) {
    const porMarca = agrupar(pecas.filter((x) => entra(x) && sel(x)), (u) => u.marca);
    const grupos = [], partilhadas = /* @__PURE__ */ new Map();
    for (const [m, lista] of porMarca) {
      if (!perfil.compartilharMiudos && lista.length >= (perfil.minPorMarca ?? CM.minPorMarca)) {
        lista.sort((a, b) => a.nivel - b.nivel);
        const niv = [...new Set(lista.map((u) => u.nivelNome || `N${u.nivel}`))];
        grupos.push({ frente: frenteDe(lista[0], ctx), rotulo: `${m} \u2014 ${lista[0].desc || ""} (${lista.length} p\xE7${niv.length > 1 ? `, ${niv.length} n\xEDveis` : ""})`, lista });
      } else for (const u of lista) {
        const k = frenteDe(u, ctx);
        (partilhadas.get(k) || partilhadas.set(k, []).get(k)).push(u);
      }
    }
    for (const [k, lista] of partilhadas) grupos.push({ frente: k, rotulo: new Set(lista.map((u) => u.marca)).size === 1 ? `${lista[0].marca} \u2014 ${lista[0].desc || ""} (${lista.length} p\xE7)` : `${faseDe(k)} \xB7 ${new Set(lista.map((u) => u.marca)).size} marcas mi\xFAdas`, lista: lista.sort((a, b) => b.C - a.C || (a.desc || "").localeCompare(b.desc || "") || b.A - a.A) });
    for (const g of grupos) montarCaixas(g, CM, unidades, seq);
  }
}
function montarCaixas(g, CM, unidades, seq) {
  const maxC = Math.max(...g.lista.map((u) => u.C)), Cint = Math.max(600, Math.ceil((maxC + 60) / 100) * 100), Lint = Math.max(CM.Lint, Math.min(1e3, Math.ceil((Math.max(...g.lista.map((u) => u.L)) + 60) / 100) * 100));
  const caixas = [];
  let cx = null, cursor = null;
  const abre = () => {
    cx = { id: `l${seq.n++}`, tipo: "CAIXA", frente: g.frente, rotulo: `${CM.rotulo} \xB7 ${g.rotulo}`, membros: [], kg: 0, C: Cint + 2 * CM.parede, L: Lint + 2 * CM.parede, A: CM.base, base: CM.base, caixaMadeira: true };
    cursor = { x: CM.parede, z: CM.parede, y: CM.base, altFileira: 0, larg: 0 };
    caixas.push(cx);
    unidades.push(cx);
  };
  const cabe = (u) => {
    if (cursor.x + u.C > CM.parede + Cint) {
      cursor.x = CM.parede;
      cursor.z += cursor.larg;
      cursor.larg = 0;
    }
    if (cursor.z + u.L > CM.parede + Lint) {
      cursor.z = CM.parede;
      cursor.x = CM.parede;
      cursor.y += cursor.altFileira + GAP;
      cursor.altFileira = 0;
    }
    return cursor.y + u.A <= CM.base + CM.alturaMax && cx.kg + u.kg <= CM.kgTotal;
  };
  for (const u of g.lista) {
    if (!cx || !cabe(u)) {
      abre();
      cabe(u);
    }
    u.dx = cursor.x;
    u.dz = cursor.z;
    u.dy = cursor.y;
    cursor.x += u.C + GAP;
    cursor.larg = Math.max(cursor.larg, u.L + GAP);
    cursor.altFileira = Math.max(cursor.altFileira, u.A);
    cx.membros.push(u);
    cx.kg += u.kg;
    cx.A = Math.max(cx.A, u.dy + u.A);
  }
  for (const [i, c] of caixas.entries()) {
    const ocupadoC = Math.max(...c.membros.map((m) => m.dx + m.C)) - CM.parede;
    const ocupadoL = Math.max(...c.membros.map((m) => m.dz + m.L)) - CM.parede;
    c.C = Math.min(c.C, Math.max(600, Math.ceil((ocupadoC + 60) / 100) * 100) + 2 * CM.parede);
    c.L = Math.min(c.L, Math.max(400, Math.ceil((ocupadoL + 60) / 100) * 100) + 2 * CM.parede);
    c.A += CM.tampaAlt;
    c.kg += Math.round((2 * (c.C * c.L) + 2 * (c.C + c.L) * c.A) / 1e6 * 12);
    c.embalagem = { tipo: "caixa", rotulo: "caixa de madeira fechada", deitado: true };
    if (caixas.length > 1) c.rotulo += ` (caixa ${i + 1}/${caixas.length})`;
  }
}
function classificarTransporte(unidades, perfil, gcModo, veic) {
  for (const u of unidades) {
    u.posicao = "deitada";
    u.transporte = "normal";
    if (u.C > veic.C) {
      if (u.C <= LEGAL.compCarretaEspecial) {
        u.transporte = "carreta14";
        u.aviso = `${(u.C / 1e3).toFixed(1)} m: s\xF3 na carreta especial de 14 m`;
      } else {
        u.transporte = "especial";
        u.aviso = `comprimento ${(u.C / 1e3).toFixed(1)} m > 14 m: transporte especial`;
      }
    }
    if (u.L > veic.L && u.transporte === "normal") {
      const tipo = u.tipo === "PACOTE" && (u.gc || u.plano) ? "engradado" : u.tipo === "PECA" ? "cavalete" : null;
      if (tipo && u.aj?.embalagem === "emPe" && ehPainel(u) && cabeEmPe(u, tipo, veic)) {
        porEmPe(u, tipo);
        u.aviso = `largura ${(u.embalagem.alturaPainel / 1e3).toFixed(2)} m deitada > carroceria ${(veic.L / 1e3).toFixed(2)} m \u2192 ` + u.aviso;
      } else {
        u.transporte = "especial";
        u.aviso = `largura ${(u.L / 1e3).toFixed(2)} m deitada > carroceria: avaliar transporte especial e apoios, sem giro autom\xE1tico para posi\xE7\xE3o em p\xE9`;
      }
    }
    if (u.transporte === "normal" && u.A + veic.assoalho > LEGAL.alturaTotalMax) {
      u.transporte = "especial";
      u.aviso = (u.aviso ? u.aviso + " \xB7 " : "") + `altura total ${((u.A + veic.assoalho) / 1e3).toFixed(2)} m > 4,40 m: transporte especial`;
    }
  }
  if (gcModo === "engradado") {
    for (const u of unidades) if (u.tipo === "PACOTE" && u.gc && !u.emPe && u.transporte === "normal" && cabeEmPe(u, "engradado", veic)) porEmPe(u, "engradado");
  }
  if (gcModo === "engradadoDeitado") {
    for (const u of unidades) if (u.tipo === "PACOTE" && u.gc && !u.emPe && u.transporte === "normal") porEngradadoDeitado(u);
  }
  if (perfil.planos === "engradado") {
    for (const u of unidades) if (u.tipo === "PACOTE" && !u.gc && !u.grade && !u.emPe && u.transporte === "normal" && (u.plano || u.membros.every((m) => m.A <= 60))) porEngradadoDeitado(u);
  }
  if (perfil.grades === "engradado") {
    for (const u of unidades) if (u.tipo === "PACOTE" && u.grade && u.transporte === "normal") porEngradadoDeitado(u);
  }
}
function montarUnidades(pecasBase, perfil, gcModo, ctx) {
  const seq = { n: 0 }, PAC_P = { ...PAC, ...perfil.pac || {} };
  const pecas = pecasBase.filter((p) => !p.semCaixa).map((p) => ({ ...p }));
  const unidades = [];
  const emb = (p) => p.aj?.embalagem || "";
  const juntas = pecas.filter((p) => p.aj?.juntoCom), soltas = pecas.filter((p) => !p.aj?.juntoCom && emb(p) === "solta");
  const forcaCaixa = pecas.filter((p) => !p.aj?.juntoCom && emb(p) === "caixa"), forcaFeixe = pecas.filter((p) => !p.aj?.juntoCom && emb(p) === "feixe");
  const decididas = /* @__PURE__ */ new Set([...juntas, ...soltas, ...forcaCaixa, ...forcaFeixe]);
  const livres = pecas.filter((p) => !decididas.has(p));
  const modeladas = livres.filter((p) => !p.estimada), estimadas = livres.filter((p) => p.estimada).concat(forcaCaixa);
  const perfisCurtos = perfil.feixesCurtos ? modeladas.filter((p) => ehPequena(p) && !p.baseEmV && /^(VIGA|COLUNA|LONGARINA|TRAVAMENTO)\b/i.test(p.desc || "") && p.C >= 600 && p.C >= 2 * Math.max(p.L, p.A) && p.L <= 400 && p.A <= 400) : [];
  const curtos = new Set(perfisCurtos);
  pacotesJuntoCom(juntas, unidades, seq);
  for (const u of soltas) unidades.push({ ...u, tipo: "PECA", rotulo: u.marca, membros: [u] });
  pacotesGuardaCorpo(modeladas, ctx, gcModo, unidades, seq);
  pacotesGrade(modeladas, ctx, unidades, seq);
  const barra = pacotesPlanosEFeixes(modeladas, ctx, PAC_P, unidades, seq, forcaFeixe);
  for (const lista of agrupar(perfisCurtos, (p) => `${frenteDe(p, ctx)}|${p.desc}`).values()) {
    let grupo = [];
    for (const p of lista.sort((a, b) => b.C - a.C)) {
      if (grupo.length && p.C < grupo[0].C * 0.8) {
        pacotesPlanosEFeixes([], ctx, PAC_P, unidades, seq, grupo);
        grupo = [];
      }
      grupo.push(p);
    }
    if (grupo.length) pacotesPlanosEFeixes([], ctx, PAC_P, unidades, seq, grupo);
  }
  caixasDeMiudos(modeladas, ctx, perfil, unidades, seq, (p) => ehPequena(p) && !curtos.has(p));
  if (estimadas.length) caixasDeMiudos(estimadas, ctx, perfil, unidades, seq, () => true);
  for (const u of modeladas.filter((x) => !ehGC(x) && !ehGrade(x) && !ehPequena(x) && !barra(x) && !ehPlana(x))) unidades.push({ ...u, tipo: "PECA", rotulo: u.marca, membros: [u] });
  for (const u of unidades) {
    if (u.tipo === "PACOTE" && u.membros.some((m) => m.topoVazado)) u.topoVazado = true;
    u.classe = classe(u);
    if (!u.nivel) {
      u.nivel = Math.min(...u.membros.map((m) => m.nivel || 0));
      u.nivelNome = (u.membros.find((m) => m.nivel === u.nivel) || u.membros[0]).nivelNome || null;
      u.tipoSeq = Math.min(...u.membros.map((m) => m.tipoSeq || 2));
    }
  }
  classificarTransporte(unidades, perfil, gcModo, ctx.veiculos?.carreta || VEICULOS.carreta);
  aplicarAjustesNasUnidades(unidades, ctx.veiculos?.carreta || VEICULOS.carreta);
  return unidades;
}
function pacotesJuntoCom(pecas, unidades, seq) {
  const g = agrupar([...pecas].sort((a, b) => b.C - a.C || b.kg - a.kg), (u) => u.aj.juntoCom.toUpperCase());
  for (const [k, lista] of g) {
    let at = null;
    for (const u of lista) {
      if (!at) {
        const pL = Math.max(...lista.map((x) => x.L)) + GAP, pA = Math.max(...lista.map((x) => x.A)) + GAP, cols = Math.max(1, Math.floor(PAC.larguraMax / pL));
        at = { id: `j${seq.n++}`, tipo: "PACOTE", junto: k, frente: faseDaMarca(u.marca), rotulo: `Pacote "${u.aj.juntoCom}"`, membros: [], kg: 0, cols, pL, pA, C: 0, L: 0, A: 0 };
        unidades.push(at);
      }
      const i = at.membros.length, col = i % at.cols, row = Math.floor(i / at.cols);
      u.dx = 0;
      u.dz = col * at.pL;
      u.dy = row * at.pA;
      at.membros.push(u);
      at.kg += u.kg;
      at.C = Math.max(at.C, u.C);
      at.L = Math.max(at.L, u.dz + u.L);
      at.A = Math.max(at.A, u.dy + u.A);
    }
  }
}
function aplicarAjustesNasUnidades(unidades, veic) {
  for (const u of unidades) {
    const regras = (u.membros || []).map((m) => m.aj).filter(Boolean);
    if (!regras.length) continue;
    const embs = regras.map((r) => r.embalagem).filter(Boolean), pos = regras.map((r) => r.posicao).filter(Boolean);
    if (u.transporte === "normal" && !u.emPe && !u.embalagem) {
      if (embs.includes("emPe") && ehPainel(u) && cabeEmPe(u, "engradado", veic)) porEmPe(u, "engradado");
      else if (embs.includes("engradado") || embs.includes("emPe")) porEngradadoDeitado(u);
    }
    if (pos.includes("chao")) {
      u.soChao = true;
      u.classe = Math.min(u.classe, 1);
    }
    if (pos.includes("topo")) {
      u.classe = 3;
      u.nadaEmCima = true;
    }
    if (pos.includes("nadaEmCima")) u.nadaEmCima = true;
    u.ajustada = true;
  }
}

// lib/carga/apoios.js
function coberturaDaBase(u, apoios) {
  const fx = u.fx || u.C, fz = u.fz || u.L;
  let n = 0;
  const quadrantes = [0, 0, 0, 0];
  for (let i = 0; i < 20; i++) for (let j = 0; j < 10; j++) {
    const x = u.x + fx * (i + 0.5) / 20, z = u.z + fz * (j + 0.5) / 10;
    if (apoios.some((b) => x >= b.x && x <= b.x + (b.fx || b.C) && z >= b.z && z <= b.z + (b.fz || b.L))) {
      n++;
      quadrantes[(i >= 10 ? 2 : 0) + (j >= 5 ? 1 : 0)]++;
    }
  }
  return { fracao: n / 200, suficiente: n >= 160 && quadrantes.every((q) => q >= 25) };
}
var temGiroSemBaseConfirmada = (u) => !!(u.rotacaoManual && (u.rotacaoManual.x % 180 || u.rotacaoManual.z % 180 || u.rotacaoManual.y % 90));
function baseCompativelParaCaixa(u, apoios, itens = [], madeira = 100) {
  if (temGiroSemBaseConfirmada(u)) return null;
  const fx = u.fx || u.C, fz = u.fz || u.L;
  return apoios.find((b) => b.tipo === "CAIXA" && !b.nadaEmCima && !b.emPe && !temGiroSemBaseConfirmada(b) && b.y <= 1 && u.kg > 0 && b.kg >= u.kg + itens.filter((p) => p.id !== u.id && p.id !== b.id && Math.abs(p.y - (b.y + (b.fy || b.A) + madeira)) <= 2 && Math.min(p.x + (p.fx || p.C), b.x + (b.fx || b.C)) > Math.max(p.x, b.x) && Math.min(p.z + (p.fz || p.L), b.z + (b.fz || b.L)) > Math.max(p.z, b.z)).reduce((s, p) => s + p.kg, 0) && u.x >= b.x - 1 && u.z >= b.z - 1 && u.x + fx <= b.x + (b.fx || b.C) + 1 && u.z + fz <= b.z + (b.fz || b.L) + 1) || null;
}

// lib/carga/empacotar.js
var { MADEIRA, FOLGA, CEL } = MEDIDAS;
var CAMPOS = ["x", "y", "z", "sobre", "girada", "fx", "fz", "nivelPilha", "camada", "pilha", "semLugar"];
var fotografar = (us) => us.map((u) => [u, Object.fromEntries(CAMPOS.map((c) => [c, u[c]]))]);
var restaurar = (snap) => {
  for (const [u, s] of snap) for (const c of CAMPOS) {
    if (s[c] === void 0) delete u[c];
    else u[c] = s[c];
  }
};
var limpar = (u) => {
  for (const c of CAMPOS) delete u[c];
};
var novoContexto = (op = {}) => ({ prefixo: op.prefixo || "", sequencia: !!op.sequencia, janela: op.janela || MEDIDAS.JANELA, cel: op.cel || CEL, modoGrupo: "", reservaTopo: 0, veiculos: op.veiculos || VEICULOS, frete: op.frete });
function novaCarga(veic, zona, ctx) {
  const cel = ctx.cel, nx = Math.floor((veic.C - zona) / cel), nz = Math.floor(veic.L / cel);
  return { veicKey: veic.chave, veic, zonaGC: zona, nx, nz, cel, emCamadas: ctx.modoGrupo === "grades", alt: new Float32Array(nx * nz), dono: new Array(nx * nz).fill(null), tampa: new Uint8Array(nx * nz), nivel: new Uint8Array(nx * nz), itens: [], peso: 0, altura: 0, pilhas: [] };
}
function colocarPilha(c, pilha) {
  let z = FOLGA;
  const colunas = [];
  for (const u of [...pilha].sort((a, b) => b.C - a.C || b.kg - a.kg)) {
    let col = colunas.find((k) => k.altura + MADEIRA + u.A <= c.veic.alturaUtil && u.L + FOLGA <= k.larg);
    if (!col) {
      const larg = u.L + FOLGA;
      if (z + larg > c.veic.L) {
        u.semLugar = true;
        continue;
      }
      col = { z0: z, larg, altura: 0, n: 0 };
      z += larg;
      colunas.push(col);
    }
    u.x = FOLGA;
    u.z = col.z0 + (col.larg - u.L) / 2;
    u.y = col.altura + (col.n ? MADEIRA : 0);
    u.pilha = true;
    u.camada = col.n;
    u.nivelPilha = col.n;
    u.fx = u.C;
    u.fz = u.L;
    col.altura = u.y + u.A;
    col.n++;
    c.itens.push(u);
    c.peso += u.kg;
    c.altura = Math.max(c.altura, col.altura);
  }
  c.pilhas = colunas;
}
var marcaDe = (u) => (u.membros?.[0] || u).marca;
var encaixaNoQuadro = (u, dono) => !!dono && ehQuadroVazado(u) && (marcaDe(u) === marcaDe(dono) || Math.abs(u.C - dono.C) <= 0.05 * dono.C && Math.abs(u.L - dono.L) <= 0.05 * dono.L);
var bloqueia = (t, u, delic, dono) => t === 1 || t === 2 && u.tipo !== "ENGRADADO" || t === 3 && !delic || t === 4 && !u.gc || t === 5 && !(u.tipo === "CAIXA" || delic) || t === 6 && !encaixaNoQuadro(u, dono);
function avaliarPosicao(c, u, perfil, ctx, pos, tetoUtil, pref, melhor) {
  const { ix, iz, cx, cz } = pos, NZ = c.nz, delic = u.classe === 3 && !u.emPe, delicAlto = delic && !c.emCamadas;
  let topo = 0, nivelBase = 0;
  for (let a = ix; a < ix + cx; a++) for (let b = iz; b < iz + cz; b++) {
    const k = a * NZ + b;
    if (bloqueia(c.tampa[k], u, delic, c.dono[k])) return null;
    const h = c.alt[k];
    if (h > topo) topo = h;
    if (c.nivel[k] > nivelBase) nivelBase = c.nivel[k];
  }
  const y = topo > 0 ? topo + MADEIRA : 0;
  if (y + u.A > tetoUtil) return null;
  if (topo > 0 && (u.soChao || u.tipo === "PALLET" || u.baseEmV && u.almaVertical !== false || nivelBase + 1 > perfil.niveisMax)) return null;
  const custoBase = (delicAlto ? -y * 1e3 : pref === "empilhar" && y > 0 ? -1e6 + y * 100 : y * 1e3) - ix * 2;
  let custo = custoBase + (u.embalagem?.tipo === "cavalete" ? 40 : 1) * Math.min(iz, NZ - iz - cz) + (pos.girada ? 3 : 0);
  if (melhor && custo >= melhor.custo) return null;
  const donos = /* @__PURE__ */ new Set();
  let nTopo = 0, nCel = 0;
  for (let a = ix; a < ix + cx; a++) for (let b = iz; b < iz + cz; b++) {
    const k = a * NZ + b;
    nCel++;
    if (Math.abs(topo - c.alt[k]) <= 2) nTopo++;
    if (c.dono[k]) donos.add(c.dono[k]);
  }
  const baixo = [...donos];
  if (topo > 0) {
    if (u.emPe && !(u.tipo === "ENGRADADO" && perfil.engradadoEmpilha && nivelBase === 1 && baixo.every((d) => d.tipo === "ENGRADADO"))) return null;
    if (u.tipo !== "PALLET" && baixo.some((d) => d.tipo === "PALLET")) return null;
    if (perfil.pesadoSobreLeve === "proibido" && baixo.some((d) => u.kg > d.kg * 1.5)) return null;
    if (nTopo / nCel < (c.emCamadas ? GRADE_CARGA.apoioMin : perfil.apoioMin ?? 0.6)) return null;
    const ponta = Math.max(1, Math.floor(cx * 0.15));
    let ini = 0, fim = 0;
    for (let a = ix; a < ix + ponta; a++) for (let b = iz; b < iz + cz; b++) if (Math.abs(topo - c.alt[a * NZ + b]) <= 2) ini++;
    for (let a = ix + cx - ponta; a < ix + cx; a++) for (let b = iz; b < iz + cz; b++) if (Math.abs(topo - c.alt[a * NZ + b]) <= 2) fim++;
    if (!ini || !fim) return null;
    const candidatos = baixo.filter((b) => Math.abs(b.y + b.A - topo) <= 2 && !b.baseEmV && !b.topoVazado);
    if (u.tipo === "CAIXA" && !baseCompativelParaCaixa({ ...u, x: c.zonaGC + ix * c.cel + FOLGA / 2, z: iz * c.cel + FOLGA / 2, fx: pos.fx, fz: pos.fz }, candidatos, c.itens, MADEIRA)) return null;
    const cobertura = coberturaDaBase({ x: c.zonaGC + ix * c.cel + FOLGA / 2, z: iz * c.cel + FOLGA / 2, fx: pos.fx, fz: pos.fz }, candidatos);
    if (!cobertura.suficiente) return null;
    custo += (1 - cobertura.fracao) * 1e4;
  }
  return { ...pos, y, custo, baixo, nivel: topo > 0 ? nivelBase : 0 };
}
function tentaPor(c, u, perfil, ctx, pref = "chao") {
  const veic = c.veic, NX = c.nx, NZ = c.nz, cel = c.cel, delicada = u.classe === 3 && !u.emPe;
  const tetoUtil = c.emCamadas ? Math.min(veic.alturaUtil, GRADE_CARGA.teto) : veic.alturaUtil - (delicada ? 0 : ctx.reservaTopo || 0);
  const opcoes = [[u.C, u.L, false]];
  if (u.C + FOLGA <= veic.L && u.C !== u.L) opcoes.push([u.L, u.C, true]);
  let melhor = null;
  for (const [fx2, fz2, girada2] of opcoes) {
    const cx2 = Math.ceil((fx2 + FOLGA) / cel), cz2 = Math.ceil((fz2 + FOLGA) / cel);
    for (let ix2 = 0; ix2 + cx2 <= NX; ix2++) for (let iz2 = 0; iz2 + cz2 <= NZ; iz2++) {
      const r = avaliarPosicao(c, u, perfil, ctx, { ix: ix2, iz: iz2, cx: cx2, cz: cz2, fx: fx2, fz: fz2, girada: girada2 }, tetoUtil, pref, melhor);
      if (r && (!melhor || r.custo < melhor.custo)) melhor = r;
    }
  }
  if (!melhor) return false;
  const { ix, iz, y, cx, cz, fx, fz, girada, baixo, nivel } = melhor;
  Object.assign(u, { x: c.zonaGC + ix * cel + FOLGA / 2, z: iz * cel + FOLGA / 2, y, girada, fx, fz, nivelPilha: nivel, sobre: baixo.map((d) => d.id), pilha: false });
  const sobrePallet = baixo.some((d) => d.tipo === "PALLET");
  for (let a = ix; a < ix + cx; a++) for (let b = iz; b < iz + cz; b++) {
    const k = a * NZ + b;
    c.alt[k] = y + u.A;
    c.dono[k] = u;
    c.nivel[k] = nivel + 1;
    if (u.nadaEmCima || u.baseEmV || u.topoVazado) c.tampa[k] = 1;
    else if (u.emPe) c.tampa[k] = u.tipo === "ENGRADADO" && perfil.engradadoEmpilha && nivel === 0 ? 2 : 1;
    else if (u.gc) c.tampa[k] = 4;
    else if (u.tipo === "CAIXA") c.tampa[k] = 5;
    else if (ehQuadroVazado(u)) c.tampa[k] = 6;
    else if (u.classe === 3 && (u.tipo !== "PALLET" || sobrePallet)) c.tampa[k] = perfil.delicadoSobreDelicado && u.tipo !== "PALLET" ? 3 : 1;
  }
  c.itens.push(u);
  c.peso += u.kg;
  c.altura = Math.max(c.altura, y + u.A);
  return true;
}
function empacotar(ordem, veicKey, perfil, ctx, pilha = [], pref = "chao", consolidarDepois = true) {
  const veic = ctx.veiculos[veicKey];
  for (const u of ordem) limpar(u);
  for (const u of pilha) limpar(u);
  const cargas = [];
  let carga = pilha.length ? novaCarga(veic, Math.max(...pilha.map((u) => u.C)) + FOLGA * 2, ctx) : novaCarga(veic, 0, ctx);
  if (pilha.length) colocarPilha(carga, pilha);
  for (const u of ordem) {
    let ok = false;
    const abertas = ctx.sequencia ? cargas.slice(-ctx.janela).concat([carga]) : cargas.concat([carga]);
    for (const c of abertas) {
      if (c.peso + u.kg > veic.pesoMax) continue;
      if (tentaPor(c, u, perfil, ctx, pref)) {
        ok = true;
        break;
      }
    }
    if (!ok) {
      if (carga.itens.length) cargas.push(carga);
      carga = novaCarga(veic, 0, ctx);
      if (!tentaPor(carga, u, perfil, ctx, pref)) u.semLugar = true;
    }
  }
  if (carga.itens.length) cargas.push(carga);
  return consolidarDepois ? consolidar(cargas, perfil, ctx, pref) : cargas;
}
var ordemSequencia = (a, b) => a.nivel - b.nivel || a.tipoSeq - b.tipoSeq || a.classe - b.classe || area(b) - area(a) || b.kg - a.kg;
var ordemSequenciaComp = (a, b) => a.nivel - b.nivel || a.tipoSeq - b.tipoSeq || a.classe - b.classe || b.C - a.C || area(b) - area(a) || b.kg - a.kg;
var area = (u) => Math.round(u.C * u.L / 5e5);
function consolidar(cargas, perfil, ctx, pref) {
  if (!ctx.sequencia) return cargas;
  for (let i = cargas.length - 1; i >= 0; i--) {
    const c = cargas[i];
    if (cargas.length < 2 || c.peso > 0.3 * c.veic.pesoMax || c.itens.some((u) => u.pilha)) continue;
    const alvos = cargas.filter((x, j) => x !== c && Math.abs(j - i) <= ctx.janela);
    const snaps = alvos.map((x) => [x, { alt: x.alt.slice(), dono: x.dono.slice(), tampa: x.tampa.slice(), nivel: x.nivel.slice(), itens: x.itens.slice(), peso: x.peso, altura: x.altura }]);
    const itens = [...c.itens].sort((a, b) => area(b) - area(a) || b.kg - a.kg), fot = fotografar(itens);
    let ok = true;
    for (const u of itens) {
      limpar(u);
      let posto = false;
      for (const x of alvos) {
        if (x.peso + u.kg > x.veic.pesoMax) continue;
        if (tentaPor(x, u, perfil, ctx, pref)) {
          posto = true;
          break;
        }
      }
      if (!posto) {
        ok = false;
        break;
      }
    }
    if (ok) {
      cargas.splice(i, 1);
      continue;
    }
    for (const [x, sn] of snaps) Object.assign(x, sn);
    restaurar(fot);
    const vizinhas = cargas.map((x, j) => ({ x, d: Math.abs(j - i) })).filter(({ x, d }) => x !== c && d <= ctx.janela && x.veicKey === c.veicKey && !x.itens.some((u) => u.pilha) && x.peso + c.peso <= c.veic.pesoMax).sort((p, q) => p.d - q.d);
    for (const { x } of vizinhas) {
      const j = cargas.indexOf(x), uniao = x.itens.concat(c.itens), fot2 = fotografar(uniao);
      let fundiu = false;
      for (const cmp of [ordemSequencia, ordemSequenciaComp]) for (const pr of ["chao", "empilhar"]) {
        const nova = empacotar([...uniao].sort(cmp), c.veicKey, perfil, ctx, [], pr, false);
        if (nova.length === 1 && nova[0].itens.length === uniao.length && !uniao.some((u) => u.semLugar)) {
          cargas[j] = nova[0];
          cargas.splice(i, 1);
          fundiu = true;
          break;
        }
        restaurar(fot2);
        for (const u of uniao) delete u.semLugar;
      }
      if (fundiu) break;
    }
  }
  return cargas;
}

// tmp/previa-unica102.js
var geo = JSON.parse(import_node_fs.default.readFileSync("/tmp/carga102/geometria.json"));
for (const n of [1, 2]) {
  const e = JSON.parse(import_node_fs.default.readFileSync(`/tmp/carga102/entrada-${n}.json`));
  let best;
  for (const [nome, cmp] of Object.entries({ area: (a, b) => b.C * b.L - a.C * a.L, comp: (a, b) => b.C - a.C, peso: (a, b) => b.kg - a.kg, larg: (a, b) => b.L - a.L })) {
    const ctx = novoContexto();
    if (n === 2) ctx.veiculos = { ...ctx.veiculos, carreta: { ...VEICULOS.carreta, L: 2900, C: 18e3, nome: "Plataforma para carga larga \u2014 ve\xEDculo a confirmar" } };
    const us = montarUnidades(expandirPecas(e.lista, geo), PERFIS.economico, "topo", ctx);
    for (const u of us) u.topoVazado = false;
    const cs = empacotar(us.sort(cmp), "carreta", PERFIS.economico, ctx, [], "empilhar");
    console.log(n, nome, cs.length, us.filter((u) => u.semLugar).length);
    const score = cs.length * 100 + us.filter((u) => u.semLugar).length * 1e4 + Math.max(...cs.map((c) => c.altura)) / 1e4;
    if (!best || score < best.score) best = { score, cs: structuredClone(cs) };
  }
  import_node_fs.default.writeFileSync(`/tmp/carga102/previa-unica-${n}.json`, JSON.stringify(best.cs));
}
