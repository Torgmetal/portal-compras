import { requireRole } from "@/lib/session";
import HoleriteClient from "./HoleriteClient";

export const dynamic = "force-dynamic";

export default async function HoleritePage() {
  await requireRole(["ADMIN", "RH"]);
  return <HoleriteClient />;
}
