import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import NovaRMClient from "./NovaRMClient";

export const dynamic = "force-dynamic";

export default async function NovaRMPage() {
  const user = await requireUser();

  // OPs ativas com itens (base + aditivos) pra alimentar a tela
  const ops = await prisma.oP.findMany({
    where: { status: { in: ["ABERTA", "EM_EXECUCAO"] } },
    orderBy: { createdAt: "desc" },
    include: {
      itens: { orderBy: { ordem: "asc" } },
      aditivos: {
        orderBy: { numero: "asc" },
        include: { itens: { orderBy: { ordem: "asc" } } },
      },
    },
  });

  // Plain object pra Client Component
  const opsData = JSON.parse(JSON.stringify(ops));

  return <NovaRMClient ops={opsData} userSetor={user.setor || ""} />;
}
