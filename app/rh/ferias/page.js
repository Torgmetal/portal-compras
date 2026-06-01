import { requireRole } from "@/lib/session";
import FeriasClient from "./FeriasClient";

export const dynamic = "force-dynamic";

export default async function FeriasPage() {
  await requireRole(["ADMIN", "RH"]);
  return <FeriasClient />;
}
