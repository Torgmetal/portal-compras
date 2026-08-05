import { requireRole } from "@/lib/session";
import IndicadoresIsoClient from "@/app/qualidade/indicadores/IndicadoresIsoClient";

export default async function ComprasIsoPage() {
  await requireRole(["ADMIN", "COMPRAS"]);
  return <IndicadoresIsoClient processo="COMPRAS" endpoint="/api/compras/indicadores/iso" titulo="Indicadores ISO — Compras" />;
}
