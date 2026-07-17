import { requireRole } from "@/lib/session";
import AuditoriasInternasClient from "./AuditoriasInternasClient";

export const dynamic = "force-dynamic";

export default async function AuditoriasInternasPage() {
  await requireRole(["ADMIN", "QUALIDADE"]);
  return <AuditoriasInternasClient />;
}
