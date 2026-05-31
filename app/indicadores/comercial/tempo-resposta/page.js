import { requireRole } from "@/lib/session";
import { TempoRespostaClient } from "../../IndicadoresComercialClient";

export default async function TempoRespostaPage() {
  await requireRole(["ADMIN", "COMERCIAL"]);
  return <TempoRespostaClient />;
}
