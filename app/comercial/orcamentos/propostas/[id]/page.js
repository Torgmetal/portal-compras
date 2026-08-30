import { requireRole } from "@/lib/session";
import PropostaClient from "./PropostaClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Comercial — Elaboração da proposta" };

export default async function Page({ params }) {
  await requireRole(["ADMIN", "COMERCIAL"]);
  const { id } = await params;
  return <PropostaClient id={id} />;
}
