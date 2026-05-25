import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { Inbox } from "lucide-react";
import AprovacoesClient from "./AprovacoesClient";

// Sempre busca dados frescos do banco


export default async function AprovacoesPage() {
  await requireRole(["ADMIN"]);

  const pendentes = await prisma.solicitacaoVerba.findMany({
    where: { status: "PENDENTE" },
    orderBy: { createdAt: "asc" },
    include: {
      createdBy: { select: { name: true } },
      opItem: {
        include: { op: { select: { id: true, numero: true, cliente: true } } },
      },
      aditivoItem: {
        include: {
          aditivo: {
            include: { op: { select: { id: true, numero: true, cliente: true } } },
          },
        },
      },
    },
  });

  const items = pendentes.map((s) => {
    const item = s.opItem || s.aditivoItem;
    const op = s.opItem?.op || s.aditivoItem?.aditivo?.op;
    return {
      id: s.id,
      tipoItem: s.opItem ? "op" : "aditivo",
      itemId: item?.id,
      itemDescricao: item?.descricao,
      opNumero: op?.numero,
      opId: op?.id,
      cliente: op?.cliente,
      aditivoNumero: s.aditivoItem?.aditivo?.numero || null,
      valorAtual: s.valorAtual,
      valorProposto: s.valorProposto,
      justificativa: s.justificativa,
      createdAt: s.createdAt.toISOString(),
      createdBy: s.createdBy?.name,
    };
  });

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h2 className="text-3xl font-extrabold text-torg-dark tracking-tight flex items-center gap-2">
          <Inbox size={28} className="text-torg-blue" /> Aprovações pendentes
        </h2>
        <p className="text-sm text-torg-gray mt-1">
          Solicitações de mudança de verba aguardando sua decisão.
        </p>
      </div>

      {items.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <Inbox size={40} className="mx-auto text-gray-300 mb-3" />
          <p className="text-torg-gray">Nenhuma solicitação pendente.</p>
        </div>
      ) : (
        <AprovacoesClient items={items} />
      )}
    </div>
  );
}
