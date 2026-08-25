import { requireRole } from "@/lib/session";
import ProgramacaoCargasPlanejamentoClient from "./ProgramacaoCargasPlanejamentoClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Planejamento — Cargas" };

// ⚠ NÃO carrega mais a lista de OPs. Ela existia só para o seletor de "Nova carga", que saiu daqui
// — Vitor (25/08/2026): "vamos tirar essa função nessa tela, deixar apenas na tela de romaneios
// prévios". Esta tela é de leitura; criar carga é lá.
export default async function ProgramacaoCargasPlanejamentoPage() {
  await requireRole(["ADMIN", "PLANEJAMENTO", "EXPEDICAO"]);
  return <ProgramacaoCargasPlanejamentoClient />;
}
