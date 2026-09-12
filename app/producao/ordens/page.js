import { requireRole } from "@/lib/session";
import ProducaoClient from "@/app/pcp/producao/ProducaoClient";
export const metadata = { title: "Produção — Ordens e peças" };
export default async function Page() {
 await requireRole(["ADMIN", "PRODUCAO", "PCP", "PLANEJAMENTO"]);
 return <ProducaoClient portalProducao />;
}
