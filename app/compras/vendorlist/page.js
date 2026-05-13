import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import VendorListClient from "./VendorListClient";

export const dynamic = "force-dynamic";

export default async function VendorListPage() {
  await requireRole(["ADMIN", "COMPRAS"]);

  const fornecedores = await prisma.fornecedor.findMany({
    orderBy: { razaoSocial: "asc" },
  });

  const data = JSON.parse(JSON.stringify(fornecedores));
  return <VendorListClient fornecedoresIniciais={data} />;
}
