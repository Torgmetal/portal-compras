import { requireRole } from "@/lib/session";
import ImprimirClient from "./ImprimirClient";

export const metadata = { title: "Workspace Torg — Kick Off (PDF)" };
export const dynamic = "force-dynamic";

export default async function KickoffImprimirPage({ params }) {
  await requireRole(["ADMIN", "COMERCIAL"]);
  return <ImprimirClient opId={params.id} />;
}
