// POST /api/qualidade/data-books/[id]/avaliacao-cliente
// Publica o data book emitido no portal do cliente para ELE CONFERIR, antes de a cadeia de
// assinaturas começar.
//
// Vitor (31/08/2026): "antes de enviar para assinatura, teria como disponibilizar no portal do
// cliente o PDF para ele avaliar as informações? (…) depois do ok dele aí sim subimos para
// assinatura".
//
// ⚠ POR QUE ANTES E NÃO DEPOIS. O cliente já é a 4ª etapa da cadeia. O problema é a ordem: hoje o
// Elaborador, o Inspetor e o Responsável Técnico assinam primeiro, e só então o cliente vê o
// livro. Se ele achar um erro nessa hora, corrigir exige revisão — e revisão zera as três
// assinaturas. Ler antes custa um clique; ler depois custa três assinaturas e um R a mais.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { estaFechado } from "@/lib/databook-revisao";
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

  // ⚠ NÃO SE MANDA RASCUNHO PARA O CLIENTE CONFERIR. Mesma régua da cadeia de assinaturas: se o
  // livro ainda pode mudar, o "ok" dele não vale para nada — ele aprovou outro documento.
  if (!estaFechado(book)) {
    return NextResponse.json(
      { success: false, error: "Emita o data book antes de mandar para o cliente avaliar — o que ele aprova precisa ser o documento final." },
      { status: 400 },
    );
  }

  // ⚠⚠ SEM VOLUME GERADO NÃO HÁ O QUE AVALIAR. O portal lista os arquivos da revisão corrente; se
  // a geração não rodou depois da emissão, o cliente abriria a seção e não veria PDF nenhum — e
  // ficaria esperando por um aviso que já foi dado.
  const volumes = await prisma.dataBookArquivo.count({ where: { dataBookId: book.id, revisao: book.revisao } });
  if (!volumes) {
    return NextResponse.json(
      { success: false, error: `Nenhum volume gerado na revisão R${String(book.revisao).padStart(2, "0")}. Gere o PDF antes de mandar para avaliação.` },
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
      status: "EM_AVALIACAO",
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
