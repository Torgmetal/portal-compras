// Unidades de carga: as peças viram pacotes cintados, caixas de madeira, engradados ou peças soltas
// conforme o perfil de embalagem. Cada unidade tem C×L×A, kg, membros (as peças, com dx/dy/dz dentro
// dela) e a classe de empilhamento.
import { EMB, LEGAL, MEDIDAS, PAC, PAC_GC, PAC_GRADE, VEICULOS } from "./premissas";
import { classe, ehBarra, ehDegrau, ehGC, ehGrade, ehPainel, ehPequena, ehPlana, faseDaMarca, m3 } from "./classificar";

const { GAP } = MEDIDAS;
const faseDe = (fr) => { const f = String(fr).split("/")[0]; return f === "?" ? "itens fora do modelo" : `fase ${f}`; };

/** Chave de agrupamento: fase (+ nível quando a carga segue a sequência da obra). */
const frenteDe = (u, ctx) => faseDaMarca(u.marca, ctx.prefixo) + (ctx.sequencia ? `/N${u.nivel || 0}` : "");

const cabeEmPe = (u, tipo, veic) => { const e = EMB[tipo], alt = e.base + u.L + e.tampa; return alt <= veic.alturaUtil && alt + veic.assoalho <= LEGAL.alturaTotalMax && u.kg <= e.kgMax && u.C + 2 * e.quadro <= veic.C; };
function porEmPe(u, tipo) {
  const e = EMB[tipo], alturaPainel = u.L, espessura = u.A, largura = Math.max(espessura + 2 * e.quadro, e.largMin || 0);
  Object.assign(u, { emPe: true, posicao: "em pé", tipo: tipo === "engradado" ? "ENGRADADO" : u.tipo, C: u.C + 2 * e.quadro, L: largura, A: e.base + alturaPainel + e.tampa, kg: u.kg + e.kgProprio,
    embalagem: { tipo, rotulo: e.rotulo, quadro: e.quadro, base: e.base, tampa: e.tampa, alturaPainel, espessura, kgProprio: e.kgProprio }, classe: tipo === "engradado" ? 0 : 1 });
  u.aviso = `em pé em ${e.rotulo} ${m3(u)}`;
}
// engradado DEITADO: o pacote ganha quadro de madeira em volta; rígido, aceita carga em cima
function porEngradadoDeitado(u) {
  const e = EMB.engradado;
  Object.assign(u, { tipo: "ENGRADADO", C: u.C + 2 * e.quadro, L: u.L + 2 * e.quadro, A: e.base + u.A + e.tampa, kg: u.kg + e.kgProprio, classe: 0,
    embalagem: { tipo: "engradado", deitado: true, rotulo: "engradado reforçado (deitado)", quadro: e.quadro, base: e.base, tampa: e.tampa, kgProprio: e.kgProprio } });
  u.aviso = `deitado em engradado reforçado ${m3(u)}`;
}

// empilha as peças de um grupo em pacotes (uma coluna, ou `col` colunas lado a lado), respeitando altura e peso
function empilhar(lista, novo, { cap, kgMax, col = 1 }, unidades) {
  let at = null;
  for (const u of lista) {
    if (!at || at.membros.length >= at.cap || at.kg + u.kg > kgMax) { const pA = u.A + GAP; at = { ...novo(u), membros: [], kg: 0, cap: col * Math.max(1, Math.floor(cap / pA)), col, pA, C: 0, L: 0, A: 0 }; unidades.push(at); }
    const i = at.membros.length; u.dx = 0; u.dz = (i % col) * (u.L + GAP); u.dy = Math.floor(i / col) * at.pA; at.membros.push(u); at.kg += u.kg;
    at.C = Math.max(at.C, u.C); at.L = Math.max(at.L, u.dz + u.L); at.A = Math.max(at.A, u.dy + u.A);
  }
}
const agrupar = (lista, chave) => { const g = new Map(); for (const u of lista) { const k = chave(u); (g.get(k) || g.set(k, []).get(k)).push(u); } return g; };

