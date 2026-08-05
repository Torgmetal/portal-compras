import { redirect } from "next/navigation";

// Movido para dentro do módulo Compras. Redireciona o link antigo.
export default function ComprasFornecedoresRedirect() {
  redirect("/compras/indicadores/fornecedores");
}
