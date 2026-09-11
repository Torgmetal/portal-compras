// GET /api/comercial/op/[id]/analise-critica/ata/[reuniaoId]/pdf — FORM 10 (ata da reunião de
// análise crítica) de uma reunião do bloco 7 do registro da OP.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { dispArquivo } from "@/lib/arquivo-http";
import { gerarAtaAnaliseCriticaPDF } from "@/lib/analise-critica-ata-pdf";

export const runtime = "nodejs";

export async function GET(_req, { params }) {
  try { await requireUser(); } catch (e) { return NextResponse.json({ error: e.message }, { status: 401 }); }
  const { id, reuniaoId } = await params;
  const op = await prisma.oP.findUnique({ where: { id }, select: { id: true, numero: true, cliente: true, obra: true } });
  if (!op) return NextResponse.json({ error: "OP não encontrada" }, { status: 404 });
  const registro = await prisma.analiseCriticaProjeto.findUnique({ where: { opId: op.id } });
  if (!registro) return NextResponse.json({ error: "Salve a análise crítica antes de emitir a ata." }, { status: 400 });
  const reuniao = (Array.isArray(registro.reunioes) ? registro.reunioes : []).find((r) => r.id === reuniaoId);
  if (!reuniao) return NextResponse.json({ error: "Reunião não encontrada no registro." }, { status: 404 });
  const { bytes, filename } = await gerarAtaAnaliseCriticaPDF({ op, registro, reuniao });
  return new NextResponse(Buffer.from(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": dispArquivo(filename, "inline") } });
}
