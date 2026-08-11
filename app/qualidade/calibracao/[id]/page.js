import { requireRole } from "@/lib/session";
import CalibracaoDetalheClient from "./CalibracaoDetalheClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Qualidade — Avaliação de Calibração" };

export default async function CalibracaoDetalhePage({ params }) {
  await requireRole(["ADMIN", "QUALIDADE"]);
  return <CalibracaoDetalheClient id={params.id} />;
}
