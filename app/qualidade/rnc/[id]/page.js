export const dynamic = "force-dynamic";
import { requireRole } from "@/lib/session";
import RncDetalheClient from "./RncDetalheClient";

export default async function Page({ params }) {
  await requireRole(["ADMIN", "QUALIDADE"]);
  return <RncDetalheClient id={params.id} />;
}
