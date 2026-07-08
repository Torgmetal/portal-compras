// GET /api/comercial/orcamento-servico/[id]/proposta?formato=docx|pdf
// Baixa a proposta PTC preenchida. docx = template Word; pdf = gerado direto
// (pdf-lib), sem serviço externo. Só ADMIN/COMERCIAL.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { gerarPropostaDocx } from "@/lib/proposta-servico-docx";
import { gerarPropostaPDF } from "@/lib/proposta-servico-pdf";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req, { params }) {
  let user;
  try { user = await requireRole(["ADMIN", "COMERCIAL"]); }
  catch (e) { return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const o = await prisma.orcamentoServico.findUnique({ where: { id: params.id } });
  if (!o) return NextResponse.json({ success: false, error: "Orçamento não encontrado" }, { status: 404 });

  const pdf = new URL(req.url).searchParams.get("formato") === "pdf";

  let buffer, filename, contentType;
  try {
    if (pdf) {
      const { bytes, numeroPtc } = await gerarPropostaPDF(o);
      buffer = Buffer.from(bytes); filename = `${numeroPtc}.pdf`; contentType = "application/pdf";
    } else {
      const { buffer: b, numeroPtc } = gerarPropostaDocx(o);
      buffer = b; filename = `${numeroPtc}.docx`; contentType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    }
  } catch (e) {
    return NextResponse.json({ success: false, error: "Falha ao gerar a proposta: " + (e?.message || "erro") }, { status: 500 });
  }

  await prisma.auditLog.create({
    data: { userId: user.id, action: "GERAR_PROPOSTA_SERVICO", entity: "OrcamentoServico", entityId: o.id, diff: { formato: pdf ? "pdf" : "docx" } },
  }).catch(() => {});

  return new Response(buffer, { status: 200, headers: { "Content-Type": contentType, "Content-Disposition": `attachment; filename="${filename}"` } });
}
