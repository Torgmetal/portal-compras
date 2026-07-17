import { requireRole } from "@/lib/session";
import PlanoAcaoDetalheClient from "./PlanoAcaoDetalheClient";

export const dynamic = "force-dynamic";

export default async function PlanoAcaoDetalhePage({ params }) {
  await requireRole(["ADMIN", "QUALIDADE"]);
  return <PlanoAcaoDetalheClient id={params.id} />;
}
