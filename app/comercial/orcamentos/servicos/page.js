import { requireRole } from "@/lib/session";
import ServicosClient from "./ServicosClient";

export const dynamic = "force-dynamic";

export default async function ServicosPage() {
  await requireRole(["ADMIN", "COMERCIAL"]);
  return <ServicosClient />;
}
