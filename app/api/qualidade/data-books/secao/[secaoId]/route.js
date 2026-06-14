// PATCH /api/qualidade/data-books/secao/[secaoId]  { estado?, observacao? }
// Trava §8: seção de fonte "modulo1" só pode ir a ANEXADO com ≥1 documento
// vinculado e nenhum vencido.
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { calcStatusValidade, diasAlertaCategoria } from "@/lib/qualidade-status";
import { secaoUsaModulo1 } from "@/lib/databook-secoes";

export const runtime = "nodejs";

const schema = z.object({
  estado: z.enum(["PENDENTE", "ANEXADO", "NA"]).optional(),
  observacao: z.string().nullable().optional(),
});

export async function PATCH(req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN", "QUALIDADE"]);
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  let body;
  try {
    body = schema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ success: false, error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 });
  }

  const secao = await prisma.dataBookSecao.findUnique({ where: { id: params.secaoId }, include: { documentos: true } });
  if (!secao) return NextResponse.json({ success: false, error: "Seção não encontrada" }, { status: 404 });

  // Trava ao marcar ANEXADO
  if (body.estado === "ANEXADO" && secaoUsaModulo1(secao.fonte)) {
    const ids = secao.documentos.map((d) => d.documentoId);
    if (ids.length === 0) {
      return NextResponse.json({ success: false, error: "Vincule ao menos um documento do Controle de Documentos antes de marcar como Anexado." }, { status: 400 });
    }
    const docs = await prisma.documentoQualidade.findMany({ where: { id: { in: ids } }, select: { categoria: true, dataValidade: true, ativo: true } });
    const vencido = docs.find((d) => calcStatusValidade(d.dataValidade, diasAlertaCategoria(d.categoria)).key === "VENCIDO");
    if (vencido) {
      return NextResponse.json({ success: false, error: "Há documento vencido vinculado — renove no Controle de Documentos antes de anexar." }, { status: 400 });
    }
    if (docs.some((d) => !d.ativo)) {
      return NextResponse.json({ success: false, error: "Há documento removido vinculado — ajuste o vínculo." }, { status: 400 });
    }
  }

  const data = {};
  if (body.estado !== undefined) data.estado = body.estado;
  if (body.observacao !== undefined) data.observacao = body.observacao?.trim() || null;

  const atualizada = await prisma.dataBookSecao.update({ where: { id: params.secaoId }, data });
  await prisma.auditLog
    .create({ data: { userId: user.id, action: "EDITAR_SECAO_DATABOOK", entity: "DataBookSecao", entityId: params.secaoId, diff: body } })
    .catch(() => {});

  return NextResponse.json({ success: true, estado: atualizada.estado });
}
