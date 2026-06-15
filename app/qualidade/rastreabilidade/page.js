import { requireRole } from "@/lib/session";
import QualidadeClient from "../QualidadeClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Qualidade — Rastreabilidade" };

export default async function RastreabilidadePage() {
  await requireRole(["ADMIN", "QUALIDADE"]);
  return <QualidadeClient escopo="material" />;
}
