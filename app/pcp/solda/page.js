// Programação de Solda no PCP — mesma tela do portal da produção, com o apontamento do
// Syneco do setor (inclui conjuntos com unidades adiantadas).
import { requireRole } from "@/lib/session";
import { buscarConjuntosComApontamento } from "@/lib/conjuntos-setor";
import SetorClient from "@/app/producao/programacao/SetorClient";

export const metadata = { title: "Workspace Torg — PCP · Solda" };
export const dynamic = "force-dynamic";

export default async function PcpSetor() {
  await requireRole(["ADMIN", "PCP", "PLANEJAMENTO", "PRODUCAO"]);
  const { pecas, apontamentos } = await buscarConjuntosComApontamento(["SOLDA", "ACABAMENTO"], "Solda");

  return (
    <SetorClient
      pecasIniciais={JSON.parse(JSON.stringify(pecas))}
      apontamentos={JSON.parse(JSON.stringify(apontamentos))}
      setorAtual="SOLDA"
      setorAnterior="MONTAGEM"
      setorProximo="ACABAMENTO"
      titulo="Programação de Solda"
      iconColor="text-orange-500"
      codigoDoc="REL-PRD-005"
    />
  );
}
