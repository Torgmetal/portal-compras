import { prisma, waitMesTables } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import MesClient from "./MesClient";

export const metadata = {
  title: "Workspace Torg — Rastreabilidade Syneco",
};

export default async function MesPage() {
  await waitMesTables();
  await requireRole(["ADMIN", "PRODUCAO", "COMERCIAL", "COMPRAS"]);

  // Data de hoje no fuso Brasil/São Paulo (UTC-3, sem horário de verão desde 2019)
  const hojeStr = new Intl.DateTimeFormat("fr-CA", { timeZone: "America/Sao_Paulo" })
    .format(new Date()); // retorna "YYYY-MM-DD"

  // Default: SÓ O DIA DE HOJE (início = fim = hoje). Pra ver dias anteriores,
  // o usuário ajusta o filtro na tela. Datas do Syneco são UTC-naïve → janela
  // em 00:00Z/23:59Z (sem offset -03:00, senão a madrugada vaza pro dia anterior).
  const de  = new Date(hojeStr + "T00:00:00.000Z");
  const ate = new Date(hojeStr + "T23:59:59.999Z");

  const [grupos0, totais0, statusGrupos, opsDb, ultimoSync, totalGeral] = await Promise.all([
    prisma.mesOrdem.groupBy({
      by: ["obra", "setor"],
      where: { dataInicio: { gte: de, lte: ate } },
      _sum:   { pesoProduzido: true, produzidoUn: true, rejeitadoUn: true, pesoPlanejado: true },
      _count: { id: true },
      _max:   { dataFim: true, updatedAt: true },
      orderBy: [{ obra: "asc" }],
    }),
    prisma.mesOrdem.groupBy({
      by: ["obra"],
      where: { dataInicio: { gte: de, lte: ate } },
      _sum:   { pesoProduzido: true, produzidoUn: true },
      _count: { id: true },
      _max:   { updatedAt: true },
    }),
    prisma.mesOrdem.groupBy({
      by: ["obra", "status"],
      where: { dataInicio: { gte: de, lte: ate } },
      _count: { id: true },
    }),
    prisma.oP.findMany({
      where: { status: { in: ["ABERTA", "EM_EXECUCAO", "ATRASADA"] } },
      select: { id: true, numero: true, cliente: true, obra: true },
      orderBy: { numero: "asc" },
    }),
    prisma.mesSyncLog.findFirst({ orderBy: { criadoEm: "desc" } }),
    prisma.mesOrdem.count(),
  ]);

  // Remapeia para o formato que o MesClient consome (produzidoKg, productionId…)
  const grupos = grupos0.map(g => ({
    obra: g.obra, setor: g.setor,
    _sum: {
      produzidoKg:   g._sum.pesoProduzido || 0,
      produzidoUn:   g._sum.produzidoUn || 0,
      rejeitado:     g._sum.rejeitadoUn || 0,
      retrabalhado:  0,
      pesoPlanejado: g._sum.pesoPlanejado || 0,
    },
    _count: { productionId: g._count.id || 0 },
    _max:   { dataFim: g._max.dataFim, updatedAt: g._max.updatedAt },
  }));
  const totaisPorObra = totais0.map(t => ({
    obra: t.obra,
    _sum: { produzidoKg: t._sum.pesoProduzido || 0, produzidoUn: t._sum.produzidoUn || 0 },
    _count: { productionId: t._count.id || 0 },
    _max: { updatedAt: t._max.updatedAt },
  }));

  // Converte T64 → 064 para encontrar a OP no portal
  function obraParaNumeroOP(obra) {
    if (!obra) return obra;
    const m = obra.match(/^T(\d+)/i);
    if (!m) return obra;
    return String(parseInt(m[1])).padStart(3, "0");
  }
  // opMapPorNumero: "064" → { id, numero, cliente, obra }
  const opMapPorNumero = Object.fromEntries(opsDb.map(o => [o.numero, o]));
  // obrasUnicas do período: ["T64", "T70", ...]
  const obrasUnicas = [...new Set(grupos.map(g => g.obra).filter(Boolean))];
  // opMap final com chave = obra SKA (T64) para o client usar direto
  const opMap = Object.fromEntries(
    obrasUnicas.map(obra => [obra, opMapPorNumero[obraParaNumeroOP(obra)] || null])
  );
  const totaisMap = Object.fromEntries(totaisPorObra.map(t => [t.obra, t]));

  // Status dominante por obra: Produzindo > Finalizado Total > Finalizado Parcial > Finalizado
  const PRIO = { "Produzindo": 4, "Finalizado Total": 3, "Finalizado Parcial": 2, "Finalizado": 1 };
  const statusMap = {};
  for (const row of statusGrupos) {
    const cur = statusMap[row.obra];
    if (!cur || (PRIO[row.status] || 0) > (PRIO[cur] || 0)) {
      statusMap[row.obra] = row.status;
    }
  }

  // Não Iniciadas: OPs ativas do portal sem nenhuma produção (produzido = 0)
  const normObraNum = (obra) => { const m = (obra || "").match(/^T(\d+)/i); return m ? String(parseInt(m[1])) : ""; };
  const obrasComProducao = new Set(
    grupos.filter(g => (g._sum.produzidoUn || 0) > 0).map(g => normObraNum(g.obra)).filter(Boolean)
  );
  const naoIniciadas = opsDb
    .filter(op => !obrasComProducao.has(String(parseInt(op.numero || "0"))))
    .map(op => ({
      obra:   `T${parseInt(op.numero)}`,
      opInfo: { id: op.id, cliente: op.cliente, obra: op.obra, numero: op.numero },
    }));

  // Setores únicos para os filtros (vindos dos dados reais)
  const setoresUnicos = [...new Set(grupos.map(g => g.setor).filter(Boolean))].sort();

  return (
    <MesClient
      grupos={JSON.parse(JSON.stringify(grupos))}
      opMap={JSON.parse(JSON.stringify(opMap))}
      totaisMap={JSON.parse(JSON.stringify(totaisMap))}
      statusMapInicial={statusMap}
      naoInicidasIniciais={naoIniciadas}
      setoresDisponiveis={setoresUnicos}
      ultimoSync={JSON.parse(JSON.stringify(ultimoSync))}
      totalGeralBanco={totalGeral}
      deInicial={hojeStr}
      ateInicial={hojeStr}
    />
  );
}
