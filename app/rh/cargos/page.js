import { requireRole } from "@/lib/session";
import CargosClient from "./CargosClient";

export const dynamic = "force-dynamic";

export default async function CargosPage() {
  await requireRole(["ADMIN", "RH"]);
  return <CargosClient />;
}
