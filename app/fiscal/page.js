import { requireRole } from "@/lib/session";
import FiscalClient from "./FiscalClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Workspace Torg — Fiscal" };

export default async function FiscalPage() {
  await requireRole(["ADMIN", "FISCAL", "FINANCEIRO"]);
  return <FiscalClient />;
}
