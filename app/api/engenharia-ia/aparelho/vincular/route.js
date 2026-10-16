// POST /api/engenharia-ia/aparelho/vincular — o projetista, logado no portal, digita o código que o app mostrou.
// O aparelho fica preso ao usuário dele e AGUARDANDO o ADMIN (Vitor, 16/10/2026: só ADMIN aprova PC novo).
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { normalizarCodigo } from "@/lib/ia-engenharia";

export const runtime = "nodejs";
const schema = z.object({ codigo: z.string().max(20) });
const NAO_ACHEI = "Código não encontrado ou expirado. Gere um novo no app.";

export async function POST(req) {
  let user;
  try { user = await requireRole(["ENGENHARIA"]); } catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  let body;
  try { body = schema.parse(await req.json()); } catch { return NextResponse.json({ error: "Dados inválidos" }, { status: 400 }); }
  const codigo = normalizarCodigo(body.codigo);
  if (!codigo) return NextResponse.json({ error: "Código no formato TRG-XXXX." }, { status: 400 });

  const ap = await prisma.iaAparelho.findUnique({ where: { codigo } });
  // ⚠ inexistente, expirado ou já usado: a MESMA resposta — não revela qual
  if (!ap || ap.status !== "PAREANDO" || !ap.codigoExpiraEm || ap.codigoExpiraEm.getTime() < Date.now()) return NextResponse.json({ error: NAO_ACHEI }, { status: 404 });
  const r = await prisma.iaAparelho.updateMany({ where: { id: ap.id, status: "PAREANDO" }, data: { userId: user.id, status: "AGUARDANDO_ADMIN", codigo: null } });
  if (r.count !== 1) return NextResponse.json({ error: NAO_ACHEI }, { status: 404 });
  await prisma.auditLog.create({ data: { userId: user.id, action: "IA_APARELHO_VINCULAR", entity: "IaAparelho", entityId: ap.id, diff: { nome: ap.nome } } }).catch(() => {});
  return NextResponse.json({ ok: true, nome: ap.nome, status: "AGUARDANDO_ADMIN" });
}
