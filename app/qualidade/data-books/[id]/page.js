import { requireRole } from "@/lib/session";
import DataBookDetalheClient from "./DataBookDetalheClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Qualidade — Data Book" };

export default async function DataBookDetalhePage({ params }) {
  const user = await requireRole(["ADMIN", "QUALIDADE"]);
  return <DataBookDetalheClient id={params.id} userId={user.id} />;
}
