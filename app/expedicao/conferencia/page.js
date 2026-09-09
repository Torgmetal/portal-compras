import { requireRole } from "@/lib/session";
import ConferenciaClient from "./ConferenciaClient";

export const metadata = {
  title: "Workspace Torg — Conferência de Peça",
  description: "Conferir as peças da obra contra a Lista de Expedição, no celular ou no tablet.",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Conferência" },
};

// ⚠ Matheus (09/09/2026): "todos que tiver acesso ao módulo Expedição pode fazer conferência" —
// mesmo perfil das rotas de API (app/api/expedicao/conferencia/**), estreitado do que era antes.
export default async function ConferenciaPage() {
  await requireRole(["ADMIN", "EXPEDICAO"]);
  return <ConferenciaClient />;
}