function pacotesGuardaCorpo(pecas, ctx, gcModo, unidades, seq) {
  const espMax = gcModo === "engradado" ? PAC_GC.alturaMax : PAC_GC.alturaMax, kgMax = PAC_GC.kgMax;
  const g = agrupar(pecas.filter(ehGC).sort((a, b) => (b.A - a.A) || (b.C - a.C)), (u) => `${frenteDe(u, ctx)}|${Math.ceil(u.C / 2000) * 2}`);
  for (const [kk, lista] of g) { const [fr, k] = kk.split("|");
    empilhar(lista, () => ({ id: `g${seq.n++}`, tipo: "PACOTE", gc: true, frente: fr, rotulo: `Pacote guarda-corpo ${faseDe(fr)} ~${k} m`, delicado: true }), { cap: espMax, kgMax }, unidades); }
}
function pacotesGrade(pecas, ctx, unidades, seq) {
  const g = agrupar(pecas.filter(ehGrade).sort((a, b) => (b.A - a.A) || (b.C - a.C) || (b.L - a.L)), (u) => `${frenteDe(u, ctx)}|${ehDegrau(u) ? "DEG" : "GR"}|${Math.ceil(u.C / 1000)}|${Math.ceil(u.L / 500) * 0.5}`);
  for (const [kk, lista] of g) { const [fr, tp, k, kl] = kk.split("|"), deg = tp === "DEG", col = deg ? 4 : 1;
    // degrau: 4 fileiras lado a lado (1,0 × 1,0 m) até 0,5 m — pacote baixo e largo, não torre
    empilhar(lista, (u) => ({ id: `r${seq.n++}`, tipo: "PACOTE", grade: true, degrau: deg, frente: fr, rotulo: `${deg ? "Pacote de degraus" : "Pacote grade de piso"} ${faseDe(fr)} ~${k} × ${deg ? ((col * u.L + (col - 1) * GAP) / 1000).toFixed(1) : kl} m`, delicado: true }), { cap: PAC_GRADE.alturaMax, kgMax: PAC_GRADE.kgMax, col }, unidades); }
  // sobra (pacote de 1–3 painéis; a OP-118 tem 310 tamanhos distintos) sobe cintada num pacote maior da mesma fase
  const sobras = unidades.filter((p) => p.grade && !p.degrau && p.membros.length <= 3).sort((a, b) => b.C * b.L - a.C * a.L);
  for (const p of sobras) {
    const alvo = unidades.filter((q) => q !== p && q.grade && !q.degrau && q.frente === p.frente && q.membros.length > 3 && q.C >= p.C && q.L >= p.L && q.kg + p.kg <= PAC_GRADE.kgMax && q.A + p.membros.reduce((t, m) => t + m.A + GAP, 0) <= PAC_GRADE.alturaMax + 150).sort((a, b) => a.C * a.L - b.C * b.L)[0];
    if (!alvo) continue;
    for (const m of [...p.membros].sort((x, y) => y.C * y.L - x.C * x.L)) { m.dx = 0; m.dz = 0; m.dy = alvo.A + GAP; alvo.membros.push(m); alvo.kg += m.kg; alvo.A = m.dy + m.A; }
    unidades.splice(unidades.indexOf(p), 1);
  }
}
function pacotesPlanosEFeixes(pecas, ctx, PAC_P, unidades, seq) {
  const barra = (u) => ehBarra(u) && u.C <= (PAC_P.compMax || Infinity);
  const planas = agrupar(pecas.filter(ehPlana).sort((a, b) => (b.A - a.A) || (b.C - a.C)), (u) => `${frenteDe(u, ctx)}|${u.desc || "CHAPA"}|${Math.ceil(u.C / 2000) * 2}`);
  for (const [k, lista] of planas) { const [fr, fam, comp] = k.split("|");
    empilhar(lista, () => ({ id: `f${seq.n++}`, tipo: "PACOTE", plano: true, frente: fr, rotulo: `Pacote ${faseDe(fr)} · ${fam} ~${comp} m` }), { cap: PAC.alturaMax, kgMax: PAC_P.kgMax }, unidades); }
  const barras = agrupar(pecas.filter(barra).sort((a, b) => (b.L - a.L) || (b.A - a.A) || (b.C - a.C)), (u) => `${frenteDe(u, ctx)}|${u.desc || "BARRA"}|${Math.ceil(u.C / 2000) * 2}`);
  for (const [k, lista] of barras) { const [fr, fam, comp] = k.split("|"); let at = null;
    for (const u of lista) {
      if (!at || at.membros.length >= at.cap || at.kg + u.kg > PAC_P.kgMax) { const pL = u.L + GAP, pA = u.A + GAP, cols = Math.max(1, Math.floor(PAC.larguraMax / pL)); at = { id: `k${seq.n++}`, tipo: "PACOTE", frente: fr, rotulo: `Feixe cintado ${faseDe(fr)} · ${fam} ~${comp} m`, membros: [], kg: 0, cap: cols * Math.max(1, Math.floor(PAC.alturaMax / pA)), cols, pL, pA, C: 0, L: 0, A: 0 }; unidades.push(at); }
      const i = at.membros.length, col = i % at.cols, row = Math.floor(i / at.cols); u.dx = 0; u.dz = col * at.pL; u.dy = row * at.pA;
      at.membros.push(u); at.kg += u.kg; at.C = Math.max(at.C, u.C); at.L = Math.max(at.L, u.dz + u.L); at.A = Math.max(at.A, u.dy + u.A); } }
  // pacote de uma peça só é a própria peça
  for (const p of unidades.filter((x) => x.tipo === "PACOTE" && !x.gc && !x.plano && !x.grade && x.membros.length === 1)) { const u = p.membros[0]; delete u.dx; delete u.dy; delete u.dz; unidades.splice(unidades.indexOf(p), 1); unidades.push({ ...u, tipo: "PECA", rotulo: u.marca, membros: [u] }); }
  return barra;
}
// caixa de madeira fechada para peça ≤ 2 m e ≤ 60 kg: uma caixa por MARCA (todas as peças da marca); marca com
// pouca peça divide caixa com as outras miúdas da mesma fase/nível
function caixasDeMiudos(pecas, ctx, perfil, unidades, seq, entra = ehPequena) {
  const niveisCaixa = perfil.miudosGrande
    ? [{ CM: perfil.miudos, sel: (u) => u.C <= perfil.miudos.compMax && u.L <= perfil.miudos.limites.L && u.A <= perfil.miudos.limites.A && u.kg <= perfil.miudos.kgMax }, { CM: perfil.miudosGrande, sel: (u) => !(u.C <= perfil.miudos.compMax && u.L <= perfil.miudos.limites.L && u.A <= perfil.miudos.limites.A && u.kg <= perfil.miudos.kgMax) }]
    : [{ CM: perfil.miudos, sel: () => true }];
  for (const { CM, sel } of niveisCaixa) {
    const porMarca = agrupar(pecas.filter((x) => entra(x) && sel(x)), (u) => u.marca);
    const grupos = [], partilhadas = new Map();
    for (const [m, lista] of porMarca) {
      if (lista.length >= (perfil.minPorMarca ?? CM.minPorMarca)) { lista.sort((a, b) => (a.nivel - b.nivel)); const niv = [...new Set(lista.map((u) => u.nivelNome || `N${u.nivel}`))]; grupos.push({ frente: frenteDe(lista[0], ctx), rotulo: `${m} — ${lista[0].desc || ""} (${lista.length} pç${niv.length > 1 ? `, ${niv.length} níveis` : ""})`, lista }); }
      else for (const u of lista) { const k = frenteDe(u, ctx); (partilhadas.get(k) || partilhadas.set(k, []).get(k)).push(u); } }
    for (const [k, lista] of partilhadas) grupos.push({ frente: k, rotulo: `${faseDe(k)} · ${new Set(lista.map((u) => u.marca)).size} marcas miúdas`, lista: lista.sort((a, b) => (b.C - a.C) || (a.desc || "").localeCompare(b.desc || "") || (b.A - a.A)) });
    for (const g of grupos) montarCaixas(g, CM, unidades, seq);
  }
}
function montarCaixas(g, CM, unidades, seq) {
  const maxC = Math.max(...g.lista.map((u) => u.C)), Cint = Math.max(600, Math.ceil((maxC + 60) / 100) * 100), Lint = Math.max(CM.Lint, Math.min(1000, Math.ceil((Math.max(...g.lista.map((u) => u.L)) + 60) / 100) * 100));
  const caixas = []; let cx = null, cursor = null;
  const abre = () => { cx = { id: `l${seq.n++}`, tipo: "CAIXA", frente: g.frente, rotulo: `${CM.rotulo} · ${g.rotulo}`, membros: [], kg: 0, C: Cint + 2 * CM.parede, L: Lint + 2 * CM.parede, A: CM.base, base: CM.base, caixaMadeira: true }; cursor = { x: CM.parede, z: CM.parede, y: CM.base, altFileira: 0, larg: 0 }; caixas.push(cx); unidades.push(cx); };
  const cabe = (u) => { if (cursor.x + u.C > CM.parede + Cint) { cursor.x = CM.parede; cursor.z += cursor.larg; cursor.larg = 0; } if (cursor.z + u.L > CM.parede + Lint) { cursor.z = CM.parede; cursor.x = CM.parede; cursor.y += cursor.altFileira + GAP; cursor.altFileira = 0; } return cursor.y + u.A <= CM.base + CM.alturaMax && cx.kg + u.kg <= CM.kgTotal; };
  for (const u of g.lista) { if (!cx || !cabe(u)) { abre(); cabe(u); }
    u.dx = cursor.x; u.dz = cursor.z; u.dy = cursor.y; cursor.x += u.C + GAP; cursor.larg = Math.max(cursor.larg, u.L + GAP); cursor.altFileira = Math.max(cursor.altFileira, u.A);
    cx.membros.push(u); cx.kg += u.kg; cx.A = Math.max(cx.A, u.dy + u.A); }
  for (const [i, c] of caixas.entries()) { c.A += CM.tampaAlt; c.kg += Math.round((2 * (c.C * c.L) + 2 * (c.C + c.L) * c.A) / 1e6 * 12); c.embalagem = { tipo: "caixa", rotulo: "caixa de madeira fechada", deitado: true }; if (caixas.length > 1) c.rotulo += ` (caixa ${i + 1}/${caixas.length})`; }
}
// transporte: contra a carreta normal (o maior veículo do dia a dia); painel largo demais vai em pé se a embalagem deixar
function classificarTransporte(unidades, perfil, gcModo, veic) {
  for (const u of unidades) {
    u.posicao = "deitada"; u.transporte = "normal";
    if (u.C > veic.C) { if (u.C <= LEGAL.compCarretaEspecial) { u.transporte = "carreta14"; u.aviso = `${(u.C / 1000).toFixed(1)} m: só na carreta especial de 14 m`; } else { u.transporte = "especial"; u.aviso = `comprimento ${(u.C / 1000).toFixed(1)} m > 14 m: transporte especial`; } }
    if (u.L > veic.L && u.transporte === "normal") {
      const tipo = u.tipo === "PACOTE" && (u.gc || u.plano) ? "engradado" : u.tipo === "PECA" ? "cavalete" : null;
      if (tipo && ehPainel(u) && cabeEmPe(u, tipo, veic)) { porEmPe(u, tipo); u.aviso = `largura ${(u.embalagem.alturaPainel / 1000).toFixed(2)} m deitada > carroceria ${(veic.L / 1000).toFixed(2)} m → ` + u.aviso; }
      else { u.transporte = "especial"; u.aviso = `largura ${(u.L / 1000).toFixed(2)} m deitada > carroceria e não tem como ir em pé: transporte especial`; } }
    if (u.transporte === "normal" && u.A + veic.assoalho > LEGAL.alturaTotalMax) { u.transporte = "especial"; u.aviso = (u.aviso ? u.aviso + " · " : "") + `altura total ${((u.A + veic.assoalho) / 1000).toFixed(2)} m > 4,40 m: transporte especial`; }
  }
  if (gcModo === "engradado") for (const u of unidades) if (u.tipo === "PACOTE" && u.gc && !u.emPe && u.transporte === "normal" && cabeEmPe(u, "engradado", veic)) porEmPe(u, "engradado");
  if (gcModo === "engradadoDeitado") for (const u of unidades) if (u.tipo === "PACOTE" && u.gc && !u.emPe && u.transporte === "normal") porEngradadoDeitado(u);
  if (perfil.planos === "engradado") for (const u of unidades) if (u.tipo === "PACOTE" && !u.gc && !u.grade && !u.emPe && u.transporte === "normal" && (u.plano || u.membros.every((m) => m.A <= 60))) porEngradadoDeitado(u);
  if (perfil.grades === "engradado") for (const u of unidades) if (u.tipo === "PACOTE" && u.grade && u.transporte === "normal") porEngradadoDeitado(u);
}

