// Posicionamento das unidades na carroceria por MAPA DE ALTURA DO AÇO: célula a célula, a unidade entra no
// lugar mais baixo (ou mais alto, se é delicada numa carga mista) em que cabe com caibro sobre aço de verdade.
import { GRADE_CARGA, MEDIDAS, VEICULOS } from "./premissas";
import { baseCompativelParaCaixa } from "./apoios";
import { ehQuadroVazado, temBaseDeMadeira } from "./classificar";
import { caibrosApoiados, celulasDoCaibro, perfilNaGrade } from "./perfil-apoio";

const { MADEIRA, FOLGA, CEL } = MEDIDAS;
// caibros/apoioMotor/posMotor: o apoio conferido no aço real e onde o volume estava (lib/carga/apoio-motor.js)
export const CAMPOS = ["x", "y", "z", "sobre", "girada", "fx", "fz", "nivelPilha", "camada", "pilha", "semLugar", "caibros", "apoioMotor", "posMotor"];
export const fotografar = (us) => us.map((u) => [u, Object.fromEntries(CAMPOS.map((c) => [c, u[c]]))]);
export const restaurar = (snap) => { for (const [u, s] of snap) for (const c of CAMPOS) { if (s[c] === undefined) delete u[c]; else u[c] = s[c]; } };
export const limpar = (u) => { for (const c of CAMPOS) delete u[c]; };

/** Contexto mutável de uma simulação (nada de estado de módulo: duas simulações não se misturam). */
// perfis: aço real de cada peça (lib/carga/perfil-apoio.js), por id da peça — vazio = caixa envolvente cheia
export const novoContexto = (op = {}) => ({ prefixo: op.prefixo || "", sequencia: !!op.sequencia, janela: op.janela || MEDIDAS.JANELA, cel: op.cel || CEL, modoGrupo: "", reservaTopo: 0, veiculos: op.veiculos || VEICULOS, frete: op.frete, perfis: op.perfis || new Map(), grades: new Map() });

// a carroceria não cresce para caber a célula
export function novaCarga(veic, zona, ctx) {
  const cel = ctx.cel, nx = Math.floor((veic.C - zona) / cel), nz = Math.floor(veic.L / cel);
  // aço já carregado em cada célula: apoio = pelo centro das colunas (onde o caibro assenta; quem pôs: donoApoio),
  // alto = por toda célula que o aço toca (colisão) · dono/tampa/nivel = o retângulo ocupado
  return { veicKey: veic.chave, veic, zonaGC: zona, nx, nz, cel, emCamadas: ctx.modoGrupo === "grades", apoio: new Float32Array(nx * nz), alto: new Float32Array(nx * nz), donoApoio: new Array(nx * nz).fill(null), dono: new Array(nx * nz).fill(null), tampa: new Uint8Array(nx * nz), nivel: new Uint8Array(nx * nz), itens: [], peso: 0, altura: 0, pilhas: [] };
}
// pilha de guarda-corpo DEITADO (Vitor, 09/09): zona própria na frente, o mais comprido embaixo, nada em cima
export function colocarPilha(c, pilha) {
  let z = FOLGA; const colunas = [];
  for (const u of [...pilha].sort((a, b) => (b.C - a.C) || (b.kg - a.kg))) {
    let col = colunas.find((k) => k.altura + MADEIRA + u.A <= c.veic.alturaUtil && u.L + FOLGA <= k.larg);
    if (!col) { const larg = u.L + FOLGA; if (z + larg > c.veic.L) { u.semLugar = true; continue; } col = { z0: z, larg, altura: 0, n: 0 }; z += larg; colunas.push(col); }
    // a de baixo também vai sobre caibro: aço nunca direto no assoalho
    u.x = FOLGA; u.z = col.z0 + (col.larg - u.L) / 2; u.y = col.altura + MADEIRA; u.pilha = true; u.camada = col.n; u.nivelPilha = col.n; u.fx = u.C; u.fz = u.L;
    col.altura = u.y + u.A; col.n++; c.itens.push(u); c.peso += u.kg; c.altura = Math.max(c.altura, col.altura);
  }
  c.pilhas = colunas;
}
// tampa: 1 nada em cima · 2 só engradado · 3 só delicado · 4 só guarda-corpo · 5 só caixa/delicado · 6 só a mesma marca (quadro vazado)
// em cima de quadro vazado só outro quadro do mesmo tamanho (mesma marca, ou C e L iguais a 5 %): pórtico encaixa em pórtico
const marcaDe = (u) => (u.membros?.[0] || u).marca;
const encaixaNoQuadro = (u, dono) => !!dono && ehQuadroVazado(u) && (marcaDe(u) === marcaDe(dono) || (Math.abs(u.C - dono.C) <= 0.05 * dono.C && Math.abs(u.L - dono.L) <= 0.05 * dono.L));
const bloqueia = (t, u, delic, dono) => t === 1 || (t === 2 && u.tipo !== "ENGRADADO") || (t === 3 && !delic) || (t === 4 && !u.gc) || (t === 5 && !(u.tipo === "CAIXA" || delic)) || (t === 6 && !encaixaNoQuadro(u, dono));

