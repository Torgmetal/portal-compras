import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAcesso } from "@/lib/session";
import { lerConversa, renomear, arquivar, reconciliarAbandonadas } from "@/lib/fiscal/assistente/conversas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const comUsuario = async () => requireAcesso({ modulos: ["FISCAL", "FINANCEIRO"] });
const erro = (e) => NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });

export async function GET(_req, { params }) {
  let user;
  try { user = await comUsuario(); } catch (e) { return erro(e); }
  // ⚠⚠ A RECONCILIAÇÃO RODA NA LEITURA. Execução abandonada não avisa que morreu — quem a marca
  // como INTERROMPIDA é quem abre a conversa depois, senão ela fica "pensando" para sempre.
  await reconciliarAbandonadas(params.id);
  const c = await lerConversa(params.id, user.id);
  // ⚠ Conversa de outro usuário devolve 404, não 403: distinguir já confirmaria que ela existe.
  if (!c) return NextResponse.json({ success: false, error: "Conversa não encontrada." }, { status: 404 });
  return NextResponse.json({ success: true, conversa: c });
}

export async function PATCH(req, { params }) {
  let user;
  try { user = await comUsuario(); } catch (e) { return erro(e); }
  let body;
  try {
    body = z.object({ titulo: z.string().trim().min(1).max(120) }).parse(await req.json());
  } catch (e) {
    return NextResponse.json({ success: false, error: e.issues?.[0]?.message ?? "Dados inválidos." }, { status: 400 });
  }
  if (!await renomear(params.id, user.id, body.titulo)) {
    return NextResponse.json({ success: false, error: "Conversa não encontrada." }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}

export async function DELETE(_req, { params }) {
  let user;
  try { user = await comUsuario(); } catch (e) { return erro(e); }
  // ⚠⚠ ARQUIVA, NÃO APAGA. O §22 do briefing manda preservar a base usada em cada resposta — e ela
  // mora nas mensagens. Sai da lista de quem arquivou; não some do banco.
  if (!await arquivar(params.id, user.id)) {
    return NextResponse.json({ success: false, error: "Conversa não encontrada." }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
