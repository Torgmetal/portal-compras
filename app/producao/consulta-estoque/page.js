import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import EstoqueProducaoClient from "./EstoqueProducaoClient";

export const metadata = { title: "Workspace Torg — Estoque Matéria-Prima" };

export default async function EstoqueProducaoPage() {
  await requireRole(["ADMIN", "PRODUCAO", "COMERCIAL"]);

  // Busca apenas itens ativos cuja categoriaLabel contém "matéria-prima" (case insensitive)
  const itens = await prisma.estoqueItem.findMany({
    where: {
      ativo: true,
      categoriaLabel: { contains: "prima", mode: "insensitive" },
    },
    orderBy: { descricao: "asc" },
  });

  return <EstoqueProducaoClient itens={JSON.parse(JSON.stringify(itens))} />;
}
