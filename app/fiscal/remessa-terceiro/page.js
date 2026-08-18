import { requireRole } from "@/lib/session";
import RemessaTerceiroClient from "./RemessaTerceiroClient";

export const metadata = { title: "Workspace Torg — Fiscal: Remessa Terceiro" };

export default async function RemessaTerceiroPage() {
  await requireRole(["ADMIN", "FISCAL", "FINANCEIRO"]);
  return <RemessaTerceiroClient />;
}
