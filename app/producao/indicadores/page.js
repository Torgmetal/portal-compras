import { requireRole } from "@/lib/session";
import IndicadoresIsoClient from "@/app/qualidade/indicadores/IndicadoresIsoClient";

export default async function ProducaoIndicadoresPage() {
  await requireRole(["ADMIN", "PRODUCAO", "PCP"]);
  return (
    <IndicadoresIsoClient
      processo="PRODUCAO"
      endpoint="/api/producao/indicadores/iso"
      titulo="Indicadores de Produção"
      detalheEndpoint="/api/producao/indicadores/iso/detalhe"
      pdfEndpoint="/api/producao/indicadores/iso/pdf"
    />
  );
}
