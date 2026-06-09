import { requireRole } from "@/lib/session";
import ControleOPClient from "./ControleOPClient";

export const metadata = {
  title: "Workspace Torg — Controle de Produção por OP",
};

export default async function ControleOPPage() {
  await requireRole(["ADMIN", "PRODUCAO", "COMERCIAL", "PLANEJAMENTO", "ENGENHARIA", "COMPRAS", "EXPEDICAO"]);
  return <ControleOPClient />;
}
