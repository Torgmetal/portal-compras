import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import TerceirizadosClient from "./TerceirizadosClient";

export const metadata = {
  title: "Workspace Torg — Romaneios Terceirizados",
  description: "Controle de material enviado a terceiros e o seu retorno.",
};

export default async function TerceirizadosPage() {
  await requireRole(["ADMIN", "EXPEDICAO", "PRODUCAO", "COMERCIAL", "ALMOXARIFADO"]);

  const opsRaw = await prisma.oP.findMany({
    where: { status: { notIn: ["ENCERRADA", "CANCELADA"] } },
    select: { id: true, numero: true, cliente: true, obra: true },
  });
  const ops = opsRaw.sort((a, b) =>
    (a.numero || "").localeCompare(b.numero || "", undefined, { numeric: true, sensitivity: "base" })
  );

  return <TerceirizadosClient ops={JSON.parse(JSON.stringify(ops))} />;
}
