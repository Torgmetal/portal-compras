// GET — a folha INTEIRA do desenho em vetor, para escolher o recorte manual.
//
// Vitor (03/09/2026): "quero poder colocar o projeto dentro do relatório e poder mover ele dentro
// para mostrar apenas o que eu selecionar" — o recorte automático (`/vetor`) já decidiu qual pedaço
// da folha é "a vista"; aqui devolve a folha inteira, sem decisão nenhuma, para a pessoa desenhar o
// próprio retângulo por cima.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { baixarDesenho, garantirDesenhos } from "@/lib/relatorio-dimensional";
import { vetoresDaPagina } from "@/lib/vista-desenho";
import { espacoDaPagina, recorteAproveitavel } from "@/lib/geometria-pagina";

export const runtime = "nodejs";
export const maxDuration = 60;

/** O espaço da folha, só para decidir se o recorte gravado ainda vale. */
async function espacoDoPdf(bytes) {
  const { getDocumentProxy } = await import("unpdf");
  const doc = await getDocumentProxy(new Uint8Array(bytes));
  return espacoDaPagina(await doc.getPage(1));
}

export async function GET(req, { params }) {
  try { await requireRole(["ADMIN", "QUALIDADE", "QUALIDADE_CAMPO"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const { id } = await params;
  const marca = String(new URL(req.url).searchParams.get("marca") || "").trim().toUpperCase();
  const rel = await prisma.relatorioInspecao.findUnique({
    where: { id }, select: { id: true, opNumero: true, marcas: true, desenhos: true },
  });
  if (!rel) return NextResponse.json({ error: "Relatório não encontrado." }, { status: 404 });

  const desenhos = await garantirDesenhos(rel);
  const d = marca ? desenhos.find((x) => String(x.marca).toUpperCase() === marca) : desenhos[0];
  const origem = d?.caminho || d?.url;
  if (!origem) return NextResponse.json({ error: "Este relatório não tem desenho vinculado." }, { status: 404 });

  const bytes = await baixarDesenho(origem);
  if (!bytes) return NextResponse.json({ error: "Não consegui abrir o desenho no servidor." }, { status: 502 });

  const v = await vetoresDaPagina(bytes).catch(() => null);
  if (!v) return NextResponse.json({ error: "Não consegui ler a geometria desta folha." }, { status: 422 });

  // ⚠⚠ NÃO PRÉ-CARREGA RECORTE QUE NÃO VALE MAIS. Gravado antes de 18/09/2026 numa folha girada,
  // ele foi escolhido sob outro contrato de coordenadas: mostrá-lo aqui faria a pessoa achar que
  // o enquadramento dela está preservado, quando ele aponta para outro pedaço da folha.
  const aproveita = recorteAproveitavel(d.recorte, await espacoDoPdf(bytes));
  return NextResponse.json({
    marca: d.marca,
    recorte: aproveita.ok ? d.recorte || null : null,
    recorteAntigoIgnorado: !!d.recorte && !aproveita.ok,
    ...v,
  });
}
