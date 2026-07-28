import { requireRole } from "@/lib/session";
import ListasClient from "./ListasClient";

export const metadata = { title: "Listas (LE / LPC) — Engenharia" };

export default async function ListasEngenhariaPage() {
  await requireRole(["ADMIN", "ENGENHARIA"]);
  return <ListasClient />;
}
