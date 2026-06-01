import { requireRole } from "@/lib/session";
import FuncionariosClient from "./FuncionariosClient";

export const dynamic = "force-dynamic";

export default async function FuncionariosPage() {
  await requireRole(["ADMIN", "RH"]);
  return <FuncionariosClient />;
}
