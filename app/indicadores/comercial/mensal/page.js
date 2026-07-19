import { requireRole } from "@/lib/session";
import MensalComercialClient from "./MensalComercialClient";

export default async function MensalComercialPage() {
  await requireRole(["ADMIN", "COMERCIAL"]);
  return <MensalComercialClient />;
}
