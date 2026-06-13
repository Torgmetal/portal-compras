// Fila de Corte dentro da Produção — mesmo kanban do PCP (Na fila → Programado
// → Em corte → Cortadas), sem sair do Portal de Produção.
import { requireRole } from "@/lib/session";
import { buscarFilaCorte } from "@/lib/fila-corte";
import FilaCorteClient from "@/app/pcp/fila-corte/FilaCorteClient";

export const metadata = { title: "Workspace Torg — Produção · Corte" };
export const dynamic = "force-dynamic";

export default async function ProducaoFilaCorte() {
  await requireRole(["ADMIN", "PRODUCAO", "PCP", "PLANEJAMENTO"]);
  const pecas = await buscarFilaCorte();
  return <FilaCorteClient pecasIniciais={JSON.parse(JSON.stringify(pecas))} />;
}
