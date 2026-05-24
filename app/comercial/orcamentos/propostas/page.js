import { requireRole } from "@/lib/session";
import PropostasClient from "./PropostasClient";

export const dynamic = "force-dynamic";

export default async function PropostasPage() {
  await requireRole(["ADMIN", "COMERCIAL"]);
  return <PropostasClient />;
}
