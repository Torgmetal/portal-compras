// Posicionamento das unidades na carroceria por MAPA DE ALTURA: célula a célula, a unidade entra no
// lugar mais baixo (ou mais alto, se é delicada numa carga mista) em que cabe com apoio suficiente.
import { GRADE_CARGA, MEDIDAS, VEICULOS } from "./premissas";
import { ehQuadroVazado } from "./classificar";

const { MADEIRA, FOLGA, CEL } = MEDIDAS;
export const CAMPOS = ["x", "y", "z", "sobre", "girada", "fx", "fz", "nivelPilha", "camada", "pilha", "semLugar"];
export const fotografar = (us) => us.map((u) => [u, Object.fromEntries(CAMPOS.map((c) => [c, u[c]]))]);
export const restaurar = (snap) => { for (const [u, s] of snap) for (const c of CAMPOS) { if (s[c] === undefined) delete u[c]; else u[c] = s[c]; } };
export const limpar = (u) => { for (const c of CAMPOS) delete u[c]; };

/** Contexto mutável de uma simulação (nada de estado de módulo: duas simulações não se misturam). */
export const novoContexto = (op = {}) => ({ prefixo: op.prefixo || "", sequencia: !!op.sequencia, janela: op.janela || MEDIDAS.JANELA, cel: op.cel || CEL, calco: MEDIDAS.CALCO, modoGrupo: "", reservaTopo: 0, veiculos: op.veiculos || VEICULOS, frete: op.frete });

// a carroceria não cresce para caber a célula
export function novaCarga(veic, zona, ctx) {
  const cel = ctx.cel, nx = Math.floor((veic.C - zona) / cel), nz = Math.floor(veic.L / cel);
  return { veicKey: veic.chave, veic, zonaGC: zona, nx, nz, cel, emCamadas: ctx.modoGrupo === "grades", alt: new Float32Array(nx * nz), dono: new Array(nx * nz).fill(null), tampa: new Uint8Array(nx * nz), nivel: new Uint8Array(nx * nz), itens: [], peso: 0, altura: 0, pilhas: [] };
}
// pilha de guarda-corpo DEITADO (Vitor, 09/09): zona própria na frente, o mais comprido embaixo, nada em cima
export function colocarPilha(c, pilha) {
  let z = FOLGA; const colunas = [];
  for (const u of [...pilha].sort((a, b) => (b.C - a.C) || (b.kg - a.kg))) {
    let col = colunas.find((k) => k.altura + MADEIRA + u.A <= c.veic.alturaUtil && u.L + FOLGA <= k.larg);
    if (!col) { const larg = u.L + FOLGA; if (z + larg > c.veic.L) { u.semLugar = true; continue; } col = { z0: z, larg, altura: 0, n: 0 }; z += larg; colunas.push(col); }
    u.x = FOLGA; u.z = col.z0 + (col.larg - u.L) / 2; u.y = col.altura + (col.n ? MADEIRA : 0); u.pilha = true; u.camada = col.n; u.nivelPilha = col.n; u.fx = u.C; u.fz = u.L;
    col.altura = u.y + u.A; col.n++; c.itens.push(u); c.peso += u.kg; c.altura = Math.max(c.altura, col.altura);
  }
  c.pilhas = colunas;
}
// tampa: 1 nada em cima · 2 só engradado · 3 só delicado · 4 só guarda-corpo · 5 só caixa/delicado · 6 só a mesma marca (quadro vazado)
// em cima de quadro vazado só outro quadro do mesmo tamanho (mesma marca, ou C e L iguais a 5 %): pórtico encaixa em pórtico
const marcaDe = (u) => (u.membros?.[0] || u).marca;
const encaixaNoQuadro = (u, dono) => !!dono && ehQuadroVazado(u) && (marcaDe(u) === marcaDe(dono) || (Math.abs(u.C - dono.C) <= 0.05 * dono.C && Math.abs(u.L - dono.L) <= 0.05 * dono.L));
const bloqueia = (t, u, delic, dono) => t === 1 || (t === 2 && u.tipo !== "ENGRADADO") || (t === 3 && !delic) || (t === 4 && !u.gc) || (t === 5 && !(u.tipo === "CAIXA" || delic)) || (t === 6 && !encaixaNoQuadro(u, dono));

