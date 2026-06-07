import { requireRole } from "@/lib/session";
import PmpClient from "./PmpClient";

export const metadata = { title: "Workspace Torg — PMP" };

export default async function PmpPage() {
  await requireRole(["ADMIN", "PRODUCAO", "PLANEJAMENTO"]);
  return <PmpClient />;
}
