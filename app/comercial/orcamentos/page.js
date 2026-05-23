import { requireRole } from "@/lib/session";
import OrcamentosClient from "./OrcamentosClient";

export const dynamic = "force-dynamic";

export default async function OrcamentosPage() {
  await requireRole(["ADMIN", "COMERCIAL"]);
  return <OrcamentosClient />;
}
