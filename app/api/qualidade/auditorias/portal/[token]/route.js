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

  // Equipe: resumo em dois grupos — Administrativo e Fábrica (nº de funcionários ATIVOS).
  let equipe = [];
  let totalFuncionarios = 0;
  try {
    const setores = await prisma.setor.findMany({
      where: { ativo: true },
      select: { nome: true, _count: { select: { funcionarios: { where: { ativo: true, status: "ATIVO" } } } } },
    });
    const RX_FABRICA = /(produ|f[áa]bric|montag|solda|prepar|corte|pintura|jato|jatea|almox|expedi|caldeir|acabamento|usinag|oficina|manuten|ferrament|serralher|estoque)/i;
    let adm = 0, fab = 0;
    for (const s of setores) {
      const n = s._count.funcionarios;
      if (!n) continue;
      if (RX_FABRICA.test(s.nome)) fab += n; else adm += n;
    }
    totalFuncionarios = adm + fab;
    if (adm) equipe.push({ grupo: "Administrativo", funcionarios: adm });
    if (fab) equipe.push({ grupo: "Fábrica", funcionarios: fab });
  } catch { /* RH pode não ter dados — equipe fica vazia */ }

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
      equipe,
      totalFuncionarios,
    },
  });
}
