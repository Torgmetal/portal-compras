import { requireRole } from "@/lib/session";
import AtaDetalheClient from "./AtaDetalheClient";

export const dynamic = "force-dynamic";

export default async function AtaDetalhePage({ params }) {
  await requireRole(["ADMIN", "PLANEJAMENTO"]);
  return <AtaDetalheClient id={params.id} />;
}
