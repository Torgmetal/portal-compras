import { redirect } from "next/navigation";

// Redirect antigo → nova rota
export default function ProgramacaoCorteRedirect() {
  redirect("/producao/programacao/corte");
}
