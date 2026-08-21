import { requireRole } from "@/lib/session";
import RelatorioDetalheClient from "./RelatorioDetalheClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Relatório de inspeção — Qualidade" };

export default async function RelatorioPage({ params }) {
  await requireRole(["ADMIN", "QUALIDADE"]);
  const { id } = await params;
  return <RelatorioDetalheClient id={id} />;
}
