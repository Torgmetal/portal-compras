import AceiteClient from "./AceiteClient";

export const metadata = { robots: { index: false, follow: false }, title: "Workspace Torg — Aceite do Aditivo" };
export const dynamic = "force-dynamic";

export default function AceiteAditivoPage({ params }) {
  return <AceiteClient token={params.token} />;
}
