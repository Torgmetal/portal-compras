import { redirect } from "next/navigation";

// Os indicadores de Compras agora ficam DENTRO do módulo Compras (pra não jogar o
// usuário no módulo "Indicadores" com todos os setores). Redireciona links antigos.
export default function ComprasIndicadoresRedirect() {
  redirect("/compras/indicadores");
}
