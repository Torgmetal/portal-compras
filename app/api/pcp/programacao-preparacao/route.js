// GET /api/pcp/programacao-preparacao
//   → o que foi programado para cada dia da preparação e o que de fato saiu.
//
// Vitor (03/09/2026): "após o dia de execução você precisa trazer o status do que foi planejado e
// foi executado de fato; aí sim, caso tenha atendido, a fila já puxa outros projetos que poderão
// estar já liberados para iniciar; ou, se por alguma razão não finalizou na data correta, mostrar
// esse atraso levando todas as outras programações para frente. Esse acompanhamento será através
// do Syneco com os apontamentos mostrados".
//
// ⚠⚠ O DIA VEM DA FILA DE CORTE, não de uma tabela nova: `corteDiaProgramado` é onde a programação
// dia a dia já mora (ver /api/pcp/fila-corte). E o `corteDiaOriginal` é escrito uma única vez — é
// dele que o atraso é contado, senão adiar a peça apagaria o atraso junto.
//
// ⚠ EXECUTADO = A MESMA RÉGUA DO RESTO DO PORTAL (`pecaCortada`): conclusão manual OU baixa total
// no Syneco. Medir aqui por outro caminho faria o dia fechar numa tela e não fechar noutra.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { SO_FABRICACAO } from "@/lib/lista-pecas";
import { OP_VIVA } from "@/lib/op-viva";
import { pecaCortada } from "@/lib/liberacao-producao";
import { META_KG_DIA_PREPARACAO } from "@/lib/capacidade-preparacao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ROLES = ["ADMIN", "PCP", "PLANEJAMENTO", "PRODUCAO"];
const iso = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);

export async function GET() {
  try { await requireRole(ROLES); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const pecas = await prisma.pecaConjunto.findMany({
    where: { ...SO_FABRICACAO, ...OP_VIVA, NOT: { tipoPeca: "CONJUNTO" }, corteDiaProgramado: { not: null } },
    select: {
      id: true, marca: true, qte: true, qteProduzida: true, pesoTotalKg: true,
      corteDiaProgramado: true, corteDiaOriginal: true, corteConcluidoEm: true,
      op: { select: { numero: true } },
    },
    take: 8000,
  });

  const dias = new Map();
  for (const p of pecas) {
    const d = iso(p.corteDiaProgramado);
    if (!d) continue;
    if (!dias.has(d)) dias.set(d, { dia: d, planejadoKg: 0, planejadoPc: 0, feitoKg: 0, feitoPc: 0, abertoKg: 0, abertoPc: 0, adiadas: 0, obras: new Set() });
    const g = dias.get(d);
    const qte = Number(p.qte) || 0;
    const kg = Number(p.pesoTotalKg) || 0;
    const feitoQt = pecaCortada(p) ? qte : Math.min(qte, Number(p.qteProduzida) || 0);
    // ⚠ o kg feito é PROPORCIONAL às peças cortadas: a marca com 8 de 12 peças não é "nada feito"
    // nem "tudo feito", e é essa fração que diz quanto sobrou para o dia seguinte.
    const feitoKg = qte > 0 ? (kg * feitoQt) / qte : 0;
    g.planejadoKg += kg; g.planejadoPc += qte;
    g.feitoKg += feitoKg; g.feitoPc += feitoQt;
    g.abertoKg += kg - feitoKg; g.abertoPc += qte - feitoQt;
    // ⚠ peça adiada continua contando o atraso pelo dia ORIGINAL — é o que ele pediu ao dizer que
    // o que não fechou "leva todas as outras programações para frente".
    if (p.corteDiaOriginal && iso(p.corteDiaOriginal) !== d) g.adiadas++;
    if (p.op?.numero) g.obras.add(p.op.numero);
  }

  const hoje = new Date().toISOString().slice(0, 10);
  const lista = [...dias.values()]
    .map((g) => ({
      ...g,
      obras: [...g.obras].sort(),
      planejadoKg: Math.round(g.planejadoKg), feitoKg: Math.round(g.feitoKg), abertoKg: Math.round(g.abertoKg),
      passou: g.dia < hoje,
      // fechou = nada em aberto. Atrasado = o dia passou e sobrou.
      fechou: g.abertoPc <= 0,
      atrasado: g.dia < hoje && g.abertoPc > 0,
    }))
    .sort((a, b) => a.dia.localeCompare(b.dia));

  return NextResponse.json({ metaKgDia: META_KG_DIA_PREPARACAO, hoje, dias: lista });
}
