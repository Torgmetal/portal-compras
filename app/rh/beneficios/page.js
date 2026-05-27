import { requireRole } from "@/lib/session";
import BeneficiosClient from "./BeneficiosClient";

export const dynamic = "force-dynamic";

export default async function BeneficiosPage() {
  await requireRole(["ADMIN", "RH"]);
  return <BeneficiosClient />;
}
