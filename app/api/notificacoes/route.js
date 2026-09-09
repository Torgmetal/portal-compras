// O sino — GET lista as notificações da PESSOA LOGADA, PATCH marca como lida.
//
// Sem requireRole: é "minhas notificações", qualquer sessão válida vê as suas. O filtro por
// módulo já aconteceu na hora de CRIAR (ver lib/notificacoes.js) — aqui é só "o que é meu".
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const erroDeAcesso = (e) =>
  NextResponse.json({ success: false, error: e.message }, { status: 401 });

// Teto da lista do sino: é um painel, não uma central de histórico. Quem quer o que passou
// disso tem o link de cada notificação — ela continua existindo, só não aparece mais aqui.
const LIMITE = 30;

export async function GET() {
  let user;
  try { user = await requireUser(); } catch (e) { return erroDeAcesso(e); }

  const [itens, naoLidas] = await Promise.all([
    prisma.notificacaoDestinatario.findMany({
      where: { userId: user.id },
      orderBy: { criadoEm: "desc" },
      take: LIMITE,
      select: {
        id: true, lida: true, criadoEm: true,
        notificacao: { select: { id: true, tipo: true, titulo: true, mensagem: true, link: true, createdAt: true } },
      },
    }),
    prisma.notificacaoDestinatario.count({ where: { userId: user.id, lida: false } }),
  ]);

  return NextResponse.json({
    success: true,
    naoLidas,
    itens: itens.map((d) => ({
      id: d.id, lida: d.lida,
      tipo: d.notificacao.tipo, titulo: d.notificacao.titulo, mensagem: d.notificacao.mensagem,
      link: d.notificacao.link, criadoEm: d.notificacao.createdAt,
    })),
  });
}

const esquema = z.object({
  ids: z.array(z.string()).max(LIMITE).optional(),
  todas: z.boolean().optional(),
}).refine((v) => v.todas || v.ids?.length, { message: "Informe ids ou todas:true." });

export async function PATCH(req) {
  let user;
  try { user = await requireUser(); } catch (e) { return erroDeAcesso(e); }

  let corpo;
  try { corpo = await req.json(); } catch { corpo = null; }
  const lido = esquema.safeParse(corpo);
  if (!lido.success) {
    return NextResponse.json({ success: false, error: lido.error.issues[0]?.message }, { status: 400 });
  }

  // ⚠ SEMPRE FILTRADO POR userId, mesmo com `ids` explícitos — sem isso, o id de uma
  // notificação de OUTRA pessoa seria marcado como lido por aqui.
  const where = lido.data.todas
    ? { userId: user.id, lida: false }
    : { userId: user.id, id: { in: lido.data.ids } };

  await prisma.notificacaoDestinatario.updateMany({ where, data: { lida: true, lidaEm: new Date() } });

  const naoLidas = await prisma.notificacaoDestinatario.count({ where: { userId: user.id, lida: false } });
  return NextResponse.json({ success: true, naoLidas });
}
