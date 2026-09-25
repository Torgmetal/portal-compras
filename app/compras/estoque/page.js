import { requireRole } from "@/lib/session";
import { carregarCatalogoOmie } from "@/lib/estoque-catalogo";
import EstoquePageWrapper from "./EstoquePageWrapper";

export const dynamic = "force-dynamic";

export default async function EstoquePage() {
  const user = await requireRole(["ADMIN", "COMPRAS"]);
  const { itens, config, agendaCron } = await carregarCatalogoOmie();

  return <EstoquePageWrapper itensIniciais={itens} configInicial={config} agendaCron={agendaCron} isAdmin={user.role === "ADMIN"} />;
}
