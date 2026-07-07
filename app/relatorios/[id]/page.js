import { requireRole } from "@/lib/session";
import { MODS_RELATORIOS } from "@/lib/relatorios";
import RelatorioEditorClient from "./RelatorioEditorClient";

export const dynamic = "force-dynamic";

export default async function RelatorioEditorPage({ params }) {
  await requireRole(MODS_RELATORIOS);
  return <RelatorioEditorClient id={params.id} />;
}
