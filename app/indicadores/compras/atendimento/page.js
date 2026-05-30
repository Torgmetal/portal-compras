import { requireRole } from "@/lib/session";
import { AtendimentoClient } from "../../IndicadoresClient";

export default async function AtendimentoPage() {
  await requireRole(["ADMIN", "COMPRAS"]);
  return <AtendimentoClient />;
}
