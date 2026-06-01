import { requireRole } from "@/lib/session";
import { TurnoverClient } from "../../IndicadoresRHClient";

export default async function TurnoverPage() {
  await requireRole(["ADMIN", "RH"]);
  return <TurnoverClient />;
}
