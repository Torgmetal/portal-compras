import { requireRole } from "@/lib/session";
import ProducaoClient from "./ProducaoClient";

// A tela de TRABALHO do PCP — lista de OPs, não painel de TV.
//
// Vitor (24/08/2026): "da forma que está como painel não está funcionando; pensei em alguma coisa
// listada onde clicamos mostrar as OPs". A TV (/planejamento/prioridades e /pcp/dashboard-prioridades)
// continua existindo para a parede da fábrica — ele escolheu que as duas convivem. O que muda é a
// porta de entrada do PCP: quem trabalha precisa de lista, filtro e seleção; quem olha de longe
// precisa de card grande.
export const dynamic = "force-dynamic";
export const metadata = { title: "PCP — Produção" };

export default async function ProducaoPCPPage() {
  await requireRole(["ADMIN", "PCP", "PLANEJAMENTO", "PRODUCAO"]);
  return <ProducaoClient />;
}
