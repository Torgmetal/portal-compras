import { requireRole } from "@/lib/session";
import ApresentacoesClient from "./ApresentacoesClient";

export default async function ApresentacoesPage() {
  await requireRole(["ADMIN", "COMPRAS"]);
  return <ApresentacoesClient />;
}
