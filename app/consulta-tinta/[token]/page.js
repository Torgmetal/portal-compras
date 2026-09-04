// Portal do fabricante de tinta — separado do portal do Compras, de propósito.
import ConsultaTintaClient from "./ConsultaTintaClient";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false }, title: "Consulta técnica de tintas — Torg Metal" };

export default async function Page({ params }) {
  const { token } = await params;
  return <ConsultaTintaClient token={token} />;
}
