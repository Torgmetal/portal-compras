// /api/rh/mural/[id]/reenviar
//   POST → reenvia o comunicado por e-mail a todos os funcionários ativos com e-mail.
//   Usado quando o disparo original não alcançou todo mundo. Só ADMIN/RH.
//
// ⚠ Reenvia para TODOS os elegíveis (não dá para saber exatamente quem falhou no
// envio anterior, pois não guardamos sucesso por destinatário). Quem já recebeu
// pode receber de novo — para um comunicado importante, é o mal menor.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { enviarAvisoPorEmail } from "@/lib/mural-broadcast";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(_req, { params }) {
  let user;
  try { user = await requireRole(["ADMIN", "RH"]); }
  catch (e) { return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const aviso = await prisma.muralAviso.findUnique({ where: { id: params.id } });
  if (!aviso) return NextResponse.json({ success: false, error: "Comunicado não encontrado" }, { status: 404 });

  const { enviados, falhas, total } = await enviarAvisoPorEmail(prisma, aviso, aviso.criadoPorNome || user.name);

  await prisma.auditLog.create({
    data: {
      userId: user.id, action: "REENVIAR_MURAL_AVISO", entity: "MuralAviso", entityId: aviso.id,
      diff: { titulo: aviso.titulo, total, emailEnviados: enviados, emailFalhas: falhas.length, falhas: falhas.slice(0, 50) },
    },
  }).catch(() => {});

  return NextResponse.json({ success: true, enviados, total, emailFalhas: falhas.length });
}
