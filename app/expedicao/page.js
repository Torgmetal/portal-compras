import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import ExpedicaoClient from "./ExpedicaoClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Workspace Torg — Portal de Expedição",
};

export default async function PainelExpedicao() {
  const user = await requireRole(["ADMIN", "EXPEDICAO", "PRODUCAO", "COMERCIAL"]);

  // Janela: 12 semanas pra tras + 4 semanas pra frente
  const hoje = new Date();
  const inicioJanela = new Date(hoje);
  inicioJanela.setDate(inicioJanela.getDate() - 12 * 7);
  const fimJanela = new Date(hoje);
  fimJanela.setDate(fimJanela.getDate() + 4 * 7);

  const [opsRaw, romaneios] = await Promise.all([
    prisma.oP.findMany({
      where: { status: { notIn: ["ENCERRADA", "CANCELADA"] } },
      select: { id: true, numero: true, cliente: true, obra: true },
    }),
    prisma.romaneio.findMany({
      where: { data: { gte: inicioJanela, lte: fimJanela } },
      orderBy: { data: "desc" },
      include: { op: { select: { numero: true, cliente: true } } },
    }),
  ]);
  // Ordena numericamente pelo numero
  const ops = opsRaw.sort((a, b) =>
    (a.numero || "").localeCompare(b.numero || "", undefined, { numeric: true, sensitivity: "base" })
  );

  return (
    <ExpedicaoClient
      ops={ops}
      romaneios={JSON.parse(JSON.stringify(romaneios))}
      userRole={user.role}
    />
  );
}
