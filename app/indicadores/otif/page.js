import { requireRole } from "@/lib/session";
import { OTIFClient } from "../IndicadoresClient";

export default async function OTIFPage() {
  await requireRole(["ADMIN", "COMPRAS"]);
  return <OTIFClient />;
}
