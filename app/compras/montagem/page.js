import { requireRole } from "@/lib/session";
import PainelServicosRM from "@/components/compras/PainelServicosRM";

export default async function PainelMontagem({ searchParams }) {
  await requireRole(["ADMIN", "COMPRAS"]);
  return <PainelServicosRM tipo="MONTAGEM" verArquivadas={searchParams?.arquivadas === "1"} />;
}
