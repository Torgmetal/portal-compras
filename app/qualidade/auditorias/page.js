import { requireRole } from "@/lib/session";
import AuditoriasClient from "./AuditoriasClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Qualidade — Auditorias Externas" };

export default async function AuditoriasPage() {
  await requireRole(["ADMIN", "QUALIDADE"]);
  return <AuditoriasClient />;
}
