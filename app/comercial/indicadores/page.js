import { requireRole } from "@/lib/session";
import IndicadoresIsoClient from "@/app/qualidade/indicadores/IndicadoresIsoClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Comercial — Indicadores (ISO)" };

export default async function ComercialIndicadoresPage() {
  await requireRole(["ADMIN", "COMERCIAL"]);
  return (
    <IndicadoresIsoClient
      processo="COMERCIAL"
      endpoint="/api/comercial/indicadores/iso"
      titulo="Indicadores do Comercial"
      detalheEndpoint="/api/comercial/indicadores/iso/detalhe"
      pdfEndpoint="/api/comercial/indicadores/iso/pdf"
    />
  );
}
