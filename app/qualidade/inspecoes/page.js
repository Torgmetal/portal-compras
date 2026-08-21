import { requireRole } from "@/lib/session";
import InspecoesClient from "./InspecoesClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Inspeções — Qualidade" };

export default async function InspecoesPage() {
  await requireRole(["ADMIN", "QUALIDADE"]);
  return <InspecoesClient />;
}
