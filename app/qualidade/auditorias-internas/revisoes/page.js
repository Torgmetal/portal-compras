import { requireRole } from "@/lib/session";
import RevisoesClient from "./RevisoesClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Revisões do cronograma de auditoria" };

export default async function RevisoesCronogramaPage() {
  await requireRole(["ADMIN", "QUALIDADE"]);
  return <RevisoesClient />;
}
