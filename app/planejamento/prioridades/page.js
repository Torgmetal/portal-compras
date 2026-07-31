import { requireRole } from "@/lib/session";
import PrioridadesClient from "./PrioridadesClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Planejamento — Prioridades (TV)" };

export default async function PrioridadesPage() {
  await requireRole(["ADMIN", "PLANEJAMENTO", "PRODUCAO", "PCP", "COMERCIAL"]);
  return <PrioridadesClient />;
}
