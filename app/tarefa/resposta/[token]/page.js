import RespostaSetorTarefa from "./RespostaSetorTarefa";

export const metadata = { robots: { index: false, follow: false }, title: "Responder tarefa — Torg" };

export default function RespostaSetorTarefaPage({ params }) {
  return <RespostaSetorTarefa token={params.token} />;
}
