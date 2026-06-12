// Programação de Acabamento no PCP — mesma tela do portal da produção, com o apontamento do
// Syneco do setor (inclui adiantados; quem já saiu conta só no Total geral).
import { requireRole } from "@/lib/session";
import { buscarConjuntosComApontamento } from "@/lib/conjuntos-setor";
import SetorClient from "@/app/producao/programacao/SetorClient";

export const metadata = { title: "Workspace Torg — PCP · Acabamento" };
export const dynamic = "force-dynamic";

export default async function PcpSetor() {
  await requireRole(["ADMIN", "PCP", "PLANEJAMENTO", "PRODUCAO"]);
  const { pecas, apontamentos, apontamentosProximo, furos } =
    await buscarConjuntosComApontamento("ACABAMENTO", "Acabamento", "Jato");

  return (
    <SetorClient
      pecasIniciais={JSON.parse(JSON.stringify(pecas))}
      apontamentos={JSON.parse(JSON.stringify(apontamentos))}
      apontamentosProximo={JSON.parse(JSON.stringify(apontamentosProximo))}
      furos={JSON.parse(JSON.stringify(furos))}
      setorAtual="ACABAMENTO"
      setorAnterior="SOLDA"
      setorProximo="JATO"
      titulo="Programação de Acabamento"
      iconColor="text-purple-500"
      codigoDoc="REL-PRD-006"
    />
  );
}
