// GET /api/pcp/carga-corte/pecas?maquina=LASER_PERFIL
// Peças do BACKLOG de uma máquina (as que compõem os "dias de carga"): em CORTE,
// ainda não cortadas totalmente. Mesma regra do resumo — pra o expandir bater com
// o número mostrado no card.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  try { await requireRole(["ADMIN", "PCP", "PRODUCAO", "PLANEJAMENTO"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const maquina = (new URL(req.url).searchParams.get("maquina") || "").trim();
  if (!maquina) return NextResponse.json({ error: "Informe a máquina." }, { status: 400 });

  const where = { status: "CORTE", corteConcluidoEm: null };
  if (maquina === "SEM_MAQUINA") where.maquina = null;
  else where.maquina = maquina;

  const raw = await prisma.pecaConjunto.findMany({
    where,
    select: {
      id: true, marca: true, opNumero: true, descricao: true, perfil: true, material: true,
      qte: true, qteProduzida: true, pesoTotalKg: true, comprimentoMm: true, corteIniciadoEm: true,
      op: { select: { numero: true } },
    },
    orderBy: [{ opNumero: "asc" }, { marca: "asc" }],
    take: 5000,
  });

  const pecas = raw
    .filter((p) => { const q = Number(p.qte) || 0, prod = Number(p.qteProduzida) || 0; return !(q > 0 && prod >= q); }) // tira as já cortadas
    .map((p) => {
      const q = Number(p.qte) || 0, prod = Number(p.qteProduzida) || 0;
      const restante = q > 0 ? Math.max(0, q - prod) : q;
      const pesoRest = q > 0 ? (Number(p.pesoTotalKg) || 0) * restante / q : (Number(p.pesoTotalKg) || 0);
      return {
        id: p.id, marca: p.marca, op: p.op?.numero || p.opNumero || null,
        descricao: p.descricao || null, perfil: p.perfil || p.material || null,
        comprimentoMm: p.comprimentoMm || null,
        qte: q, qteProduzida: prod, restante,
        pesoKg: Math.round(pesoRest * 10) / 10,
        iniciada: !!p.corteIniciadoEm || prod > 0,
      };
    });

  return NextResponse.json({ success: true, maquina, total: pecas.length, pecas });
}
