import { requireRole } from "@/lib/session";
import { PipelineClient } from "../../IndicadoresComercialClient";

export default async function PipelinePage() {
  await requireRole(["ADMIN", "COMERCIAL"]);
  return <PipelineClient />;
}
