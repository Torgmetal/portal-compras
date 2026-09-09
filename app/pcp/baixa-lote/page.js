// PCP › Baixa em Lote — fecha um setor inteiro de uma OP no portal, num clique.
//
// Vitor (09/09/2026): "não é possível não ter uma maneira de darmos baixa de uma vez, precisa ter
// essa opção". A SKA não tem API de escrita; a certeza do que falta passa a morar aqui.
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import BaixaLoteClient from "./BaixaLoteClient";

export const metadata = { title: "Workspace Torg — PCP · Baixa em Lote" };
export const dynamic = "force-dynamic";

export default async function PcpBaixaLote() {
  await requireRole(["ADMIN", "PCP", "PLANEJAMENTO", "PRODUCAO"]);
  // ⚠ só obra viva: encerrada já não conta em fila nenhuma, e baixar nela seria mexer em histórico
  const ops = await prisma.oP.findMany({
    where: { status: { in: ["ABERTA", "EM_EXECUCAO"] } },
    select: { id: true, numero: true, obra: true, cliente: true },
    orderBy: { numero: "desc" },
  });
  return (
    <div className="p-4 md:p-6 flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-extrabold text-torg-dark">Baixa em Lote</h1>
        <p className="text-xs text-torg-gray mt-0.5">
          Escolha a obra e feche um setor inteiro de uma vez. Grava no portal, com quem e quando — não escreve no Syneco.
        </p>
      </div>
      <BaixaLoteClient ops={ops} />
    </div>
  );
}
