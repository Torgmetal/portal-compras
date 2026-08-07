import { requireRole } from "@/lib/session";
// Mesma TV de prioridades do Planejamento (formato "Por setor", filas em kg).
// Reaproveita o componente para não haver dois formatos/telas divergentes.
import PrioridadesClient from "@/app/planejamento/prioridades/PrioridadesClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "PCP — Prioridades (TV)" };

export default async function DashboardPrioridadesPage({ searchParams }) {
  await requireRole(["ADMIN", "PCP", "PLANEJAMENTO", "PRODUCAO"]);
  const sp = searchParams ? await searchParams : {};
  return <PrioridadesClient telaInicial={sp?.tela || null} />;
}
