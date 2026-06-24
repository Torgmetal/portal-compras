import { requireRole } from "@/lib/session";
import RelatorioCorteClient from "./RelatorioCorteClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "PCP — Relatório de Corte" };

export default async function RelatorioCortePage() {
  const user = await requireRole(["ADMIN", "PCP", "PLANEJAMENTO", "PRODUCAO"]);
  return <RelatorioCorteClient isAdmin={user.tipo === "ADMIN"} />;
}
