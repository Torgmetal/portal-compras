import PortalClienteClient from "./PortalClienteClient";

export const metadata = {
  title: "Portal do Cliente — Torg Metal",
  robots: { index: false, follow: false },
};

export default function PortalClientePage({ params }) {
  return <PortalClienteClient token={params.token} />;
}
