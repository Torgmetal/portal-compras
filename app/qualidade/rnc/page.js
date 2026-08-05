export const dynamic = "force-dynamic";
import { requireRole } from "@/lib/session";
import RncClient from "./RncClient";

export default async function Page() {
  await requireRole(["ADMIN", "QUALIDADE"]);
  return <RncClient />;
}
