import { requireRole } from "@/lib/session";
import ReunioesClient from "./ReunioesClient";

export const dynamic = "force-dynamic";

export default async function ReunioesPage() {
  await requireRole(["ADMIN", "PLANEJAMENTO"]);
  return <ReunioesClient />;
}
