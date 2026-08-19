import { requireRole } from "@/lib/session";
import GrdClient from "./GrdClient";

export const metadata = { title: "Workspace Torg — GRD (liberação de desenhos)" };
export const dynamic = "force-dynamic";

export default async function GrdPage() {
  await requireRole(["ADMIN", "PCP", "PLANEJAMENTO", "PRODUCAO", "QUALIDADE", "COMERCIAL"]);
  return <GrdClient />;
}
