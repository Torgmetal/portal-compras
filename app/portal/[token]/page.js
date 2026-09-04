import PortalClienteView from "./PortalClienteView";

export const metadata = {
  robots: { index: false, follow: false },
  title: "Portal da Obra — Torg Metal",
  description: "Acompanhamento da fabricação: cronograma, qualidade, certificados e documentos.",
};

export default async function Page({ params }) {
  const { token } = await params;
  return <PortalClienteView token={token} />;
}
