import { requireRole } from "@/lib/session";
import { TreinamentoIndicadorClient } from "../../IndicadoresRHClient";

export default async function TreinamentoIndicadorPage() {
  await requireRole(["ADMIN", "RH"]);
  return <TreinamentoIndicadorClient />;
}
