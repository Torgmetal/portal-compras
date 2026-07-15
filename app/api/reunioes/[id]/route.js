// Detalhe/edição de uma ata. Enquanto RASCUNHO edita livre (inclui atividades);
// depois de ENVIADA, editar campos da ata sobe a REVISÃO (ISO) com motivo.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { getISOWeek } from "@/lib/semana-iso";
import { z } from "zod";

export const runtime = "nodejs";

export async function GET(_req, { params }) {
  try { await requireRole(["ADMIN", "PLANEJAMENTO"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const ata = await prisma.ataReuniao.findUnique({
    where: { id: params.id },
    include: {
      atividades: { orderBy: { ordem: "asc" } },
      confirmacoes: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!ata) return NextResponse.json({ error: "Ata não encontrada" }, { status: 404 });
  return NextResponse.json({ ata });
}

const schema = z.object({
  titulo: z.string().min(1).max(200).optional(),
  dataReuniao: z.string().optional().nullable(),
  pauta: z.string().max(4000).optional().nullable(),
  envolvidos: z.array(z.object({ nome: z.string().min(1), email: z.string().email(), setor: z.string().optional().nullable() })).optional(),
  atividades: z.array(z.object({ op: z.string().optional().nullable(), descricao: z.string().min(1), setor: z.string().optional().nullable(), responsavel: z.string().optional().nullable(), prazo: z.string().optional().nullable() })).optional(),
  motivoRevisao: z.string().max(300).optional().nullable(),
});

export async function PATCH(req, { params }) {
  let user;
  try { user = await requireRole(["ADMIN", "PLANEJAMENTO"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const ata = await prisma.ataReuniao.findUnique({ where: { id: params.id }, select: { id: true, status: true, revisao: true, revisoes: true } });
  if (!ata) return NextResponse.json({ error: "Ata não encontrada" }, { status: 404 });

  let body;
  try { body = schema.parse(await req.json()); }
  catch (e) { return NextResponse.json({ error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 }); }

  const data = {};
  if (body.titulo !== undefined) data.titulo = body.titulo.trim();
  if (body.pauta !== undefined) data.pauta = body.pauta?.trim() || null;
  if (body.dataReuniao !== undefined) data.dataReuniao = body.dataReuniao ? new Date(body.dataReuniao + "T12:00:00Z") : null;
  if (body.envolvidos !== undefined) data.envolvidos = body.envolvidos;

  // Enquanto RASCUNHO, o número/semana acompanham a data da reunião (ATA = semana ISO).
  // Depois de enviada, a identidade fica travada (não renumera).
  if (ata.status === "RASCUNHO" && body.dataReuniao) {
    const { semana, ano } = getISOWeek(new Date(body.dataReuniao + "T12:00:00Z"));
    data.semanaIso = semana; data.ano = ano; data.numero = semana;
  }

  // Depois de enviada, alteração sobe a revisão (ISO) — exige motivo.
  if (ata.status !== "RASCUNHO" && Object.keys(data).length > 0) {
    if (!body.motivoRevisao?.trim()) return NextResponse.json({ error: "Informe o motivo da revisão." }, { status: 400 });
    const nova = ata.revisao + 1;
    data.revisao = nova;
    data.revisoes = [...(Array.isArray(ata.revisoes) ? ata.revisoes : []), { n: nova, motivo: body.motivoRevisao.trim(), por: user.name || "—", em: new Date().toISOString() }];
  }

  const ops = [];
  if (Object.keys(data).length > 0) ops.push(prisma.ataReuniao.update({ where: { id: ata.id }, data }));

  // Atividades: só substitui em RASCUNHO (depois de enviada, os setores estão respondendo)
  if (body.atividades !== undefined) {
    if (ata.status !== "RASCUNHO") return NextResponse.json({ error: "Ata já enviada — não dá pra trocar as atividades (só subir revisão nos dados)." }, { status: 400 });
    ops.push(prisma.ataAtividade.deleteMany({ where: { ataId: ata.id } }));
    ops.push(prisma.ataAtividade.createMany({ data: body.atividades.map((a, i) => ({ ataId: ata.id, descricao: a.descricao.trim(), op: a.op?.trim() || null, setor: a.setor?.trim() || null, responsavel: a.responsavel?.trim() || null, prazo: a.prazo ? new Date(a.prazo + "T12:00:00Z") : null, ordem: i })) }));
  }

  if (ops.length) await prisma.$transaction(ops);
  return NextResponse.json({ success: true });
}

export async function DELETE(_req, { params }) {
  let user;
  try { user = await requireRole(["ADMIN", "PLANEJAMENTO"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  await prisma.ataReuniao.delete({ where: { id: params.id } });
  await prisma.auditLog.create({ data: { userId: user.id, action: "EXCLUIR_ATA", entity: "AtaReuniao", entityId: params.id, diff: {} } }).catch(() => {});
  return NextResponse.json({ success: true });
}
