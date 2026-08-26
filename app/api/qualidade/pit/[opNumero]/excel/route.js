// GET /api/qualidade/pit/{opNumero}/excel — o PIT da obra no padrão Torg, em Excel.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { gerarPitExcel } from "@/lib/pit-excel";
import { PIT_PADRAO } from "@/lib/pit-padroes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req, { params }) {
  let user;
  try { user = await requireRole(["ADMIN", "QUALIDADE", "COMERCIAL", "PRODUCAO", "PCP"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const opNumero = String((await params)?.opNumero || "").replace(/\D/g, "").padStart(3, "0");
  const op = await prisma.oP.findFirst({
    where: { numero: opNumero },
    select: { numero: true, cliente: true, clienteRazaoSocial: true, obra: true, refCliente: true, pitPadrao: true, pitRevisao: true },
  });
  if (!op) return NextResponse.json({ error: "OP não encontrada." }, { status: 404 });

  // ⚠ SEM PADRÃO NÃO SE EMITE. Escolher um por conta (o mais comum, por exemplo) faria sair um
  // plano de inspeção que ninguém decidiu — e ele é assinado pelo cliente. Melhor recusar e dizer
  // onde escolher.
  const padrao = new URL(req.url).searchParams.get("padrao") || op.pitPadrao;
  if (!padrao || !PIT_PADRAO[padrao]) {
    return NextResponse.json({
      error: "Esta obra ainda não tem o padrão de PIT definido. Escolha o padrão na aba Qualidade da OP e emita de novo.",
      semPadrao: true,
    }, { status: 400 });
  }

  const bytes = await gerarPitExcel({
    op: { ...op, cliente: op.clienteRazaoSocial || op.cliente },
    padrao, revisao: op.pitRevisao || "0",
    usuario: user?.name || user?.email || null,
  });
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="PIT-T${opNumero}.xlsx"`,
    },
  });
}
