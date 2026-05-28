import { requireRole } from "@/lib/session";
import DocumentosClient from "./DocumentosClient";

export const dynamic = "force-dynamic";

export default async function DocumentosPage() {
  await requireRole(["ADMIN", "RH"]);
  return <DocumentosClient />;
}
