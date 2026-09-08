import { requireRole } from "@/lib/session";
import ConferenciaClient from "./ConferenciaClient";

export const metadata = {
  title: "Workspace Torg — Conferência de Peça",
  description: "Conferir as peças da obra contra a Lista de Expedição, no celular ou no tablet.",
};

export default async function ConferenciaPage() {
  await requireRole(["ADMIN", "EXPEDICAO", "PRODUCAO", "QUALIDADE", "PCP", "PLANEJAMENTO"]);
  return <ConferenciaClient />;
}
