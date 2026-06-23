import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { isoWeekString } from "@/lib/semana";
import { listarFurosApontamento, resumoCorteAtivo } from "@/lib/conjuntos-setor";
import { carregarSolicitacoes } from "@/lib/solicitacao-producao";
import PainelProducaoClient from "./PainelProducaoClient";

export const metadata = { title: "Workspace Torg — Painel de Produção" };
export const dynamic = "force-dynamic";

// Setores do Syneco (nomes exatos do MesOrdem) e status do pipeline da peça.
const SETORES_SYNECO = ["Corte", "Montagem", "Solda", "Acabamento", "Jato", "Pintura"];
const PIPE_STATUS = ["PENDENTE", "CORTE", "MONTAGEM", "SOLDA", "ACABAMENTO", "JATO", "PINTURA", "EXPEDIDO"];
const POS_CORTE = ["MONTAGEM", "SOLDA", "ACABAMENTO", "JATO", "PINTURA", "EXPEDIDO"];

export default async function PainelProducao() {
  await requireRole(["ADMIN", "COMERCIAL", "COMPRAS", "PRODUCAO", "PCP", "PLANEJAMENTO"]);

  // "Hoje"/mês na janela do dia do Syneco. As datas do Syneco são gravadas como
  // BRT sem offset (UTC-naïve) → o dia é [dia 00:00Z, dia+1 00:00Z), igual ao
  // "Relatório do dia".
  const hojeIso = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const hojeBRT = new Date(hojeIso + "T00:00:00.000Z");
  const hojeFim = new Date(hojeBRT.getTime() + 86400000);
  const inicioMes = new Date(hojeIso.slice(0, 7) + "-01T00:00:00.000Z");
  const [ano, mes, dia] = hojeIso.split("-").map(Number);
  const diasNoMes = new Date(ano, mes, 0).getDate();
  // ~12 semanas atrás para a evolução
  const inicio12sem = new Date(hojeBRT);
  inicio12sem.setUTCDate(inicio12sem.getUTCDate() - 84);

  const umDiaAtras = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [pipeRaw, metas, synHojeRaw, synMesRaw, synSemanaRaw, furos, paradas, corteAtivo] = await Promise.all([
    // Pipeline das peças (conjuntos + avulsas; croqui só conta no corte)
    prisma.pecaConjunto.groupBy({ by: ["status", "tipoPeca"], _count: true, _sum: { pesoTotalKg: true } }),

    // Meta mensal por setor (modelo Meta — mesmas usadas no Mapa)
    prisma.meta.findMany({
      where: { modulo: "PRODUCAO", tipo: "PESO_KG", ano, mes, setor: { in: SETORES_SYNECO } },
      select: { setor: true, valorMensal: true },
    }),

    // Syneco: APONTADO hoje por setor (apontamentos do dia — não o cumulativo das
    // ordens; mesOrdem inflava setores com ordens de vários dias).
    prisma.mesApontamento.groupBy({
      by: ["setor"],
      where: { setor: { in: SETORES_SYNECO }, produzidoUn: { gt: 0 }, dataFim: { gte: hojeBRT, lt: hojeFim } },
      _sum: { produzidoKg: true, produzidoUn: true },
    }),

    // Syneco: apontado no MÊS por setor
    prisma.mesApontamento.groupBy({
      by: ["setor"],
      where: { setor: { in: SETORES_SYNECO }, produzidoUn: { gt: 0 }, dataFim: { gte: inicioMes } },
      _sum: { produzidoKg: true },
    }),

    // Syneco: peso apontado (todos setores) nas últimas ~12 semanas → evolução
    prisma.mesApontamento.findMany({
      where: { produzidoUn: { gt: 0 }, dataFim: { gte: inicio12sem } },
      select: { dataFim: true, produzidoKg: true },
    }),

    listarFurosApontamento(),

    // Peças paradas >1 dia no setor (conjuntos/avulsas LPC, fora de pendente/expedido)
    prisma.pecaConjunto.count({
      where: {
        fonte: "LPC_IMPORT",
        status: { notIn: ["PENDENTE", "EXPEDIDO"] },
        atualizadoEm: { lt: umDiaAtras },
        OR: [{ tipoPeca: "CONJUNTO" }, { tipoPeca: null }],
      },
    }),

    resumoCorteAtivo(),
  ]);

  // ── Pipeline (aplica regra croqui só no corte) ──
  const pipe = {};
  for (const s of PIPE_STATUS) pipe[s] = { pecas: 0, kg: 0 };
  for (const r of pipeRaw) {
    if (!pipe[r.status]) continue;
    if (POS_CORTE.includes(r.status) && r.tipoPeca === "CROQUI") continue;
    pipe[r.status].pecas += r._count;
    pipe[r.status].kg += r._sum.pesoTotalKg || 0;
  }
  // Corte: só croquis ainda não consumidos (conjunto subiu pra montagem → baixa)
  pipe.CORTE = { pecas: corteAtivo.count, kg: corteAtivo.kg };

  // ── Syneco por setor (hoje/mês) + meta ──
  const setores = SETORES_SYNECO.map((s) => {
    const hoje = synHojeRaw.find((r) => r.setor === s);
    const mesAgg = synMesRaw.find((r) => r.setor === s);
    const meta = metas.find((m) => m.setor === s);
    return {
      setor: s,
      hojeKg: hoje?._sum.produzidoKg || 0,
      hojeUn: hoje?._sum.produzidoUn || 0,
      mesKg: mesAgg?._sum.produzidoKg || 0,
      metaKg: meta?.valorMensal || 0,
    };
  });

  // ── Evolução semanal (peso apontado por semana ISO) ──
  const semMap = {};
  for (const r of synSemanaRaw) {
    const wk = isoWeekString(new Date(r.dataFim));
    semMap[wk] = (semMap[wk] || 0) + (r.produzidoKg || 0);
  }
  const semanas = Object.entries(semMap)
    .map(([semana, kg]) => ({ semana, kg }))
    .sort((a, b) => a.semana.localeCompare(b.semana));

  // Demandas do Planejamento ainda pendentes (Solicitada) — somem ao virar Programada
  const solicitacoes = await carregarSolicitacoes(["SOLICITADA"]);

  return (
    <PainelProducaoClient
      hoje={hojeIso}
      dia={dia}
      diasNoMes={diasNoMes}
      pipe={pipe}
      setores={setores}
      semanas={semanas}
      furos={JSON.parse(JSON.stringify(furos))}
      paradas={paradas}
      solicitacoes={JSON.parse(JSON.stringify(solicitacoes))}
    />
  );
}
