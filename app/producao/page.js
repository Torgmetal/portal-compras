import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { isoWeekString } from "@/lib/semana";
import { listarFurosApontamento, resumoCorteAtivo } from "@/lib/conjuntos-setor";
import { carregarSolicitacoes } from "@/lib/solicitacao-producao";
import { normalizeSetorSyneco, janelaDiaBRT } from "@/lib/syneco-dia";
import PainelProducaoClient from "./PainelProducaoClient";

export const metadata = { title: "Workspace Torg — Painel de Produção" };
export const dynamic = "force-dynamic";

// Setores do Syneco (nomes exatos do MesOrdem) e status do pipeline da peça.
const SETORES_SYNECO = ["Corte", "Montagem", "Solda", "Acabamento", "Jato", "Pintura"];
const PIPE_STATUS = ["PENDENTE", "CORTE", "MONTAGEM", "SOLDA", "ACABAMENTO", "JATO", "PINTURA", "EXPEDIDO"];
const POS_CORTE = ["MONTAGEM", "SOLDA", "ACABAMENTO", "JATO", "PINTURA", "EXPEDIDO"];

export default async function PainelProducao() {
  await requireRole(["ADMIN", "COMERCIAL", "COMPRAS", "PRODUCAO", "PCP", "PLANEJAMENTO"]);

  // "Hoje"/mês na MESMA janela do Relatório do dia (fuso de Brasília, por
  // dataInicio). A lib compartilhada garante que painel e relatório batem.
  const hojeIso = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const { inicio: inicioDia, fim: fimDia } = janelaDiaBRT(hojeIso);
  const [ano, mes, dia] = hojeIso.split("-").map(Number);
  const mesStr = String(mes).padStart(2, "0");
  const diasNoMes = new Date(ano, mes, 0).getDate();
  const inicioMes = new Date(`${ano}-${mesStr}-01T00:00:00.000Z`);
  const fimMes = new Date(`${ano}-${mesStr}-${String(diasNoMes).padStart(2, "0")}T23:59:59.999Z`);
  // ~12 semanas atrás para a evolução (também por dataInicio, BRT)
  const inicio12sem = new Date(inicioDia);
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

    // Syneco: apontado HOJE por setor — MESMA conta do Relatório do dia
    // (mesApontamento por dataInicio, janela BRT). Os nomes crus do Syneco
    // (Serra/Plasma→Corte, MIG/MAG/TIG→Solda…) são normalizados no JS abaixo.
    prisma.mesApontamento.groupBy({
      by: ["setor"],
      where: { dataInicio: { gte: inicioDia, lte: fimDia } },
      _sum: { produzidoKg: true, produzidoUn: true },
    }),

    // Syneco: apontado no MÊS por setor (idem relatório: dataInicio, janela BRT)
    prisma.mesApontamento.groupBy({
      by: ["setor"],
      where: { dataInicio: { gte: inicioMes, lte: fimMes } },
      _sum: { produzidoKg: true, produzidoUn: true },
    }),

    // Syneco: peso apontado (todos setores) nas últimas ~12 semanas → evolução
    prisma.mesApontamento.findMany({
      where: { dataInicio: { gte: inicio12sem } },
      select: { dataInicio: true, produzidoKg: true },
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

  // ── Syneco por setor (hoje/mês) + meta ── normaliza os nomes crus do Syneco
  // para o setor canônico (igual ao Relatório do dia) e soma.
  const hojeMap = {};
  for (const r of synHojeRaw) {
    const n = normalizeSetorSyneco(r.setor);
    if (!n) continue;
    (hojeMap[n] ||= { kg: 0, un: 0 });
    hojeMap[n].kg += r._sum.produzidoKg || 0;
    hojeMap[n].un += r._sum.produzidoUn || 0;
  }
  const mesMap = {};
  for (const r of synMesRaw) {
    const n = normalizeSetorSyneco(r.setor);
    if (!n) continue;
    mesMap[n] = (mesMap[n] || 0) + (r._sum.produzidoKg || 0);
  }
  const setores = SETORES_SYNECO.map((s) => {
    const k = s.toUpperCase();
    const h = hojeMap[k] || { kg: 0, un: 0 };
    const meta = metas.find((m) => m.setor === s);
    return {
      setor: s,
      hojeKg: h.kg,
      hojeUn: h.un,
      mesKg: mesMap[k] || 0,
      metaKg: meta?.valorMensal || 0,
    };
  });

  // ── Evolução semanal (peso apontado por semana ISO, por dataInicio) ──
  const semMap = {};
  for (const r of synSemanaRaw) {
    const wk = isoWeekString(new Date(r.dataInicio));
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
