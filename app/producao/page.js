import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { isoWeekString, ultimasSemanas, parseSemana, semanaInicio, semanaFim } from "@/lib/semana";
import ProducaoClient from "./ProducaoClient";


export const metadata = {
  title: "Workspace Torg — Painel de Produção",
};

export default async function PainelProducao() {
  const user = await requireRole(["ADMIN", "COMERCIAL", "COMPRAS", "PRODUCAO"]);

  // Janela: do inicio do ano corrente ate' fim do ano corrente (YTD + projecao)
  const hoje = new Date();
  const inicioJanela = new Date(hoje.getFullYear(), 0, 1); // 1 jan do ano
  const fimJanela = new Date(hoje.getFullYear(), 11, 31, 23, 59, 59); // 31 dez do ano

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

  // Lista de TODAS as semanas do ano corrente (W01 ate' W52/W53)
  const ano = hoje.getFullYear();
  const semanas = [];
  // Numero de semanas no ano: 52 ou 53 (depende do calendario ISO)
  // Calcula olhando 31 de dezembro
  const ultimoDia = new Date(ano, 11, 31);
  const ultimaSemana = parseSemana(isoWeekString(ultimoDia));
  const numSemanas = (ultimaSemana && ultimaSemana.ano === ano) ? ultimaSemana.semana : 52;
  for (let w = 1; w <= numSemanas; w++) {
    const semana = `${ano}-W${String(w).padStart(2, "0")}`;
    semanas.push({
      semana,
      dataInicio: semanaInicio(ano, w).toISOString(),
      dataFim: semanaFim(ano, w).toISOString(),
    });
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
