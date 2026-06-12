import { requireRole } from "@/lib/session";
import { buscarConjuntosComApontamento } from "@/lib/conjuntos-setor";
import SetorClient from "../SetorClient";
export const metadata = { title: "Workspace Torg — Programação · Acabamento" };
export const dynamic = "force-dynamic";

export default async function ProgramacaoSetor() {
  await requireRole(["ADMIN", "PRODUCAO", "COMERCIAL"]);
  const { pecas, apontamentos } = await buscarConjuntosComApontamento(["ACABAMENTO", "JATO"], "Acabamento");

  return (
    <SetorClient
      pecasIniciais={JSON.parse(JSON.stringify(pecas))}
      apontamentos={JSON.parse(JSON.stringify(apontamentos))}
      setorAtual="ACABAMENTO"
      setorAnterior="SOLDA"
      setorProximo="JATO"
      titulo="Programação de Acabamento"
      iconColor="text-purple-500"
      codigoDoc="REL-PRD-006"
    />
  );
}
