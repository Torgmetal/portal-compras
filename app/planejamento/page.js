import { redirect } from "next/navigation";

// O "Painel Geral" foi removido — a entrada do módulo Planejamento cai direto
// na primeira aba (Cronogramas).
export default function PlanejamentoPage() {
  redirect("/planejamento/cronogramas");
}
