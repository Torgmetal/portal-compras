import { requireRole } from "@/lib/session";
import VagasClient from "./VagasClient";

export default async function VagasPage() {
  await requireRole(["ADMIN", "RH"]);
  return <VagasClient />;
}
