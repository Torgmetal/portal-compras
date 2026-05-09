import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { ArrowLeft } from "lucide-react";
import { labelCategoria } from "@/lib/op-categorias";
import RMComprasClient from "./RMComprasClient";

// Sempre busca dados frescos do banco
export const dynamic = "force-dynamic";


export default async function RMComprasDetail({ params }) {
  const user = await requireRole(["ADMIN", "COMPRAS"]);

  const rm = await prisma.rM.findUnique({
    where: { id: params.id },
    include: {
      op: {
        include: {
          itens: { orderBy: { ordem: "asc" } },
          aditivos: { orderBy: { numero: "asc" }, include: { itens: { orderBy: { ordem: "asc" } } } },
        },
      },
      createdBy: { select: { name: true, email: true } },
      itens: {
        orderBy: { ordem: "asc" },
        include: {
          opItem: { select: { categoria: true, descricao: true, valorVerba: true, qtdContratada: true, unidade: true } },
          aditivoItem: { select: { categoria: true, descricao: true, valorVerba: true, qtdContratada: true, unidade: true } },
        },
      },
      cotacoes: {
        select: {
          id: true, fornecedorNome: true, fornecedorEmail: true, token: true,
          status: true, total: true, numeroRevisao: true,
          createdAt: true, prazoResposta: true, recebidaEm: true,
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!rm) notFound();

  // Outras RMs ativas (mesma OP em primeiro lugar; depois outras)
  // pra opcao de "vincular mais RMs no envio de cotacao"
  const outrasRMsAtivas = await prisma.rM.findMany({
    where: {
      id: { not: rm.id },
      status: { in: ["ABERTA", "EM_COTACAO", "COTADA"] },
    },
    orderBy: { numero: "asc" },
    include: {
      op: { select: { numero: true, cliente: true } },
      itens: {
        orderBy: { ordem: "asc" },
        select: {
          id: true, descricao: true, status: true, qtd: true, unidade: true, peso: true,
        },
      },
    },
  });

  // Ordena: mesma OP primeiro, depois resto numericamente
  outrasRMsAtivas.sort((a, b) => {
    const sameOpA = a.opId === rm.opId ? 0 : 1;
    const sameOpB = b.opId === rm.opId ? 0 : 1;
    if (sameOpA !== sameOpB) return sameOpA - sameOpB;
    return (a.numero || "").localeCompare(b.numero || "", undefined, { numeric: true });
  });

  const data = JSON.parse(JSON.stringify(rm));
  const outrasRMs = JSON.parse(JSON.stringify(outrasRMsAtivas));

  return (
    <div className="space-y-6 max-w-7xl">
      <Link href="/compras" className="text-sm text-torg-gray hover:text-torg-dark inline-flex items-center gap-1">
        <ArrowLeft size={14} /> Voltar pro Painel
      </Link>
      <RMComprasClient rm={data} outrasRMs={outrasRMs} userRole={user.role} />
    </div>
  );
}
