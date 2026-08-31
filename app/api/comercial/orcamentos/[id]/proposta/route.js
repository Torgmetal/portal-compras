// POST /api/comercial/orcamentos/[id]/proposta   { tipo?: "PTC"|"PT"|"PC" }
// Garante que existe a PropostaEstrutura deste orçamento e devolve o id, pronto para emitir.
//
// Vitor (31/08/2026): "estou na proposta 290-26 e não estou encontrando o botão para extrair a
// proposta (…) pode colocar emitir Word e emitir PDF".
//
// ⚠ O CAMINHO DE IDA NÃO EXISTIA. A Central de Orçamentos é a lista lida da planilha
// RELATÓRIO_PROPOSTAS; o documento nasce no assistente (/comercial/orcamentos/propostas/[id]),
// sobre uma `PropostaEstrutura`. Só que não havia como criar uma A PARTIR do orçamento — a tabela
// estava com zero registros — então quem abria a 290-26 procurava um botão que não tinha de onde
// sair. Esta rota é essa ponte.
//
// ⚠⚠ NÃO SOBRESCREVE O QUE JÁ FOI MONTADO. `@@unique([orcamentoId, tipo])` garante uma proposta por
// tipo; se ela já existe, devolvo a mesma. Recriar apagaria escopo, áreas e destinatário que
// alguém preencheu no assistente.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";

const TIPOS = ["PTC", "PT", "PC"];

export async function POST(req, { params }) {
  let user;
  try { user = await requireRole(["ADMIN", "COMERCIAL"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const { id } = await params;
  const b = await req.json().catch(() => ({}));
  const tipo = TIPOS.includes(b?.tipo) ? b.tipo : "PTC";

  const orc = await prisma.orcamento.findUnique({
    where: { id },
    select: {
      id: true, numero: true, cliente: true, obra: true, contato: true, responsavel: true,
      // ⚠ O PREÇO VEM DO ESTUDO. Sem ele o documento sai com a capa e o texto do modelo e a tabela
      // de preço vazia — que é pior que não emitir. Pego o estudo mais recente do orçamento.
      estudosLqc: { orderBy: { createdAt: "desc" }, take: 1, select: { id: true, resultado: true } },
    },
  });
  if (!orc) return NextResponse.json({ error: "Orçamento não encontrado." }, { status: 404 });

  const estudo = orc.estudosLqc?.[0] || null;

  const existente = await prisma.propostaEstrutura.findFirst({
    where: { orcamentoId: orc.id, tipo },
    select: { id: true, revisao: true, estudoId: true },
  });
  if (existente) {
    // liga o estudo se ele apareceu depois — sem tocar em mais nada
    if (!existente.estudoId && estudo) {
      await prisma.propostaEstrutura.update({ where: { id: existente.id }, data: { estudoId: estudo.id } });
    }
    return NextResponse.json({
      id: existente.id, tipo, revisao: existente.revisao, criada: false,
      semEstudo: !(existente.estudoId || estudo),
    });
  }

  const nova = await prisma.propostaEstrutura.create({
    data: {
      orcamentoId: orc.id,
      estudoId: estudo?.id || null,
      tipo,
      // ⚠ o que dá para preencher sozinho, preenchido: a capa é o que mais dói digitar de novo, e
      // esses quatro campos já estão no orçamento.
      destinatario: {
        empresa: orc.cliente || "",
        contato: orc.responsavel || "",
        email: orc.contato || "",
      },
      referencia: orc.obra || null,
      criadoPorId: user.id,
    },
    select: { id: true, revisao: true },
  });

  await prisma.auditLog.create({
    data: {
      userId: user.id, action: "CRIAR_PROPOSTA_DO_ORCAMENTO", entity: "PropostaEstrutura", entityId: nova.id,
      diff: { orcamento: orc.numero, tipo, estudoId: estudo?.id || null },
    },
  }).catch(() => {});

  return NextResponse.json({ id: nova.id, tipo, revisao: nova.revisao, criada: true, semEstudo: !estudo });
}
