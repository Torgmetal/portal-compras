import { requireRole } from "@/lib/session";
import { ContratacaoClient } from "../../IndicadoresRHClient";

export default async function ContratacaoPage() {
  await requireRole(["ADMIN", "RH"]);
  return <ContratacaoClient />;
}
