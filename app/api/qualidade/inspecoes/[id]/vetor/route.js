// GET — a vista do desenho EM VETOR, para o navegador desenhar e a pessoa cotar em cima.
//
// Vitor (21/08/2026): "seria possível você trazer apenas o desenho sem as cotas e quem for gerar o
// relatório eu conseguir fazer a cota no desenho específico?"
//
// ⚠ Vetor, não imagem: o clique gruda no traço real e a cota nasce nas coordenadas do desenho — as
// mesmas que o PDF usa depois para carimbar a marca.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { baixarDesenho } from "@/lib/relatorio-dimensional";
import { vetoresDaVista } from "@/lib/vista-desenho";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req, { params }) {
  try { await requireRole(["ADMIN", "QUALIDADE"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const marca = String(new URL(req.url).searchParams.get("marca") || "").trim().toUpperCase();
  const rel = await prisma.relatorioInspecao.findUnique({
    where: { id: params.id },
    select: { desenhos: true },
  });
  if (!rel) return NextResponse.json({ error: "Relatório não encontrado." }, { status: 404 });

  const desenhos = Array.isArray(rel.desenhos) ? rel.desenhos : [];
  // sem marca, vale o primeiro — o relatório de conjunto só tem um
  const d = marca ? desenhos.find((x) => String(x.marca).toUpperCase() === marca) : desenhos[0];
  if (!d?.caminho) return NextResponse.json({ error: "Este relatório não tem desenho vinculado." }, { status: 404 });

  const bytes = await baixarDesenho(d.caminho);
  if (!bytes) return NextResponse.json({ error: "Não consegui abrir o desenho no servidor." }, { status: 502 });

  const v = await vetoresDaVista(bytes).catch(() => null);
  if (!v) return NextResponse.json({ error: "Não consegui ler a geometria deste desenho." }, { status: 422 });

  return NextResponse.json({ marca: d.marca, ...v });
}
