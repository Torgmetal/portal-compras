import { requireRole } from "@/lib/session";
import PropostasClient from "./PropostasClient";


export default async function PropostasPage() {
  await requireRole(["ADMIN", "COMERCIAL"]);
  return <PropostasClient />;
}
