import { requireRole } from "@/lib/session";
import OrganoClient from "./OrganoClient";

export const dynamic = "force-dynamic";

export default async function OrganoPage() {
  await requireRole(["ADMIN", "RH"]);
  return <OrganoClient />;
}
