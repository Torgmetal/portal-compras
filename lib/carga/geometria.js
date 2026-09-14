// Geometria da peça para o simulador: caixa ORIENTADA a partir da malha do IFC e a orientação em
// que a peça viaja (perfil com a alma em pé, chapa deitada).
import { VEICULOS } from "./premissas";
import { ehFamiliaChapa } from "./classificar";

// ─── caixa orientada: gira a nuvem de pontos em torno de cada eixo (passo 2°) e fica com a menor caixa ───
// Guarda-corpo de escada medido pelos eixos do prédio dá 3,5 × 3,0 m; girado no próprio plano dá 3,8 × 1,1 m.
const rot = (p, eixo, r) => { const c = Math.cos(r), s = Math.sin(r); const [x, y, z] = p;
  return eixo === 2 ? [x * c - y * s, x * s + y * c, z] : eixo === 0 ? [x, y * c - z * s, y * s + z * c] : [x * c + z * s, y, -x * s + z * c]; };

/**
 * @param {ArrayLike<number>} pos  vértices x,y,z intercalados (mm)
 * @returns {{ eixo:number, ang:number, dimsEixos:number[], min:number[] }} giro que dá a menor caixa e as dimensões por eixo depois dele
 */
export function caixaOrientada(pos) {
  const n = pos.length / 3, passo = Math.max(1, Math.floor(n / 4000)), pts = [];
  for (let i = 0; i < n; i += passo) pts.push([pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]]);
  let melhor = null;
  for (const eixo of [0, 1, 2]) for (let g = 0; g < 180; g += 2) {
    const r = g * Math.PI / 180; const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (const p of pts) { const q = rot(p, eixo, r); for (let a = 0; a < 3; a++) { if (q[a] < min[a]) min[a] = q[a]; if (q[a] > max[a]) max[a] = q[a]; } }
    const d = max.map((v, i) => v - min[i]), vol = d[0] * d[1] * d[2];
    if (!melhor || vol < melhor.vol * 0.995) melhor = { eixo, ang: g, vol, dimsEixos: d.map(Math.round), min: min.map(Math.round) };
  }
  return melhor ? { eixo: melhor.eixo, ang: melhor.ang, dimsEixos: melhor.dimsEixos, min: melhor.min } : null;
}

/* ⚠⚠ ORIENTAÇÃO DA PEÇA: PERFIL VIAJA COM A ALMA EM PÉ, CHAPA DEITA. Vitor (12/09/2026), vendo vigas
   tombadas e um feixe de mãos-francesas "flutuando": a caixa orientada escolhia a rotação de menor
   volume e mandava a menor dimensão para baixo — viga de lado. Regra:
   • o modelo do Tekla é Y-UP (índice 1);
   • a caixa orientada só alinha o COMPRIMENTO (giro em torno de eixo horizontal mantém a alma vertical);
   • família de perfil: altura = eixo Y depois do giro; coluna modelada em pé deita, seção maior para cima;
   • família CHAPA: menor dimensão para baixo;
   • "em pé" com altura > 80 cm e > 1,5× a largura é quadro plano (pórtico, painel): deita. */
const UP = 1;
/**
 * @param {string} desc  descrição da peça (decide a família)
 * @param {number[]} dimsEixos  dimensões por eixo X,Y,Z (mm) — da caixa orientada ou da caixa alinhada
 * @param {object|null} obb  giro da caixa orientada ({eixo, ang, min}) quando houver
 * @returns {{ C:number, L:number, A:number, perm:{X:number,Z:number,Y:number}, giro:object|null, almaVertical:boolean }}
 */
export function orientarPeca(desc, dimsEixos, obb, orientacao = "") {
  let d = dimsEixos.slice(), perm = null;
  // ajuste por marca: "deitar" trata como chapa (menor lado para baixo); "almaVertical" força a regra de perfil
  const chapa = orientacao === "deitar" ? true : orientacao === "almaVertical" ? false : ehFamiliaChapa(desc);
  if (!chapa) {
    const iC = d.indexOf(Math.max(...d)); let iA, iL;
    if (iC === UP) { const outros = [0, 1, 2].filter((i) => i !== UP); iA = d[outros[0]] >= d[outros[1]] ? outros[0] : outros[1]; iL = outros.find((i) => i !== iA); }
    else { iA = UP; iL = [0, 1, 2].find((i) => i !== iC && i !== UP); }
    if (d[iA] > 800 && d[iA] > 1.5 * d[iL]) { const t = iA; iA = iL; iL = t; }
    perm = { X: iC, Z: iL, Y: iA }; d = [d[iC], d[iL], d[iA]];
  } else { const ord = [0, 1, 2].sort((a, b) => d[b] - d[a]); perm = { X: ord[0], Z: ord[1], Y: ord[2] }; d = [d[ord[0]], d[ord[1]], d[ord[2]]]; }
  return { C: Math.round(d[0]), L: Math.round(d[1]), A: Math.round(d[2]), perm, giro: obb ? { eixo: obb.eixo, ang: obb.ang, min: obb.min } : null, almaVertical: !chapa };
}

