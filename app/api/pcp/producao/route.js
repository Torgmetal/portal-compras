// GET /api/pcp/producao — a lista de OPs do PCP: uma linha por obra, com o que decide o dia.
//
// Vitor (24/08/2026): "da forma que está como painel não está funcionando; pensei em alguma coisa
// listada onde clicamos mostrar as OPs, peças programadas pelo programador, peças já programadas
// fica liberado para o PCP descer para fabricar, quando já estiver em algum setor já trazer o
// status, a forma de conseguir selecionar vários para podermos imprimir, status de material na
// preparação".
//
// ⚠⚠ MESMA FONTE DA TV, DE PROPÓSITO. `carregarPrioridadesPorObra` é o que alimenta as raias de
// /planejamento/prioridades. Se esta lista carregasse as peças por conta própria, a mesma obra
// mostraria kg diferente em duas telas do mesmo portal — e a conversa vira sobre qual acreditar,
// não sobre o que fabricar. Aqui só se PIVOTA: a TV corta por setor, a lista corta por OP.
//
// ⚠ O DETALHE NÃO VEM DAQUI. Clicar na OP abre /api/pcp/despacho?opId=&setor=, que já devolve peça
// a peça com programação, material e baixa. Duplicar aquilo aqui daria dois lugares para consertar.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import {
  FLUXO_SETORES, progressoPorSetor, progressoMontagemMontavel, entregaDoSetor, temDetalheCorte,
} from "@/lib/prioridades-setor";
import { carregarPrioridadesPorObra } from "@/lib/prioridades-setor-data";
import { statusCompraPorOp } from "@/lib/status-compra";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROLES = ["ADMIN", "PCP", "PLANEJAMENTO", "PRODUCAO"];

