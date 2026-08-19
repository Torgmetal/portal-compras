import { requireRole } from "@/lib/session";
import RomaneiosAntigosClient from "./RomaneiosAntigosClient";

export const metadata = { title: "Workspace Torg — Romaneios antigos" };
export const dynamic = "force-dynamic";

export default async function RomaneiosAntigosPage() {
  await requireRole(["ADMIN", "PCP", "PLANEJAMENTO", "EXPEDICAO"]);
  return <RomaneiosAntigosClient />;
}
