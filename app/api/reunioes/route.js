// Atas de reunião semanal (módulo Reuniões). GET lista; POST cria.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, requireAcesso } from "@/lib/session";
import { podeGerenciarAtas, TIPOS_REUNIOES } from "@/lib/reunioes-acesso";
import { situacaoAtividade } from "@/lib/ata-status";
import { getISOWeek } from "@/lib/semana-iso";
import { z } from "zod";

export const runtime = "nodejs";

export async function GET() {
  let user;
  try { user = await requireAcesso({ tipos: TIPOS_REUNIOES }); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  const gerente = podeGerenciarAtas(user);

  const atas = await prisma.ataReuniao.findMany({
    // rascunho é da equipe que monta a ata; os demais só veem o que foi enviado
    where: gerente ? {} : { status: { not: "RASCUNHO" } },
    orderBy: [{ ano: "desc" }, { numero: "desc" }],
    take: 200,
    select: {
      id: true, numero: true, semanaIso: true, ano: true, titulo: true, dataReuniao: true,
      status: true, revisao: true, enviadaEm: true, envolvidos: true, createdAt: true,
      _count: { select: { atividades: true, confirmacoes: true } },
      confirmacoes: { select: { confirmadoEm: true } },
      atividades: { select: { status: true, prazo: true } },
    },
  });
  const lista = atas.map((a) => {
    const { confirmacoes, atividades, _count, ...rest } = a;
    return {
      ...rest,
      totalAtividades: _count.atividades,
      atividadesConcluidas: atividades.filter((x) => x.status === "CONCLUIDA").length,
      // atrasada é derivada do prazo — sem resposta e ainda dentro do prazo é só pendente
      atividadesAtrasadas: atividades.filter((x) => situacaoAtividade(x, a) === "ATRASADA").length,
      totalEnvolvidos: _count.confirmacoes || (Array.isArray(a.envolvidos) ? a.envolvidos.length : 0),
      confirmados: confirmacoes.filter((c) => c.confirmadoEm).length,
    };
  });
  return NextResponse.json({ atas: lista, podeGerenciar: gerente });
}

const schema = z.object({
  titulo: z.string().min(1).max(200),
  dataReuniao: z.string().optional().nullable(),
  pauta: z.string().max(4000).optional().nullable(),
  envolvidos: z.array(z.object({ nome: z.string().min(1), email: z.string().email(), setor: z.string().optional().nullable() })).default([]),
  atividades: z.array(z.object({ op: z.string().optional().nullable(), descricao: z.string().min(1), setor: z.string().optional().nullable(), responsavel: z.string().optional().nullable(), prazo: z.string().optional().nullable(), origemAtaNumero: z.number().int().optional().nullable() })).default([]),
});

export async function POST(req) {
  let user;
  try { user = await requireRole(["ADMIN", "PLANEJAMENTO"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  let body;
  try { body = schema.parse(await req.json()); }
  catch (e) { return NextResponse.json({ error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 }); }

  const dataReuniao = body.dataReuniao ? new Date(body.dataReuniao + "T12:00:00Z") : new Date();
  const { semana, ano } = getISOWeek(dataReuniao);

  // número da ata = número da semana ISO da reunião (ata semanal → ATA-029 = semana 29)
  const numero = semana;

  const ata = await prisma.ataReuniao.create({
    data: {
      numero, semanaIso: semana, ano, titulo: body.titulo.trim(), dataReuniao,
      pauta: body.pauta?.trim() || null, envolvidos: body.envolvidos, createdById: user.id,
      atividades: {
        create: body.atividades.map((a, i) => ({
          descricao: a.descricao.trim(), op: a.op?.trim() || null, setor: a.setor?.trim() || null,
          responsavel: a.responsavel?.trim() || null, origemAtaNumero: a.origemAtaNumero ?? null,
          prazo: a.prazo ? new Date(a.prazo + "T12:00:00Z") : null, ordem: i,
        })),
      },
    },
    select: { id: true },
  });

  await prisma.auditLog.create({ data: { userId: user.id, action: "CRIAR_ATA", entity: "AtaReuniao", entityId: ata.id, diff: { numero, titulo: body.titulo } } }).catch(() => {});
  return NextResponse.json({ success: true, id: ata.id, numero });
}
