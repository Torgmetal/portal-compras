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

  // OPs ativas pra dropdown
  const ops = await prisma.oP.findMany({
    where: { status: { notIn: ["ENCERRADA", "CANCELADA"] } },
    orderBy: { numero: "asc" },
    select: { id: true, numero: true, cliente: true, obra: true },
  });

  // Producao semanal nessa janela
  const producoes = await prisma.producaoSemanal.findMany({
    where: { dataInicio: { gte: inicioJanela, lte: fimJanela } },
    orderBy: { dataInicio: "asc" },
    include: { op: { select: { numero: true } } },
  });

  // Romaneios nessa janela (peso REAL produzido/expedido)
  const romaneios = await prisma.romaneio.findMany({
    where: { data: { gte: inicioJanela, lte: fimJanela } },
    orderBy: { data: "desc" },
    include: { op: { select: { numero: true, cliente: true } } },
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
      romaneios={JSON.parse(JSON.stringify(romaneios))}
      userRole={user.role}
    />
  );
}
