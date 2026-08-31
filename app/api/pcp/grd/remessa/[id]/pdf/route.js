// GET /api/pcp/grd/remessa/[id]/pdf — abre a GUIA (FORM 09) já emitida.
//
// Vitor (31/08/2026): "a GRD do PCP só aparece se eu reimprimir ela; preciso que traga o form para
// poder mostrar ao auditor".
//
// ⚠⚠ ERA UMA PONTA SOLTA MINHA. Eu emitia a guia, gravava tudo e nunca criei o caminho de volta —
// o documento existia no banco e não havia como abri-lo. Reemitir para "ver" é o pior contorno
// possível: cria uma segunda guia da mesma entrega, e duas guias dizendo a mesma coisa é o oposto
// do que um controle de documentos precisa.
//
// ⚠ O PDF É REMONTADO DO SNAPSHOT, não do estado de hoje. `itens`, `recebidoPorNome` e `enviadoEm`
// foram congelados na emissão: se o CMR mudar ou o desenho for reimpresso depois, a guia continua
// mostrando o que foi entregue naquele dia — que é a única coisa que ela precisa provar.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { gerarGuiaPcpPDF } from "@/lib/grd-pcp-pdf";
import { dispArquivo } from "@/lib/arquivo-http";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req, { params }) {
  try { await requireRole(["ADMIN", "PCP", "PLANEJAMENTO", "PRODUCAO", "QUALIDADE", "ENGENHARIA"]); }
  catch (e) { return new NextResponse(e.message, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const { id } = await params;
  const g = await prisma.grdRemessaPcp.findUnique({ where: { id } });
  if (!g) return new NextResponse("Guia não encontrada.", { status: 404 });

  const op = g.opId
    ? await prisma.oP.findUnique({ where: { id: g.opId }, select: { obra: true, cliente: true } })
    : await prisma.oP.findFirst({ where: { numero: g.opNumero }, select: { obra: true, cliente: true } });

  const doc = await gerarGuiaPcpPDF({
    numero: g.numero, ano: g.ano, opNumero: g.opNumero,
    obra: op?.obra || null, cliente: op?.cliente || null,
    setor: g.setor, itens: Array.isArray(g.itens) ? g.itens : [],
    emitidoEm: g.emitidoEm, emitidoPorNome: g.emitidoPorNome,
    recebidoPorNome: g.recebidoPorNome, recebidoPorEmail: g.recebidoPorEmail, enviadoEm: g.enviadoEm,
  });

  return new NextResponse(Buffer.from(doc.bytes), {
    headers: {
      "Content-Type": "application/pdf",
      // ⚠ inline: o auditor está olhando a tela junto, e obrigar a baixar para depois abrir é
      // atrito na hora errada.
      "Content-Disposition": dispArquivo(doc.filename, "inline"),
      "Cache-Control": "private, max-age=60",
    },
  });
}
