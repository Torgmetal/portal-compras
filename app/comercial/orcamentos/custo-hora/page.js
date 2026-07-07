import { requireRole } from "@/lib/session";
import CustoHoraClient from "./CustoHoraClient";

export const dynamic = "force-dynamic";

export default async function CustoHoraPage() {
  await requireRole(["ADMIN", "COMERCIAL"]);
  return <CustoHoraClient />;
}
