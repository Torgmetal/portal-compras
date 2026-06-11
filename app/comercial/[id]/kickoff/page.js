import { requireRole } from "@/lib/session";
import KickoffClient from "./KickoffClient";

export const metadata = { title: "Workspace Torg — Kick Off da OP" };
export const dynamic = "force-dynamic";

export default async function KickoffPage({ params }) {
  await requireRole(["ADMIN", "COMERCIAL"]);
  return <KickoffClient opId={params.id} />;
}
