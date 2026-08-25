// GET /api/diretoria/fluxo — o caminho do trabalho, da Engenharia até a bancada.
//
// Vitor (25/08/2026): "não tenho o controle do que a engenharia desce de desenho para o programador,
// não tenho a visão do que o programador de fato fez e não tenho o controle do que cada setor está
// fazendo... como estruturar isso dentro da Diretoria".
//
// ⚠⚠ TRÊS PERGUNTAS, UMA FONTE CADA — e nenhuma tabela nova.
//   1. entregou × lançou → `PecaConjunto` (LPC importada) × `MesOrdem` (ordem do Syneco)
//   2. fora do mapa      → item com ordem no Syneco que NÃO existe na LPC do portal
//   3. ritmo por setor   → apontamento do Syneco por dia
//
// ⚠ ESTA TELA É DE LEITURA. Diretoria é onde se olha e se cobra; quem opera trabalha no PCP e na
// Produção. Nenhum botão daqui muda dado — se virar tela de ação, vira a quarta lista de trabalho
// e a fábrica passa a ter mais um lugar para discordar de si mesma.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDiretoria } from "@/lib/diretoria";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DIAS_RITMO = 14;

export async function GET() {
  try { await requireDiretoria(); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const ops = await prisma.oP.findMany({
    where: { status: { notIn: ["ENCERRADA", "CANCELADA"] } },
    select: { id: true, numero: true, cliente: true, obra: true, emProducao: true, dataFimPrevista: true },
    orderBy: { numero: "asc" },
  });
  const ids = ops.map((o) => o.id);
  if (!ids.length) return NextResponse.json({ ops: [], setores: [], dias: [], geradoEm: new Date().toISOString() });

  // ── 1. o que a Engenharia entregou: a LPC importada é o "desenho que desceu" ────────────────
  // ⚠ LPC, não LE: a lista de expedição é o que embarca; a de produção é o que se fabrica. Medir a
  // fila do programador pela LE contaria conjunto e ignoraria croqui, que é o grosso do corte.
  const pecas = await prisma.pecaConjunto.findMany({
    where: { opId: { in: ids }, fonte: "LPC_IMPORT" },
    select: { opId: true, marca: true, pesoTotalKg: true },
  });
  const daOp = new Map(); // opId → { marcas:Set, kg }
  for (const p of pecas) {
    const g = daOp.get(p.opId) || { marcas: new Set(), kg: 0 };
    g.marcas.add(String(p.marca || "").toUpperCase());
    g.kg += Number(p.pesoTotalKg) || 0;
    daOp.set(p.opId, g);
  }

  // ── 2. o que o programador lançou ───────────────────────────────────────────────────────────
  // ⚠ SEM filtro de produção: a ordem nasce quando ele LANÇA; produzir é o passo seguinte. E é o
  // `_min(createdAt)` que diz há quanto tempo aquela obra parou de receber lançamento.
  const ordens = await prisma.mesOrdem.groupBy({
    by: ["opId", "item"],
    where: { opId: { in: ids } },
    _min: { createdAt: true },
  });
  const lancadas = new Map(); // opId → { marcas:Set, ultimoLancamento:Date }
  for (const o of ordens) {
    if (!o.opId || !o.item) continue;
    const g = lancadas.get(o.opId) || { marcas: new Set(), ultimo: null };
    g.marcas.add(String(o.item).toUpperCase());
    const q = o._min.createdAt;
    if (q && (!g.ultimo || q > g.ultimo)) g.ultimo = q;
    lancadas.set(o.opId, g);
  }

  const agora = Date.now();
  const dias = (d) => (d ? Math.floor((agora - new Date(d).getTime()) / 86400000) : null);

  const linhas = ops.map((o) => {
    const eng = daOp.get(o.id) || { marcas: new Set(), kg: 0 };
    const prog = lancadas.get(o.id) || { marcas: new Set(), ultimo: null };
    const entregues = eng.marcas.size;
    const casadas = [...eng.marcas].filter((m) => prog.marcas.has(m)).length;
    // ⚠ FORA DO MAPA: a fábrica tem ordem e o portal não tem a peça. Não é atraso, é cegueira —
    // tudo que se conta por OP (kg pendente, avanço de setor, fila) sai errado nessas.
    const foraDoMapa = [...prog.marcas].filter((m) => !eng.marcas.has(m)).length;
    return {
      opId: o.id, numero: o.numero, cliente: o.cliente, obra: o.obra,
      emProducao: !!o.emProducao,
      entrega: o.dataFimPrevista ? o.dataFimPrevista.toISOString() : null,
      atrasoDias: o.dataFimPrevista ? Math.max(0, dias(o.dataFimPrevista)) : 0,
      entregues, lancadas: casadas, aLancar: entregues - casadas, foraDoMapa,
      kgLpc: Math.round(eng.kg),
      diasSemLancar: dias(prog.ultimo),
      // ⚠ a obra que produz SEM lista nenhuma é o caso extremo do fora do mapa: nem dá para dizer
      // o que ela é. Merece nome próprio para não se perder no meio dos números grandes.
      semListaNenhuma: entregues === 0 && prog.marcas.size > 0,
    };
  }).filter((l) => l.entregues > 0 || l.foraDoMapa > 0);

  // ── 3. ritmo por setor ──────────────────────────────────────────────────────────────────────
  // ⚠ o corte é por `dataInicio` do apontamento (quando a fábrica produziu), não por `createdAt`
  // (quando o sync trouxe) — senão um sync atrasado empilharia dias de produção num dia só.
  const desde = new Date(agora - DIAS_RITMO * 86400000);
  const porSetor = await prisma.$queryRaw`
    SELECT setor,
           count(DISTINCT to_char("dataInicio",'YYYY-MM-DD'))::int dias,
           sum("produzidoUn")::int un,
           sum("pesoProduzido")::float kg,
           count(DISTINCT obra)::int obras,
           max("dataInicio") ultimo
    FROM "MesOrdem"
    WHERE "dataInicio" >= ${desde} AND "produzidoUn" > 0
    GROUP BY 1 ORDER BY 4 DESC`;

  const porDia = await prisma.$queryRaw`
    SELECT to_char("dataInicio",'YYYY-MM-DD') dia,
           sum("pesoProduzido")::float kg,
           count(DISTINCT setor)::int setores
    FROM "MesOrdem"
    WHERE "dataInicio" >= ${desde} AND "produzidoUn" > 0
    GROUP BY 1 ORDER BY 1 ASC`;

  const totais = {
    entregues: linhas.reduce((a, l) => a + l.entregues, 0),
    lancadas: linhas.reduce((a, l) => a + l.lancadas, 0),
    aLancar: linhas.reduce((a, l) => a + l.aLancar, 0),
    foraDoMapa: linhas.reduce((a, l) => a + l.foraDoMapa, 0),
    obrasForaDoMapa: linhas.filter((l) => l.foraDoMapa > 0).length,
    obrasSemLista: linhas.filter((l) => l.semListaNenhuma).length,
  };

  return NextResponse.json({
    totais,
    ops: linhas,
    setores: porSetor.map((s) => ({
      setor: s.setor, dias: s.dias, un: s.un, kg: Math.round(s.kg), obras: s.obras,
      ultimo: s.ultimo ? new Date(s.ultimo).toISOString() : null,
      mediaDia: s.dias > 0 ? Math.round(s.kg / s.dias) : 0,
    })),
    dias: porDia.map((d) => ({ dia: d.dia, kg: Math.round(d.kg), setores: d.setores })),
    janelaDias: DIAS_RITMO,
    geradoEm: new Date().toISOString(),
  });
}
