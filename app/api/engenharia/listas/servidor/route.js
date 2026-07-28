// POST /api/engenharia/listas/servidor
// Salva o arquivo da lista (LE/LPC) importada no servidor (SharePoint SERVIDOR),
// na pasta da OP selecionada. Recebe o arquivo em base64 (listas do Tekla são
// pequenas — bem abaixo do limite do corpo serverless).
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/session";
import { salvarListaNoServidor } from "@/lib/sharepoint-lista";

export const runtime = "nodejs";
export const maxDuration = 60;

const schema = z.object({
  tipo: z.enum(["LE", "LPC"]),
  opNumero: z.string().min(1),
  fileNome: z.string().min(1).max(260),
  fileBase64: z.string().min(1),
});

export async function POST(req) {
  let user;
  try { user = await requireRole(["ADMIN", "ENGENHARIA", "PCP", "PLANEJAMENTO", "PRODUCAO"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  let body;
  try { body = schema.parse(await req.json()); }
  catch (e) { return NextResponse.json({ error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 }); }

  const buffer = Buffer.from(body.fileBase64, "base64");
  if (buffer.length > 4 * 1024 * 1024) {
    return NextResponse.json({ error: "Arquivo acima de 4 MB — muito grande pra salvar por aqui. Avise o dev (usar upload por token)." }, { status: 413 });
  }

  try {
    const r = await salvarListaNoServidor({ tipo: body.tipo, opNumero: body.opNumero, fileNome: body.fileNome, buffer });
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return NextResponse.json({ error: e.message || "Falha ao salvar no servidor." }, { status: 502 });
  }
}
