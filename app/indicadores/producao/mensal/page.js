import { requireRole } from "@/lib/session";
import MensalProducaoClient from "./MensalProducaoClient";

export default async function MensalProducaoPage() {
  await requireRole(["ADMIN", "PRODUCAO", "PCP", "PLANEJAMENTO"]);
  return <MensalProducaoClient />;
}
