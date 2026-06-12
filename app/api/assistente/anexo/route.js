// Recebe um arquivo anexado no chat do Torguinho e devolve o conteúdo
// processado (texto/tabela) ou base64 (imagem) para o front mandar junto da
// próxima mensagem. Não persiste o arquivo — é efêmero, só para a conversa.
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { processarAnexo } from "@/lib/assistente/anexos";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_SIZE = 15 * 1024 * 1024; // 15MB

export async function POST(req) {
  try {
    await requireUser();
  } catch {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  let form;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Envie como multipart/form-data." }, { status: 400 });
  }

  const file = form.get("file");
  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "Campo 'file' obrigatório." }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: `Arquivo muito grande (máx ${MAX_SIZE / 1024 / 1024}MB).` }, { status: 413 });
  }

  try {
    const r = await processarAnexo(file);
    if (r.erro) return NextResponse.json({ error: r.erro }, { status: 400 });
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ error: "Falha ao processar o anexo: " + e.message }, { status: 500 });
  }
}
