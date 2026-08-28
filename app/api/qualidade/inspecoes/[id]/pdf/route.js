// GET — o PDF do relatório, com as fotos e o quadro de assinaturas.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { baixarDesenho, garantirDesenhos } from "@/lib/relatorio-dimensional";
import { usaCotas } from "@/lib/qualidade-campo";
import { gerarPDFdoRelatorio } from "@/lib/relatorio-render";
import { dispArquivo } from "@/lib/arquivo-http";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req, { params }) {
  try { await requireRole(["ADMIN", "QUALIDADE"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const { id } = await params;
  const rel = await prisma.relatorioInspecao.findUnique({ where: { id } });
  // ⚠ idem à tela de marcação: se o relatório nasceu sem desenho (criação instantânea), resolve e
  // grava aqui. Sem isto o PDF sairia com o campo do croqui em branco.
  if (!rel) return NextResponse.json({ error: "Relatório não encontrado" }, { status: 404 });
  if (usaCotas(rel.tipo)) rel.desenhos = await garantirDesenhos(rel);

  const fotos = await prisma.fotoInspecao.findMany({
    where: { relatorioId: id },
    orderBy: { capturadaEm: "asc" },
    select: { url: true, marca: true, origemMarca: true, observacao: true, capturadaEm: true, autorNome: true },
  });

  const assinaturas = rel.envioAssinaturaId
    ? await prisma.assinaturaDocumento.findMany({
        where: { envioId: rel.envioAssinaturaId },
        select: { nome: true, setor: true, assinadoEm: true, ip: true, imagemUrl: true },
        orderBy: { nome: "asc" },
      })
    : null;

  // ── UMA REVISÃO ANTERIOR? ───────────────────────────────────────────────────────────────────
  //
  // Vitor (21/08/2026): "nos casos dos relatórios que foram reprovados você deve mencionar no data
  // book tanto o reprovado quanto o aprovado, evidenciando o retrabalho".
  //
  // ⚠ A REVISÃO ANTERIOR É RECONSTRUÍDA DO SNAPSHOT, não de um arquivo guardado. Congelar o PDF
  // exigiria armazenar um binário por revisão e mantê-lo em pé para sempre; o dado já está em
  // `revisoes`, e renderizar dali dá o mesmo documento sem nada para sincronizar — e sem risco de o
  // arquivo e o registro contarem histórias diferentes.
  const pedida = new URL(req.url).searchParams.get("revisao");
  if (pedida != null && rel) {
    const n = Number(pedida);
    const antiga = (Array.isArray(rel.revisoes) ? rel.revisoes : []).find((r) => r.revisao === n);
    if (!antiga) {
      return NextResponse.json({ error: `Revisão R${String(n).padStart(2, "0")} não encontrada neste relatório.` }, { status: 404 });
    }
    rel.linhas = antiga.linhas || [];
    rel.resultados = antiga.resultados || rel.resultados;
    rel.inspetor = antiga.inspetor || rel.inspetor;
    rel.revisao = antiga.revisao;
    rel.resultadoInspecao = antiga.resultadoInspecao;
  }

  // ⚠ CADA MODELO TEM SEU FORMULÁRIO. Vitor: "quando gerar o relatório ele precisa ficar com a cara
  // de relatório do excel". Os tipos que ainda não têm modelo próprio seguem o layout de evidências
  // fotográficas, que é o que existia antes.
  // ⚠ o despacho por tipo mora em lib/relatorio-render.js, e não aqui: a rota pública do link de
  // assinatura precisa EXATAMENTE do mesmo, e duas cópias divergiram — o LP nasceu numa e não na
  // outra, e quem assinava recebia uma folha que não era o documento.
  const op = await prisma.oP.findFirst({
    where: { numero: rel.opNumero }, select: { cliente: true, obra: true, refCliente: true },
  });
  const bytes = await gerarPDFdoRelatorio({
    rel, fotos, assinaturas,
    cliente: op?.cliente || null, obra: op?.obra || null, refCliente: op?.refCliente || null,
    desenhoBytes: (d) => baixarDesenho(d?.caminho || d?.url),
  });

  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": dispArquivo(`${rel.codigo}.pdf`, "inline"),
    },
  });
}
