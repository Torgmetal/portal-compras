import { requireRole } from "@/lib/session";
import IndicadoresIsoClient from "@/app/qualidade/indicadores/IndicadoresIsoClient";

export const metadata = { title: "Indicadores da Engenharia" };

export default async function EngenhariaIndicadoresPage() {
  await requireRole(["ADMIN", "ENGENHARIA", "QUALIDADE"]);
  return (
    <IndicadoresIsoClient
      processo="ENGENHARIA"
      endpoint="/api/engenharia/indicadores/iso"
      titulo="Indicadores da Engenharia"
      detalheEndpoint="/api/engenharia/indicadores/iso/detalhe"
      pdfEndpoint="/api/engenharia/indicadores/iso/pdf"
    />
  );
}
