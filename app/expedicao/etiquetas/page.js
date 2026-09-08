import { requireRole } from "@/lib/session";
import EtiquetasClient from "./EtiquetasClient";

export const metadata = {
  title: "Workspace Torg — Etiquetas de Carregamento",
  description: "Emissão das etiquetas de 100×50 mm que vão coladas na peça.",
};

export default async function EtiquetasPage() {
  await requireRole(["ADMIN", "EXPEDICAO", "PRODUCAO", "PCP", "PLANEJAMENTO"]);
  return <EtiquetasClient />;
}