// ⚠ Peça que não está em nenhum IFC da obra (escada móvel, contrapeso, batente, roldana — desenho do cliente,
// modelado à parte) NÃO pode sumir da carga: a Expedição carregaria sem ela. Entra com caixa ESTIMADA pelo peso
// e pela família, marcada `aproximada`, e a tela avisa para conferir. Vitor (13/09/2026): "o ideal seria ignorar
// [o aviso], pois isso vai dar problema para o setor de carregamento". Parafuso/AC (sem peso) fica fora.
const ACO = 7.85e-6; // kg/mm³
export function caixaEstimada(desc, kg) {
  const d = String(desc || "").toUpperCase(), k = Number(kg) || 0;
  if (k <= 0) return null;
  const clamp = (v, a, b) => Math.round(Math.min(b, Math.max(a, v)));
  if (/ESCADA/.test(d)) return [clamp(k / (ACO * 600 * 150 * 0.04), 1500, 6000), 150, 600]; // estrutura vazada: 4 % de aço na caixa
  if (/CONTRA\s*PESO|LASTRO/.test(d)) { const s = Math.cbrt(k / ACO); return [clamp(s, 80, 1000), clamp(s, 80, 1000), clamp(s, 80, 1000)]; } // bloco maciço
  if (k <= 10 || /ROLDANA|BATENTE|PINO|BUCHA|ROSCAD|PARAFUS|PORCA|ARRUELA/.test(d)) return [300, 80, 150]; // miúda: vai para a caixa de madeira
  return [clamp(k / (ACO * 100 * 100 * 0.3), 300, 12000), 100, 100]; // barra genérica 100×100 com 30 % de aço
}

/**
 * Expande a lista (marca × quantidade) em peças individuais com caixa, na orientação de viagem.
 * @param {Array<{marca:string, desc?:string, qtd:number, kgUn:number, nivel?:number, nivelNome?:string, tipoSeq?:number}>} lista
 * @param {Record<string, {obb?:object, dimsEixos?:number[], temGeo?:boolean}>} geometria  por marca (maiúscula)
 */
export function expandirPecas(lista, geometria = {}, ajustes = {}) {
  const pecas = []; let seq = 0;
  for (const p of lista) {
    const marca = String(p.marca || "").toUpperCase(), g = geometria[marca], aj = ajustes[marca] || null;
    // medidas à mão (ajuste por marca) valem acima do IFC e da estimativa: C ao longo de X, A em Y, L em Z
    const manual = aj?.medidas ? [aj.medidas.C, aj.medidas.A, aj.medidas.L] : null;
    const dims = manual || g?.obb?.dimsEixos || g?.dimsEixos, estimada = !dims ? caixaEstimada(p.desc, p.kgUn) : null;
    const o = dims ? orientarPeca(p.desc, dims, manual ? null : (g?.obb || null), aj?.orientacao) : estimada ? orientarPeca(p.desc, estimada, null, aj?.orientacao) : null;
    for (let i = 0; i < (p.qtd || 1); i++) {
      const base = { id: `p${seq++}`, marca, desc: p.desc || "", kg: Number(p.kgUn) || 0, nivel: p.nivel || 0, nivelNome: p.nivelNome || null, tipoSeq: p.tipoSeq || 2, aj };
      pecas.push(o ? { ...base, ...o, temGeo: !manual && !!g?.temGeo, aproximada: !!manual || !g?.obb, estimada: !!estimada, manual: !!manual } : { ...base, semCaixa: true });
    }
  }
  desmontarContraventamentos(pecas);
  return pecas;
}

// ⚠ contraventamento em X vem MONTADO no IFC (T118J20: 7,6 × 7,1 m, 16 kg = 2 tirantes) — Vitor (10/09/2026):
// "vai desmontado, não teremos transporte especial". Mais largo que a carroceria e fino → 2 barras da diagonal.
function desmontarContraventamentos(pecas) {
  const carr = VEICULOS.carreta;
  for (let i = pecas.length - 1; i >= 0; i--) { const u = pecas[i];
    if (u.semCaixa || !/CONTRAVENT/i.test(u.desc || "") || u.L <= carr.L || u.A > 60) continue;
    const diag = Math.round(Math.hypot(u.C, u.L)), sec = Math.max(26, u.A);
    const barra = (k) => ({ ...u, id: `${u.id}d${k}`, desc: `${u.desc} (desmontado: barra ${k}/2 de ${(diag / 1000).toFixed(1)} m)`, kg: u.kg / 2, C: diag, L: sec, A: sec, giro: null, temGeo: false, desmontada: true });
    pecas.splice(i, 1, barra(1), barra(2)); }
}
