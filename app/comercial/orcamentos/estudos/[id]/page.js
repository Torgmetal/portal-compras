import { requireRole } from "@/lib/session";
import EstudoClient from "./EstudoClient";

export const dynamic = "force-dynamic";

export default async function EstudoPage({ params }) {
  await requireRole(["ADMIN", "COMERCIAL"]);
  const { id } = await params;
  return <EstudoClient id={id} />;
}
