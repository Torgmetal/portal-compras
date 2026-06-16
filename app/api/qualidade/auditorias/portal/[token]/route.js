// GET /api/qualidade/auditorias/portal/[token] — PÚBLICO: dados do portal do cliente.
// Retorna só o que é compartilhado (boas-vindas + documentos tipo EVIDENCIA). Sem login.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(_req, { params }) {
  const aud = await prisma.auditoria.findUnique({
    where: { token: params.token },
    include: { documentos: { where: { tipo: "EVIDENCIA" }, orderBy: { createdAt: "asc" }, select: { id: true, nome: true, arquivoTipo: true, arquivoTamanho: true } } },
  });
  if (!aud || aud.status !== "PUBLICADO") {
    return NextResponse.json({ success: false, error: "Portal indisponível ou link inválido." }, { status: 404 });
  }
  // Registra o acesso do cliente (não bloqueia a resposta).
  prisma.auditoria
    .update({ where: { id: aud.id }, data: { ultimoAcessoEm: new Date(), ...(aud.primeiroAcessoEm ? {} : { primeiroAcessoEm: new Date() }) } })
    .catch(() => {});
  return NextResponse.json({
    success: true,
    data: {
      empresa: aud.empresa,
      contato: aud.contato,
      titulo: aud.titulo,
      mensagemBoasVindas: aud.mensagemBoasVindas,
      publicadoEm: aud.publicadoEm,
      documentos: aud.documentos,
    },
  });
}
