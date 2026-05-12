import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import NotificacoesClient from "./NotificacoesClient";

export const dynamic = "force-dynamic";

export default async function NotificacoesPage() {
  await requireRole(["ADMIN"]);

  const inscritos = await prisma.emailNotificacao.findMany({
    orderBy: { createdAt: "desc" },
  });

  const data = JSON.parse(JSON.stringify(inscritos));
  return <NotificacoesClient inscritosIniciais={data} />;
}
