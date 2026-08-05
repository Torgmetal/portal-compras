export const dynamic = "force-dynamic";
import { requireRole } from "@/lib/session";
import IndicadoresIsoClient from "./IndicadoresIsoClient";

export default async function Page() {
  await requireRole(["ADMIN", "QUALIDADE", "RH"]);
  return <IndicadoresIsoClient detalheEndpoint="/api/qualidade/indicadores/detalhe" pdfEndpoint="/api/qualidade/indicadores/pdf" />;
}
