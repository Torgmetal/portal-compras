import { requireRole } from "@/lib/session";
import ListasExpedicaoClient from "./ListasExpedicaoClient";

export const metadata = {
  title: "Workspace Torg — Listas de Expedição",
  description: "Obras com peça em aberto para envio, pela lista de expedição.",
};

export default async function ListasExpedicaoPage() {
  await requireRole(["ADMIN", "EXPEDICAO", "PCP", "PLANEJAMENTO", "PRODUCAO", "COMERCIAL"]);
  return <ListasExpedicaoClient />;
}
