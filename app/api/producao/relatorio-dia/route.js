// GET /api/producao/relatorio-dia?setor=Corte&data=YYYY-MM-DD
// Peças feitas no dia num setor — direto dos apontamentos do Syneco (MesApontamento).
// Alimenta o botão "Relatório do dia" das abas de cada setor (PCP e Produção).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";

export async function GET(req) {
  try {
    await requireRole(["ADMIN", "PCP", "PLANEJAMENTO", "PRODUCAO"]);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  const url = new URL(req.url);
  const setor = (url.searchParams.get("setor") || "").trim();
  if (!setor) return NextResponse.json({ error: "Informe o setor" }, { status: 400 });

  // Dia em BRT. As datas do Syneco são gravadas como BRT "sem offset" (UTC-naïve),
  // então a janela do dia é [dia 00:00Z, dia+1 00:00Z).
  const diaIso = url.searchParams.get("data") || new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const ini = new Date(diaIso + "T00:00:00.000Z");
  if (isNaN(ini.getTime())) return NextResponse.json({ error: "Data inválida" }, { status: 400 });
  const fim = new Date(ini.getTime() + 86400000);

  const apont = await prisma.mesApontamento.findMany({
    where: {
      setor: { equals: setor, mode: "insensitive" },
      produzidoUn: { gt: 0 },
      dataFim: { gte: ini, lt: fim },
    },
    select: {
      obra: true, descricaoItem: true, opSka: true, maquina: true, operador: true,
      produzidoUn: true, produzidoKg: true, dataFim: true,
    },
    orderBy: [{ maquina: "asc" }, { dataFim: "asc" }],
  });

  const itens = apont.map((a) => ({
    hora: a.dataFim,
    obra: a.obra || "—",
    item: a.descricaoItem || a.opSka || "—",
    maquina: a.maquina || "—",
    operador: a.operador || "—",
    un: a.produzidoUn || 0,
    kg: a.produzidoKg || 0,
  }));
  const totais = {
    itens: itens.length,
    un: itens.reduce((s, i) => s + i.un, 0),
    kg: Math.round(itens.reduce((s, i) => s + i.kg, 0) * 100) / 100,
  };

  return NextResponse.json({ setor, data: diaIso, itens, totais });
}
