// POST — grava (ou apaga) o recorte manual de um desenho do relatório.
//
// Vitor (03/09/2026): "quero poder colocar o projeto dentro do relatório e poder mover ele dentro
// para mostrar apenas o que eu selecionar" — o recorte guardado aqui vale por cima do algoritmo
// automático em TODO lugar que usa o desenho: a marcação de cotas (`/vetor`) e o PDF final
// (`gerarDimensionalPDF`), porque os dois passam por `recortarVista`.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req, { params }) {
  try { await requireRole(["ADMIN", "QUALIDADE"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const marca = String(body?.marca || "").trim().toUpperCase();

  const rel = await prisma.relatorioInspecao.findUnique({
    where: { id }, select: { id: true, desenhos: true, envioAssinaturaId: true },
  });
  if (!rel) return NextResponse.json({ error: "Relatório não encontrado." }, { status: 404 });
  if (rel.envioAssinaturaId) return NextResponse.json({ error: "Relatório já enviado para assinatura." }, { status: 409 });

  const desenhos = Array.isArray(rel.desenhos) ? rel.desenhos : [];
  const i = marca ? desenhos.findIndex((d) => String(d.marca).toUpperCase() === marca) : 0;
  if (i < 0) return NextResponse.json({ error: "Desenho não encontrado neste relatório." }, { status: 404 });

  const r = body?.recorte;
  // `recorte: null` (ou inválido) volta ao automático — remove o campo em vez de gravar lixo.
  const valido = r && [r.left, r.right, r.bottom, r.top].every((v) => Number.isFinite(v))
    && Math.abs(r.right - r.left) >= 20 && Math.abs(r.top - r.bottom) >= 20;

  const novo = desenhos.map((d, idx) => {
    if (idx !== i) return d;
    if (!valido) { const { recorte, ...resto } = d; return resto; }
    return { ...d, recorte: { left: r.left, right: r.right, bottom: r.bottom, top: r.top } };
  });

  await prisma.relatorioInspecao.update({ where: { id }, data: { desenhos: novo } });
  return NextResponse.json({ ok: true, recorte: novo[i].recorte || null });
}
