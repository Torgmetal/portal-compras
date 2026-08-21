import { prisma } from "@/lib/prisma";

// Mapa funcionarioId → horas do Controle de Ponto (HE por %, faltas, atrasos) de uma
// competência. Usado pra semear/atualizar a Folha a partir do Ponto (RH ajusta depois).
export async function mapaPontoCompetencia(competencia) {
  const mapa = new Map();
  const ponto = await prisma.pontoCompetencia.findUnique({
    where: { competencia },
    include: { itens: { select: {
      funcionarioId: true, horasExtras50: true, horasExtras60: true, horasExtras80: true,
      horasExtras100: true, horasExtras150: true, faltas: true, atrasos: true, adicionalNoturno: true,
    } } },
  }).catch(() => null);
  if (!ponto) return mapa;
  for (const p of ponto.itens) {
    if (!p.funcionarioId) continue;
    mapa.set(p.funcionarioId, {
      heHoras50: p.horasExtras50 || 0,
      heHoras60: p.horasExtras60 || 0,
      heHoras80: p.horasExtras80 || 0,
      heHoras100: p.horasExtras100 || 0,
      heHoras150: p.horasExtras150 || 0,
      faltasHoras: p.faltas || 0,
      atrasosHoras: p.atrasos || 0,
      adNoturnoHoras: p.adicionalNoturno || 0,
    });
  }
  return mapa;
}

/** Divisor do valor-hora a partir da jornada semanal (44h → 220). */
export function divisorPorJornada(jornadaHoras) {
  const j = Number(jornadaHoras) || 44;
  return Math.round(j * 5) || 220;
}
