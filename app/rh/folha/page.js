import { requireRole } from "@/lib/session";
import FolhaClient from "./FolhaClient";

export const dynamic = "force-dynamic";

export default async function FolhaPage() {
  await requireRole(["ADMIN", "RH"]);
  return <FolhaClient />;
}
