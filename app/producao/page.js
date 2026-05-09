import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { isoWeekString, ultimasSemanas, parseSemana, semanaInicio, semanaFim } from "@/lib/semana";
import ProducaoClient from "./ProducaoClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Workspace Torg — Painel de Produção",
};

export default async function PainelProducao() {
  const user = await requireRole(["ADMIN", "COMERCIAL", "COMPRAS", "PRODUCAO"]);

  // Janela: 8 semanas pra tras + atual + 4 semanas pra frente
  const hoje = new Date();
  const inicioJanela = new Date(hoje);
  inicioJanela.setDate(inicioJanela.getDate() - 8 * 7);
  const fimJanela = new Date(hoje);
  fimJanela.setDate(fimJanela.getDate() + 12 * 7);

  // OPs ativas pra dropdown — ordenadas numericamente
  const opsRaw = await prisma.oP.findMany({
    where: { status: { notIn: ["ENCERRADA", "CANCELADA"] } },
    select: { id: true, numero: true, cliente: true, obra: true },
  });
  const ops = opsRaw.sort((a, b) =>
    (a.numero || "").localeCompare(b.numero || "", undefined, { numeric: true, sensitivity: "base" })
  );

  // Producao semanal nessa janela
  const producoes = await prisma.producaoSemanal.findMany({
    where: { dataInicio: { gte: inicioJanela, lte: fimJanela } },
    orderBy: { dataInicio: "asc" },
    include: { op: { select: { numero: true } } },
  });

  // Lista de semanas (ultimas 8 + atual + 4 prox = 13 semanas)
  const semanas = [];
  for (let i = 8; i >= -4; i--) {
    const d = new Date(hoje);
    d.setDate(d.getDate() - i * 7);
    const semana = isoWeekString(d);
    const p = parseSemana(semana);
    if (p) {
      semanas.push({
        semana,
        dataInicio: semanaInicio(p.ano, p.semana).toISOString(),
        dataFim: semanaFim(p.ano, p.semana).toISOString(),
      });
    }
  }
  // Dedupe (caso de virada de ano)
  const seen = new Set();
  const semanasUnicas = semanas.filter((s) => {
    if (seen.has(s.semana)) return false;
    seen.add(s.semana);
    return true;
  });

  const semanaAtual = isoWeekString(hoje);

  return (
    <ProducaoClient
      ops={ops}
      semanas={semanasUnicas}
      semanaAtual={semanaAtual}
      producoes={JSON.parse(JSON.stringify(producoes))}
      userRole={user.role}
    />
  );
}
