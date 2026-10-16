// POST /api/admin/engenharia-ia/aparelho/[id] — aprovar, recusar ou revogar um PC (só o ADMIN do portal).
// Troca de estado condicional: aprovar só sai de AGUARDANDO_ADMIN; revogar vale para o que ainda tem (ou terá) acesso.
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdminDoPortal } from "@/lib/session";

export const runtime = "nodejs";
const schema = z.object({ acao: z.enum(["aprovar", "recusar", "revogar"]) });

const TRANSICOES = (adminId) => ({
  aprovar: { de: "AGUARDANDO_ADMIN", data: { status: "APROVADO", aprovadoPorId: adminId, aprovadoEm: new Date() } },
  recusar: { de: "AGUARDANDO_ADMIN", data: { status: "RECUSADO", revogadoPorId: adminId, revogadoEm: new Date() } },
  revogar: { de: { in: ["APROVADO", "ATIVO", "AGUARDANDO_ADMIN"] }, data: { status: "REVOGADO", revogadoPorId: adminId, revogadoEm: new Date() } },
});

export async function POST(req, { params }) {
  let admin;
  try { admin = await requireAdminDoPortal(); } catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  let body;
  try { body = schema.parse(await req.json()); } catch { return NextResponse.json({ error: "Ação inválida" }, { status: 400 }); }
  const t = TRANSICOES(admin.id)[body.acao];
  const r = await prisma.iaAparelho.updateMany({ where: { id: params.id, status: t.de }, data: t.data });
  if (r.count !== 1) return NextResponse.json({ error: "O aparelho não está num estado que permita essa ação. Atualize a tela." }, { status: 409 });
  await prisma.auditLog.create({ data: { userId: admin.id, action: `IA_APARELHO_${body.acao.toUpperCase()}`, entity: "IaAparelho", entityId: params.id, diff: { status: t.data.status } } }).catch(() => {});
  return NextResponse.json({ ok: true, status: t.data.status });
}
