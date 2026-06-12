import { requireRole } from "@/lib/session";
import { buscarConjuntosComApontamento } from "@/lib/conjuntos-setor";
import SetorClient from "../SetorClient";
export const metadata = { title: "Workspace Torg — Programação · Jato" };
export const dynamic = "force-dynamic";

export default async function ProgramacaoSetor() {
  await requireRole(["ADMIN", "PRODUCAO", "COMERCIAL"]);
  const { pecas, apontamentos } = await buscarConjuntosComApontamento(["JATO", "PINTURA"], "Jato");

  return (
    <SetorClient
      pecasIniciais={JSON.parse(JSON.stringify(pecas))}
      apontamentos={JSON.parse(JSON.stringify(apontamentos))}
      setorAtual="JATO"
      setorAnterior="ACABAMENTO"
      setorProximo="PINTURA"
      titulo="Programação de Jato"
      iconColor="text-cyan-500"
      codigoDoc="REL-PRD-007"
    />
  );
}
