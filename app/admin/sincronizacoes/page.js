import { requireAcesso } from "@/lib/session";
import SincronizacoesClient from "./SincronizacoesClient";

export const dynamic = "force-dynamic";

export default async function SincronizacoesPage() {
  await requireAcesso({ tipos: ["ADMIN"] });
  return <SincronizacoesClient />;
}
