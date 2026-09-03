// GET /api/pcp/bancadas
//   → o que cada bancada da montagem tem marcado, dia a dia.
//
// Vitor (03/09/2026): "traga uma sugestão de como podemos fazer uma forma de gantt com as bancadas
// mostrando as OPs e os dias que elas vão ocupar em cada bancada" — e, sobre onde: "não acho que
// deve ficar em aba própria, deixa na mesma aba que estamos no /pcp/producao", "em uma parte da
// tela separada para não ficar apertando botão e ficar uma zona".
//
// ⚠⚠ NÃO EXISTE TABELA DE AGENDA. O Gantt é a leitura do que a própria programação já grava:
// `montagemBancada` + `montagemDiaProgramado` no conjunto. Criar um calendário à parte faria a tela
// e a programação divergirem no primeiro reagendamento.
//
// ⚠ DEVOLVE O CONJUNTO, NÃO A BARRA. Quem junta dias em barra é a tela — e é ela também que soma o
// custo em dias-bancada (lib/montagem-capacidade), a mesma régua com que a programação foi feita.
// Somar aqui de outro jeito faria o Gantt acusar estouro num lote que o programador viu caber.
//
// ⚠ SEM BANCADA É INFORMAÇÃO, NÃO SUJEIRA: conjunto com dia e sem posto (hoje, 32 da OP-105) não
// aparece em lugar nenhum do portal. Vem com `bancada: null` e a tela mostra numa faixa própria.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { CONJUNTO_MONTAVEL } from "@/lib/prontidao-conjunto";
import { OP_VIVA } from "@/lib/op-viva";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ROLES = ["ADMIN", "PCP", "PLANEJAMENTO", "PRODUCAO"];
const iso = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);

export async function GET() {
  try { await requireRole(ROLES); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const conj = await prisma.pecaConjunto.findMany({
    where: { ...CONJUNTO_MONTAVEL, ...OP_VIVA, montagemDiaProgramado: { not: null } },
    select: {
      id: true, marca: true, descricao: true, qte: true, pesoTotalKg: true,
      montagemDiaProgramado: true, montagemBancada: true, status: true,
      op: { select: { numero: true } },
    },
    orderBy: [{ montagemDiaProgramado: "asc" }, { montagemBancada: "asc" }, { marca: "asc" }],
    take: 4000,
  });

  return NextResponse.json({
    conjuntos: conj.map((c) => ({
      id: c.id, marca: c.marca, descricao: c.descricao || null,
      opNumero: c.op?.numero || null, qte: c.qte || 1,
      pesoTotalKg: Math.round(Number(c.pesoTotalKg) || 0),
      dia: iso(c.montagemDiaProgramado), bancada: c.montagemBancada || null,
      // ⚠ o que já entrou na montagem não é previsão, é o que está na bancada AGORA — a barra
      // precisa distinguir, senão remarcar o dia de algo em curso parece inofensivo.
      andando: c.status === "MONTAGEM",
    })),
  });
}
