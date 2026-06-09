import { requireRole } from "@/lib/session";
import ConfrontoExpedicaoClient from "./ConfrontoExpedicaoClient";

export const metadata = {
  title: "Workspace Torg — Confronto de Expedição",
};

export default async function ConfrontoExpedicaoPage() {
  await requireRole(["ADMIN", "EXPEDICAO", "PRODUCAO", "COMERCIAL", "FINANCEIRO"]);
  return <ConfrontoExpedicaoClient />;
}
