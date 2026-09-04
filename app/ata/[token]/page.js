import AtaPublicaClient from "./AtaPublicaClient";

export const metadata = { robots: { index: false, follow: false }, title: "Ata de Reunião — Torg Metal" };

export default function AtaPublicaPage({ params }) {
  return <AtaPublicaClient token={params.token} />;
}
