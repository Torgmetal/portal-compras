// ─── CONCILIAÇÃO COM O CMR — a tela que faltava ───────────────────────────────
// Vitor (23/08/2026), no pente-fino: 218 itens do Compras estão marcados como "aguardando
// entrega" enquanto o material já está no galpão — e ninguém enxergava, porque a conciliação
// calculava a lista dos que NÃO casaram e devolvia só no JSON. O cron das 12h lança o que casa e
// joga o resto fora; nenhuma tela chamava este endpoint.
//
// ⚠ O QUE NÃO CASA É JUSTAMENTE O QUE PRECISA DE GENTE. A conciliação exige descrição idêntica
// entre a RM e o CMR — "W150X22.5" na RM contra o nome inteiro do perfil no CMR não casa. Sem a
// lista, o comprador descobre por telefone o que já chegou.
import { requireRole } from "@/lib/session";
import RecebimentoCmrClient from "./RecebimentoCmrClient";

export const dynamic = "force-dynamic";

export default async function Page() {
  await requireRole(["ADMIN", "COMPRAS", "PCP", "PLANEJAMENTO"]);
  return <RecebimentoCmrClient />;
}
