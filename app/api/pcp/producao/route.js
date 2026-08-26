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

export async function GET(req) {
  try { await requireRole(ROLES); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  // ⚠⚠ POR PADRÃO, SÓ O QUE O PLANEJAMENTO LIBEROU. Vitor (25/08/2026): "no painel do PCP o ideal
  // seria não mostrar nenhuma obra por hora para não ficar confuso, e o planejamento cria a demanda
  // para o pcp indicando as prioridades e fases das obras".
  //
  // Antes esta lista trazia TODA obra com cronograma ativo — 30 linhas, e escolher qual atacar
  // virava conversa diária. `?todas=1` continua mostrando tudo, para quem precisa procurar.
  const todas = new URL(req.url).searchParams.get("todas") === "1";

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

  // ── a liberação do Planejamento ──────────────────────────────────────────────────────────
  const libs = await prisma.liberacaoProducao.findMany({
    where: { opId: { in: opIds }, status: { in: ["LIBERADA", "EM_PRODUCAO"] } },
    orderBy: { liberadoEm: "asc" },
  });
  const porOpLib = new Map();
  for (const l of libs) {
    const g = porOpLib.get(l.opId) || [];
    g.push({
      id: l.id, frente: l.frente, setores: l.setores, prioridade: l.prioridade, status: l.status,
      liberadoEm: l.liberadoEm.toISOString(), liberadoPorNome: l.liberadoPorNome,
      dataMarco: l.dataMarco ? l.dataMarco.toISOString() : null,
      // o DIA em que este lote deve ser cortado — é por ele que a fila se ordena
      dataProgramada: l.dataProgramada ? l.dataProgramada.toISOString().slice(0, 10) : null,
      pecas: Array.isArray(l.pecaIds) ? l.pecaIds.length : null,
      totalKg: l.totalKg || null,
      desvioDias: l.desvioDias, desvioMotivo: l.desvioMotivo,
    });
    porOpLib.set(l.opId, g);
  }
  for (const o of ops) o.liberacoes = porOpLib.get(o.opId) || [];

  const visiveis = todas ? ops : ops.filter((o) => o.liberacoes.length > 0);

  const PRIO = { ALTA: 0, MEDIA: 1, BAIXA: 2 };
  // ⚠⚠ A FILA É A DATA. Vitor (26/08/2026): "na pagina do pcp precisamos que deixe a fila de acordo
  // com a data que definimos".
  //
  // O Planejamento agora programa dia a dia; a ordem da fábrica tem de ser essa, não uma régua que
  // o PCP recalcula por conta. Antes ordenava por prioridade → atraso → entrega — critérios que
  // fazem sentido SEM programação, e que passam por cima dela quando ela existe.
  //
  // ⚠ Obra sem dia programado vai para o FIM, não para o começo: sem data ela não foi posta em
  // nenhum dia, e furar a fila de quem tem dia marcado desfaz a programação.
  const diaDaOp = (o) => {
    const dias = (o.liberacoes || []).map((l) => l.dataProgramada).filter(Boolean).sort();
    return dias[0] || null;
  };
  // ⚠ com liberação, a PRIORIDADE do Planejamento manda — é a decisão dele, e o PCP não deve
  // reordenar por conta própria. Sem liberação (modo "todas"), vale a régua antiga da TV.
  const prioDaOp = (o) => Math.min(...(o.liberacoes.length ? o.liberacoes.map((l) => PRIO[l.prioridade] ?? 1) : [9]));

  // Atrasada primeiro, depois entrega mais próxima, depois mais kg parado. Mesma régua da TV.
  visiveis.sort((a, b) => {
    // 1) o dia programado manda
    const da = diaDaOp(a), db = diaDaOp(b);
    if (da !== db) { if (!da) return 1; if (!db) return -1; return da < db ? -1 : 1; }
    // 2) empatado no dia, a prioridade do Planejamento desempata
    const pa = prioDaOp(a), pb = prioDaOp(b);
    if (pa !== pb) return pa - pb;
    if ((b.atrasoDias > 0) !== (a.atrasoDias > 0)) return (b.atrasoDias > 0) - (a.atrasoDias > 0);
    if (a.atrasoDias !== b.atrasoDias) return b.atrasoDias - a.atrasoDias;
    if (a.entrega && b.entrega && a.entrega !== b.entrega) return new Date(a.entrega) - new Date(b.entrega);
    if (a.entrega !== b.entrega) return a.entrega ? -1 : 1;
    return b.kg.pendente - a.kg.pendente;
  });

  return NextResponse.json({
    ops: visiveis,
    todas,
    totalObras: ops.length,
    liberadas: ops.filter((o) => o.liberacoes.length > 0).length,
    geradoEm: new Date().toISOString(),
  });
}
