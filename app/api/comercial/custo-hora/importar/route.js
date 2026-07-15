// POST /api/comercial/custo-hora/importar  (multipart: file = xlsx CET Auditoria)
// Agrega a aba "Custo Efetivo" por setor e devolve os setores (CET real + horas
// efetivas + headcount) p/ a tela do custo-hora. Não salva — o RH revisa antes.
import { NextResponse } from "next/server";
import { requireRole, requireUser } from "@/lib/session";
import { temAcessoDiretoria } from "@/lib/diretoria";
import { parseCetAuditoria } from "@/lib/cet-auditoria";

export const runtime = "nodejs";
export const maxDuration = 30;

// Libera ADMIN/COMERCIAL ou quem tem acesso à Diretoria (custo-hora mora lá).
async function gateCustoHora() {
  try { return await requireRole(["ADMIN", "COMERCIAL"]); }
  catch (e) {
    if (e.message === "Unauthorized") throw e;
    const user = await requireUser();
    if (await temAcessoDiretoria(user.email)) return user;
    throw e;
  }
}

export async function POST(req) {
  try { await gateCustoHora(); }
  catch (e) { return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  let form;
  try { form = await req.formData(); } catch { return NextResponse.json({ success: false, error: "Envie a planilha (.xlsx)" }, { status: 400 }); }
  const file = form.get("file");
  if (!file || typeof file.arrayBuffer !== "function") return NextResponse.json({ success: false, error: "Nenhum arquivo enviado" }, { status: 400 });

  let dados;
  try { dados = parseCetAuditoria(Buffer.from(await file.arrayBuffer())); }
  catch (e) { return NextResponse.json({ success: false, error: "Planilha ilegível: " + (e?.message || "erro") }, { status: 422 }); }
  if (!dados.setores.length) return NextResponse.json({ success: false, error: "Nenhum setor encontrado na aba 'Custo Efetivo'" }, { status: 422 });

  return NextResponse.json({ success: true, setores: dados.setores, cetTotal: dados.cetTotal });
}
