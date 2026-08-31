// POST — o CLIENTE dá o parecer sobre o data book que está em avaliação no portal dele.
//
// Vitor (31/08/2026): "no caso da OP-106 quero que apareça para o Davi avaliar antes de mandar
// para assinatura. Depois do ok dele aí sim subimos para assinatura".
//
// Duas respostas, e as duas contam:
//   aprovado: true   → libera a cadeia de assinaturas (a Qualidade passa a poder iniciar)
//   aprovado: false  → grava o que ele pediu para ajustar; a Qualidade lê e decide
//
// ⚠ O "NÃO" NÃO REABRE O LIVRO SOZINHO. O data book em avaliação está FECHADO (ver
// ESTADOS_FECHADOS): mudar conteúdo exige revisão, que zera assinaturas e sobe o R. Deixar um
// clique do cliente disparar isso seria dar a ele o controle da numeração do nosso documento. O
// pedido fica registrado; quem abre a revisão é a Qualidade.
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { secoesDoPortal } from "@/lib/portal-cliente";
import { destinatarioDoCodigo, registrarAcesso } from "@/lib/portal-acesso";
import { limparTextoCurto } from "@/lib/html";

export const runtime = "nodejs";

const Body = z.object({
  aprovado: z.boolean(),
  nome: z.string().trim().min(2, "Informe seu nome.").max(120),
  obs: z.string().trim().max(2000).optional().nullable(),
});

const ipDe = (req) =>
  (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() ||
  req.headers.get("x-real-ip") || null;

export async function POST(req, { params }) {
  const { token } = await params;

  const portal = await prisma.portalCliente.findUnique({ where: { token } });
  if (!portal || portal.status !== "PUBLICADO") {
    return NextResponse.json({ success: false, error: "Link inválido." }, { status: 404 });
  }
  if (!secoesDoPortal(portal).includes("DATABOOK")) {
    return NextResponse.json({ success: false, error: "O Data Book não faz parte do portal desta obra." }, { status: 403 });
  }

  let body;
  try {
    body = Body.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ success: false, error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 });
  }

  // ⚠ SÓ RESPONDE QUEM ESTÁ SENDO PERGUNTADO. Fora de `EM_AVALIACAO` não há pergunta em aberto —
  // e aceitar o parecer num livro já assinado sobrescreveria o registro da rodada que valeu.
  const book = await prisma.dataBookQualidade.findFirst({
    where: { opNumero: portal.opNumero, status: "EM_AVALIACAO" },
    select: { id: true, revisao: true, opNumero: true },
  });
  if (!book) {
    return NextResponse.json(
      { success: false, error: "Não há data book aguardando sua avaliação nesta obra." },
      { status: 409 },
    );
  }

  const quem = await destinatarioDoCodigo(new URL(req.url).searchParams.get("d"), portal.id);
  const nome = limparTextoCurto(body.nome, 120);
  const obs = body.obs ? limparTextoCurto(body.obs, 2000) : null;
  const agora = new Date();

  await prisma.dataBookQualidade.update({
    where: { id: book.id },
    data: body.aprovado
      ? { avaliacaoOkEm: agora, avaliacaoOkNome: nome, avaliacaoOkIp: ipDe(req), avaliacaoObs: obs }
      : { avaliacaoOkEm: null, avaliacaoOkNome: null, avaliacaoOkIp: null, avaliacaoObs: obs || "Cliente pediu ajuste sem detalhar." },
  });

  await prisma.auditLog.create({
    data: {
      userId: null,
      action: body.aprovado ? "DATABOOK_AVALIACAO_APROVADA" : "DATABOOK_AVALIACAO_AJUSTE",
      entity: "DataBookQualidade", entityId: book.id,
      diff: {
        opNumero: book.opNumero, revisao: book.revisao, nome,
        destinatario: quem?.nome || null, email: quem?.email || null,
        ip: ipDe(req), obs,
      },
    },
  }).catch(() => {});

  await registrarAcesso(req, {
    portal, codigo: new URL(req.url).searchParams.get("d"),
    evento: body.aprovado ? "DATABOOK_APROVADO" : "DATABOOK_AJUSTE",
    secao: "DATABOOK",
  }).catch(() => {});

  return NextResponse.json({ success: true, aprovado: body.aprovado });
}
