import { requireRole } from "@/lib/session";
import PedidosExpedicaoClient from "./PedidosExpedicaoClient";

export const metadata = {
  title: "Workspace Torg — Expedição: A Expedir",
};

export default async function PedidosExpedicaoPage() {
  await requireRole(["ADMIN", "EXPEDICAO", "PRODUCAO", "COMERCIAL", "PLANEJAMENTO"]);
  return <PedidosExpedicaoClient />;
}
