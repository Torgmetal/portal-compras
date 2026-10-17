import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import NovaRMClient from "./NovaRMClient";


export default async function NovaRMPage() {
  const user = await requireUser();

  // OPs ativas com itens (base + aditivos) pra alimentar a tela
  const opsRaw = await prisma.oP.findMany({
    where: { status: { in: ["ABERTA", "EM_EXECUCAO"] } },
    include: {
      itens: { orderBy: { ordem: "asc" } },
      aditivos: {
        orderBy: { numero: "asc" },
        include: { itens: { orderBy: { ordem: "asc" } } },
      },
    },
  });
  // Ordena numericamente pelo numero (T8 < T84 < T100), ascendente
  const ops = opsRaw.sort((a, b) =>
    (a.numero || "").localeCompare(b.numero || "", undefined, { numeric: true, sensitivity: "base" })
  );

  // Plain object pra Client Component
  const opsData = JSON.parse(JSON.stringify(ops));

  const userModulos = user.modulos ?? [];

  return <NovaRMClient ops={opsData} userSetor={user.setor || ""} userModulos={userModulos} userTipo={user.tipo} />;
}
