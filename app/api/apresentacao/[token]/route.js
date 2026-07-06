import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Público (sem login) — dados da apresentação por token. Registra acesso.
export const runtime = "nodejs";

export async function GET(req, { params }) {
  try {
    const { token } = await params;
    const ap = await prisma.apresentacaoCliente.findUnique({ where: { token } });
    if (!ap || ap.status !== "PUBLICADO") {
      return NextResponse.json({ success: false, error: "Apresentação não encontrada ou não publicada." }, { status: 404 });
    }

    // Documentos da biblioteca institucional selecionados (ativos) + extras.
    const ids = Array.isArray(ap.docsInstitucionaisIds) ? ap.docsInstitucionaisIds : [];
    const [institucionais, extras] = await Promise.all([
      ids.length ? prisma.documentoInstitucional.findMany({ where: { id: { in: ids }, ativo: true }, orderBy: [{ tipo: "asc" }, { ordem: "asc" }] }) : Promise.resolve([]),
      prisma.apresentacaoDoc.findMany({ where: { apresentacaoId: ap.id }, orderBy: { ordem: "asc" } }),
    ]);

    // Junta e agrupa por tipo (mantendo ordem: cadastrais, portfólio, outros)
    const docs = [
      ...institucionais.map((d) => ({ nome: d.nome, tipo: d.tipo, url: d.arquivoUrl, arquivoTipo: d.arquivoTipo })),
      ...extras.map((d) => ({ nome: d.nome, tipo: d.tipo, url: d.arquivoUrl, arquivoTipo: d.arquivoTipo })),
    ];

    // Registra acesso (best-effort)
    prisma.apresentacaoCliente.update({
      where: { id: ap.id },
      data: { ultimoAcessoEm: new Date(), acessos: { increment: 1 }, ...(ap.primeiroAcessoEm ? {} : { primeiroAcessoEm: new Date() }) },
    }).catch(() => {});

    return NextResponse.json({
      success: true,
      apresentacao: { contato: ap.contato, empresa: ap.empresa, mensagemBoasVindas: ap.mensagemBoasVindas, capaUrl: ap.capaUrl },
      docs,
    });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
