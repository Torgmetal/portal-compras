import { requireRole } from "@/lib/session";
import MarcarPrioridadeClient from "./MarcarPrioridadeClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Planejamento — Marcar prioridades" };

export default async function MarcarPrioridadePage() {
  await requireRole(["ADMIN", "PLANEJAMENTO", "PCP"]);
  return <MarcarPrioridadeClient />;
}
