import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { ArrowLeft } from "lucide-react";
import OPDetailClient from "./OPDetailClient";

export default async function OPDetailPage({ params }) {
  const user = await requireRole(["ADMIN", "COMERCIAL"]);

  const op = await prisma.oP.findUnique({
    where: { id: params.id },
    include: {
      createdBy: { select: { name: true, email: true } },
      itens: {
        orderBy: { ordem: "asc" },
        include: {
          solicitacoesVerba: {
            where: { status: "PENDENTE" },
            select: { id: true, valorProposto: true },
          },
        },
      },
      aditivos: {
        orderBy: { numero: "asc" },
        include: {
          createdBy: { select: { name: true } },
          itens: {
            orderBy: { ordem: "asc" },
            include: {
              solicitacoesVerba: {
                where: { status: "PENDENTE" },
                select: { id: true, valorProposto: true },
              },
            },
          },
        },
      },
      revisoes: {
        orderBy: { numero: "asc" },
        include: { createdBy: { select: { name: true } } },
      },
      ajustesPrazo: {
        orderBy: { createdAt: "asc" },
        include: { createdBy: { select: { name: true } } },
      },
      _count: { select: { rms: true } },
    },
  });

  if (!op) notFound();

  // Transformar pra plain object (Date → string)
  const opData = JSON.parse(JSON.stringify(op));

  return (
    <div className="space-y-6 max-w-7xl">
      <Link href="/comercial" className="text-sm text-torg-gray hover:text-torg-dark inline-flex items-center gap-1">
        <ArrowLeft size={14} /> Voltar pra lista de OPs
      </Link>

      <OPDetailClient op={opData} userRole={user.role} userId={user.id} />
    </div>
  );
}
