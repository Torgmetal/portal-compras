import { requireRole } from "@/lib/session";
import MensalRHClient from "./MensalRHClient";

export default async function MensalRHPage() {
  await requireRole(["ADMIN", "RH"]);
  return <MensalRHClient />;
}
