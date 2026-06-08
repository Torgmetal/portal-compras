import { requireRole } from "@/lib/session";
import ContasPagarClient from "./ContasPagarClient";

export const metadata = { title: "Workspace Torg — Contas a Pagar" };
export const dynamic = "force-dynamic";

export default async function ContasPagarPage() {
  await requireRole(["ADMIN", "FINANCEIRO", "COMERCIAL"]);
  return <ContasPagarClient />;
}
