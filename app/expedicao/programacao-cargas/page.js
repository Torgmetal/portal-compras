import { requireRole } from "@/lib/session";
import ProgramacaoCargasClient from "./ProgramacaoCargasClient";

export const metadata = {
  title: "Programacao de Cargas — Workspace Torg",
  description: "Gerencie e acompanhe todas as cargas programadas para obra.",
};

export default async function ProgramacaoCargasPage() {
  await requireRole(["ADMIN", "EXPEDICAO", "PRODUCAO", "COMERCIAL", "PLANEJAMENTO"]);
  return <ProgramacaoCargasClient />;
}
