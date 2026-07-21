import AtaOPPublicaClient from "./AtaOPPublicaClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ata de reunião — Torg Metal" };

export default function AtaOPPublicaPage({ params }) {
  return <AtaOPPublicaClient token={params.token} />;
}
