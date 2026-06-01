import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import ConsultaEstoqueListClient from "./ConsultaEstoqueListClient";

export const metadata = { title: "Workspace Torg — Consultas de Estoque" };

export default async function ConsultaEstoqueListPage() {
  await requireRole(["ADMIN", "PRODUCAO"]);

  const consultas = await prisma.consultaEstoque.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      rm: {
        select: {
          id: true, numero: true, descricao: true,
          op: { select: { numero: true, cliente: true } },
        },
      },
      createdBy: { select: { name: true } },
      itens: {
        select: {
          id: true, resposta: true,
          rmItem: { select: { descricao: true } },
        },
      },
    },
  });

  return <ConsultaEstoqueListClient consultas={JSON.parse(JSON.stringify(consultas))} />;
}
