import { prisma } from "@/lib/prisma";
import NestingClient from "./NestingClient";

// O NESTING DA PREPARAÇÃO — importar o plano do programador.
//
// Matheus (11/09/2026): *"o operador apenas seleciona o NESTING que ele vai cortar e já puxa todas
// as MARCAS para abrir na tela do operador"*. Esta é a primeira metade: o plano entra no portal.
export const metadata = {
  title: "Nesting da Preparação (laboratório)",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function NestingPage() {
  const planos = await prisma.mesNesting.findMany({
    orderBy: { createdAt: "desc" },
    take: 30,
    include: {
      unidades: {
        orderBy: { indice: "asc" },
        include: { itens: { orderBy: [{ ordem: "asc" }, { marca: "asc" }] } },
      },
    },
  });
  return <NestingClient iniciais={JSON.parse(JSON.stringify(planos))} />;
}
