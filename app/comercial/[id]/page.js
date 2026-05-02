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
      rms: {
        select: { id: true, numero: true, tipoRM: true, categoriasOP: true, status: true },
      },
    },
  });

  if (!op) notFound();

  // Cobertura por categoria: pra cada categoria da OP, lista RMs (apenas ENGENHARIA) que cobrem
  const categoriasNoEscopo = new Set();
  for (const it of op.itens) categoriasNoEscopo.add(it.categoria);
  for (const ad of op.aditivos) for (const it of ad.itens) categoriasNoEscopo.add(it.categoria);

  const cobertura = {};
  for (const cat of categoriasNoEscopo) cobertura[cat] = [];
  for (const rm of op.rms) {
    if (rm.tipoRM !== "ENGENHARIA") continue;
    for (const cat of rm.categoriasOP || []) {
      if (cobertura[cat]) cobertura[cat].push({ id: rm.id, numero: rm.numero, status: rm.status });
    }
  }

  // Transformar pra plain object (Date → string)
  const opData = JSON.parse(JSON.stringify(op));
  opData.cobertura = cobertura;

  return (
    <div className="space-y-6 max-w-7xl">
      <Link href="/comercial" className="text-sm text-torg-gray hover:text-torg-dark inline-flex items-center gap-1">
        <ArrowLeft size={14} /> Voltar pra lista de OPs
      </Link>

      <OPDetailClient op={opData} userRole={user.role} userId={user.id} />
    </div>
  );
}
