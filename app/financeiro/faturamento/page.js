import { requireRole } from "@/lib/session";
import FaturamentoClient from "./FaturamentoClient";

export const metadata = {
  title: "Workspace Torg — Faturamento por obra",
};

export const dynamic = "force-dynamic";

export default async function FaturamentoPage() {
  await requireRole(["ADMIN", "FINANCEIRO", "COMERCIAL"]);
  return <FaturamentoClient />;
}
