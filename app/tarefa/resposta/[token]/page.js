import RespostaSetorTarefa from "./RespostaSetorTarefa";

export const metadata = { title: "Responder tarefa — Torg" };

export default function RespostaSetorTarefaPage({ params }) {
  return <RespostaSetorTarefa token={params.token} />;
}
