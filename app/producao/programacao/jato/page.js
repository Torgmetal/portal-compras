import { requireRole } from "@/lib/session";
import { buscarConjuntosComApontamento } from "@/lib/conjuntos-setor";
import SetorClient from "../SetorClient";
export const metadata = { title: "Workspace Torg — Programação · Jato" };
export const dynamic = "force-dynamic";

export default async function ProgramacaoSetor() {
  await requireRole(["ADMIN", "PRODUCAO", "COMERCIAL"]);
  const { pecas, apontamentos, apontamentosProximo } =
    await buscarConjuntosComApontamento("JATO", "Jato", "Pintura");

  return (
    <SetorClient
      pecasIniciais={JSON.parse(JSON.stringify(pecas))}
      apontamentos={JSON.parse(JSON.stringify(apontamentos))}
      apontamentosProximo={JSON.parse(JSON.stringify(apontamentosProximo))}
      setorAtual="JATO"
      setorAnterior="ACABAMENTO"
      setorProximo="PINTURA"
      titulo="Programação de Jato"
      iconColor="text-cyan-500"
      codigoDoc="REL-PRD-007"
    />
  );
}
