// CMR — Controle de Materiais Rastreáveis.
//   Aba "Lançar": o estoque/almoxarifado lança os recebimentos (por ano; celular ou desktop).
//   Aba "Conciliar": casa o que foi lançado no CMR com as RMs do Compras (a tela que faltava).
import { requireRole } from "@/lib/session";
import CmrPageClient from "./CmrPageClient";

export const dynamic = "force-dynamic";

export default async function Page() {
  await requireRole(["ADMIN", "ALMOXARIFADO", "COMPRAS", "PCP", "PLANEJAMENTO"]);
  return <CmrPageClient />;
}
