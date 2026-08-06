import { requireRole } from "@/lib/session";
import IndicadoresIsoClient from "@/app/qualidade/indicadores/IndicadoresIsoClient";

export default async function RhIndicadoresPage() {
  await requireRole(["ADMIN", "RH"]);
  return (
    <IndicadoresIsoClient
      processo="RH"
      endpoint="/api/rh/indicadores/iso"
      titulo="Indicadores de RH e Segurança do Trabalho"
      detalheEndpoint="/api/rh/indicadores/iso/detalhe"
      pdfEndpoint="/api/rh/indicadores/iso/pdf"
    />
  );
}
