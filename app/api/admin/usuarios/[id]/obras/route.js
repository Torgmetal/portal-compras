// GET — as obras que este login de cliente enxerga (e por onde).
// PUT — { opIds } → as obras liberadas por contato passam a ser exatamente estas.
//
// Vitor (21/09/2026): "preciso deixar uma forma de conseguir liberar as OPs que eu quero que ele
// veja". A regra e o porquê moram em lib/cliente-obras.js: liberar = pôr o e-mail do login nos
// contatos da OP; revogar = tirar. É o mesmo vínculo que o portal do cliente, os papéis e os
// envios já usam.
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdminDoPortal } from "@/lib/session";
import { obrasDoLogin, aplicarLiberacao } from "@/lib/cliente-obras";

export const runtime = "nodejs";

const SELECT_OP = { id: true, numero: true, cliente: true, obra: true, status: true, clienteEmail: true, clienteContatos: true };

async function contexto(id) {
  const usuario = await prisma.user.findUnique({ where: { id }, select: { id: true, name: true, email: true, tipo: true } });
  if (!usuario) return { erro: "Usuário não encontrado.", status: 404 };
  if (usuario.tipo !== "CLIENTE") return { erro: "Obras liberadas só existem para login de cliente.", status: 400 };
  if (!usuario.email) return { erro: "Este login não tem e-mail — é pelo e-mail que a obra se liga a ele.", status: 400 };
  // ⚠ todas as obras, não só as ativas: cliente antigo precisa continuar vendo o data book da obra
  // encerrada. A tela ordena e filtra.
  const ops = await prisma.oP.findMany({ select: SELECT_OP, orderBy: { numero: "desc" } });
  return { usuario, ops };
}

const semContatos = (u) => ({ id: u.id, name: u.name, email: u.email });

export async function GET(_req, { params }) {
  try { await requireAdminDoPortal(); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  const ctx = await contexto(params.id);
  if (ctx.erro) return NextResponse.json({ error: ctx.erro }, { status: ctx.status });
  return NextResponse.json({ usuario: semContatos(ctx.usuario), obras: obrasDoLogin(ctx.ops, ctx.usuario.email) });
}

const schema = z.object({ opIds: z.array(z.string().min(1)).max(500) });

export async function PUT(req, { params }) {
  let admin;
  try { admin = await requireAdminDoPortal(); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  let body;
  try { body = schema.parse(await req.json()); }
  catch (e) { return NextResponse.json({ error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 }); }
  const ctx = await contexto(params.id);
  if (ctx.erro) return NextResponse.json({ error: ctx.erro }, { status: ctx.status });

  const conhecidas = new Set(ctx.ops.map((o) => o.id));
  const estranhos = body.opIds.filter((id) => !conhecidas.has(id));
  if (estranhos.length) return NextResponse.json({ error: `OP desconhecida: ${estranhos[0]}` }, { status: 400 });

  const { mudancas, liberadas, revogadas } = aplicarLiberacao(ctx.ops, ctx.usuario, body.opIds);
  for (const m of mudancas) {
    await prisma.oP.update({ where: { id: m.id }, data: { clienteContatos: m.clienteContatos } });
  }
  if (mudancas.length) {
    await prisma.auditLog.create({
      data: {
        userId: admin.id, action: "LIBERAR_OBRAS_CLIENTE", entity: "User", entityId: ctx.usuario.id,
        diff: { email: ctx.usuario.email, liberadas, revogadas },
      },
    }).catch(() => {});
  }
  const depois = ctx.ops.map((o) => { const m = mudancas.find((x) => x.id === o.id); return m ? { ...o, clienteContatos: m.clienteContatos } : o; });
  return NextResponse.json({ success: true, liberadas, revogadas, obras: obrasDoLogin(depois, ctx.usuario.email) });
}
