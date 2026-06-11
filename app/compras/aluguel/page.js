import { requireRole } from "@/lib/session";
import PainelServicosRM from "@/components/compras/PainelServicosRM";

export default async function PainelAluguel({ searchParams }) {
  await requireRole(["ADMIN", "COMPRAS"]);
  return <PainelServicosRM tipo="ALUGUEL" verArquivadas={searchParams?.arquivadas === "1"} />;
}
