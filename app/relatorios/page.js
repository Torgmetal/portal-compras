import { requireRole } from "@/lib/session";
import { MODS_RELATORIOS } from "@/lib/relatorios";
import RelatoriosClient from "./RelatoriosClient";

export const dynamic = "force-dynamic";

export default async function RelatoriosPage() {
  await requireRole(MODS_RELATORIOS);
  return <RelatoriosClient />;
}
