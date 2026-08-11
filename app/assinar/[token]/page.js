import AssinarClient from "./AssinarClient";

export const metadata = { title: "Assinatura de documento — Torg Metal", robots: { index: false, follow: false } };

export default function AssinarPage({ params }) {
  return <AssinarClient token={params.token} />;
}
