// GET /api/qualidade/auditorias/portal/[token] — PÚBLICO: dados do portal do cliente.
// Retorna só o que é compartilhado (boas-vindas + documentos tipo EVIDENCIA). Sem login.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(_req, { params }) {
  const aud = await prisma.auditoria.findUnique({
    where: { token: params.token },
    include: { documentos: { where: { tipo: "EVIDENCIA" }, orderBy: { createdAt: "asc" }, select: { id: true, nome: true, secao: true, arquivoTipo: true, arquivoTamanho: true } } },
  });
  if (!aud || aud.status !== "PUBLICADO") {
    return NextResponse.json({ success: false, error: "Portal indisponível ou link inválido." }, { status: 404 });
  }
  // Registra o acesso do cliente (não bloqueia a resposta).
  prisma.auditoria
    .update({ where: { id: aud.id }, data: { ultimoAcessoEm: new Date(), ...(aud.primeiroAcessoEm ? {} : { primeiroAcessoEm: new Date() }) } })
    .catch(() => {});

  // Organograma: setores ativos com nº de funcionários ATIVOS — só os que têm gente.
  let organograma = [];
  let totalFuncionarios = 0;
  try {
    const setores = await prisma.setor.findMany({
      where: { ativo: true },
      select: { nome: true, sigla: true, cor: true, gestor: { select: { nome: true } }, _count: { select: { funcionarios: { where: { ativo: true, status: "ATIVO" } } } } },
      orderBy: { nome: "asc" },
    });
    organograma = setores
      .filter((s) => s._count.funcionarios > 0)
      .map((s) => ({ nome: s.nome, sigla: s.sigla, cor: s.cor, gestor: s.gestor?.nome || null, funcionarios: s._count.funcionarios }));
    totalFuncionarios = organograma.reduce((a, s) => a + s.funcionarios, 0);
  } catch { /* RH pode não ter dados — organograma fica vazio */ }

  return NextResponse.json({
    success: true,
    data: {
      empresa: aud.empresa,
      contato: aud.contato,
      titulo: aud.titulo,
      mensagemBoasVindas: aud.mensagemBoasVindas,
      capaUrl: aud.capaUrl,
      dataBookModeloUrl: aud.dataBookModeloUrl,
      publicadoEm: aud.publicadoEm,
      documentos: aud.documentos,
      organograma,
      totalFuncionarios,
    },
  });
}
