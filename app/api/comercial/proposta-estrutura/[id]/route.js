// PATCH /api/comercial/proposta-estrutura/[id]  — salva o que a tela editou
// GET   /api/comercial/proposta-estrutura/[id]  — a proposta com o orçamento e o estudo
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { selecaoPadrao } from "@/lib/proposta-estrutura";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROLES = ["ADMIN", "COMERCIAL"];
// ⚠ lista fechada: PATCH que aceita qualquer chave deixa a tela gravar `revisao` ou `emissoes`
// sem passar pela emissão — e aí o histórico do documento deixa de valer como histórico.
const CAMPOS = ["destinatario", "referencia", "escopo", "documentos", "projetos", "areas",
                "selecao", "textos", "comMontagem", "modalidade", "estudoId", "status", "tipo"];

export async function GET(_req, { params }) {
  try { await requireRole(ROLES); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  const { id } = await params;
  const proposta = await prisma.propostaEstrutura.findUnique({
    where: { id },
    include: {
      orcamento: { select: { id: true, numero: true, cliente: true, obra: true, contato: true, responsavel: true, valor: true } },
      estudo: { select: { id: true, numero: true, ano: true, revisao: true, composicao: true, resultado: true } },
    },
  });
  if (!proposta) return NextResponse.json({ error: "Proposta não encontrada." }, { status: 404 });
  return NextResponse.json({ proposta });
}

export async function PATCH(req, { params }) {
  try { await requireRole(ROLES); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  const { id } = await params;
  const atual = await prisma.propostaEstrutura.findUnique({ where: { id } });
  if (!atual) return NextResponse.json({ error: "Proposta não encontrada." }, { status: 404 });

  const b = await req.json().catch(() => ({}));
  const data = {};
  for (const k of CAMPOS) if (k in b) data[k] = b[k];

  // ⚠ trocar o escopo de montagem troca O MODELO do documento — e com ele 21 parágrafos em nove
  // seções. A seleção precisa ser refeita, senão ficam blocos marcados que o novo modelo não tem
  // (ou faltam os que ele passou a ter).
  if ("comMontagem" in data && !!data.comMontagem !== atual.comMontagem) {
    const antes = atual.selecao || {};
    const nova = selecaoPadrao({ tipo: atual.tipo, comMontagem: !!data.comMontagem });
    // preserva a escolha de quem já mexeu, nos blocos que continuam existindo
    for (const k of Object.keys(nova)) if (antes[k]) nova[k] = antes[k];
    data.selecao = nova;
  }

  // ⚠ trocar o TIPO troca quais blocos existem no documento — e o (orçamento, tipo) é único, então
  // pode colidir com uma proposta que já exista. Mensagem clara em vez do erro cru do banco.
  if (data.tipo && data.tipo !== atual.tipo) {
    if (!["PT", "PC", "PTC"].includes(data.tipo)) return NextResponse.json({ error: "Tipo inválido." }, { status: 400 });
    const colide = await prisma.propostaEstrutura.findUnique({
      where: { orcamentoId_tipo: { orcamentoId: atual.orcamentoId, tipo: data.tipo } },
    });
    if (colide) return NextResponse.json({ error: `Já existe uma ${data.tipo} para este orçamento.` }, { status: 409 });
    const nova = selecaoPadrao({ tipo: data.tipo, comMontagem: "comMontagem" in data ? !!data.comMontagem : atual.comMontagem });
    const antes = data.selecao || atual.selecao || {};
    for (const k of Object.keys(nova)) if (antes[k]) nova[k] = antes[k];
    data.selecao = nova;
  }

  const proposta = await prisma.propostaEstrutura.update({ where: { id }, data });
  return NextResponse.json({ ok: true, proposta });
}
