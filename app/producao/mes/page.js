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
  // Vercel roda em UTC, então usamos Intl para pegar a data correta em SP
  const hojeStr = new Intl.DateTimeFormat("fr-CA", { timeZone: "America/Sao_Paulo" })
    .format(new Date()); // retorna "YYYY-MM-DD"

  // Dados armazenados como UTC naïve (hora BRT salva sem offset).
  // Comparamos com meia-noite UTC para preservar o dia exato do Brasil.
  const de  = new Date(hojeStr + "T00:00:00.000Z");
  const ate = new Date(hojeStr + "T23:59:59.999Z");

  const [grupos, totaisPorObra, opsDb, ultimoSync, totalGeral] = await Promise.all([
    prisma.mesApontamento.groupBy({
      by: ["obra", "setor"],
      where: { dataInicio: { gte: de, lte: ate } },
      _sum:   { produzidoKg: true, produzidoUn: true, rejeitado: true, retrabalhado: true },
      _count: { productionId: true },
      _max:   { dataFim: true, updatedAt: true },
      orderBy: [{ obra: "asc" }],
    }),
    prisma.mesApontamento.groupBy({
      by: ["obra"],
      where: { dataInicio: { gte: de, lte: ate } },
      _sum:   { produzidoKg: true, produzidoUn: true },
      _count: { productionId: true },
      _max:   { updatedAt: true },
    }),
    prisma.oP.findMany({
      select: { id: true, numero: true, cliente: true, obra: true },
    }),
    prisma.mesSyncLog.findFirst({ orderBy: { criadoEm: "desc" } }),
    prisma.mesApontamento.count(),
  ]);

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

  // Setores únicos para os filtros (vindos dos dados reais)
  const setoresUnicos = [...new Set(grupos.map(g => g.setor).filter(Boolean))].sort();

  return (
    <MesClient
      grupos={JSON.parse(JSON.stringify(grupos))}
      opMap={JSON.parse(JSON.stringify(opMap))}
      totaisMap={JSON.parse(JSON.stringify(totaisMap))}
      setoresDisponiveis={setoresUnicos}
      ultimoSync={JSON.parse(JSON.stringify(ultimoSync))}
      totalGeralBanco={totalGeral}
      deInicial={hojeStr}
      ateInicial={hojeStr}
    />
  );
}
