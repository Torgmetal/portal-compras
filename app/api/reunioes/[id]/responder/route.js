// POST /api/reunioes/[id]/responder — preencher uma atividade da ata pelo
// PORTAL (logado), sem depender do link do e-mail. Os envolvidos precisam voltar
// na ata pra completar as tarefas, e o link do e-mail é de uso pontual.
// Também registra o aceite de recebimento (acao: "confirmar") pelo portal.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAcesso } from "@/lib/session";
import { TIPOS_REUNIOES } from "@/lib/reunioes-acesso";
import { getISOWeek } from "@/lib/semana-iso";
import { acharOuCriarAtaDaSemana } from "@/lib/ata-semana";
import { z } from "zod";

export const runtime = "nodejs";

const schema = z.object({
  acao: z.enum(["responder", "confirmar"]).default("responder"),
  atividadeId: z.string().optional(),
  resposta: z.string().max(2000).optional().nullable(),
  evidencia: z.string().max(2000).optional().nullable(),
  status: z.enum(["EM_ANDAMENTO", "CONCLUIDA"]).optional(),
  // Desdobramento: nova tarefa gerada ao responder. O prazo decide a semana-alvo.
  desdobramento: z.object({
    descricao: z.string().min(1).max(500),
    setor: z.string().max(60).optional().nullable(),
    responsavel: z.string().max(100).optional().nullable(),
    prazo: z.string().optional().nullable(), // AAAA-MM-DD
  }).optional().nullable(),
});

export async function POST(req, { params }) {
  let user;
  try { user = await requireAcesso({ tipos: TIPOS_REUNIOES }); }
  catch (e) { return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const ata = await prisma.ataReuniao.findUnique({ where: { id: params.id }, select: { id: true, status: true, numero: true, semanaIso: true, ano: true, envolvidos: true } });
  if (!ata) return NextResponse.json({ success: false, error: "Ata não encontrada" }, { status: 404 });
  if (ata.status === "RASCUNHO") return NextResponse.json({ success: false, error: "Esta ata ainda está em rascunho." }, { status: 400 });

  let body;
  try { body = schema.parse(await req.json()); }
  catch (e) { return NextResponse.json({ success: false, error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 }); }

  // Aceite do recebimento pelo portal (mesmo registro do link do e-mail)
  if (body.acao === "confirmar") {
    const conf = await prisma.ataConfirmacao.findFirst({ where: { ataId: ata.id, email: String(user.email || "").toLowerCase() } });
    if (!conf) return NextResponse.json({ success: false, error: "Você não está na lista de envolvidos desta ata." }, { status: 403 });
    if (!conf.confirmadoEm) await prisma.ataConfirmacao.update({ where: { id: conf.id }, data: { confirmadoEm: new Date() } });
    return NextResponse.json({ success: true });
  }

  if (!body.atividadeId) return NextResponse.json({ success: false, error: "Atividade não informada." }, { status: 400 });
  const atv = await prisma.ataAtividade.findFirst({ where: { id: body.atividadeId, ataId: ata.id } });
  if (!atv) return NextResponse.json({ success: false, error: "Atividade não encontrada." }, { status: 404 });
  if (!(body.resposta || "").trim() && !(body.evidencia || "").trim()) {
    return NextResponse.json({ success: false, error: "Preencha a informação e/ou a evidência." }, { status: 400 });
  }

  const dd = body.desdobramento?.descricao?.trim() ? body.desdobramento : null;

  const resultado = await prisma.$transaction(async (tx) => {
    await tx.ataAtividade.update({
      where: { id: atv.id },
      data: {
        resposta: (body.resposta || "").trim() || null,
        evidencia: (body.evidencia || "").trim() || null,
        respondidoPor: String(user.name || user.email || "").slice(0, 100) || null,
        respondidoEm: new Date(),
        status: body.status || "EM_ANDAMENTO",
      },
    });

    if (!dd) return { desdobramento: null };

    // O prazo decide a semana-alvo: mesma semana da ata → entra nela; semana futura
    // → vai pro rascunho da ata daquela semana (criado se ainda não existir). Sem
    // prazo, cai nesta semana mesmo.
    const prazoDate = dd.prazo ? new Date(dd.prazo + "T12:00:00Z") : null;
    const alvo = prazoDate ? getISOWeek(prazoDate) : { semana: ata.semanaIso, ano: ata.ano };
    const mesmaSemana = alvo.semana === ata.semanaIso && alvo.ano === ata.ano;

    const ataAlvo = mesmaSemana
      ? { id: ata.id, numero: ata.numero, criada: false }
      : await acharOuCriarAtaDaSemana(tx, {
          ano: alvo.ano, semana: alvo.semana,
          envolvidos: Array.isArray(ata.envolvidos) ? ata.envolvidos : [],
          createdById: user.id || null,
        });

    const ult = await tx.ataAtividade.findFirst({ where: { ataId: ataAlvo.id }, orderBy: { ordem: "desc" }, select: { ordem: true } });
    await tx.ataAtividade.create({
      data: {
        ataId: ataAlvo.id,
        descricao: dd.descricao.trim(),
        setor: ((dd.setor || atv.setor || "").trim()) || null,
        responsavel: ((dd.responsavel || "").trim()) || null,
        prazo: prazoDate,
        op: atv.op || null,
        ehDesdobramento: true,
        desdobramentoDeDesc: atv.descricao.slice(0, 300),
        origemAtaNumero: ata.numero,
        status: "PENDENTE",
        ordem: (ult?.ordem ?? -1) + 1,
      },
    });

    return { desdobramento: { ataNumero: ataAlvo.numero, mesmaSemana, ataCriada: !!ataAlvo.criada } };
  });

  return NextResponse.json({ success: true, ...resultado });
}
