// GET — corpo COMPLETO de um e-mail vinculado à OP, buscado no Graph sob demanda (não
// guardamos corpo no banco). SÓ DIRETORIA (ADMIN ou allowlist). Valida que o e-mail é da OP.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { temAcessoDiretoria } from "@/lib/diretoria";
import { lerCorpoMensagem } from "@/lib/graph-mail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(_req, { params }) {
  let user;
  try { user = await requireUser(); } catch (e) { return NextResponse.json({ error: e.message }, { status: 401 }); }
  const diretor = user.tipo === "ADMIN" || (await temAcessoDiretoria(user.email).catch(() => false));
  if (!diretor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const ev = await prisma.obraEmailEvento.findUnique({
    where: { id: params.emailId },
    select: { id: true, opId: true, caixa: true, graphId: true, assunto: true, webLink: true, anexos: true, temAnexoIfc: true },
  });
  if (!ev || ev.opId !== params.id) return NextResponse.json({ error: "E-mail não encontrado nesta OP" }, { status: 404 });
  if (!ev.graphId) return NextResponse.json({ error: "Sem referência da mensagem no Graph" }, { status: 422 });

  try {
    const corpo = await lerCorpoMensagem(ev.caixa, ev.graphId);
    return NextResponse.json({ success: true, ...corpo, anexos: ev.anexos || [], temAnexoIfc: ev.temAnexoIfc, webLink: corpo.webLink || ev.webLink });
  } catch (e) {
    const status = e.status === 404 ? 404 : 502;
    return NextResponse.json({ error: `Falha ao ler o e-mail no Outlook: ${e.message}` }, { status });
  }
}
