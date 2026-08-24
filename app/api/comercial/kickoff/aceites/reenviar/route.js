// POST /api/comercial/kickoff/aceites/reenviar  { opId, alvos?: [{email, tipo}] }
// Cobra o aceite de quem ainda não confirmou o Kick Off. Sem `alvos`, cobra todos os pendentes
// da OP; com `alvos`, só os escolhidos. Acesso ADMIN/COMERCIAL.
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { sendEmail } from "@/lib/email";
import { montarEmailKickoff, blocoAceite, urlBase, SELECT_OP_EMAIL_KICKOFF } from "@/lib/kickoff-email";

export const runtime = "nodejs";
export const maxDuration = 60;

// ⚠⚠ O ALVO É (E-MAIL + TIPO), NUNCA SÓ O E-MAIL.
// A mesma pessoa pode ter DUAS pendências na mesma OP — o Kick Off GERAL e o FISCAL são convites
// separados, com tokens separados. Na OP-115, guilherme@ e matheus@ têm as duas. Filtrar por
// e-mail cobraria as duas quando o comercial marcou uma, e o e-mail errado é justamente o que faz
// a pessoa ignorar a cobrança.
const schema = z.object({
  opId: z.string().min(1),
  alvos: z.array(z.object({ email: z.string(), tipo: z.enum(["GERAL", "FISCAL"]) })).optional(),
});

export async function POST(req) {
  let user;
  try { user = await requireRole(["ADMIN", "COMERCIAL"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  let body;
  try { body = schema.parse(await req.json()); }
  catch (e) { return NextResponse.json({ error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 }); }

  const op = await prisma.oP.findUnique({ where: { id: body.opId }, select: SELECT_OP_EMAIL_KICKOFF });
  if (!op) return NextResponse.json({ error: "OP não encontrada" }, { status: 404 });
  const k = op.kickoff;
  if (!k) return NextResponse.json({ error: "Esta OP não tem Kick Off." }, { status: 400 });

  // ⚠⚠ COBRANÇA REUSA O CONVITE — NÃO CRIA UM NOVO.
  // Cada `KickoffAceite` é o convite de UMA pessoa, com o token dela. Criar linha nova a cada
  // cobrança faria a mesma pendência contar duas vezes na tela, e o link antigo continuaria
  // valendo em paralelo: a pessoa confirmaria por um e o outro seguiria pendente para sempre.
  // Por isso a busca é pelos pendentes que JÁ EXISTEM e o e-mail leva o token que eles já têm.
  const pendentes = await prisma.kickoffAceite.findMany({
    where: {
      kickoffId: k.id,
      aceitoEm: null,
      ...(body.alvos?.length ? { OR: body.alvos.map((a) => ({ email: a.email, tipo: a.tipo })) } : {}),
    },
    select: { id: true, email: true, tipo: true, token: true, cobrancas: true },
    orderBy: { email: "asc" },
  });
  if (!pendentes.length) {
    return NextResponse.json({ error: "Ninguém pendente para cobrar nesta OP." }, { status: 400 });
  }

  // ⚠ o comunicado é montado por TIPO, não por pessoa: quem está no GERAL recebe o geral e quem
  // está no FISCAL recebe o fiscal. Montar uma vez por tipo e só trocar o botão evita remontar o
  // HTML inteiro (Gantt, tabelas) para cada destinatário.
  const baseUrl = urlBase();
  const corpoPorTipo = {};
  for (const tipo of [...new Set(pendentes.map((p) => p.tipo))]) {
    corpoPorTipo[tipo] = montarEmailKickoff({ op, tipo, userName: user.name, lembrete: true });
  }

  const resultados = [];
  for (const p of pendentes) {
    const { subject, html } = corpoPorTipo[p.tipo] || corpoPorTipo.GERAL;
    const r = await sendEmail({
      to: p.email,
      replyTo: user.email,
      subject,
      html: html.replace("__ACEITE__", blocoAceite(`${baseUrl}/kickoff/aceite/${p.token}`)),
      text: `Seu aceite do Kick Off da OP ${op.numero} — ${op.cliente} está pendente. Confirme: ${baseUrl}/kickoff/aceite/${p.token}`,
    });
    resultados.push({ ...p, ok: r.ok, error: r.error || null });
  }

  const enviados = resultados.filter((r) => r.ok);
  if (!enviados.length) {
    return NextResponse.json({ error: "Nenhum e-mail foi enviado: " + (resultados[0]?.error || "falha no envio") }, { status: 502 });
  }

  // ⚠ `enviadoEm` NÃO é tocado: é a data do 1º convite, e é dela que sai o "há N dias" da tela —
  // o número que mostra que a pendência é velha. Cobrar não pode zerar essa conta.
  await prisma.$transaction([
    ...enviados.map((r) =>
      prisma.kickoffAceite.update({
        where: { id: r.id },
        data: { cobradoEm: new Date(), cobrancas: { increment: 1 } },
      })
    ),
    prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "COBRAR_ACEITE_KICKOFF",
        entity: "OPKickOff",
        entityId: k.id,
        diff: {
          opNumero: op.numero,
          cobrados: enviados.map((r) => `${r.email} (${r.tipo})`),
          falhas: resultados.filter((r) => !r.ok).map((r) => r.email),
        },
      },
    }),
  ]);

  return NextResponse.json({
    success: true,
    enviados: enviados.length,
    falhas: resultados.filter((r) => !r.ok).map((r) => r.email),
  });
}
