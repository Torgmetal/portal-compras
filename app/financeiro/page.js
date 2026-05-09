import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { isoWeekString, parseSemana, semanaInicio, semanaFim } from "@/lib/semana";
import FinanceiroClient from "./FinanceiroClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Workspace Torg — Portal Financeiro",
};

export default async function PainelFinanceiro() {
  const user = await requireRole(["ADMIN", "FINANCEIRO", "COMERCIAL"]);

  const hoje = new Date();
  const inicioJanela = new Date(hoje);
  inicioJanela.setDate(inicioJanela.getDate() - 8 * 7);
  const fimJanela = new Date(hoje);
  fimJanela.setDate(fimJanela.getDate() + 12 * 7);

  const [opsRaw, fluxos, romaneios] = await Promise.all([
    prisma.oP.findMany({
      where: { status: { notIn: ["ENCERRADA", "CANCELADA"] } },
      select: { id: true, numero: true, cliente: true, obra: true },
    }),
    prisma.fluxoCaixa.findMany({
      where: { data: { gte: inicioJanela, lte: fimJanela } },
      orderBy: { data: "asc" },
      include: { op: { select: { numero: true, cliente: true } } },
    }),
    prisma.romaneio.findMany({
      where: { data: { gte: inicioJanela, lte: fimJanela } },
      orderBy: { data: "asc" },
      include: { op: { select: { numero: true, cliente: true } } },
    }),
  ]);
  // Ordena OPs numericamente
  const ops = opsRaw.sort((a, b) =>
    (a.numero || "").localeCompare(b.numero || "", undefined, { numeric: true, sensitivity: "base" })
  );

  // Janela de semanas
  const semanas = [];
  for (let i = 8; i >= -4; i--) {
    const d = new Date(hoje);
    d.setDate(d.getDate() - i * 7);
    const semana = isoWeekString(d);
    const p = parseSemana(semana);
    if (!p) continue;
    semanas.push({
      semana,
      dataInicio: semanaInicio(p.ano, p.semana).toISOString(),
      dataFim: semanaFim(p.ano, p.semana).toISOString(),
    });
  }
  const seen = new Set();
  const semanasUnicas = semanas.filter((s) => !seen.has(s.semana) && (seen.add(s.semana), true));

  return (
    <FinanceiroClient
      ops={ops}
      fluxos={JSON.parse(JSON.stringify(fluxos))}
      romaneios={JSON.parse(JSON.stringify(romaneios))}
      semanas={semanasUnicas}
      semanaAtual={isoWeekString(hoje)}
      userRole={user.role}
    />
  );
}
