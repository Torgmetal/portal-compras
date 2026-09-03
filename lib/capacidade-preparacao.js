// ─── QUANTO CADA MÁQUINA DA PREPARAÇÃO FAZ POR DIA ─────────────────────────────
//
// Vitor (03/09/2026): "sobre a divisão das máquinas você sabe fazer melhor do que eu, então veja
// para você ajustar isso de acordo com os apontamentos e que de fato atenda essa meta que te
// passei" — a meta é 12.000 kg/dia na preparação.
//
// ⚠⚠ A CAPACIDADE É MEDIDA, NÃO ARBITRADA. Sai do que o Syneco apontou por máquina, dia a dia. Um
// número inventado por máquina faria o lote "caber" no papel e estourar na fábrica — que é
// exatamente o que a meta agregada de 12 t já fazia: 12 t só de cantoneira não é o mesmo dia que
// 12 t de perfil, e a meta agregada não enxerga isso.
//
// ⚠⚠ P75, NÃO MÉDIA. Mesma régua da capacidade da montagem: a média carrega o dia em que a máquina
// mal rodou (setup, falta de material, meio turno) e puxa o número para baixo; o melhor dia é
// exceção. O p75 é "um bom dia normal", que é o que se pode prometer.
//
// ⚠ MEDIDO EM 03/09/2026, 90 dias de apontamento (kg/dia no p75):
//     perfil 2.843 · chapa 2.407 · tubo 1.864 · cantoneira 1.065 · policorte 419  →  8.598 kg/dia
//   Ou seja: com a mistura de hoje as máquinas juntas NÃO fecham 12 t. Por isso a tela mostra o
//   gargalo por máquina em vez de só somar — a cantoneira estoura muito antes de o total chegar
//   na meta, e é trocando a mistura do lote (mais perfil e chapa) que o dia fecha.
import { prisma } from "@/lib/prisma";

export const META_KG_DIA_PREPARACAO = 12000;
export const DIAS_AMOSTRA = 90;

/** "LASER_CHAPA" (LPC) e "LASER CHAPA" (Syneco) são a mesma máquina. */
export const normalizaMaquina = (m) =>
  String(m || "").trim().toUpperCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");

export const rotuloMaquina = (m) => {
  const n = normalizaMaquina(m);
  if (!n) return "sem máquina";
  return n.replace(/^LASER /, "").toLowerCase();
};

/**
 * kg/dia por máquina, no p75 dos dias apontados.
 * @returns {Promise<{ capacidade: Record<string, number>, amostra: Record<string, number>, totalKgDia: number }>}
 */
export async function capacidadePorMaquina() {
  const desde = new Date();
  desde.setDate(desde.getDate() - DIAS_AMOSTRA);

  const aps = await prisma.mesApontamento.findMany({
    where: { dataInicio: { gte: desde }, produzidoKg: { gt: 0 }, setor: { contains: "corte", mode: "insensitive" } },
    select: { maquina: true, dataInicio: true, produzidoKg: true },
    take: 60000,
  });

  // kg por (máquina, dia) — o apontamento vem por peça, e capacidade é do DIA
  const porDia = new Map();
  for (const a of aps) {
    const m = normalizaMaquina(a.maquina);
    if (!m) continue;
    const dia = new Date(a.dataInicio).toISOString().slice(0, 10);
    const k = `${m}|${dia}`;
    porDia.set(k, (porDia.get(k) || 0) + (Number(a.produzidoKg) || 0));
  }

  const kgsPorMaquina = new Map();
  for (const [k, kg] of porDia) {
    const m = k.split("|")[0];
    if (!kgsPorMaquina.has(m)) kgsPorMaquina.set(m, []);
    kgsPorMaquina.get(m).push(kg);
  }

  const capacidade = {}, amostra = {};
  for (const [m, kgs] of kgsPorMaquina) {
    kgs.sort((a, b) => a - b);
    // ⚠ p75 por posição, sem interpolação: com 5 dias de amostra (é o caso da policorte) qualquer
    // coisa mais fina seria falsa precisão.
    capacidade[m] = Math.round(kgs[Math.min(kgs.length - 1, Math.floor(kgs.length * 0.75))] || 0);
    amostra[m] = kgs.length;
  }
  const totalKgDia = Object.values(capacidade).reduce((s, x) => s + x, 0);
  return { capacidade, amostra, totalKgDia };
}

/**
 * Quantos dias o lote leva, olhando MÁQUINA POR MÁQUINA.
 *
 * ⚠⚠ O DIA É DO GARGALO. Somar tudo e dividir por 12 t diria "1 dia" para um lote que põe 3 t na
 * cantoneira — que sozinha leva quase três. Quem fecha o dia é a máquina mais carregada.
 */
export function diasDoLote(pesoPorMaquina, capacidade) {
  let dias = 0;
  const porMaquina = [];
  for (const [m, kg] of Object.entries(pesoPorMaquina || {})) {
    const cap = Number(capacidade?.[m]) || 0;
    const d = cap > 0 ? kg / cap : null;
    porMaquina.push({ maquina: m, kg, capacidade: cap, dias: d });
    if (d != null) dias = Math.max(dias, d);
  }
  porMaquina.sort((a, b) => (b.dias ?? -1) - (a.dias ?? -1));
  return { dias, porMaquina, gargalo: porMaquina[0]?.maquina || null };
}
