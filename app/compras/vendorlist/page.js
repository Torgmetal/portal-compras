import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import VendorListClient from "./VendorListClient";

export const dynamic = "force-dynamic";

export default async function VendorListPage() {
  const user = await requireRole(["ADMIN", "COMPRAS"]);

  const [fornecedores, categoriasCustom] = await Promise.all([
    prisma.fornecedor.findMany({ orderBy: { razaoSocial: "asc" } }),
    prisma.categoriaFornecedor.findMany({
      where: { ativa: true },
      orderBy: [{ ordem: "asc" }, { label: "asc" }],
    }),
  ]);

  const data = JSON.parse(JSON.stringify(fornecedores));
  const custom = JSON.parse(JSON.stringify(categoriasCustom));
  return (
    <VendorListClient
      fornecedoresIniciais={data}
      categoriasCustomIniciais={custom}
      isAdmin={user.role === "ADMIN"}
    />
  );
}
