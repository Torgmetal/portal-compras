// GET /api/comercial/op/[id]/kickoff/pdf?tipo=geral|fiscal
// PDF do Kick Off no padrão Torg (pdf-lib), em dois tipos: GERAL (setores) e FISCAL
// (fiscal/financeiro). Substitui o antigo "Salvar PDF" via window.print().
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { gerarKickoffPDF } from "@/lib/kickoff-pdf";
import { dispArquivo } from "@/lib/arquivo-http";

export const runtime = "nodejs";

export async function GET(req, { params }) {
  try { await requireRole(["ADMIN", "COMERCIAL"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const { id } = await params;
  const tipo = (new URL(req.url).searchParams.get("tipo") || "geral").toUpperCase() === "FISCAL" ? "FISCAL" : "GERAL";

  const op = await prisma.oP.findUnique({
    where: { id },
    select: {
      id: true, numero: true, cliente: true, obra: true,
      clienteRazaoSocial: true, clienteCnpj: true, clienteIE: true, clienteEndereco: true,
      clienteCidade: true, clienteUF: true, clienteCep: true, clienteContato: true,
      kickoff: { include: { aceites: { select: { tipo: true, email: true, aceitoEm: true } } } },
      itens: { select: { descricao: true, categoria: true, faturamentoDireto: true } },
      aditivos: { select: { itens: { select: { descricao: true, categoria: true, faturamentoDireto: true } } } },
    },
  });
  if (!op) return NextResponse.json({ error: "OP não encontrada" }, { status: 404 });
  if (!op.kickoff) return NextResponse.json({ error: "Salve o Kick Off antes de gerar o PDF." }, { status: 400 });

  const itens = [...op.itens, ...op.aditivos.flatMap((a) => a.itens)];
  const { bytes, filename } = await gerarKickoffPDF({ op, kickoff: op.kickoff, tipo, itens });

  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": dispArquivo(filename, "inline"),
    },
  });
}
