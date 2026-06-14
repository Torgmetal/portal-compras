import { requireRole } from "@/lib/session";
import CargaCorteClient from "./CargaCorteClient";

export const metadata = { title: "Workspace Torg — PCP · Carga do Corte" };
export const dynamic = "force-dynamic";

export default async function CargaCortePage() {
  await requireRole(["ADMIN", "PCP", "PLANEJAMENTO", "PRODUCAO"]);
  return <CargaCorteClient />;
}
