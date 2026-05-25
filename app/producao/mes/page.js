import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import MesClient from "./MesClient";

export const metadata = {
  title: "Workspace Torg — Rastreabilidade MES",
};

export default async function MesPage() {
  await requireRole(["ADMIN", "PRODUCAO", "COMERCIAL", "COMPRAS"]);

  // Sumário inicial: últimos 30 dias
  const ate = new Date();
  ate.setHours(23, 59, 59);
  const de = new Date(ate);
  de.setDate(de.getDate() - 30);
  de.setHours(0, 0, 0);

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

  const opMap = Object.fromEntries(opsDb.map(o => [o.numero, o]));
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
      deInicial={de.toISOString().slice(0, 10)}
      ateInicial={ate.toISOString().slice(0, 10)}
    />
  );
}
