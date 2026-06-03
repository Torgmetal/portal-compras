// Aba "Materiais por OP" — visao consolidada de TODOS os materiais solicitados
// por OP, com status derivado de cada item (comprado, aguardando, estoque, etc).
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { fmtOP } from "@/lib/utils";
import { Boxes } from "lucide-react";
import MateriaisOPPageClient from "./MateriaisOPPageClient";

export default async function MateriaisPage() {
  await requireRole(["ADMIN", "COMPRAS"]);

  const ops = await prisma.oP.findMany({
    where: { status: { in: ["ABERTA", "EM_EXECUCAO"] } },
    select: {
      id: true,
      numero: true,
      cliente: true,
      obra: true,
      rms: {
        orderBy: { numero: "asc" },
        select: {
          id: true,
          numero: true,
          itens: {
            orderBy: { ordem: "asc" },
            select: {
              id: true,
              descricao: true,
              unidade: true,
              qtd: true,
              peso: true,
              material: true,
              status: true,
              canceladoEm: true,
              atendidoEstoqueEm: true,
              atendidoEstoquePreco: true,
              pedidoOmie: {
                select: {
                  id: true,
                  numeroPedido: true,
                  fornecedorNome: true,
                  statusEntrega: true,
                  nfNumero: true,
                  recebidoEm: true,
                  status: true,
                },
              },
            },
          },
        },
      },
    },
    orderBy: { numero: "desc" },
  });

  // Processa cada OP e seus itens
  const opsData = ops
    .map((op) => {
      const itens = [];
      const resumo = { RECEBIDO: 0, COMPRADO: 0, ESTOQUE: 0, EM_COTACAO: 0, NAO_COMPRADO: 0, CANCELADO: 0 };

      for (const rm of op.rms) {
        for (const it of rm.itens) {
          const ped = it.pedidoOmie;
          const pedidoRecebido = ped?.statusEntrega === "RECEBIDO" || !!ped?.recebidoEm;
          const pedidoRevertido = ped?.status === "REVERTIDO";

          let st;
          if (it.status === "CANCELADO") st = "CANCELADO";
          else if (it.status === "ATENDIDO_ESTOQUE") st = "ESTOQUE";
          else if (it.status === "PEDIDO_GERADO" && !pedidoRevertido) st = pedidoRecebido ? "RECEBIDO" : "COMPRADO";
          else if (it.status === "EM_COTACAO" || it.status === "COTADO") st = "EM_COTACAO";
          else st = "NAO_COMPRADO";

          resumo[st]++;

          itens.push({
            id: it.id,
            rmNumero: rm.numero,
            descricao: it.descricao,
            material: it.material,
            unidade: it.peso > 0 ? "KG" : it.unidade,
            quantidade: it.peso > 0 ? it.peso : it.qtd,
            statusDerivado: st,
            fornecedor: ped?.fornecedorNome || null,
            pedidoNumero: ped?.numeroPedido || null,
            nfNumero: ped?.nfNumero || null,
          });
        }
      }

      const totalItens = itens.length;
      return {
        id: op.id,
        numero: op.numero,
        cliente: op.cliente,
        obra: op.obra,
        itens,
        resumo,
        totalItens,
      };
    })
    .filter((op) => op.totalItens > 0);

  return (
    <div className="space-y-6 max-w-7xl">
      <div>
        <h2 className="text-3xl font-extrabold text-torg-dark tracking-tight inline-flex items-center gap-2">
          <Boxes size={26} className="text-torg-blue" /> Materiais por OP
        </h2>
        <p className="text-sm text-torg-gray mt-1">
          Todos os materiais solicitados por OP — status atualizado automaticamente conforme cotações, pedidos e recebimentos.
        </p>
      </div>

      {opsData.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <Boxes size={48} className="mx-auto text-gray-300 mb-4" />
          <p className="text-torg-gray text-lg">Nenhuma OP com materiais solicitados</p>
        </div>
      ) : (
        <MateriaisOPPageClient ops={JSON.parse(JSON.stringify(opsData))} />
      )}
    </div>
  );
}
