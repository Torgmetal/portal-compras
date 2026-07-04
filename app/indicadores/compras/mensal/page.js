import { requireRole } from "@/lib/session";
import MensalClient from "./MensalClient";

export default async function ComprasMensalPage() {
  await requireRole(["ADMIN", "COMPRAS"]);
  return <MensalClient />;
}
