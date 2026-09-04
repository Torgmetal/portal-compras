// GET /api/pcp/carga-producao[?todas=1]
//   → a fila de cada setor da fábrica, em kg e em DIAS.
//
// Vitor (03/09/2026): "no painel do PCP você consegue criar o kanban para termos ideia da carga da
// produção?".
//
// ⚠⚠ EM DIAS, NÃO SÓ EM KG — é o que muda a decisão. Hoje jato e pintura têm exatamente o mesmo
// peso na fila (82.244 kg cada) e um leva 12,9 dias enquanto o outro leva 3,6, porque a pintura faz
// 23 t/dia e o jato 6,4. Um quadro só de quilos diria que os dois estão igualmente carregados.
//
// ⚠⚠ A FILA VEM DA ORDEM DO SYNECO, não do status da peça: ordem lançada e ainda não produzida
// (`produzidoUn < planejadoUn`), com o saldo em peso. O status da PecaConjunto só é mantido até o
// corte (ver torg_peca_setor_real) e não saberia dizer o que está parado no jato.
//
// ⚠ CORTE E PREPARAÇÃO SÃO A MESMA COLUNA: o Syneco separa a operação 10 (Corte) da 20 (Preparação)
// e só aponta em "Corte"; para quem olha a carga é um setor só, e somá-los separado dobraria as
// colunas do quadro sem dizer nada novo.
//
// ⚠ O RITMO É MEDIDO, no p75 dos dias com apontamento (90 dias) — mesma régua da capacidade das
// máquinas. A média carrega o dia em que o setor mal rodou; o melhor dia é exceção.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ROLES = ["ADMIN", "PCP", "PLANEJAMENTO", "PRODUCAO"];
const DIAS_AMOSTRA = 90;

// ordem do fluxo da fábrica — é assim que o quadro se lê da esquerda para a direita
export const ORDEM_SETORES = ["Preparação", "Montagem", "Solda", "Jato", "Pintura", "Acabamento"];

const semAcento = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
function coluna(setor) {
  const n = semAcento(setor);
  if (n === "corte" || n === "preparacao") return "Preparação";
  const achado = ORDEM_SETORES.find((s) => semAcento(s) === n);
  return achado || null;
}

export async function GET(req) {
  try { await requireRole(ROLES); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const todas = new URL(req.url).searchParams.get("todas") === "1";

  // ⚠ por padrão, só a obra que o Planejamento colocou na fila — a MESMA régua da lista de obras
  // logo abaixo (liberação ativa). Com "todas", entra obra parada como a 060 e a 067, e a escala do
  // quadro muda: a preparação salta de 112 t para 1.884 t.
  const libs = await prisma.liberacaoProducao.findMany({
    where: { status: { in: ["LIBERADA", "EM_PRODUCAO"] } },
    select: { opId: true },
  });
  const naFila = [...new Set(libs.map((l) => l.opId).filter(Boolean))];

  const ordens = todas
    ? await prisma.$queryRaw`
        select mo.setor, o.numero as "opNumero", o.obra,
          sum(greatest(coalesce(mo."pesoPlanejado",0) - coalesce(mo."pesoProduzido",0), 0))::float as kg
        from "MesOrdem" mo join "OP" o on o.id = mo."opId"
        where coalesce(mo."produzidoUn",0) < coalesce(mo."planejadoUn",0)
          and o.status not in ('ENCERRADA','CANCELADA')
        group by 1,2,3`
    : naFila.length
      ? await prisma.$queryRaw`
          select mo.setor, o.numero as "opNumero", o.obra,
            sum(greatest(coalesce(mo."pesoPlanejado",0) - coalesce(mo."pesoProduzido",0), 0))::float as kg
          from "MesOrdem" mo join "OP" o on o.id = mo."opId"
          where coalesce(mo."produzidoUn",0) < coalesce(mo."planejadoUn",0)
            and o.status not in ('ENCERRADA','CANCELADA')
            and o.id = ANY(${naFila})
          group by 1,2,3`
      : [];

  // ritmo de cada setor, medido
  const desde = new Date();
  desde.setDate(desde.getDate() - DIAS_AMOSTRA);
  const aps = await prisma.mesApontamento.findMany({
    where: { dataInicio: { gte: desde }, produzidoKg: { gt: 0 } },
    select: { setor: true, dataInicio: true, produzidoKg: true },
    take: 80000,
  });
  const kgPorSetorDia = new Map();
  for (const a of aps) {
    const c = coluna(a.setor);
    if (!c) continue;
    const k = `${c}|${new Date(a.dataInicio).toISOString().slice(0, 10)}`;
    kgPorSetorDia.set(k, (kgPorSetorDia.get(k) || 0) + (Number(a.produzidoKg) || 0));
  }
  const serie = new Map();
  for (const [k, kg] of kgPorSetorDia) {
    const c = k.split("|")[0];
    if (!serie.has(c)) serie.set(c, []);
    serie.get(c).push(kg);
  }
  const ritmo = {};
  for (const [c, kgs] of serie) {
    kgs.sort((a, b) => a - b);
    ritmo[c] = Math.round(kgs[Math.min(kgs.length - 1, Math.floor(kgs.length * 0.75))] || 0);
  }

  const porColuna = new Map(ORDEM_SETORES.map((s) => [s, { setor: s, kg: 0, obras: new Map() }]));
  for (const r of ordens) {
    const c = coluna(r.setor);
    if (!c || !porColuna.has(c)) continue;
    const kg = Math.max(0, Number(r.kg) || 0);
    if (kg <= 0) continue;
    const g = porColuna.get(c);
    g.kg += kg;
    const atual = g.obras.get(r.opNumero) || { opNumero: r.opNumero, obra: r.obra || null, kg: 0 };
    atual.kg += kg;
    g.obras.set(r.opNumero, atual);
  }

  const colunas = ORDEM_SETORES.map((s) => {
    const g = porColuna.get(s);
    const r = ritmo[s] || 0;
    return {
      setor: s,
      kg: Math.round(g.kg),
      ritmoKgDia: r,
      // ⚠ sem ritmo medido não se inventa um: a coluna mostra o peso e diz que não dá para
      // converter em dias. Número sem origem é pior que número faltando.
      dias: r > 0 ? g.kg / r : null,
      obras: [...g.obras.values()]
        .map((o) => ({ ...o, kg: Math.round(o.kg) }))
        .sort((a, b) => b.kg - a.kg),
    };
  });

  // o gargalo é a coluna com mais DIAS, não com mais quilos
  const comDias = colunas.filter((c) => c.dias != null && c.kg > 0);
  const gargalo = comDias.length ? comDias.reduce((a, b) => (b.dias > a.dias ? b : a)).setor : null;

  return NextResponse.json({ todas, obrasNaFila: naFila.length, gargalo, colunas });
}
