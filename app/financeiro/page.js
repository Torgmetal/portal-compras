import { redirect } from "next/navigation";
import { requireRole } from "@/lib/session";

export const metadata = {
  title: "Workspace Torg — Portal Financeiro",
};

// A aba "Fluxo de Caixa" foi removida do menu (será reformulada depois). O índice
// do módulo passa a cair na primeira aba disponível — Faturamento por obra. A tela
// antiga (FinanceiroClient) segue no repo para ser retomada/ajustada no futuro.
export default async function PainelFinanceiro() {
  await requireRole(["ADMIN", "FINANCEIRO", "COMERCIAL"]);
  redirect("/financeiro/faturamento");
}
