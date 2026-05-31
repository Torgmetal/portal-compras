import { requireRole } from "@/lib/session";
import { MargemClient } from "../../IndicadoresComercialClient";

export default async function MargemPage() {
  await requireRole(["ADMIN", "COMERCIAL"]);
  return <MargemClient />;
}
