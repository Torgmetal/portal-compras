import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import ConsultaEstoqueResponder from "./ConsultaEstoqueResponder";

export const metadata = { title: "Workspace Torg — Responder Consulta de Estoque" };

export default async function ConsultaEstoquePage({ params }) {
  const user = await requireRole(["ADMIN", "PRODUCAO"]);

  const consulta = await prisma.consultaEstoque.findUnique({
    where: { id: params.id },
    include: {
      rm: {
        select: {
          id: true, numero: true, descricao: true, observacao: true,
          op: { select: { numero: true, cliente: true } },
        },
      },
      createdBy: { select: { name: true } },
      itens: {
        include: {
          rmItem: {
            select: {
              id: true, descricao: true, unidade: true, qtd: true,
              peso: true, material: true, comprimento: true, largura: true,
            },
          },
          respondidoPor: { select: { name: true } },
        },
      },
    },
  });

  if (!consulta) notFound();

  return (
    <ConsultaEstoqueResponder
      consulta={JSON.parse(JSON.stringify(consulta))}
      userName={user.name}
    />
  );
}
