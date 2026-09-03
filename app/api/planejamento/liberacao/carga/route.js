// GET /api/planejamento/liberacao/carga?setor=CORTE&opId=…&dias=21
//   → quanto já foi programado para cada dia, EM TODA A FÁBRICA, com a fatia desta obra à parte.
//
// ⚠⚠ O DIA É DA FÁBRICA, NÃO DA OBRA. Vitor (03/09/2026): "não precisa ser apenas de uma OP, mostre
// tudo que foi para aquele dia". Ele está certo e isso muda a pergunta que a tela responde: a meta
// de 12.000 kg/dia é do SETOR — a máquina é uma só. Olhando apenas a OP aberta, alguém enche a
// terça com 9 t achando que sobra espaço, quando outra obra já colocou 8 t no mesmo dia.
//
// ⚠ O setor filtra de verdade: `LiberacaoProducao.setores` é a lista do que desceu naquele lote
// (["CORTE","MONTAGEM"]). Somar tudo misturaria a esteira do corte com a bancada da montagem, que
// têm metas diferentes e nem sequer disputam a mesma máquina.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ROLES = ["ADMIN", "PLANEJAMENTO", "PCP", "PRODUCAO"];

export async function GET(req) {
  try { await requireRole(ROLES); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const { searchParams } = new URL(req.url);
  const setor = String(searchParams.get("setor") || "").toUpperCase();
  const opId = searchParams.get("opId") || null;

  const abertas = await prisma.liberacaoProducao.findMany({
    where: { status: { in: ["LIBERADA", "EM_PRODUCAO"] } },
    select: {
      id: true, opId: true, frente: true, setores: true, dataProgramada: true, pecaIds: true,
      op: { select: { numero: true, obra: true, cliente: true } },
    },
    orderBy: [{ dataProgramada: "asc" }],
    take: 4000,
  });

  const doSetor = setor
    ? abertas.filter((l) => (Array.isArray(l.setores) ? l.setores : []).map(String).includes(setor))
    : abertas;
  if (!doSetor.length) return NextResponse.json({ setor: setor || null, dias: [] });

  // ⚠ o peso vem da peça, e só das que ainda existem: id órfão (lista reimportada depois da
  // liberação) não conta no dia — ele aparece separado, para alguém reprogramar.
  const ids = [...new Set(doSetor.flatMap((l) => (Array.isArray(l.pecaIds) ? l.pecaIds : []).map(String)))];
  const pecas = ids.length
    ? await prisma.pecaConjunto.findMany({ where: { id: { in: ids } }, select: { id: true, pesoTotalKg: true } })
    : [];
  const pesoDe = new Map(pecas.map((p) => [p.id, p.pesoTotalKg || 0]));

  const porDia = new Map();
  for (const l of doSetor) {
    const k = l.dataProgramada ? l.dataProgramada.toISOString().slice(0, 10) : "";
    const g = porDia.get(k) || porDia.set(k, {
      dia: k || null, kg: 0, pecas: 0, orfas: 0,
      minhaKg: 0, minhasPecas: 0, obras: new Map(),
    }).get(k);

    const lista = Array.isArray(l.pecaIds) ? l.pecaIds.map(String) : [];
    let kgLote = 0, nLote = 0;
    for (const id of lista) {
      if (!pesoDe.has(id)) { g.orfas++; continue; }
      kgLote += pesoDe.get(id); nLote++;
    }
    g.kg += kgLote; g.pecas += nLote;
    if (opId && l.opId === opId) { g.minhaKg += kgLote; g.minhasPecas += nLote; }

    // ⚠ a obra vai junto: sem saber QUEM ocupou o dia, "o dia está cheio" não dá o que fazer.
    const nome = `OP-${l.op?.numero || "?"}`;
    const o = g.obras.get(nome) || { obra: nome, kg: 0, pecas: 0, minha: opId ? l.opId === opId : false };
    o.kg += kgLote; o.pecas += nLote;
    g.obras.set(nome, o);
  }

  const dias = [...porDia.values()]
    .map((g) => ({
      ...g,
      kg: Math.round(g.kg), minhaKg: Math.round(g.minhaKg),
      obras: [...g.obras.values()].map((o) => ({ ...o, kg: Math.round(o.kg) })).sort((a, b) => b.kg - a.kg),
    }))
    .sort((a, b) => (a.dia || "9999").localeCompare(b.dia || "9999"));

  return NextResponse.json({ setor: setor || null, dias });
}
