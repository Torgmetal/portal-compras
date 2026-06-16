import AceiteClient from "./AceiteClient";

export const metadata = {
  title: "Aceite do Data Book — Torg Metal",
  robots: { index: false, follow: false },
};

export default function DataBookAceitePage({ params }) {
  return <AceiteClient token={params.token} />;
}
