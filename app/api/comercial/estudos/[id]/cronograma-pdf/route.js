// POST /api/comercial/estudos/[id]/cronograma-pdf — a folha do cronograma preliminar.
//
// ⚠ FOLHA À PARTE, e não seção da proposta. Tentou-se pôr o quadro dentro do .docx; Vitor
// (05/09/2026): "acho que terá que ser uma folha à parte mesmo, pois a tabela no arquivo Word tá
// bem ruim". Ela é anexada à proposta, não embutida.
//
// O corpo traz o que a tela escolheu mostrar (`folha`) — o cálculo é sempre o do estudo.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { calcularLqc } from "@/lib/lqc";
import { montarCronogramaPrevio, comprasEspeciais } from "@/lib/cronograma-previo";
import { gerarCronogramaPrevioPDF } from "@/lib/cronograma-previo-pdf";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req, { params }) {
  try { await requireRole(["ADMIN", "COMERCIAL", "PLANEJAMENTO"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const { id } = await params;
  const e = await prisma.estudoFabricacao.findUnique({
    where: { id },
    select: { numero: true, ano: true, cliente: true, obra: true, composicao: true },
  });
  if (!e) return NextResponse.json({ error: "Estudo não encontrado." }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const res = calcularLqc(e.composicao || {});
  const cfg = { ...(e.composicao?.cronograma || {}), ...(body?.cfg || {}) };
  const cron = montarCronogramaPrevio(
    { pesoKg: res.pesoTotal, cargas: res.cargas?.totalCargas || 0, comprasEspeciais: comprasEspeciais(res) },
    cfg,
  );

  const bytes = await gerarCronogramaPrevioPDF({
    cliente: e.cliente, obra: e.obra,
    numero: e.numero ? `LQC-${String(e.numero).padStart(3, "0")}-${String(e.ano).slice(2)}` : null,
    cron, folha: { ...(e.composicao?.cronograma?.folha || {}), ...(body?.folha || {}) },
  });

  const nome = `Cronograma preliminar ${e.numero ? `LQC-${e.numero}-${String(e.ano).slice(2)} ` : ""}${(e.cliente || "").slice(0, 30)}.pdf`;
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${nome.replace(/[^\w\-. ]+/g, "")}"`,
    },
  });
}
