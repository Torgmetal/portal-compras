// GET  — lista os desenhos (PDF as-built) da pasta da obra no SERVIDOR (SharePoint),
//        via buscarDesenhosOP (Montagem + Conjunto), marcando os já importados.
// POST  — importa os selecionados como referências (origem SHAREPOINT), servidos
//        depois pelo proxy .../[desenhoId]/arquivo. Não copia pro Blob.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { buscarDesenhosOP, resolveServidorDriveId } from "@/lib/projetos-databook";

export const runtime = "nodejs";
export const maxDuration = 60;
const ROLES = ["ADMIN", "ENGENHARIA", "COMERCIAL", "PLANEJAMENTO", "PCP"];
const extDe = (nome) => (String(nome || "").match(/\.([a-z0-9]+)$/i)?.[1] || "").toLowerCase() || null;

export async function GET(_req, { params }) {
  try { await requireRole(ROLES); } catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  const op = await prisma.oP.findUnique({ where: { id: params.id }, select: { numero: true } });
  if (!op) return NextResponse.json({ error: "OP não encontrada" }, { status: 404 });

  const { desenhos, opFolder, erro } = await buscarDesenhosOP(op.numero);
  const existentes = await prisma.desenhoOP.findMany({ where: { opId: params.id, origem: "SHAREPOINT" }, select: { itemId: true } });
  const ja = new Set(existentes.map((e) => e.itemId));
  return NextResponse.json({
    success: true,
    opFolder: opFolder || null,
    erro: erro || null,
    desenhos: (desenhos || []).map((d) => ({ itemId: d.id, nome: d.name, webUrl: d.url, area: d.area, ext: extDe(d.name), jaImportado: ja.has(d.id) })),
  });
}

export async function POST(req, { params }) {
  let user;
  try { user = await requireRole(ROLES); } catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  const op = await prisma.oP.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!op) return NextResponse.json({ error: "OP não encontrada" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const sel = Array.isArray(body.desenhos) ? body.desenhos : [];
  if (!sel.length) return NextResponse.json({ error: "Nenhum desenho selecionado." }, { status: 400 });

  // lote (opcional) aplicado a todos os importados; precisa ser desta OP
  let loteId = null;
  if (body.loteId) {
    const l = await prisma.loteExpedicao.findFirst({ where: { id: body.loteId, opId: op.id }, select: { id: true } });
    loteId = l ? body.loteId : null;
  }

  const driveId = await resolveServidorDriveId();
  if (!driveId) return NextResponse.json({ error: "Drive SERVIDOR não resolvido." }, { status: 502 });

  // não duplica: pula itemIds já importados
  const existentes = await prisma.desenhoOP.findMany({ where: { opId: op.id, origem: "SHAREPOINT" }, select: { itemId: true } });
  const ja = new Set(existentes.map((e) => e.itemId));
  const ult = await prisma.desenhoOP.findFirst({ where: { opId: op.id }, orderBy: { ordem: "desc" }, select: { ordem: true } });
  let ordem = ult?.ordem ?? 0;

  const novos = sel.filter((d) => d.itemId && !ja.has(d.itemId));
  const data = novos.map((d) => ({
    opId: op.id,
    ordem: ++ordem,
    nome: String(d.nome || "desenho").slice(0, 300),
    ext: extDe(d.nome),
    origem: "SHAREPOINT",
    driveId,
    itemId: String(d.itemId),
    webUrl: d.webUrl || null,
    area: d.area || null,
    loteId,
  }));
  if (data.length) await prisma.desenhoOP.createMany({ data });

  await prisma.auditLog.create({ data: { userId: user.id, action: "IMPORTAR_DESENHOS_PASTA", entity: "OP", entityId: op.id, diff: { criados: data.length } } }).catch(() => {});
  return NextResponse.json({ success: true, criados: data.length, pulados: sel.length - data.length });
}
