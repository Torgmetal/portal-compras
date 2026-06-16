import { requireRole } from "@/lib/session";
import AuditoriaDetalheClient from "./AuditoriaDetalheClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Qualidade — Auditoria" };

export default async function AuditoriaDetalhePage({ params }) {
  await requireRole(["ADMIN", "QUALIDADE"]);
  return <AuditoriaDetalheClient id={params.id} />;
}
