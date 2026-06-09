import CronogramaDetalheClient from "./CronogramaDetalheClient";

export const metadata = { title: "Cronograma — Planejamento Torg" };

export default async function CronogramaDetalhePage({ params }) {
  const { id } = await params;
  return <CronogramaDetalheClient cronogramaId={id} />;
}
