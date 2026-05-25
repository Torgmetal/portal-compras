import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import NotificacoesClient from "./NotificacoesClient";


export default async function NotificacoesPage() {
  const user = await requireRole(["ADMIN", "COMPRAS"]);

  const [feed, inscritos] = await Promise.all([
    prisma.notificacao.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        origemUser: { select: { name: true, email: true } },
      },
    }),
    user.role === "ADMIN"
      ? prisma.emailNotificacao.findMany({ orderBy: { createdAt: "desc" } })
      : Promise.resolve([]),
  ]);

  return (
    <NotificacoesClient
      feedInicial={JSON.parse(JSON.stringify(feed))}
      inscritosIniciais={JSON.parse(JSON.stringify(inscritos))}
      isAdmin={user.role === "ADMIN"}
      resendConfigurado={!!process.env.RESEND_API_KEY}
    />
  );
}
