import { requireRole } from "@/lib/session";
import APagarPorObraClient from "./APagarPorObraClient";

export const metadata = {
  title: "Workspace Torg — A pagar por obra",
};

export const dynamic = "force-dynamic";

export default async function APagarPorObraPage() {
  await requireRole(["ADMIN", "FINANCEIRO", "COMERCIAL"]);
  return <APagarPorObraClient />;
}
