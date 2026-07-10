import AceiteClient from "./AceiteClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Torg Metal — Proposta Comercial" };

export default function Page({ params }) {
  return <AceiteClient token={params.token} />;
}
