// GRD da Engenharia — o que foi liberado, por OP, com a revisão vigente.
import { requireRole } from "@/lib/session";
import GrdEngenhariaClient from "./GrdEngenhariaClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Engenharia — GRD" };

export default async function Page() {
  await requireRole(["ADMIN", "ENGENHARIA", "PCP", "PLANEJAMENTO", "QUALIDADE"]);
  return <GrdEngenhariaClient />;
}
