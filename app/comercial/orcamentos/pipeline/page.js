import { requireRole } from "@/lib/session";
import PipelineClient from "./PipelineClient";

export const dynamic = "force-dynamic";

export default async function PipelinePage() {
  await requireRole(["ADMIN", "COMERCIAL"]);
  return <PipelineClient />;
}
