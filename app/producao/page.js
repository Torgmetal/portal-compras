import { requireRole } from "@/lib/session";
import MinhaFila from "@/components/producao/MinhaFila";
export const metadata = { title: "Produção — Operação da fábrica" };
export default async function Page() {
 await requireRole(["ADMIN", "PRODUCAO", "PCP", "PLANEJAMENTO"]);
 return <MinhaFila />;
}
