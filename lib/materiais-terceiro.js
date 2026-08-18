// Calcula o MATERIAL BRUTO que deve ser enviado ao terceiro (2º romaneio, pra NF de retorno).
// Não é o peso cortado — é a QUANTIDADE DE BARRAS/CHAPAS de estoque, porque manda-se material
// inteiro (não dá pra mandar cortado 100% no tamanho). Regras do Vitor (17/08):
//   • W (perfil pesado): barra 6 m — ou 12 m se alguma peça passar de 6 m. SEM folga (+0).
//   • Perfis leves (cantoneira, tubo, U, ferro redondo, barra chata…): barra 6 m, +1 barra de folga.
//   • Chapa (CH): chapa inteira 3000×1500 mm por ESPESSURA (peso ÷ peso da chapa), SEM folga.
// Só faz sentido saindo da Preparação (Corte) ou da Montagem — da Solda em diante manda-se o
// conjunto pronto (só o romaneio de peças).
//   • CORTE     → as próprias peças selecionadas (croquis/avulsas).
//   • MONTAGEM  → expande cada conjunto nos seus croquis (× qtdNoConjunto × qtd do conjunto).
// Retorna [{ perfil, descricao, unidade, qtd, pesoKg }].
import { prisma } from "./prisma";

const BAR_6M = 6000, BAR_12M = 12000;      // mm
const CHAPA_L = 3000, CHAPA_C = 1500;      // mm (3,00 × 1,50 m)
const DENS = 7850;                          // kg/m³ (aço)
const PESO_CHAPA_POR_MM = (CHAPA_L / 1000) * (CHAPA_C / 1000) * DENS / 1000; // kg por mm de espessura

const espessuraChapa = (perfil) => {
  const m = String(perfil || "").toUpperCase().match(/CH\s*([\d]+(?:[.,]\d+)?)/);
  return m ? parseFloat(m[1].replace(",", ".")) : 0;
};

// Agrupa os "brutos" (perfil, comprimentoMm, pesoUnitKg, qtd) em barras/chapas.
// chapaModo: "INTEIRA" (default) conta chapas 3000×1500 por espessura; "CORTADA" só o peso das
// peças cortadas por perfil (Vitor: p/ chapa cortada a NF precisa só do peso e de qual chapa).
function montarMateriais(raws, chapaModo) {
  const chapaCortada = String(chapaModo || "").toUpperCase() === "CORTADA";
  const barras = new Map(); // perfil → { perfil, material, totalLen, peso, maxLen, ehW }
  const chapas = new Map(); // key → { … }
  for (const r of raws) {
    const qtd = Number(r.qtd) || 0;
    if (qtd <= 0) continue;
    const perfil = String(r.perfil || "").trim();
    const up = perfil.toUpperCase();
    const peso = (Number(r.pesoUnitKg) || 0) * qtd;
    const comp = Number(r.comprimentoMm) || 0;
    if (up.startsWith("CH")) {
      if (chapaCortada) {
        const g = chapas.get(up) || { cortada: true, perfil: perfil || "—", material: r.material || null, qtd: 0, peso: 0 };
        g.qtd += qtd; g.peso += peso;
        if (!g.material && r.material) g.material = r.material;
        chapas.set(up, g);
      } else {
        const esp = espessuraChapa(perfil);
        const g = chapas.get(`E${esp}`) || { cortada: false, esp, peso: 0 };
        g.peso += peso;
        chapas.set(`E${esp}`, g);
      }
    } else {
      const g = barras.get(up) || { perfil: perfil || "—", material: r.material || null, totalLen: 0, peso: 0, maxLen: 0, ehW: up.startsWith("W") };
      g.totalLen += comp * qtd;
      g.peso += peso;
      if (comp > g.maxLen) g.maxLen = comp;
      if (!g.material && r.material) g.material = r.material;
      barras.set(up, g);
    }
  }

  const out = [];
  for (const g of barras.values()) {
    if (g.totalLen <= 0) continue;
    const barLen = g.ehW && g.maxLen > BAR_6M ? BAR_12M : BAR_6M;
    let n = Math.ceil(g.totalLen / barLen);
    if (!g.ehW) n += 1;                       // folga só nos perfis leves (não W)
    const linear = g.peso / g.totalLen;       // kg/mm
    out.push({ perfil: g.perfil, descricao: g.material, unidade: `barra ${barLen / 1000}m`, qtd: n, pesoKg: Math.round(n * barLen * linear) });
  }
  for (const g of chapas.values()) {
    if (g.cortada) {
      if (g.peso <= 0) continue;
      out.push({ perfil: g.perfil, descricao: g.material, unidade: "chapa cortada", qtd: Math.round(g.qtd), pesoKg: Math.round(g.peso) });
    } else {
      const pesoChapa = PESO_CHAPA_POR_MM * (g.esp || 0); // peso de uma chapa 3000×1500 dessa espessura
      if (pesoChapa <= 0 || g.peso <= 0) continue;
      const n = Math.ceil(g.peso / pesoChapa);            // chapas inteiras, sem folga
      out.push({ perfil: `Chapa ${g.esp}mm`, descricao: `${CHAPA_L}×${CHAPA_C}`, unidade: "chapa", qtd: n, pesoKg: Math.round(n * pesoChapa) });
    }
  }
  return out.sort((a, b) => b.pesoKg - a.pesoKg);
}

export async function computarMateriaisEnvio({ pecaIds, setorEnvio, chapaModo }) {
  const setor = String(setorEnvio || "").toUpperCase();
  if (!Array.isArray(pecaIds) || !pecaIds.length) return [];
  if (setor !== "CORTE" && setor !== "MONTAGEM") return [];

  const raws = [];
  if (setor === "CORTE") {
    const pecas = await prisma.pecaConjunto.findMany({ where: { id: { in: pecaIds } }, select: { perfil: true, material: true, qte: true, pesoUnitKg: true, comprimentoMm: true } });
    for (const p of pecas) raws.push({ perfil: p.perfil, material: p.material, qtd: Number(p.qte) || 0, pesoUnitKg: p.pesoUnitKg, comprimentoMm: p.comprimentoMm });
  } else {
    const conjuntos = await prisma.pecaConjunto.findMany({ where: { id: { in: pecaIds } }, select: { id: true, qte: true } });
    const qteConj = new Map(conjuntos.map((c) => [c.id, Number(c.qte) || 1]));
    const links = await prisma.conjuntoCroqui.findMany({
      where: { conjuntoId: { in: pecaIds } },
      select: { conjuntoId: true, qtdNoConjunto: true, croqui: { select: { perfil: true, material: true, pesoUnitKg: true, comprimentoMm: true } } },
    });
    for (const lk of links) {
      const cr = lk.croqui;
      raws.push({ perfil: cr?.perfil, material: cr?.material, qtd: (qteConj.get(lk.conjuntoId) || 1) * (Number(lk.qtdNoConjunto) || 1), pesoUnitKg: cr?.pesoUnitKg, comprimentoMm: cr?.comprimentoMm });
    }
  }
  return montarMateriais(raws, chapaModo);
}
