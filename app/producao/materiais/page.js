import { requireRole } from "@/lib/session";
import ProducaoOperacional from "@/components/producao/ProducaoOperacional";
export const metadata = { title: "Produção — Operação da fábrica" };
export default async function Page() {
 await requireRole(["ADMIN", "PRODUCAO", "PCP", "PLANEJAMENTO"]);
 return <ProducaoOperacional inicial="materiais"/>;
}
