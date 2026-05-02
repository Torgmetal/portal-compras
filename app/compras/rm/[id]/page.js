import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { ArrowLeft } from "lucide-react";
import { labelCategoria } from "@/lib/op-categorias";
import RMComprasClient from "./RMComprasClient";

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

  // Calcula consumo agregado por categoria — vai pra parte 2 (Compras integrado).
  // Por enquanto só serializa pra client.
  const data = JSON.parse(JSON.stringify(rm));

  return (
    <div className="space-y-6 max-w-7xl">
      <Link href="/compras" className="text-sm text-torg-gray hover:text-torg-dark inline-flex items-center gap-1">
        <ArrowLeft size={14} /> Voltar pro Painel
      </Link>
      <RMComprasClient rm={data} userRole={user.role} />
    </div>
  );
}
