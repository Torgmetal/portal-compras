import { redirect } from "next/navigation";

// Aba "Status da obra" saiu do ar (pouco usada). Redireciona pra Cronogramas.
export default function StatusObraPage() {
  redirect("/planejamento/cronogramas");
}
