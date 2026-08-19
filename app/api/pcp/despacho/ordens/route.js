// ORDENS do Syneco de UMA marca — o detalhe que abre ao clicar no chip de Programação.
// Fica fora da listagem do painel de propósito: numa OP grande são milhares de linhas e o
// payload da tela triplicava. GET ?opId=&marca= (ou ?obra=&marca=).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ORDEM_SETOR = ["Corte", "Preparação", "Montagem", "Solda", "Acabamento", "Jato", "Pintura"];

export async function GET(req) {
  try { await requireRole(["ADMIN", "PCP", "PLANEJAMENTO", "PRODUCAO"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const sp = new URL(req.url).searchParams;
  const marca = (sp.get("marca") || "").trim();
  let opId = sp.get("opId");
  if (!opId && sp.get("obra")) {
    const n = parseInt(String(sp.get("obra")).match(/\d+/)?.[0] || "", 10);
    if (Number.isFinite(n)) {
      const op = await prisma.oP.findFirst({ where: { numero: { in: [String(n), String(n).padStart(3, "0"), String(n).padStart(4, "0")] } }, select: { id: true } });
      opId = op?.id || null;
    }
  }
  if (!opId || !marca) return NextResponse.json({ error: "Informe opId e marca." }, { status: 400 });

  const linhas = await prisma.mesOrdem.findMany({
    where: { opId, item: marca },
    select: { setor: true, operacao: true, maquina: true, status: true, planejadoUn: true, produzidoUn: true, pesoPlanejado: true, dataInicio: true, dataFim: true, updatedAt: true },
  });
  const ordens = linhas
    .map((o) => ({
      setor: o.setor, operacao: o.operacao, maquina: o.maquina && o.maquina !== "---" ? o.maquina : null,
      status: o.status, planejadoUn: Number(o.planejadoUn) || 0, produzidoUn: Number(o.produzidoUn) || 0,
      pesoPlanejado: Number(o.pesoPlanejado) || 0,
      dataInicio: o.dataInicio ? o.dataInicio.toISOString() : null,
      dataFim: o.dataFim ? o.dataFim.toISOString() : null,
    }))
    .sort((a, b) => String(a.operacao || "").localeCompare(String(b.operacao || ""), undefined, { numeric: true }) || ORDEM_SETOR.indexOf(a.setor) - ORDEM_SETOR.indexOf(b.setor));

  const sinc = linhas.reduce((a, o) => (!a || o.updatedAt > a ? o.updatedAt : a), null);
  return NextResponse.json({ marca, ordens, sincronizadoEm: sinc ? sinc.toISOString() : null });
}
