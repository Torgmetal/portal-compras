// POST — recebe um PDF e devolve o TEXTO extraído, pra tela casar as marcas da
// Lista de Expedição com o que está no arquivo (Excel é lido no navegador).
// Usa unpdf, que já é o extrator do portal (otimizado pra serverless).
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";
export const maxDuration = 60;
const ROLES = ["ADMIN", "COMERCIAL", "PLANEJAMENTO", "PCP", "ENGENHARIA"];
const MAX = 15 * 1024 * 1024;

export async function POST(req) {
  try { await requireRole(ROLES); } catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  let form;
  try { form = await req.formData(); } catch { return NextResponse.json({ error: "Envio inválido" }, { status: 400 }); }
  const file = form.get("arquivo");
  if (!file || typeof file === "string") return NextResponse.json({ error: "Nenhum arquivo recebido" }, { status: 400 });
  if (file.size > MAX) return NextResponse.json({ error: "PDF muito grande (máx. 15MB)" }, { status: 413 });

  try {
    const { extractText } = await import("unpdf");
    const buf = new Uint8Array(await file.arrayBuffer());
    const { text } = await extractText(buf, { mergePages: true });
    const texto = Array.isArray(text) ? text.join("\n") : String(text || "");
    if (!texto.trim()) return NextResponse.json({ error: "Não consegui ler texto deste PDF (pode ser digitalizado/imagem)." }, { status: 422 });
    return NextResponse.json({ success: true, texto });
  } catch (e) {
    return NextResponse.json({ error: "Falha ao ler o PDF: " + (e?.message || "") }, { status: 500 });
  }
}
