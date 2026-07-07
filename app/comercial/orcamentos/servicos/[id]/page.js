import { requireRole } from "@/lib/session";
import ServicoDetalheClient from "./ServicoDetalheClient";

export const dynamic = "force-dynamic";

export default async function Page({ params }) {
  await requireRole(["ADMIN", "COMERCIAL"]);
  return <ServicoDetalheClient id={params.id} />;
}
