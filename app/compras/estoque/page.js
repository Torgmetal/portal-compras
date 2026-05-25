import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import EstoqueClient from "./EstoqueClient";


export default async function EstoquePage() {
  const user = await requireRole(["ADMIN", "COMPRAS"]);

  const [items, config] = await Promise.all([
    prisma.estoqueItem.findMany({
      where: { ativo: true },
      orderBy: { descricao: "asc" },
      take: 1000, // Limite de segurança; catálogo Omie raramente passa disso
    }),
    prisma.configEstoque.findFirst(),
  ]);

  const data = JSON.parse(JSON.stringify(items));
  const cfg = JSON.parse(JSON.stringify(config || { categoriasOmie: ["3.1"], ultimaSincProd: null, ultimaSincMov: null }));

  return <EstoqueClient itensIniciais={data} configInicial={cfg} isAdmin={user.role === "ADMIN"} />;
}
