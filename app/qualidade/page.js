import { requireRole } from "@/lib/session";
import QualidadeClient from "./QualidadeClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Qualidade — Controle de Documentos" };

export default async function QualidadePage() {
  const user = await requireRole(["ADMIN", "QUALIDADE"]);
  return <QualidadeClient escopo="empresa" isAdmin={user.tipo === "ADMIN"} />;
}
