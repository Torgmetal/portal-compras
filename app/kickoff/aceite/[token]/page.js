import AceiteClient from "./AceiteClient";

export const metadata = { title: "Workspace Torg — Aceite do Kick Off" };
export const dynamic = "force-dynamic";

export default function AceitePage({ params }) {
  return <AceiteClient token={params.token} />;
}
