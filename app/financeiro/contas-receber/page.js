import { requireRole } from "@/lib/session";
import ContasReceberClient from "./ContasReceberClient";

export const metadata = { title: "Workspace Torg — Contas a Receber" };
export const dynamic = "force-dynamic";

export default async function ContasReceberPage() {
  await requireRole(["ADMIN", "FINANCEIRO", "COMERCIAL"]);
  return <ContasReceberClient />;
}
