import { requireRole } from "@/lib/session";
import { buscarConjuntosComApontamento } from "@/lib/conjuntos-setor";
import SetorClient from "../SetorClient";
export const metadata = { title: "Workspace Torg — Programação · Pintura" };
export const dynamic = "force-dynamic";

export default async function ProgramacaoSetor() {
  await requireRole(["ADMIN", "PRODUCAO", "COMERCIAL"]);
  const { pecas, apontamentos } = await buscarConjuntosComApontamento(["PINTURA", "EXPEDIDO"], "Pintura");

  return (
    <SetorClient
      pecasIniciais={JSON.parse(JSON.stringify(pecas))}
      apontamentos={JSON.parse(JSON.stringify(apontamentos))}
      setorAtual="PINTURA"
      setorAnterior="JATO"
      setorProximo="EXPEDIDO"
      titulo="Programação de Pintura"
      iconColor="text-pink-500"
      codigoDoc="REL-PRD-008"
    />
  );
}
