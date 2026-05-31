import { requireRole } from "@/lib/session";
import { ConcentracaoClient } from "../../IndicadoresComercialClient";

export default async function ConcentracaoPage() {
  await requireRole(["ADMIN", "COMERCIAL"]);
  return <ConcentracaoClient />;
}
