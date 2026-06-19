// GET/POST/DELETE /api/diretoria/acesso — allowlist do módulo Diretoria.
// SÓ o dono (vitor@torg.com.br) gerencia. Nenhum ADMIN tem acesso por aqui.
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireDonoDiretoria, DIRETORIA_OWNER } from "@/lib/diretoria";

export const runtime = "nodejs";

function status(e) {
  return e.message === "Unauthorized" ? 401 : 403;
}

export async function GET() {
  let dono;
  try {
    dono = await requireDonoDiretoria();
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: status(e) });
  }
  const liberados = await prisma.acessoDiretoria.findMany({ orderBy: { createdAt: "asc" } });
  return NextResponse.json({ dono: DIRETORIA_OWNER, liberados });
}

export async function POST(req) {
  let dono;
  try {
    dono = await requireDonoDiretoria();
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: status(e) });
  }

  let body;
  try {
    body = z.object({ email: z.string().email("E-mail inválido").toLowerCase() }).parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 });
  }
  if (body.email === DIRETORIA_OWNER) {
    return NextResponse.json({ error: "Esse e-mail já é o dono do módulo." }, { status: 400 });
  }

  // Puxa o nome do usuário, se existir no portal (só pra exibir).
  const u = await prisma.user.findUnique({ where: { email: body.email }, select: { name: true } });

  const liberado = await prisma.acessoDiretoria.upsert({
    where: { email: body.email },
    create: { email: body.email, nome: u?.name || null, liberadoPorEmail: dono.email },
    update: { nome: u?.name || null, liberadoPorEmail: dono.email },
  });

  await prisma.auditLog
    .create({ data: { userId: dono.id, action: "DIRETORIA_LIBERAR_ACESSO", entity: "AcessoDiretoria", entityId: liberado.id, diff: { email: body.email } } })
    .catch(() => {});

  return NextResponse.json({ ok: true, liberado });
}

export async function DELETE(req) {
  let dono;
  try {
    dono = await requireDonoDiretoria();
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: status(e) });
  }

  const email = (new URL(req.url).searchParams.get("email") || "").toLowerCase().trim();
  if (!email) return NextResponse.json({ error: "Informe o e-mail" }, { status: 400 });

  await prisma.acessoDiretoria.deleteMany({ where: { email } });
  await prisma.auditLog
    .create({ data: { userId: dono.id, action: "DIRETORIA_REVOGAR_ACESSO", entity: "AcessoDiretoria", entityId: email, diff: { email } } })
    .catch(() => {});

  return NextResponse.json({ ok: true });
}
