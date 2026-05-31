import { requireRole } from "@/lib/session";
import { VisaoGeralClient } from "./IndicadoresClient";

export default async function IndicadoresPage() {
  await requireRole(["ADMIN", "COMPRAS", "COMERCIAL"]);
  return <VisaoGeralClient />;
}
