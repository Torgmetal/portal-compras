import { requireRole } from "@/lib/session";
import DetalheOPClient from "./DetalheOPClient";

export default async function EngenhariaOPPage({ params }) {
  await requireRole(["ADMIN", "ENGENHARIA"]);
  const { opNumero } = await params;
  return <DetalheOPClient opNumero={decodeURIComponent(opNumero)} />;
}
