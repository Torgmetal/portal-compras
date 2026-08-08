import { requireRole } from "@/lib/session";
import KickoffAceitesClient from "./KickoffAceitesClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Comercial — Kick Offs (Aceites)" };

export default async function KickoffAceitesPage() {
  await requireRole(["ADMIN", "COMERCIAL"]);
  return <KickoffAceitesClient />;
}
