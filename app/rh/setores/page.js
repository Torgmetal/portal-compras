import { requireRole } from "@/lib/session";
import SetoresClient from "./SetoresClient";

export const dynamic = "force-dynamic";

export default async function SetoresPage() {
  await requireRole(["ADMIN", "RH"]);
  return <SetoresClient />;
}
