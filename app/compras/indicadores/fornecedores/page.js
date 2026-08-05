import { requireRole } from "@/lib/session";
import IqfClient from "./IqfClient";

export default async function ComprasFornecedoresIqfPage() {
  await requireRole(["ADMIN", "COMPRAS"]);
  return <IqfClient />;
}
