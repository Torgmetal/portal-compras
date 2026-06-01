import { requireRole } from "@/lib/session";
import AcidentesClient from "./AcidentesClient";

export default async function AcidentesPage() {
  await requireRole(["ADMIN", "RH"]);
  return <AcidentesClient />;
}
