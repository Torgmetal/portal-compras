import { requireRole } from "@/lib/session";
import IqfClient from "./IqfClient";

export default async function ComprasFornecedoresPage() {
  await requireRole(["ADMIN", "COMPRAS"]);
  return <IqfClient />;
}
