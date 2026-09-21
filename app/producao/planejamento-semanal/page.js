import { requireRole } from "@/lib/session";
import PmpClient from "@/app/pcp/pmp/PmpClient";
export const metadata = { title: "Produção — Programação semanal" };
export default async function Page() {
 await requireRole(["ADMIN", "PRODUCAO", "PCP", "PLANEJAMENTO"]);
 return <PmpClient portalProducao />;
}
