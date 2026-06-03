import { requireRole } from "@/lib/session";
import { redirect } from "next/navigation";
import ExpedicaoSemanalClient from "./ExpedicaoSemanalClient";

export const metadata = {
  title: "Expedição Semanal · Planejamento",
};

export default async function ExpedicaoSemanalPage() {
  try {
    await requireRole(["ADMIN", "PRODUCAO", "PLANEJAMENTO", "COMERCIAL", "EXPEDICAO"]);
  } catch {
    redirect("/");
  }
  return <ExpedicaoSemanalClient />;
}
