// GET /api/engenharia/emails/pendentes — a fila do que só uma pessoa resolve.
//
// ⚠⚠ O QUE ENTRA NA FILA. Medido em 29/08/2026: dos 359 e-mails, 169 estavam "sem obra" — mas 52
// eram ruído de sistema e 98 eram conversa interna Torg↔Torg. Sobram os que vieram de FORA e não
// casaram: 22. Jogar os 169 na tela transformaria um trabalho de minutos numa lista que ninguém
// encara — e é assim que fila de pendência morre.
//
// ⚠ E-mail interno fica de fora de propósito: conversa entre engenheiros não é correspondência de
// projeto, e forçar alguém a apontar obra para cada uma seria inventar trabalho.
//
// ⚠⚠ QUEM CONSOME É O CARD DA OP. Vitor (29/08/2026): "o ideal é na aba de resumo da OP; não pode
// ter essa informação na engenharia". Faz sentido além da organização: quem está na OP-072 sabe
// reconhecer o e-mail dela, e quem olha uma lista solta de 22 assuntos não sabe. O contexto da
// obra faz o trabalho que o seletor tentava fazer.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { temAcessoDiretoria } from "@/lib/diretoria";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  let user;
  try { user = await requireUser(); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: 401 }); }
  const diretor = user.tipo === "ADMIN" || (await temAcessoDiretoria(user.email).catch(() => false));
  if (!diretor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [brutos, ops] = await Promise.all([
    prisma.obraEmailEvento.findMany({
      where: {
        opId: null,
        // RUIDO e IGNORADO já foram resolvidos — voltar com eles é fazer a pessoa decidir duas vezes
        matchMetodo: { notIn: ["RUIDO", "IGNORADO"] },
        NOT: { de: { endsWith: "@torg.com.br" } },
      },
      orderBy: [{ recebidoEm: "desc" }],
      take: 200,
      select: {
        id: true, de: true, deNome: true, assunto: true, snippet: true, recebidoEm: true,
        direcao: true, temAnexo: true, conversationId: true,
      },
    }),
    prisma.oP.findMany({
      where: { status: { notIn: ["CANCELADA"] } },
      select: { id: true, numero: true, cliente: true, obra: true, status: true },
      orderBy: { numero: "desc" },
    }),
  ]);

  // ⚠ quantas mensagens vêm junto se a pessoa apontar a obra desta: o vínculo leva a thread inteira,
  // e saber disso antes muda a decisão (apontar uma que arrasta 12 pede mais atenção que uma solta).
  const convs = [...new Set(brutos.map((e) => e.conversationId).filter(Boolean))];
  const naThread = convs.length
    ? await prisma.obraEmailEvento.groupBy({ by: ["conversationId"], where: { conversationId: { in: convs } }, _count: true })
    : [];
  const porConv = new Map(naThread.map((x) => [x.conversationId, x._count]));

  return NextResponse.json({
    success: true,
    pendentes: brutos.map((e) => ({ ...e, naThread: (porConv.get(e.conversationId) || 1) - 1 })),
    ops,
    total: brutos.length,
  });
}
