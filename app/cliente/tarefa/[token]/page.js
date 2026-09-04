import RespostaClienteTarefa from "./RespostaClienteTarefa";

export const metadata = { robots: { index: false, follow: false }, title: "Torg Metal — Sua resposta" };

export default function ClienteTarefaPage({ params }) {
  return <RespostaClienteTarefa token={params.token} />;
}
