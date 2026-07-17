import { requireRole } from "@/lib/session";
import PlanosAcaoClient from "./PlanosAcaoClient";

export const dynamic = "force-dynamic";

export default async function PlanosAcaoPage() {
  await requireRole(["ADMIN", "QUALIDADE"]);
  return <PlanosAcaoClient />;
}
