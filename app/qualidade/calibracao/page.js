import { requireRole } from "@/lib/session";
import CalibracaoClient from "./CalibracaoClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Qualidade — Calibração" };

export default async function CalibracaoPage() {
  await requireRole(["ADMIN", "QUALIDADE"]);
  return <CalibracaoClient />;
}
