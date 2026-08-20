import { requireRole } from "@/lib/session";
import SequenciaClient from "./SequenciaClient";

export const metadata = {
  title: "Workspace Torg — Engenharia · Sequência",
  description: "Tarefas dos cronogramas em ordem de prazo.",
};

export default async function SequenciaPage() {
  await requireRole(["ADMIN", "ENGENHARIA", "PLANEJAMENTO", "PCP", "PRODUCAO", "COMERCIAL"]);
  return <SequenciaClient />;
}
