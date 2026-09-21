import { requireRole } from "@/lib/session";
import PainelServicosRM from "@/components/compras/PainelServicosRM";
import { normalizarOp } from "@/lib/rms-painel";

export default async function PainelMontagem({ searchParams }) {
  await requireRole(["ADMIN", "COMPRAS"]);
  return (
    <PainelServicosRM
      tipo="MONTAGEM"
      verArquivadas={searchParams?.arquivadas === "1"}
      opSelecionada={normalizarOp(searchParams?.op)}
    />
  );
}
