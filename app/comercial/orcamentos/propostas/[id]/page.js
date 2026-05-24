import { requireRole } from "@/lib/session";
import EstudoDetalheClient from "./EstudoDetalheClient";

export const dynamic = "force-dynamic";

export default async function EstudoDetalhePage({ params }) {
  await requireRole(["ADMIN", "COMERCIAL"]);
  const { id } = await params;
  return <EstudoDetalheClient estudoId={id} />;
}
