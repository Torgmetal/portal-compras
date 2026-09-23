import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAcesso } from "@/lib/session";
import { OPERACOES } from "@/lib/fiscal/cfop";
import { conferirCadeia, operacaoPorId } from "@/lib/fiscal/conferencia-cadeia";
import { documentosDaObra } from "@/lib/fiscal/coleta-documentos";

// A conferência da CADEIA de documentos de uma obra — PARTE 15 do briefing.
//
// ⚠⚠ NADA É GRAVADO, pelo mesmo motivo da auditoria: o resultado é derivado, e derivado guardado
// envelhece calado. O que é escrito à mão (o vínculo que alguém confirmou) ainda não existe — e é
// o que justificaria persistir.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const negado = (e) => NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });

const esquema = z.object({ opId: z.string().min(1).max(40), operacaoId: z.string().min(1).max(60) });

export async function GET() {
  try {
    await requireAcesso({ modulos: ["FISCAL"] });
  } catch (e) { return negado(e); }

  const ops = await prisma.oP.findMany({
    where: { status: "ABERTA" },
    select: { id: true, numero: true, cliente: true, clienteUF: true },
    orderBy: { numero: "desc" }, take: 200,
  });
  return NextResponse.json({
    success: true, ops,
    operacoes: OPERACOES.map((o) => ({
      id: o.id, titulo: o.titulo, resumo: o.resumo, alerta: o.alerta ?? null,
      documentos: (o.notas ?? []).length,
      // ⚠ Quantos emitentes a cadeia tem aparece ANTES da escolha: é o número que explica por que
      // "conferir as notas da TORG" nunca fecha a operação do art. 406.
      emitentes: [...new Set((o.notas ?? []).map((n) => n.quem))],
    })),
  });
}

export async function POST(req) {
  try {
    await requireAcesso({ modulos: ["FISCAL"] });
  } catch (e) { return negado(e); }

  let body;
  try {
    body = esquema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ success: false, error: e.issues?.[0]?.message ?? "Dados inválidos." }, { status: 400 });
  }

  const operacao = operacaoPorId(body.operacaoId);
  if (!operacao) return NextResponse.json({ success: false, error: "Operação desconhecida." }, { status: 400 });

  const op = await prisma.oP.findUnique({
    where: { id: body.opId },
    select: { id: true, numero: true, cliente: true, clienteUF: true },
  });
  if (!op) return NextResponse.json({ success: false, error: "Obra não encontrada." }, { status: 404 });

  const { documentos, cobertura } = await documentosDaObra({ opId: op.id, opNumero: op.numero });
  return NextResponse.json({
    success: true,
    obra: { numero: op.numero, cliente: op.cliente, uf: op.clienteUF },
    ...conferirCadeia(operacao, documentos, cobertura),
    // ⚠ Os documentos achados vão inteiros: a etapa mostra os que casaram, e esta lista mostra o
    // que existe na obra mas não casou com etapa nenhuma — que é uma pergunta por si só.
    documentos,
  });
}
