import { requireRole } from "@/lib/session";
import EngenhariaCarteiraClient from "./EngenhariaCarteiraClient";

export default async function EngenhariaPage() {
  await requireRole(["ADMIN", "ENGENHARIA"]);
  return <EngenhariaCarteiraClient />;
}
