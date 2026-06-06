import { redirect } from "next/navigation";

// Redireciona para o primeiro sub-setor (Corte)
export default function ProgramacaoRedirect() {
  redirect("/producao/programacao/corte");
}
