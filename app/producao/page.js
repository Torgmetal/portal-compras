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

  // "Hoje"/mês no fuso da fábrica (Syneco grava 00:00 BRT = 03:00Z)
  const hojeIso = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const hojeBRT = new Date(hojeIso + "T03:00:00Z");
  const inicioMes = new Date(hojeIso.slice(0, 7) + "-01T03:00:00Z");
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

    // Syneco: apontado HOJE por setor
    prisma.mesOrdem.groupBy({
      by: ["setor"],
      where: { setor: { in: SETORES_SYNECO }, pesoProduzido: { gt: 0 }, dataFim: { gte: hojeBRT } },
      _sum: { pesoProduzido: true, produzidoUn: true },
    }),

    // Syneco: apontado no MÊS por setor
    prisma.mesOrdem.groupBy({
      by: ["setor"],
      where: { setor: { in: SETORES_SYNECO }, pesoProduzido: { gt: 0 }, dataFim: { gte: inicioMes } },
      _sum: { pesoProduzido: true },
    }),

    // Syneco: peso apontado (todos setores) nas últimas ~12 semanas → evolução
    prisma.mesOrdem.findMany({
      where: { pesoProduzido: { gt: 0 }, dataFim: { gte: inicio12sem } },
      select: { dataFim: true, pesoProduzido: true },
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
      hojeKg: hoje?._sum.pesoProduzido || 0,
      hojeUn: hoje?._sum.produzidoUn || 0,
      mesKg: mesAgg?._sum.pesoProduzido || 0,
      metaKg: meta?.valorMensal || 0,
    };
  });

  // ── Evolução semanal (peso apontado por semana ISO) ──
  const semMap = {};
  for (const r of synSemanaRaw) {
    const wk = isoWeekString(new Date(r.dataFim));
    semMap[wk] = (semMap[wk] || 0) + (r.pesoProduzido || 0);
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
