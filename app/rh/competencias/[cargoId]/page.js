export const dynamic = "force-dynamic";
import { requireRole } from "@/lib/session";
import CargoMatrizClient from "./CargoMatrizClient";

export default async function Page({ params }) {
  await requireRole(["ADMIN", "RH"]);
  return <CargoMatrizClient cargoId={params.cargoId} />;
}
