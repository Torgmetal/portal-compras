// POST /api/qualidade/data-books/[id]/avaliacao-cliente
// Publica o data book emitido no portal do cliente para ELE CONFERIR, antes de a cadeia de
// assinaturas começar.
//
// Vitor (31/08/2026): "antes de enviar para assinatura, teria como disponibilizar no portal do
// cliente o PDF para ele avaliar as informações? (…) depois do ok dele aí sim subimos para
// assinatura".
//
// ⚠⚠ É O RASCUNHO QUE VAI, NÃO O EMITIDO. Vitor (31/08/2026): "o que deve aparecer para o cliente
// é exatamente o rascunho; o emitido vai somente depois para ele, quando terminar todas as
// assinaturas".
//
// A ordem importa e eu tinha invertido. Emitir é o ato que FECHA o documento: carimba R00, trava
// as seções e só se desfaz por revisão. Emitir antes de o cliente ler significa que qualquer
// apontamento dele custa um R a mais em um livro que ainda nem começou a circular. O rascunho já
// se identifica sozinho — a capa traz STATUS: RASCUNHO e o arquivo baixa como "(rascunho)".
//
// Por isso esta rota NÃO exige emissão e NÃO mexe no `status`: ela só marca que o rascunho foi
// posto para conferência. O livro segue editável, que é o ponto — a conferência existe para gerar
// correção.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { secoesDoPortal } from "@/lib/portal-cliente";

export const runtime = "nodejs";

export async function POST(_req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN", "QUALIDADE"]);
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  const book = await prisma.dataBookQualidade.findUnique({
    where: { id: params.id },
    select: { id: true, opNumero: true, status: true, revisao: true, emitidoEm: true, avaliacaoOkEm: true },
  });
  if (!book) return NextResponse.json({ success: false, error: "Data book não encontrado" }, { status: 404 });

  // ⚠ SÓ NÃO SE MANDA O QUE JÁ ACABOU. Depois do aceite o portal mostra o livro EMITIDO e assinado;
  // reabrir uma conferência ali confundiria o cliente sobre qual documento vale.
  if (book.status === "ACEITO") {
    return NextResponse.json(
      { success: false, error: "Este data book já foi aceito pelo cliente — não há o que conferir." },
      { status: 409 },
    );
  }

  // ⚠⚠ SEM VOLUME GERADO NÃO HÁ O QUE CONFERIR. O portal lista os arquivos da revisão corrente; se
  // a geração não rodou, o cliente abriria a seção e não veria PDF nenhum — e ficaria esperando
  // por um aviso que já foi dado.
  const volumes = await prisma.dataBookArquivo.count({ where: { dataBookId: book.id, revisao: book.revisao } });
  if (!volumes) {
    return NextResponse.json(
      { success: false, error: `Nenhum volume gerado na revisão R${String(book.revisao).padStart(2, "0")}. Gere o PDF do rascunho antes de mandar para conferência.` },
      { status: 409 },
    );
  }

  // ⚠ O PORTAL PRECISA EXISTIR E TER A SEÇÃO LIGADA. Sem isso o status mudaria aqui e o cliente
  // não veria nada lá — o pior desfecho possível, porque a Qualidade fica esperando um "ok" que
  // ninguém tem como dar.
  const portal = await prisma.portalCliente.findFirst({
    where: { opNumero: book.opNumero, status: "PUBLICADO" },
    select: { id: true, token: true, secoes: true },
  });
  if (!portal) {
    return NextResponse.json(
      { success: false, error: "Esta obra não tem portal do cliente publicado. Publique o portal antes de mandar o data book para avaliação." },
      { status: 409 },
    );
  }
  if (!secoesDoPortal(portal).includes("DATABOOK")) {
    return NextResponse.json(
      { success: false, error: "O portal desta obra está sem a seção Data Book ligada — ligue-a para o cliente conseguir abrir o PDF." },
      { status: 409 },
    );
  }

  const atualizado = await prisma.dataBookQualidade.update({
    where: { id: book.id },
    data: {
      // ⚠ o `status` NÃO muda: o livro continua o rascunho que é, e continua editável. Quem diz
      // que há conferência em aberto é o `avaliacaoEnviadaEm` — e é ele que o portal consulta.
      avaliacaoEnviadaEm: new Date(),
      // reenviar limpa o parecer anterior: o que vale é a leitura desta rodada
      avaliacaoOkEm: null, avaliacaoOkNome: null, avaliacaoOkIp: null, avaliacaoObs: null,
    },
    select: { status: true, avaliacaoEnviadaEm: true },
  });

  await prisma.auditLog.create({
    data: {
      userId: user.id, action: "DATABOOK_ENVIAR_AVALIACAO_CLIENTE", entity: "DataBookQualidade", entityId: book.id,
      diff: { opNumero: book.opNumero, revisao: book.revisao, volumes },
    },
  }).catch(() => {});

  return NextResponse.json({
    success: true, status: atualizado.status, volumes,
    link: `/portal/${portal.token}`,
  });
}
