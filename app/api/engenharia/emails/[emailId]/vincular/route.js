// PATCH /api/engenharia/emails/[emailId]/vincular  { opId }  — aponta a obra do e-mail à mão.
//
// ⚠⚠ O QUE SOBRA DEPOIS DAS REGRAS. Medido em 29/08/2026: dos 359 e-mails, 52 eram ruído de
// sistema, 98 eram conversa interna Torg↔Torg e apenas **22 de cliente/terceiro** ficaram sem obra
// — não os "48%" que a contagem crua sugeria. Vinte e dois é o que uma pessoa resolve em minutos,
// e é por isso que a saída aqui é o clique, não mais uma regra.
//
// ⚠ E O CLIQUE ENSINA: gravar `MANUAL` faz o `rematchTudo` respeitar essa escolha para sempre (ele
// só re-casa quem não tem vínculo forte). Regra automática nunca desfaz decisão de gente.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { temAcessoDiretoria } from "@/lib/diretoria";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req, { params }) {
  let user;
  try { user = await requireUser(); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: 401 }); }
  const diretor = user.tipo === "ADMIN" || (await temAcessoDiretoria(user.email).catch(() => false));
  if (!diretor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { opId, propagarThread = true } = await req.json().catch(() => ({}));
  const email = await prisma.obraEmailEvento.findUnique({
    where: { id: params.emailId },
    select: { id: true, conversationId: true, assunto: true },
  });
  if (!email) return NextResponse.json({ error: "E-mail não encontrado." }, { status: 404 });

  // opId null = "não é de obra nenhuma" (marketing, spam, conversa interna) — também é resposta,
  // e precisa ficar registrada para o e-mail sair da fila em vez de voltar amanhã.
  const dados = opId
    ? { opId, matchMetodo: "MANUAL", matchConfianca: 1 }
    : { opId: null, matchMetodo: "IGNORADO", matchConfianca: null };
  await prisma.obraEmailEvento.update({ where: { id: email.id }, data: dados });

  // ⚠ a thread inteira acompanha: quem aponta a obra de uma mensagem está apontando a da conversa.
  // Só toca em quem ainda não tem vínculo — nunca sobrescreve match forte nem outra decisão manual.
  let naThread = 0;
  if (propagarThread && opId && email.conversationId) {
    const r = await prisma.obraEmailEvento.updateMany({
      where: { conversationId: email.conversationId, id: { not: email.id },
               OR: [{ opId: null }, { matchMetodo: { in: ["SEM_MATCH", "DOMINIO", "NOME_OBRA"] } }] },
      data: { opId, matchMetodo: "THREAD", matchConfianca: 0.9 },
    });
    naThread = r.count;
  }

  await prisma.auditLog.create({
    data: { userId: user.id, action: "EMAIL_VINCULAR_OP", entity: "ObraEmailEvento", entityId: email.id,
      diff: { opId: opId || null, assunto: email.assunto, naThread } },
  }).catch(() => {});

  return NextResponse.json({ ok: true, naThread });
}
