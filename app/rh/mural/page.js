import { requireRole } from "@/lib/session";
import MuralClient from "./MuralClient";

export const dynamic = "force-dynamic";

export default async function MuralPage() {
  await requireRole(["ADMIN", "RH"]);
  return <MuralClient />;
}
