// POST /api/comercial/op/[id]/analise-critica/sharepoint — emite o FORM 08 e salva na pasta da OP
// (2. Engenharia / 2.9 Análise Crítica). Reemitir a mesma revisão substitui o arquivo (conflict
// "replace"): a pasta não pode ficar com "R2.pdf" e "R2 1.pdf" lado a lado.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { acharPastaOp, uploadFileToFolder } from "@/lib/sharepoint";
import { montarForm08 } from "@/lib/analise-critica-emitir";

export const runtime = "nodejs";
export const maxDuration = 60;
const SUBPASTA = "2. Engenharia/2.9 Análise Crítica"; // segue a numeração 2.1–2.8 da pasta da OP

export async function POST(_req, { params }) {
  let user;
  try { user = await requireRole(["ADMIN", "ENGENHARIA"]); } catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  const { id } = await params;
  const r = await montarForm08(id);
  if (r.erro) return NextResponse.json({ error: r.erro }, { status: r.status });
  let base;
  try { base = await acharPastaOp(r.op.numero); } catch (e) { return NextResponse.json({ error: `SharePoint indisponível: ${e.message}` }, { status: 502 }); }
  if (!base) return NextResponse.json({ error: `Pasta da OP-${r.op.numero} não encontrada em /Ordem de Servico/01. OP.` }, { status: 404 });
  const folderPath = `${base}/${SUBPASTA}`;
  let salvo;
  try { salvo = await uploadFileToFolder({ folderPath, fileName: r.filename, buffer: Buffer.from(r.bytes), contentType: "application/pdf", conflict: "replace" }); }
  catch (e) { return NextResponse.json({ error: `Não consegui salvar no SharePoint: ${e.message}` }, { status: 502 }); }
  const registro = await prisma.analiseCriticaProjeto.update({ where: { opId: r.op.id }, data: { sharepointPath: `${folderPath}/${salvo.name}`, sharepointEm: new Date(), form08Url: salvo.webUrl || null, form08EmitidoEm: new Date() } });
  await prisma.auditLog.create({ data: { userId: user.id, action: "ANALISE_CRITICA_SHAREPOINT", entity: "AnaliseCriticaProjeto", entityId: registro.id, diff: { opNumero: r.op.numero, revisao: registro.revisao, arquivo: salvo.name, pasta: folderPath } } }).catch(() => {});
  return NextResponse.json({ success: true, arquivo: salvo.name, pasta: folderPath, webUrl: salvo.webUrl || null, registro });
}
