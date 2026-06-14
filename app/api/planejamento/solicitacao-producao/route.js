// GET  — lista as solicitações de produção (com dados da OP)
// POST — cria/atualiza a solicitação de uma obra (datas necessárias por setor)
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { carregarSolicitacoes, SETORES_SOLICITACAO } from "@/lib/solicitacao-producao";

const dataOpcional = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida").nullable().optional();

const schema = z.object({
  opNumero: z.string().min(1, "OP obrigatória"),
  opId: z.string().nullable().optional(),
  cronogramaId: z.string().nullable().optional(),
  dataEntrega: dataOpcional,
  datasSetor: z.record(z.string(), dataOpcional).default({}),
  hhPorTonManual: z.number().min(0).max(10000).nullable().optional(),
  prioridade: z.enum(["ALTA", "MEDIA", "BAIXA"]).default("MEDIA"),
  status: z.enum(["SOLICITADA", "PROGRAMADA", "EM_PRODUCAO", "ATRASADA", "CONCLUIDA"]).default("SOLICITADA"),
  observacao: z.string().nullable().optional(),
});

const toDate = (s) => (s ? new Date(s + "T12:00:00Z") : null);

export async function GET() {
  try {
    await requireRole(["ADMIN", "PLANEJAMENTO", "COMERCIAL", "PCP", "PRODUCAO"]);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }
  const solicitacoes = await carregarSolicitacoes();
  return NextResponse.json({ solicitacoes });
}

export async function POST(req) {
  let user;
  try {
    user = await requireRole(["ADMIN", "PLANEJAMENTO", "COMERCIAL"]);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  let body;
  try {
    body = schema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 });
  }

  // Só setores válidos, datas normalizadas (string ISO)
  const datasSetor = {};
  for (const s of SETORES_SOLICITACAO) {
    const v = body.datasSetor?.[s];
    if (v) datasSetor[s] = v;
  }

  const antes = await prisma.solicitacaoProducao.findUnique({ where: { opNumero: body.opNumero } });

  const dados = {
    opId: body.opId || null,
    cronogramaId: body.cronogramaId || null,
    dataEntrega: toDate(body.dataEntrega),
    datasSetor,
    hhPorTonManual: body.hhPorTonManual ?? null,
    prioridade: body.prioridade,
    status: body.status,
    observacao: body.observacao || null,
  };

  const solicitacao = await prisma.solicitacaoProducao.upsert({
    where: { opNumero: body.opNumero },
    create: { opNumero: body.opNumero, criadoPorId: user.id, ...dados },
    update: dados,
  });

  try {
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: antes ? "SOLICITACAO_PRODUCAO_ATUALIZADA" : "SOLICITACAO_PRODUCAO_CRIADA",
        entity: "SolicitacaoProducao",
        entityId: solicitacao.id,
        diff: { antes: antes ? { datasSetor: antes.datasSetor, status: antes.status } : null, depois: dados },
      },
    });
  } catch {}

  return NextResponse.json({ ok: true, solicitacao });
}
