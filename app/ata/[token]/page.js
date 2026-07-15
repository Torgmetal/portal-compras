import AtaPublicaClient from "./AtaPublicaClient";

export const metadata = { title: "Ata de Reunião — Torg Metal" };

export default function AtaPublicaPage({ params }) {
  return <AtaPublicaClient token={params.token} />;
}
