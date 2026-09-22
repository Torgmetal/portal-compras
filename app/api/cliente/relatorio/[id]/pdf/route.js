// O PDF DE UM RELATÓRIO DE INSPEÇÃO, PARA O CLIENTE LOGADO CONSULTAR.
//
// Vitor (22/09/2026): "deixe disponível para ele consultar quando o Davi assinar". As outras portas
// para este PDF não servem aqui: a interna exige perfil da Torg e a pública exige o token de quem
// foi convidado a ASSINAR — e quem consulta não assina nada.
//
// ⚠⚠ QUEM PERGUNTA É A SESSÃO, nunca um parâmetro: a autorização é o e-mail do login estar na obra
// do relatório (contato da OP ou e-mail do cadastro). Uma rota que aceitasse "?email=" deixaria um
// cliente ler o documento de outro.
//
// ⚠ E só depois de TODAS as assinaturas — documento em circulação ainda pode voltar para revisão.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { pdfDoRelatorio } from "@/lib/relatorio-pdf-fonte";
import { obraLiberadaPara, cicloConcluido } from "@/lib/cliente-relatorios";
import { dispArquivo } from "@/lib/arquivo-http";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const NEGADO = "Este documento não está disponível para consulta.";

export async function GET(_req, { params }) {
  let user;
  try { user = await requireUser(); }
  catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); }

  const { id } = await params;
  const rel = await prisma.relatorioInspecao.findUnique({
    where: { id },
    select: {
      id: true, codigo: true, opNumero: true,
      envioAssinatura: { select: { status: true, assinaturas: { select: { assinadoEm: true } } } },
    },
  });
  if (!rel) return NextResponse.json({ error: "Relatório não encontrado" }, { status: 404 });

  // ⚠ a MESMA regra da lista (lib/cliente-relatorios.js): fechado e obra liberada. Duas respostas
  // iguais de propósito — dizer "existe, mas você não pode" já conta o que o outro cliente tem.
  if (!cicloConcluido(rel.envioAssinatura)) return NextResponse.json({ error: NEGADO }, { status: 403 });

  const op = await prisma.oP.findFirst({
    where: { numero: rel.opNumero || "" },
    select: { clienteEmail: true, clienteContatos: true },
  });
  if (!obraLiberadaPara(op, user.email)) return NextResponse.json({ error: NEGADO }, { status: 403 });

  let pdf;
  // ⚠ `exigirOp` amarra o PDF à obra que autorizou a leitura — a conferência mora no próprio
  // gerador, então nenhuma troca de id no meio do caminho entrega documento de outra obra.
  try { pdf = await pdfDoRelatorio(id, { exigirOp: rel.opNumero }); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.status || 500 }); }

  return new NextResponse(Buffer.from(pdf.bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": dispArquivo(pdf.nome || `${rel.codigo}.pdf`, "inline"),
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}
