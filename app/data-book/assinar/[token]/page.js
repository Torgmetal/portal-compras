import AssinarClient from "./AssinarClient";

export const metadata = {
  title: "Assinatura do Data Book — Torg Metal",
  robots: { index: false, follow: false },
};

export default function DataBookAssinarPage({ params }) {
  return <AssinarClient token={params.token} />;
}
