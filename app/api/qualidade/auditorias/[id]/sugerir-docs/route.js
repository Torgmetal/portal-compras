// POST /api/qualidade/auditorias/[id]/sugerir-docs
// "Torguinho": lê as solicitações do cliente e sugere, do Controle de Documentos, os
// documentos que atendem a auditoria (IA). Retorna lista p/ o usuário revisar e anexar.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { sugerirDocumentos } from "@/lib/auditoria-sugestao";

export const runtime = "nodejs";
export const maxDuration = 60;

const CATEGORIAS_AUDITORIA = ["SISTEMA", "EQUIPAMENTOS", "FUNCIONARIOS", "INSPETORES"];

export async function POST(_req, { params }) {
  try {
    await requireRole(["ADMIN", "QUALIDADE"]);
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  const aud = await prisma.auditoria.findUnique({
    where: { id: params.id },
    include: { documentos: { select: { documentoId: true } } },
  });
  if (!aud) return NextResponse.json({ success: false, error: "Auditoria não encontrada" }, { status: 404 });
  if (!aud.solicitacoes || !aud.solicitacoes.trim()) {
    return NextResponse.json({ success: false, error: "Preencha as solicitações do cliente antes de sugerir documentos." }, { status: 400 });
  }

  const candidatos = await prisma.documentoQualidade.findMany({
    where: { ativo: true, categoria: { in: CATEGORIAS_AUDITORIA } },
    select: { id: true, nome: true, categoria: true, tipo: true, norma: true, arquivoUrl: true, sharepointItemId: true },
    take: 250,
  });

  let sugestoes;
  try {
    sugestoes = await sugerirDocumentos(aud.solicitacoes, candidatos);
  } catch (e) {
    return NextResponse.json({ success: false, error: "Falha ao consultar a IA: " + (e.message || "erro") }, { status: 502 });
  }

  const jaAnexados = new Set(aud.documentos.map((d) => d.documentoId).filter(Boolean));
  const resultado = sugestoes.map((s) => ({
    id: s.id, nome: s.nome, categoria: s.categoria, secao: s.secao, motivo: s.motivo,
    temArquivo: !!(s.arquivoUrl || s.sharepointItemId),
    jaAnexado: jaAnexados.has(s.id),
  }));

  return NextResponse.json({ success: true, sugestoes: resultado });
}
