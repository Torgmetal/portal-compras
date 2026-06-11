import { requireRole } from "@/lib/session";
import { buscarFilaCorte } from "@/lib/fila-corte";
import FilaCorteClient from "./FilaCorteClient";

export const metadata = { title: "Workspace Torg — Fila de Corte" };
export const dynamic = "force-dynamic";

export default async function FilaCortePage() {
  await requireRole(["ADMIN", "PCP", "PLANEJAMENTO", "PRODUCAO"]);
  const pecas = await buscarFilaCorte();
  return <FilaCorteClient pecasIniciais={JSON.parse(JSON.stringify(pecas))} />;
}
