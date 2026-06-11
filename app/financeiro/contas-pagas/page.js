import { requireRole } from "@/lib/session";
import ContasPagasClient from "./ContasPagasClient";

export const metadata = { title: "Workspace Torg — Contas Pagas" };
export const dynamic = "force-dynamic";

export default async function ContasPagasPage() {
  await requireRole(["ADMIN", "FINANCEIRO", "COMERCIAL"]);
  return <ContasPagasClient />;
}
