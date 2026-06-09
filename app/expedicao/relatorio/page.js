import { requireRole } from "@/lib/session";
import RelatorioExpedicaoClient from "./RelatorioExpedicaoClient";

export const metadata = {
  title: "Workspace Torg — Relatório de Expedição",
};

export default async function RelatorioExpedicaoPage() {
  await requireRole(["ADMIN", "EXPEDICAO", "PRODUCAO", "COMERCIAL", "FINANCEIRO"]);
  return <RelatorioExpedicaoClient />;
}