export async function GET() {
  try { await requireRole(ROLES); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const { porObra, now } = await carregarPrioridadesPorObra();
  if (!porObra.length) return NextResponse.json({ ops: [], geradoEm: new Date().toISOString() });

  const opIds = porObra.map((o) => o.opId);
  const opNumeros = porObra.map((o) => o.opNumero);

  // ── O PROGRAMADOR LANÇOU? ──────────────────────────────────────────────────────────────────
  // ⚠ SEM filtro de `produzidoUn`, ao contrário do `realMap`. A ordem do Syneco nasce quando o
  // programador lança a peça; produção é o passo seguinte. Peça lançada e ainda não iniciada é
  // exatamente o que o PCP procura — é o que já pode descer para a fábrica.
  const ordens = await prisma.mesOrdem.groupBy({ by: ["opId", "item"], where: { opId: { in: opIds } } });
  const lancadasPorOp = new Map();
  for (const o of ordens) {
    if (!o.opId || !o.item) continue;
    const s = lancadasPorOp.get(o.opId) || new Set();
    s.add(String(o.item).toUpperCase());
    lancadasPorOp.set(o.opId, s);
  }

  // ── JÁ FOI LIBERADO? ───────────────────────────────────────────────────────────────────────
  // Vitor (24/08/2026) escolheu: liberar É imprimir a GRD. Então "liberado" não é campo novo — é
  // a existência da GRD daquela marca, que já guarda quem emitiu, quando e quantas impressões.
  const grds = await prisma.grdLiberacao.findMany({
    where: { opNumero: { in: opNumeros } },
    select: { opNumero: true, marca: true },
  });
  const liberadasPorOp = new Map();
  for (const g of grds) {
    const s = liberadasPorOp.get(g.opNumero) || new Set();
    s.add(String(g.marca).toUpperCase());
    liberadasPorOp.set(g.opNumero, s);
  }

  // Material do CMR — o corte não começa sem ele. Ver lib/status-compra.js.
  let compra = new Map();
  try { compra = await statusCompraPorOp(opNumeros); } catch { /* almoxarifado fora não derruba a lista */ }

  const ops = porObra.map((o) => {
    const setores = progressoPorSetor(o.universo, o.realMap);
    const mi = setores.findIndex((x) => x.setor === "MONTAGEM");
    if (mi >= 0) setores[mi] = progressoMontagemMontavel(o.universo, o.realMap, o.links);

    const lancadas = lancadasPorOp.get(o.opId) || new Set();
    const liberadas = liberadasPorOp.get(o.opNumero) || new Set();
    const marcas = o.universo.map((p) => String(p.marca || "").toUpperCase()).filter(Boolean);
    const nLancadas = marcas.filter((m) => lancadas.has(m)).length;
    const nLiberadas = marcas.filter((m) => liberadas.has(m)).length;

    // ⚠ a fila da OP é a soma do que falta em CADA setor, não o peso da obra: a mesma peça passa
    // por corte, solda e pintura, e somar o peso dela uma vez por setor é o que a TV mostra na
    // raia. Aqui o número que interessa é o pendente do setor onde ela está parada.
    const pendenteKg = setores.reduce((a, s) => a + (s.pendenteKg || 0), 0);
    const totalKg = o.universo.reduce((a, p) => a + (Number(p.pesoTotalKg) || 0), 0);

    // A entrega mais apertada entre os setores que ainda têm fila — é ela que dita a urgência.
    const comFila = setores.filter((s) => (s.pendenteKg || 0) > 0);
    const datas = comFila.map((s) => entregaDoSetor(o.datasSetor, s.setor, o.entrega, now));
    const atrasoDias = datas.length ? Math.max(...datas.map((d) => d.atrasoDias || 0)) : 0;
    const entrega = datas.map((d) => d.entrega).filter(Boolean).sort()[0] || o.entrega || null;

    const semPecas = (o.universo || []).length === 0;
    const alertas = [];
    if (semPecas) alertas.push("SEM_LISTA");
    else if (!temDetalheCorte(o.universo)) {
      alertas.push((o.realMap?.size || 0) > 0 ? "PRODUZINDO_SEM_LISTA" : "SEM_DETALHE_CORTE");
    }
    if (o.semCronograma) alertas.push("SEM_CRONOGRAMA");
    if (marcas.length && nLancadas === 0) alertas.push("NADA_LANCADO");

    return {
      opId: o.opId, opNumero: o.opNumero, cliente: o.cliente, obra: o.obra, refCliente: o.refCliente,
      entrega: entrega ? new Date(entrega).toISOString() : null, atrasoDias, alertas,
      kg: { total: Math.round(totalKg), pendente: Math.round(pendenteKg) },
      pecas: { total: marcas.length, lancadas: nLancadas, naoLancadas: marcas.length - nLancadas, liberadas: nLiberadas },
      setores: setores
        .filter((s) => (s.totalKg || 0) > 0)
        .map((s) => {
          const es = entregaDoSetor(o.datasSetor, s.setor, o.entrega, now);
          return {
            setor: s.setor, label: FLUXO_SETORES.find((f) => f.key === s.setor)?.label || s.setor,
            totalKg: Math.round(s.totalKg || 0), pendenteKg: Math.round(s.pendenteKg || 0),
            pct: s.pct ?? 0, entrega: es.entrega || null, atrasoDias: es.atrasoDias || 0,
          };
        }),
      compra: compra.get(o.opNumero) || null,
    };
  });

  // Atrasada primeiro, depois entrega mais próxima, depois mais kg parado. Mesma régua da TV.
  ops.sort((a, b) => {
    if ((b.atrasoDias > 0) !== (a.atrasoDias > 0)) return (b.atrasoDias > 0) - (a.atrasoDias > 0);
    if (a.atrasoDias !== b.atrasoDias) return b.atrasoDias - a.atrasoDias;
    if (a.entrega && b.entrega && a.entrega !== b.entrega) return new Date(a.entrega) - new Date(b.entrega);
    if (a.entrega !== b.entrega) return a.entrega ? -1 : 1;
    return b.kg.pendente - a.kg.pendente;
  });

  return NextResponse.json({ ops, geradoEm: new Date().toISOString() });
}
