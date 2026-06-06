import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import ProgramacaoCorteClient from "./ProgramacaoCorteClient";

export const metadata = {
  title: "Workspace Torg — Programação · Corte",
};

export default async function ProgramacaoCorte() {
  const user = await requireRole(["ADMIN", "PRODUCAO"]);

  // Busca apenas croquis e avulsas (peças que passam por máquina)
  const pecas = await prisma.pecaConjunto.findMany({
    where: {
      OR: [
        { tipoPeca: "CROQUI" },
        { tipoPeca: null, material: { not: null } },
      ],
    },
    orderBy: [{ opNumero: "asc" }, { marca: "asc" }],
    include: { op: { select: { id: true, numero: true, cliente: true, obra: true } } },
    take: 5000,
  });

  return (
    <ProgramacaoCorteClient
      pecasIniciais={JSON.parse(JSON.stringify(pecas))}
      userRole={user.role}
    />
  );
}
