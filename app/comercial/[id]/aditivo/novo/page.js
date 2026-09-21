import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { podeGerenciarComercialOP } from "@/lib/op-obra-acesso";
import NovoAditivoClient from "./NovoAditivoClient";

export const dynamic = "force-dynamic";

// A abertura do aditivo saiu do modal e virou página (Vitor, 17/09/2026: "está muito ruim de ver
// essas info"). Quem chega aqui sem gerenciar o Comercial, ou numa obra fechada, volta para a aba
// Obra — lá o botão nem aparece para esses casos.
export default async function NovoAditivoPage({ params }) {
  const user = await requireUser();
  const op = await prisma.oP.findUnique({
    where: { id: params.id },
    select: { id: true, numero: true, cliente: true, obra: true, status: true, refCliente: true, _count: { select: { aditivos: true } } },
  });
  if (!op) notFound();
  if (!podeGerenciarComercialOP(user) || op.status === "ENCERRADA" || op.status === "CANCELADA") redirect(`/comercial/${op.id}?vista=obra`);
  return (
    <NovoAditivoClient
      op={{ id: op.id, numero: op.numero, cliente: op.cliente, obra: op.obra, refCliente: op.refCliente }}
      proximoNumero={op._count.aditivos + 1}
    />
  );
}