// perfil do aço do volume na grade da carroceria, por orientação (calculado uma vez por simulação)
function gradeDoVolume(u, ctx, cel, cx, cz, girada) {
  const chave = `${u.id}|${cel}|${cx}|${cz}|${girada ? 1 : 0}`;
  let g = ctx.grades.get(chave);
  if (!g) { g = perfilNaGrade(u, ctx.perfis, { cel, cx, cz, girada, folga: FOLGA }); ctx.grades.set(chave, g); }
  return g;
}

// custo da posição pela altura: mais baixo primeiro; "empilhar" prefere qualquer lugar em cima ao assoalho;
// delicado numa carga mista vai para o alto (nada sobe nele). ⚠ "no chão" é o volume sobre o caibro do assoalho,
// que agora fica a 10 cm (y > 0) — é o `chao`, e não o y, que separa assoalho de empilhado.
const custoDaAltura = (y, pref, delicAlto, chao) => (delicAlto ? -y * 1000 : pref === "empilhar" && !chao ? -1e6 + y * 100 : y * 1000);

function avaliarPosicao(c, u, perfil, ctx, pos, tetoUtil, pref, melhor) {
  const { ix, iz, cx, cz, pg } = pos, NZ = c.nz, delic = u.classe === 3 && !u.emPe, delicAlto = delic && !c.emCamadas;
  // ⚠⚠ ENCOSTADO NA CABECEIRA: x cresce da cabine para trás (lib/carga/caminhao-3d.js), então a preferência é o x MENOR —
  // cada volume encosta no da frente e a carga vai da cabine para trás. O `- ix * 2` de antes mandava tudo para o fim
  // da carroceria e abria vão na frente de cada pilha: medido na OP-118, 30 volumes com mais de 1 m livre à frente,
  // espaço para "correr" numa frenagem. Vitor (24/09/2026): "esse vão pode ser um problema no transporte?".
  const extra = (u.embalagem?.tipo === "cavalete" ? 40 : 1) * Math.min(iz, NZ - iz - cz) + (pos.girada ? 3 : 0) + ix * 2;
  // ⚠⚠ A ALTURA SAI DO AÇO, NÃO DA CAIXA ENVOLVENTE: coluna a coluna, o volume desce até o aço dele ficar um
  // caibro acima do aço de baixo. É o que deixa a coluna de cima DESENCONTRADA da de baixo, com a chapa de base
  // fora do corpo da outra, corpo sobre corpo — pela caixa (550 × 550 da chapa), a de cima ficava 37 cm no ar.
  // ⚠⚠ AÇO NUNCA DIRETO NO ASSOALHO: onde não há aço embaixo, o volume fica um caibro acima do piso. Vitor (24/09/2026):
  // "sempre com madeira para conseguir retirar com facilidade" — é por onde passam o garfo e a cinta. Caixa, engradado
  // e palete já têm base de madeira.
  const sobChao = temBaseDeMadeira(u) ? 0 : MADEIRA;
  let y = 0, nivelBase = 0, sobreAco = false, ocupado = false;
  for (let a = 0; a < cx; a++) for (let b = 0; b < cz; b++) { const k = (ix + a) * NZ + iz + b;
    const tp = c.tampa[k]; if (tp && bloqueia(tp, u, delic, c.dono[k])) return null;
    if (c.dono[k]) ocupado = true; if (c.nivel[k] > nivelBase) nivelBase = c.nivel[k];
    // a altura é conta de COLISÃO: o aço que raspa a célula também bate (retrato conservador dos dois lados)
    const f = pg.fundoMin[a * cz + b]; if (f === Infinity) continue;
    const t = c.alto[k], precisa = t > 0 ? t - f + MADEIRA : sobChao - f;
    if (t > 0) sobreAco = true;
    if (precisa > y) { y = precisa;
      // a altura só sobe no laço e o custo (de empilhado) sobe com ela: se já perde para a melhor posição, nem termina a conta
      if (y + u.A > tetoUtil || (sobreAco && melhor && !delicAlto && custoDaAltura(y, pref, false, false) + extra >= melhor.custo)) return null; } }
  // no assoalho, o retângulo tem de estar livre: peça do chão não se encaixa no vão de outra (vira quebra-cabeça)
  const chao = !sobreAco;
  if (chao) { if (ocupado) return null; y = sobChao; }
  y = Math.ceil(y);
  if (y + u.A > tetoUtil) return null;
  if (!chao && (u.soChao || u.tipo === "PALLET" || (u.baseEmV && u.almaVertical !== false) || nivelBase + 1 > perfil.niveisMax)) return null; // ajuste "no chão": só no assoalho
  // custo provisório: se já não bate o melhor, nem olha os apoios
  let custo = custoDaAltura(y, pref, delicAlto, chao) + extra;
  if (melhor && custo >= melhor.custo) return null;
  const donos = new Set();
  for (let a = ix; a < ix + cx; a++) for (let b = iz; b < iz + cz; b++) { const d = c.dono[a * NZ + b]; if (d) donos.add(d); }
  const baixo = [...donos];
  if (chao) return { ...pos, y, custo, baixo, nivel: 0, chao };
  // em pé só no assoalho — exceto engradado sobre engradado quando o perfil deixa (2 níveis)
  if (u.emPe && !(u.tipo === "ENGRADADO" && perfil.engradadoEmpilha && nivelBase === 1 && baixo.every((d) => d.tipo === "ENGRADADO"))) return null;
  if (u.tipo !== "PALLET" && baixo.some((d) => d.tipo === "PALLET")) return null;
  if (perfil.pesadoSobreLeve === "proibido" && baixo.some((d) => u.kg > d.kg * 1.5)) return null;
  // caixa de madeira só sobre caixa maior e mais pesada, numa camada (a tampa aguenta caixa, não aguenta aço)
  if (u.tipo === "CAIXA" && !baseCompativelParaCaixa({ ...u, x: c.zonaGC + ix * c.cel + FOLGA / 2, z: iz * c.cel + FOLGA / 2, fx: pos.fx, fz: pos.fz }, baixo.filter((b) => Math.abs(b.y + b.A + MADEIRA - y) <= 2), c.itens, MADEIRA)) return null;
  // ⚠⚠ APOIO = CAIBRO SOBRE AÇO DE VERDADE (lib/carga/perfil-apoio.js): as duas pontas e 60 % dos caibros
  // (80 % na carga de grades), com até 15 cm de calço entre o caibro e o aço de baixo.
  const r = caibrosApoiados({ apoio: c.apoio, alto: c.alto, NZ, ix, iz, cx, cz, cel: c.cel, fx: pos.fx, fz: pos.fz, y, pg, rigido: u.tipo !== "PECA", minimo: c.emCamadas ? GRADE_CARGA.apoioMin : (perfil.apoioMin ?? 0.6) });
  if (!r.ok) return null;
  // prefere o volume assentado: ganhar posição à frente não compensa avançar sobre o vazio
  custo += (1 - r.assentado) * 10000 + (1 - r.fracao) * 2000;
  return { ...pos, y, custo, baixo, nivel: nivelBase, linhas: r.linhas };
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
    const cx = Math.ceil((fx + FOLGA) / cel), cz = Math.ceil((fz + FOLGA) / cel), pg = gradeDoVolume(u, ctx, cel, cx, cz, girada);
    for (let ix = 0; ix + cx <= NX; ix++) for (let iz = 0; iz + cz <= NZ; iz++) {
      const r = avaliarPosicao(c, u, perfil, ctx, { ix, iz, cx, cz, fx, fz, girada, pg }, tetoUtil, pref, melhor);
      if (r && (!melhor || r.custo < melhor.custo)) melhor = r;
    }
  }
  if (!melhor) return false;
  const { ix, iz, y, cx, cz, fx, fz, girada, baixo, nivel, pg, chao } = melhor;
  // no assoalho, os caibros vão onde o volume encosta (o piso apoia a largura toda); sem exigir as duas pontas — a peça
  // já está no chão, o caibro é para tirar
  const linhas = chao ? (temBaseDeMadeira(u) ? null : caibrosApoiados({ apoio: c.apoio, alto: c.alto, NZ, ix, iz, cx, cz, cel, fx, fz, y, pg, assoalho: true, exigir: false, minimo: 0 }).linhas) : melhor.linhas;
  // caibros: onde assentam e o aço sob cada um (o 3D desenha o caibro e o calço exatamente aqui)
  let sobre = baixo;
  if (linhas) {
    const quem = new Set(), largura = Math.max(1, Math.round(MADEIRA / cel)), nb = celulasDoCaibro(fz, cel, cz);
    u.caibros = linhas.map((l) => {
      const segs = [];
      for (const k of [...l.celulas].sort((p, q) => (p % NZ) - (q % NZ) || p - q)) {
        const z0 = (k % NZ) * cel, base = Math.round(c.apoio[k]), ult = segs[segs.length - 1];
        if (c.donoApoio[k]) quem.add(c.donoApoio[k]);
        if (ult && ult[1] >= z0 && Math.abs(ult[2] - base) <= 10) { ult[1] = z0 + cel; ult[2] = Math.max(ult[2], base); }
        else if (!(ult && ult[1] > z0)) segs.push([z0, z0 + cel, base]);
      }
      // y0 = face de baixo do caibro (ele encosta no aço do volume, que pode estar acima do fundo da caixa dele);
      // z0..z1 = o trecho que o motor conferiu (e o 3D desenha)
      return { x: Math.round(c.zonaGC + (ix + l.a) * cel + largura * cel / 2), y0: l.y0, z0: iz * cel, z1: (iz + nb) * cel, segs };
    });
    if (quem.size) sobre = [...quem];
    u.apoioMotor = { sobre: sobre.map((d) => d.id) };
  }
  Object.assign(u, { x: c.zonaGC + ix * cel + FOLGA / 2, z: iz * cel + FOLGA / 2, y, girada, fx, fz, nivelPilha: nivel, sobre: sobre.map((d) => d.id), pilha: false });
  u.posMotor = [u.x, u.y, u.z];
  const sobrePallet = baixo.some((d) => d.tipo === "PALLET");
  for (let a = ix; a < ix + cx; a++) for (let b = iz; b < iz + cz; b++) { const k = a * NZ + b; c.dono[k] = u; c.nivel[k] = nivel + 1;
    // o apoio só sobe onde o volume tem aço: no vão do quadro fica o que já estava embaixo
    const t = pg.topo[(a - ix) * cz + (b - iz)]; if (t >= 0 && y + t > c.apoio[k]) { c.apoio[k] = y + t; c.donoApoio[k] = u; }
    const tm = pg.topoMax[(a - ix) * cz + (b - iz)]; if (tm >= 0 && y + tm > c.alto[k]) c.alto[k] = y + tm;
    if (u.nadaEmCima || u.baseEmV) c.tampa[k] = 1; // ajuste "nada em cima"
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
    const snaps = alvos.map((x) => [x, { apoio: x.apoio.slice(), alto: x.alto.slice(), donoApoio: x.donoApoio.slice(), dono: x.dono.slice(), tampa: x.tampa.slice(), nivel: x.nivel.slice(), itens: x.itens.slice(), peso: x.peso, altura: x.altura }]);
    const itens = [...c.itens].sort((a, b) => (area(b) - area(a)) || (b.kg - a.kg)), fot = fotografar(itens);
    let ok = true;
    for (const u of itens) { limpar(u); let posto = false; for (const x of alvos) { if (x.peso + u.kg > x.veic.pesoMax) continue; if (tentaPor(x, u, perfil, ctx, pref)) { posto = true; break; } } if (!posto) { ok = false; break; } }
    if (ok) { cargas.splice(i, 1); continue; }
    for (const [x, sn] of snaps) Object.assign(x, sn); restaurar(fot);
    // A inserção falha por geometria; remonta a união com uma vizinha sem presumir calços.
    const vizinhas = cargas.map((x, j) => ({ x, d: Math.abs(j - i) })).filter(({ x, d }) => x !== c && d <= ctx.janela && x.veicKey === c.veicKey && !x.itens.some((u) => u.pilha) && x.peso + c.peso <= c.veic.pesoMax).sort((p, q) => p.d - q.d);
    for (const { x } of vizinhas) {
      const j = cargas.indexOf(x), uniao = x.itens.concat(c.itens), fot2 = fotografar(uniao); let fundiu = false;
      for (const cmp of [ordemSequencia, ordemSequenciaComp]) for (const pr of ["chao", "empilhar"]) {
        const nova = empacotar([...uniao].sort(cmp), c.veicKey, perfil, ctx, [], pr, false);
        if (nova.length === 1 && nova[0].itens.length === uniao.length && !uniao.some((u) => u.semLugar)) { cargas[j] = nova[0]; cargas.splice(i, 1); fundiu = true; break; }
        restaurar(fot2); for (const u of uniao) delete u.semLugar; }
      if (fundiu) break;
    }
  }
  return cargas;
}