function avaliarPosicao(c, u, perfil, ctx, pos, tetoUtil, pref, melhor) {
  const { ix, iz, cx, cz } = pos, NZ = c.nz, delic = u.classe === 3 && !u.emPe, delicAlto = delic && !c.emCamadas;
  let topo = 0, nivelBase = 0;
  for (let a = ix; a < ix + cx; a++) for (let b = iz; b < iz + cz; b++) { const k = a * NZ + b;
    if (bloqueia(c.tampa[k], u, delic, c.dono[k])) return null;
    const h = c.alt[k]; if (h > topo) topo = h; if (c.nivel[k] > nivelBase) nivelBase = c.nivel[k]; }
  const y = topo > 0 ? topo + MADEIRA : 0; if (y + u.A > tetoUtil) return null;
  if (topo > 0 && (u.soChao || nivelBase + 1 > perfil.niveisMax)) return null; // ajuste "no chão": só no assoalho
  // custo provisório: se já não bate o melhor, nem olha os apoios
  const custoBase = (delicAlto ? -y * 1000 : pref === "empilhar" && y > 0 ? -1e6 + y * 100 : y * 1000) - ix * 2;
  if (melhor && custoBase > melhor.custo + 60) return null;
  const donos = new Set(); let nTopo = 0, nCel = 0;
  for (let a = ix; a < ix + cx; a++) for (let b = iz; b < iz + cz; b++) { const k = a * NZ + b; nCel++; if (topo - c.alt[k] <= ctx.calco) nTopo++; if (c.dono[k]) donos.add(c.dono[k]); }
  const baixo = [...donos];
  if (topo > 0) {
    // em pé só no assoalho — exceto engradado sobre engradado quando o perfil deixa (2 níveis)
    if (u.emPe && !(u.tipo === "ENGRADADO" && perfil.engradadoEmpilha && nivelBase === 1 && baixo.every((d) => d.tipo === "ENGRADADO"))) return null;
    if (u.tipo !== "PALLET" && baixo.some((d) => d.tipo === "PALLET")) return null;
    if (perfil.pesadoSobreLeve === "proibido" && baixo.some((d) => u.kg > d.kg * 1.5)) return null;
    // apoio PARCIAL: ≥ 60 % da base no nível mais alto (80 % na carga em camadas) e as duas pontas apoiadas
    if (nTopo / nCel < (c.emCamadas ? GRADE_CARGA.apoioMin : (perfil.apoioMin ?? 0.6))) return null;
    const ponta = Math.max(1, Math.floor(cx * 0.15)); let ini = 0, fim = 0;
    for (let a = ix; a < ix + ponta; a++) for (let b = iz; b < iz + cz; b++) if (topo - c.alt[a * NZ + b] <= ctx.calco) ini++;
    for (let a = ix + cx - ponta; a < ix + cx; a++) for (let b = iz; b < iz + cz; b++) if (topo - c.alt[a * NZ + b] <= ctx.calco) fim++;
    if (!ini || !fim) return null; }
  // mais baixo primeiro, depois para o fundo, encostado na lateral; atravessada só se compensar
  const custo = custoBase + (u.embalagem?.tipo === "cavalete" ? 40 : 1) * Math.min(iz, NZ - iz - cz) + (pos.girada ? 3 : 0);
  return { ...pos, y, custo, baixo, nivel: topo > 0 ? nivelBase : 0 };
}

/** Tenta pôr a unidade na carga; devolve true e grava x/y/z quando cabe. */
export function tentaPor(c, u, perfil, ctx, pref = "chao") {
  // reservaTopo: numa tentativa com reserva, a peça rígida para abaixo do teto para sobrar lugar para os delicados (guarda-corpo) em cima
  const veic = c.veic, NX = c.nx, NZ = c.nz, cel = c.cel, delicada = u.classe === 3 && !u.emPe;
  const tetoUtil = c.emCamadas ? Math.min(veic.alturaUtil, GRADE_CARGA.teto) : veic.alturaUtil - (delicada ? 0 : (ctx.reservaTopo || 0));
  // deitada no sentido da carroceria ou ATRAVESSADA (peça curta cabe de lado e fecha buraco)
  const opcoes = [[u.C, u.L, false]]; if (u.C + FOLGA <= veic.L && u.C !== u.L) opcoes.push([u.L, u.C, true]);
  let melhor = null;
  for (const [fx, fz, girada] of opcoes) {
    const cx = Math.ceil((fx + FOLGA) / cel), cz = Math.ceil((fz + FOLGA) / cel);
    for (let ix = 0; ix + cx <= NX; ix++) for (let iz = 0; iz + cz <= NZ; iz++) {
      const r = avaliarPosicao(c, u, perfil, ctx, { ix, iz, cx, cz, fx, fz, girada }, tetoUtil, pref, melhor);
      if (r && (!melhor || r.custo < melhor.custo)) melhor = r;
    }
  }
  if (!melhor) return false;
  const { ix, iz, y, cx, cz, fx, fz, girada, baixo, nivel } = melhor;
  Object.assign(u, { x: c.zonaGC + ix * cel + FOLGA / 2, z: iz * cel + FOLGA / 2, y, girada, fx, fz, nivelPilha: nivel, sobre: baixo.map((d) => d.id), pilha: false });
  const sobrePallet = baixo.some((d) => d.tipo === "PALLET");
  for (let a = ix; a < ix + cx; a++) for (let b = iz; b < iz + cz; b++) { const k = a * NZ + b; c.alt[k] = y + u.A; c.dono[k] = u; c.nivel[k] = nivel + 1;
    if (u.nadaEmCima) c.tampa[k] = 1; // ajuste "nada em cima"
    else if (u.emPe) c.tampa[k] = u.tipo === "ENGRADADO" && perfil.engradadoEmpilha && nivel === 0 ? 2 : 1;
    else if (u.gc) c.tampa[k] = 4; // guarda-corpo nunca por baixo de nada que não seja guarda-corpo
    else if (u.tipo === "CAIXA") c.tampa[k] = 5;
    else if (ehQuadroVazado(u)) c.tampa[k] = 6; // pórtico/treliça deitado: só outro igual encaixa em cima
    else if (u.classe === 3 && (u.tipo !== "PALLET" || sobrePallet)) c.tampa[k] = perfil.delicadoSobreDelicado && u.tipo !== "PALLET" ? 3 : 1; }
  c.itens.push(u); c.peso += u.kg; c.altura = Math.max(c.altura, y + u.A);
  return true;
}

