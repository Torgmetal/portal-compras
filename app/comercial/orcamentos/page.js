import { requireRole } from "@/lib/session";
import OrcamentosClient from "./OrcamentosClient";


export default async function OrcamentosPage() {
  await requireRole(["ADMIN", "COMERCIAL"]);
  return <OrcamentosClient />;
}
