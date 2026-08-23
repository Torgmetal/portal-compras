import { requireRole } from "@/lib/session";
import EstudosClient from "./EstudosClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Comercial — Estudos de fabricação" };

export default async function EstudosPage() {
  await requireRole(["ADMIN", "COMERCIAL"]);
  return <EstudosClient />;
}
