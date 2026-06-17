import { requireRole } from "@/lib/session";
import TerceirizadosClient from "./TerceirizadosClient";

export const metadata = { title: "Workspace Torg — Serviço Terceirizado" };
export const dynamic = "force-dynamic";

export default async function TerceirizadosPage() {
  await requireRole(["ADMIN", "COMPRAS", "PCP", "PLANEJAMENTO", "PRODUCAO"]);
  return <TerceirizadosClient />;
}
