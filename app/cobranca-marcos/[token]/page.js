import RespostaCobrancaMarcos from "./RespostaCobrancaMarcos";

export const metadata = { title: "Responder cobrança de marcos — Torg" };

export default function CobrancaMarcosPage({ params }) {
  return <RespostaCobrancaMarcos token={params.token} />;
}
