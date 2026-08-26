import { requireRole } from "@/lib/session";
import IndicadoresIsoClient from "@/app/qualidade/indicadores/IndicadoresIsoClient";

export const metadata = { title: "Workspace Torg — Indicadores do PCP" };

export default async function PcpIndicadoresPage() {
  await requireRole(["ADMIN", "PCP", "PLANEJAMENTO", "PRODUCAO"]);
  return (
    <IndicadoresIsoClient
      processo="PCP"
      endpoint="/api/pcp/indicadores/iso"
      titulo="Indicadores do PCP"
      detalheEndpoint="/api/pcp/indicadores/iso/detalhe"
      pdfEndpoint="/api/pcp/indicadores/iso/pdf"
    />
  );
}
