import { requireRole } from "@/lib/session";
import { SavingsClient } from "../IndicadoresClient";

export default async function SavingsPage() {
  await requireRole(["ADMIN", "COMPRAS"]);
  return <SavingsClient />;
}