/** Empacota a lista em cargas do veículo, na ordem dada (guloso). */
export function empacotar(ordem, veicKey, perfil, ctx, pilha = [], pref = "chao", consolidarDepois = true) {
  const veic = ctx.veiculos[veicKey];
  for (const u of ordem) limpar(u); for (const u of pilha) limpar(u);
  const cargas = []; let carga = pilha.length ? novaCarga(veic, Math.max(...pilha.map((u) => u.C)) + FOLGA * 2, ctx) : novaCarga(veic, 0, ctx);
  if (pilha.length) colocarPilha(carga, pilha);
  for (const u of ordem) {
    let ok = false;
    const abertas = ctx.sequencia ? cargas.slice(-ctx.janela).concat([carga]) : cargas.concat([carga]);
    for (const c of abertas) { if (c.peso + u.kg > veic.pesoMax) continue; if (tentaPor(c, u, perfil, ctx, pref)) { ok = true; break; } }
    if (!ok) { if (carga.itens.length) cargas.push(carga); carga = novaCarga(veic, 0, ctx); if (!tentaPor(carga, u, perfil, ctx, pref)) u.semLugar = true; }
  }
  if (carga.itens.length) cargas.push(carga);
  return consolidarDepois ? consolidar(cargas, perfil, ctx, pref) : cargas;
}

const ordemSequencia = (a, b) => (a.nivel - b.nivel) || (a.tipoSeq - b.tipoSeq) || (a.classe - b.classe) || (area(b) - area(a)) || (b.kg - a.kg);
const ordemSequenciaComp = (a, b) => (a.nivel - b.nivel) || (a.tipoSeq - b.tipoSeq) || (a.classe - b.classe) || (b.C - a.C) || (area(b) - area(a)) || (b.kg - a.kg);
export const area = (u) => Math.round(u.C * u.L / 5e5);

// carga leve (≤ 30 % do peso) que sobrou no meio da sequência: redistribui nas vizinhas ou remonta a UNIÃO com uma delas
export function consolidar(cargas, perfil, ctx, pref) {
  if (!ctx.sequencia) return cargas;
  for (let i = cargas.length - 1; i >= 0; i--) {
    const c = cargas[i]; if (cargas.length < 2 || c.peso > 0.3 * c.veic.pesoMax || c.itens.some((u) => u.pilha)) continue;
    const alvos = cargas.filter((x, j) => x !== c && Math.abs(j - i) <= ctx.janela);
    const snaps = alvos.map((x) => [x, { alt: x.alt.slice(), dono: x.dono.slice(), tampa: x.tampa.slice(), nivel: x.nivel.slice(), itens: x.itens.slice(), peso: x.peso, altura: x.altura }]);
    const itens = [...c.itens].sort((a, b) => (area(b) - area(a)) || (b.kg - a.kg)), fot = fotografar(itens);
    let ok = true;
    for (const u of itens) { limpar(u); let posto = false; for (const x of alvos) { if (x.peso + u.kg > x.veic.pesoMax) continue; if (tentaPor(x, u, perfil, ctx, pref)) { posto = true; break; } } if (!posto) { ok = false; break; } }
    if (ok) { cargas.splice(i, 1); continue; }
    for (const [x, sn] of snaps) Object.assign(x, sn); restaurar(fot);
    // a inserção falha por GEOMETRIA (assoalho picado); remonta do zero a união com UMA vizinha, calço de 300 mm
    const vizinhas = cargas.map((x, j) => ({ x, d: Math.abs(j - i) })).filter(({ x, d }) => x !== c && d <= ctx.janela && x.veicKey === c.veicKey && !x.itens.some((u) => u.pilha) && x.peso + c.peso <= c.veic.pesoMax).sort((p, q) => p.d - q.d);
    for (const { x } of vizinhas) {
      const j = cargas.indexOf(x), uniao = x.itens.concat(c.itens), fot2 = fotografar(uniao); let fundiu = false;
      for (const cmp of [ordemSequencia, ordemSequenciaComp]) for (const pr of ["chao", "empilhar"]) {
        ctx.calco = MEDIDAS.CALCO_FUSAO; const nova = empacotar([...uniao].sort(cmp), c.veicKey, perfil, ctx, [], pr, false); ctx.calco = MEDIDAS.CALCO;
        if (nova.length === 1 && nova[0].itens.length === uniao.length && !uniao.some((u) => u.semLugar)) { cargas[j] = nova[0]; cargas.splice(i, 1); fundiu = true; break; }
        restaurar(fot2); for (const u of uniao) delete u.semLugar; }
      if (fundiu) break;
    }
  }
  return cargas;
}
