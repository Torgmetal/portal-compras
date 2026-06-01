import { requireRole } from "@/lib/session";
import { AbsenteismoClient } from "../../IndicadoresRHClient";

export default async function AbsenteismoPage() {
  await requireRole(["ADMIN", "RH"]);
  return <AbsenteismoClient />;
}
