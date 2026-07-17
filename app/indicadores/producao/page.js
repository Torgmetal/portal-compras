import { requireRole } from "@/lib/session";
import ProducaoIndicadoresClient from "./ProducaoIndicadoresClient";

export default async function ProducaoIndicadoresPage() {
  await requireRole(["ADMIN", "PRODUCAO", "PCP", "PLANEJAMENTO"]);
  return <ProducaoIndicadoresClient />;
}
