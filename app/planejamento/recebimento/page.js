import { requireRole } from "@/lib/session";
import RecebimentoClient from "./RecebimentoClient";
export const dynamic = "force-dynamic";
export default async function Page({ searchParams }) {
  await requireRole(["ADMIN", "PLANEJAMENTO", "PCP"]);
  return <RecebimentoClient rInicial={searchParams?.r || ""} />;
}
