import EstudoCotacaoFormClient from "./EstudoCotacaoFormClient";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false }, title: "Cotacao de Materiais | Torg Metal" };

export default function EstudoCotacaoPage() {
  return <EstudoCotacaoFormClient />;
}
