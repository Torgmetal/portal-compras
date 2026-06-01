import { requireRole } from "@/lib/session";
import { WinRateClient } from "../../IndicadoresComercialClient";

export default async function WinRatePage() {
  await requireRole(["ADMIN", "COMERCIAL"]);
  return <WinRateClient />;
}
