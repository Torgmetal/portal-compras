import { requireAdminDoPortal } from "@/lib/session";
import EngenhariaIaClient from "./EngenhariaIaClient";

export const dynamic = "force-dynamic";

export default async function EngenhariaIaPage() {
  await requireAdminDoPortal();
  return <EngenhariaIaClient />;
}
