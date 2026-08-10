import SgqPublicoClient from "./SgqPublicoClient";

export const metadata = { title: "Documentos do SGQ — Torg Metal", robots: { index: false, follow: false } };

export default function SgqPublicoPage({ params }) {
  return <SgqPublicoClient token={params.token} />;
}
