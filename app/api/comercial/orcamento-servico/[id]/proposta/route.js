// GET /api/comercial/orcamento-servico/[id]/proposta?formato=docx|pdf
// Baixa a proposta PTC preenchida. formato=pdf converte via CloudConvert.
// Só ADMIN/COMERCIAL.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { gerarPropostaDocx } from "@/lib/proposta-servico-docx";
import { converterDocxParaPdf } from "@/lib/cloudconvert";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(req, { params }) {
  let user;
  try { user = await requireRole(["ADMIN", "COMERCIAL"]); }
  catch (e) { return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const o = await prisma.orcamentoServico.findUnique({ where: { id: params.id } });
  if (!o) return NextResponse.json({ success: false, error: "Orçamento não encontrado" }, { status: 404 });

  const formato = new URL(req.url).searchParams.get("formato") === "pdf" ? "pdf" : "docx";

  let buffer, numeroPtc;
  try { ({ buffer, numeroPtc } = gerarPropostaDocx(o)); }
  catch (e) { return NextResponse.json({ success: false, error: "Falha ao gerar o documento: " + (e?.message || "erro") }, { status: 500 }); }

  let contentType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  let filename = `${numeroPtc}.docx`;
  if (formato === "pdf") {
    try {
      buffer = await converterDocxParaPdf(buffer, `${numeroPtc}.docx`);
      contentType = "application/pdf";
      filename = `${numeroPtc}.pdf`;
    } catch (e) {
      return NextResponse.json({ success: false, error: e?.message || "Falha ao gerar o PDF" }, { status: 502 });
    }
  }

  await prisma.auditLog.create({
    data: { userId: user.id, action: "GERAR_PROPOSTA_SERVICO", entity: "OrcamentoServico", entityId: o.id, diff: { numeroPtc, formato } },
  }).catch(() => {});

  return new Response(buffer, {
    status: 200,
    headers: { "Content-Type": contentType, "Content-Disposition": `attachment; filename="${filename}"` },
  });
}
