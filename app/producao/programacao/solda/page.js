import { requireRole } from "@/lib/session";
import { buscarConjuntosComApontamento } from "@/lib/conjuntos-setor";
import SetorClient from "../SetorClient";
export const metadata = { title: "Workspace Torg — Programação · Solda" };
export const dynamic = "force-dynamic";

export default async function ProgramacaoSetor() {
  await requireRole(["ADMIN", "PRODUCAO", "COMERCIAL"]);
  const { pecas, apontamentos, apontamentosProximo } =
    await buscarConjuntosComApontamento("SOLDA", "Solda", "Acabamento");

  return (
    <SetorClient
      pecasIniciais={JSON.parse(JSON.stringify(pecas))}
      apontamentos={JSON.parse(JSON.stringify(apontamentos))}
      apontamentosProximo={JSON.parse(JSON.stringify(apontamentosProximo))}
      setorAtual="SOLDA"
      setorAnterior="MONTAGEM"
      setorProximo="ACABAMENTO"
      titulo="Programação de Solda"
      iconColor="text-orange-500"
      codigoDoc="REL-PRD-005"
    />
  );
}
