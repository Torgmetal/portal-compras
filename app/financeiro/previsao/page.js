import { requireRole } from "@/lib/session";
import PrevisaoClient from "./PrevisaoClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Financeiro — Previsão de faturamento" };

export default async function PrevisaoFaturamentoPage() {
  await requireRole(["ADMIN", "FINANCEIRO", "COMERCIAL"]);
  return <PrevisaoClient />;
}
