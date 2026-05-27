import { requireRole } from "@/lib/session";
import PontoClient from "./PontoClient";

export const dynamic = "force-dynamic";

export default async function PontoPage() {
  await requireRole(["ADMIN", "RH"]);
  return <PontoClient />;
}
