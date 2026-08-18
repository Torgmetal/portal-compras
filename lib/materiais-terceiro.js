// Calcula o MATERIAL a enviar ao terceiro (2º romaneio, pra NF de retorno). Regras do Vitor (17/08):
// só saindo da Preparação (Corte) ou da Montagem; da Solda em diante manda-se o conjunto pronto.
//   • CORTE     → as próprias peças selecionadas (croquis/avulsas) — peso confiável.
//   • MONTAGEM  → expande cada conjunto nos seus croquis, MAS NORMALIZANDO pelo peso real do
//     conjunto (a estrutura da LPC/ConjuntoCroqui infla p/ ~25% dos conjuntos — croqui
//     compartilhado contado em vários conjuntos; sem normalizar o material dava 3,5× o peso real).
// O PESO da lista é o REALMENTE USADO (Vitor: "apenas o que realmente será usado"); a QTD é o
// estoque a mandar: barras (W 6/12m sem folga; leves 6m +1) e chapas (inteira 3000×1500 por
// espessura, ou cortada por perfil). Retorna [{ perfil, descricao, unidade, qtd, pesoKg }].
import { prisma } from "./prisma";
import { casarPerfilComOmie } from "./casar-omie";

const BAR_6M = 6000, BAR_12M = 12000;      // mm
const CHAPA_L = 3000, CHAPA_C = 1500;      // mm
const PESO_CHAPA_POR_MM = (CHAPA_L / 1000) * (CHAPA_C / 1000) * 7850 / 1000; // kg por mm de espessura

const espessuraChapa = (perfil) => {
  const m = String(perfil || "").toUpperCase().match(/CH\s*([\d]+(?:[.,]\d+)?)/);
  return m ? parseFloat(m[1].replace(",", ".")) : 0;
};

// raws: [{ perfil, material, qtd, pesoUnitKg, comprimentoMm }] (qtd pode ser fracionária após normalizar).
function montarMateriais(raws, chapaModo) {
  const chapaCortada = String(chapaModo || "").toUpperCase() === "CORTADA";
  const barras = new Map(); // perfil → { perfil, material, totalLen, peso, maxLen, ehW }
  const chapas = new Map();
  for (const r of raws) {
    const qtd = Number(r.qtd) || 0;
    if (qtd <= 0) continue;
    const perfil = String(r.perfil || "").trim();
    const up = perfil.toUpperCase();
    const peso = (Number(r.pesoUnitKg) || 0) * qtd;      // peso REALMENTE usado
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
    if (g.peso <= 0) continue;
    const barLen = g.ehW && g.maxLen > BAR_6M ? BAR_12M : BAR_6M;
    let n = g.totalLen > 0 ? Math.ceil(g.totalLen / barLen) : 1;
    if (!g.ehW) n += 1;                                    // folga só nos perfis leves (não W)
    out.push({ perfil: g.perfil, descricao: g.material, unidade: `barra ${barLen / 1000}m`, qtd: n, pesoKg: Math.round(g.peso) });
  }
  for (const g of chapas.values()) {
    if (g.peso <= 0) continue;
    if (g.cortada) {
      out.push({ perfil: g.perfil, descricao: g.material, unidade: "chapa cortada", qtd: Math.max(1, Math.round(g.qtd)), pesoKg: Math.round(g.peso) });
    } else {
      const pesoChapa = PESO_CHAPA_POR_MM * (g.esp || 0);
      const n = pesoChapa > 0 ? Math.ceil(g.peso / pesoChapa) : 1;
      out.push({ perfil: `Chapa ${g.esp}mm`, descricao: `${CHAPA_L}×${CHAPA_C}`, unidade: "chapa", qtd: n, pesoKg: Math.round(g.peso) });
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
    const conjuntos = await prisma.pecaConjunto.findMany({ where: { id: { in: pecaIds } }, select: { id: true, qte: true, pesoTotalKg: true } });
    const links = await prisma.conjuntoCroqui.findMany({
      where: { conjuntoId: { in: pecaIds } },
      select: { conjuntoId: true, qtdNoConjunto: true, croqui: { select: { perfil: true, material: true, pesoUnitKg: true, comprimentoMm: true } } },
    });
    const porConj = new Map();
    for (const lk of links) { const a = porConj.get(lk.conjuntoId) || []; a.push(lk); porConj.set(lk.conjuntoId, a); }
    for (const c of conjuntos) {
      const ls = porConj.get(c.id) || [];
      const qte = Number(c.qte) || 1;
      // fator normaliza a expansão dos croquis pro peso REAL do conjunto (LPC infla p/ ~25%).
      const naive = ls.reduce((s, lk) => s + (Number(lk.croqui?.pesoUnitKg) || 0) * (Number(lk.qtdNoConjunto) || 1), 0) * qte;
      const fator = naive > 0 ? (Number(c.pesoTotalKg) || 0) / naive : 0;
      for (const lk of ls) {
        const cr = lk.croqui;
        raws.push({ perfil: cr?.perfil, material: cr?.material, qtd: qte * (Number(lk.qtdNoConjunto) || 1) * fator, pesoUnitKg: cr?.pesoUnitKg, comprimentoMm: cr?.comprimentoMm });
      }
    }
  }
  const mats = montarMateriais(raws, chapaModo);

  // CÓDIGO + DESCRIÇÃO DO OMIE: o romaneio de material vai pro terceiro e pro fiscal, então
  // precisa do item do cadastro (não do perfil interno da Engenharia). Casa cada perfil com os
  // itens de aço da RM daquela OP — que já carregam o código do Omie. (Vitor 18/08.)
  try {
    const alguma = await prisma.pecaConjunto.findFirst({ where: { id: { in: pecaIds } }, select: { opId: true } });
    if (alguma?.opId) {
      const itensRm = await prisma.rMItem.findMany({
        where: { rm: { opId: alguma.opId }, status: { not: "CANCELADO" } },
        select: { codigo: true, descricao: true, largura: true, comprimento: true },
      });
      for (const m of mats) {
        const hit = casarPerfilComOmie(m.perfil, itensRm);
        m.codigoOmie = hit?.codigo || null;
        m.descricaoOmie = hit?.descricao || null;
      }
    }
  } catch { /* sem RM/Omie: segue com o perfil interno */ }

  return mats;
}