/**
 * @param {object[]} pecasBase  peças individuais (expandirPecas), já orientadas
 * @param {object} perfil  um de PERFIS
 * @param {string} gcModo  "topo" | "engradado" | "engradadoDeitado" | "pilha"
 * @param {{prefixo:string, sequencia:boolean}} ctx
 */
export function montarUnidades(pecasBase, perfil, gcModo, ctx) {
  const seq = { n: 0 }, PAC_P = { ...PAC, ...(perfil.pac || {}) };
  const pecas = pecasBase.filter((p) => !p.semCaixa).map((p) => ({ ...p }));
  const unidades = [];
  // ⚠ peça com medida ESTIMADA (fora do IFC: escada móvel, contrapeso, batente) só viaja embalada — Vitor (13/09/2026):
  // "vc só deve fazer pacote no caso para esses itens, exemplo de caixas". Vai para a caixa de madeira, nunca solta nem em feixe.
  const modeladas = pecas.filter((p) => !p.estimada), estimadas = pecas.filter((p) => p.estimada);
  pacotesGuardaCorpo(modeladas, ctx, gcModo, unidades, seq);
  pacotesGrade(modeladas, ctx, unidades, seq);
  const barra = pacotesPlanosEFeixes(modeladas, ctx, PAC_P, unidades, seq);
  caixasDeMiudos(modeladas, ctx, perfil, unidades, seq);
  if (estimadas.length) caixasDeMiudos(estimadas, ctx, perfil, unidades, seq, () => true);
  for (const u of modeladas.filter((x) => !ehGC(x) && !ehGrade(x) && !ehPequena(x) && !barra(x) && !ehPlana(x))) unidades.push({ ...u, tipo: "PECA", rotulo: u.marca, membros: [u] });
  for (const u of unidades) { u.classe = classe(u); if (!u.nivel) { u.nivel = Math.min(...u.membros.map((m) => m.nivel || 0)); u.nivelNome = (u.membros.find((m) => m.nivel === u.nivel) || u.membros[0]).nivelNome || null; u.tipoSeq = Math.min(...u.membros.map((m) => m.tipoSeq || 2)); } }
  classificarTransporte(unidades, perfil, gcModo, ctx.veiculos?.carreta || VEICULOS.carreta);
  return unidades;
}
