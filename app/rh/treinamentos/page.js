import { requireRole } from "@/lib/session";
import TreinamentosClient from "./TreinamentosClient";

export default async function TreinamentosPage() {
  await requireRole(["ADMIN", "RH"]);
  return <TreinamentosClient />;
}
