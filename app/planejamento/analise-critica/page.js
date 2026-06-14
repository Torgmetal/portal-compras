import { requireRole } from "@/lib/session";
import AnaliseCriticaClient from "./AnaliseCriticaClient";

export const metadata = { title: "Workspace Torg — Planejamento · Análise Crítica" };
export const dynamic = "force-dynamic";

export default async function AnaliseCriticaPage() {
  await requireRole(["ADMIN", "PLANEJAMENTO", "COMERCIAL"]);
  return <AnaliseCriticaClient />;
}
