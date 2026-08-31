// Recebimento CMR — espelho da planilha do Compras dentro do Portal da Qualidade.
// Substituiu a antiga tela "Rastreabilidade" na barra lateral (ver CmrQualidadeClient).
import { requireRole } from "@/lib/session";
import CmrQualidadeClient from "./CmrQualidadeClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Qualidade — Recebimento CMR" };

export default async function Page() {
  await requireRole(["ADMIN", "QUALIDADE"]);
  return <CmrQualidadeClient />;
}
