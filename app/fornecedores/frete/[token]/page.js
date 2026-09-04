import FreteFormClient from "./FreteFormClient";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false }, title: "Cotacao de Frete | Torg Metal" };

export default function FreteCotacaoPage() {
  return <FreteFormClient />;
}
