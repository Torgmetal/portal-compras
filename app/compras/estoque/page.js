import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import EstoquePageWrapper from "./EstoquePageWrapper";

export const dynamic = "force-dynamic";

export default async function EstoquePage() {
  const user = await requireRole(["ADMIN", "COMPRAS"]);

  const [items, config] = await Promise.all([
    prisma.estoqueItem.findMany({
      where: { ativo: true },
      orderBy: { descricao: "asc" },
      take: 1000,
    }),
    prisma.configEstoque.findFirst(),
  ]);

  const data = JSON.parse(JSON.stringify(items));
  const cfg = JSON.parse(JSON.stringify(config || { categoriasOmie: ["3.1"], ultimaSincProd: null, ultimaSincMov: null }));

  return <EstoquePageWrapper itensIniciais={data} configInicial={cfg} isAdmin={user.role === "ADMIN"} />;
}
