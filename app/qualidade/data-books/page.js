import { requireRole } from "@/lib/session";
import DataBooksClient from "./DataBooksClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Qualidade — Data Books" };

export default async function DataBooksPage() {
  await requireRole(["ADMIN", "QUALIDADE"]);
  return <DataBooksClient />;
}
