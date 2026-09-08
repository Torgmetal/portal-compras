import { requireRole } from "@/lib/session";
import SessaoClient from "./SessaoClient";

export const metadata = {
  title: "Workspace Torg — Conferência de Peça",
};

export default async function ConferenciaSessaoPage({ params }) {
  await requireRole(["ADMIN", "EXPEDICAO", "PRODUCAO", "QUALIDADE", "PCP", "PLANEJAMENTO"]);
  return <SessaoClient id={params.id} />;
}
