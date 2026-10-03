import { requireRole } from "@/lib/session";
import CorteMontagemClient from "./CorteMontagemClient";

// Consulta dos gerentes de setor, no celular (Matheus, 03/10/2026). Mesmos perfis da rota que ela lê
// (`/api/pcp/despacho`): quem vê esta tela consegue carregar os dados dela.
export const metadata = { title: "Produção — Corte e montagem" };

export default async function Page() {
  await requireRole(["ADMIN", "PRODUCAO", "PCP", "PLANEJAMENTO"]);
  return <CorteMontagemClient />;
}
