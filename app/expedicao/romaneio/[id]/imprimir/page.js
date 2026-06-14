import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import RomaneioDoc from "./RomaneioDoc";

export const metadata = { title: "Romaneio — Impressão" };

export default async function ImprimirRomaneioPage({ params }) {
  await requireRole(["ADMIN", "EXPEDICAO", "PRODUCAO", "COMERCIAL", "FINANCEIRO", "PLANEJAMENTO"]);

  const romaneio = await prisma.romaneio.findUnique({
    where: { id: params.id },
    include: {
      itens: { orderBy: { descricao: "asc" } },
      op: { select: { numero: true, cliente: true, obra: true } },
    },
  });
  if (!romaneio) notFound();

  return <RomaneioDoc romaneio={JSON.parse(JSON.stringify(romaneio))} />;
}
