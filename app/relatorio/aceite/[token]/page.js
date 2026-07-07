import AceiteClient from "./AceiteClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Torg Metal — Relatório de Status" };

export default function Page({ params }) {
  return <AceiteClient token={params.token} />;
}
