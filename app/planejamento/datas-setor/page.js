import { requireRole } from "@/lib/session";
import DatasSetorClient from "./DatasSetorClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Planejamento — Datas por setor" };

export default async function DatasSetorPage() {
  await requireRole(["ADMIN", "PLANEJAMENTO", "COMERCIAL"]);
  return <DatasSetorClient />;
}
