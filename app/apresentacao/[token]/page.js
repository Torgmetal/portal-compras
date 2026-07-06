import ApresentacaoClient from "./ApresentacaoClient";

export const metadata = {
  title: "Torg Metal — Apresentação",
  robots: { index: false, follow: false },
};

export default async function ApresentacaoPage({ params }) {
  const { token } = await params;
  return <ApresentacaoClient token={token} />;
}
