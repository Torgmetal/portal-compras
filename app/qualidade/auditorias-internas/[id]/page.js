import { requireRole } from "@/lib/session";
import AuditoriaInternaDetalheClient from "./AuditoriaInternaDetalheClient";

export const dynamic = "force-dynamic";

export default async function AuditoriaInternaDetalhePage({ params }) {
  await requireRole(["ADMIN", "QUALIDADE"]);
  return <AuditoriaInternaDetalheClient id={params.id} />;
}
