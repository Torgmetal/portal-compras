import { requireRole } from "@/lib/session";
import AfastamentosClient from "./AfastamentosClient";

export default async function AfastamentosPage() {
  await requireRole(["ADMIN", "RH"]);
  return <AfastamentosClient />;
}
