import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { podeGerenciarComercialOP } from "@/lib/op-obra-acesso";
import NovoAditivoClient from "../../novo/NovoAditivoClient";

export const dynamic = "force-dynamic";

// A edição do aditivo usa a MESMA página da abertura, já preenchida (Matheus, 15/10/2026, OP-105:
// "não tem a opção de editar"). Vale também para o divulgado (Vitor). Os itens de verba ficam de
// fora: têm RM e solicitação de verba penduradas e já se editam na aba Resumo.
export default async function EditarAditivoPage({ params }) {
  const user = await requireUser();
  const ad = await prisma.aditivo.findUnique({
    where: { id: params.aditivoId },
    include: {
      receitas: { orderBy: { ordem: "asc" } },
      referencias: { orderBy: { ordem: "asc" } },
      op: { select: { id: true, numero: true, cliente: true, obra: true, status: true, refCliente: true } },
    },
  });
  if (!ad || ad.opId !== params.id) notFound();
  const { op } = ad;
  if (!podeGerenciarComercialOP(user) || op.status === "ENCERRADA" || op.status === "CANCELADA") redirect(`/comercial/${op.id}?vista=obra`);
  return (
    <NovoAditivoClient
      op={{ id: op.id, numero: op.numero, cliente: op.cliente, obra: op.obra, refCliente: op.refCliente }}
      proximoNumero={ad.numero}
      aditivo={JSON.parse(JSON.stringify({
        id: ad.id, numero: ad.numero, status: ad.status, descricao: ad.descricao,
        dataInicio: ad.dataInicio, dataFimPrevista: ad.dataFimPrevista,
        orcamentoPasta: ad.orcamentoPasta, orcamentoRef: ad.orcamentoRef, propostas: ad.propostas, estudoArquivo: ad.estudoArquivo, estudoDados: ad.estudoDados,
        receitas: ad.receitas, referencias: ad.referencias,
      }))}
    />
  );
}
