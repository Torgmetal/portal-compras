import { requireRole } from "@/lib/session";
import { AcidentesIndicadorClient } from "../../IndicadoresRHClient";

export default async function AcidentesIndicadorPage() {
  await requireRole(["ADMIN", "RH"]);
  return <AcidentesIndicadorClient />;
}
