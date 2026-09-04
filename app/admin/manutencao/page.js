import { requireAcesso } from "@/lib/session";
import ManutencaoClient from "./ManutencaoClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Manutenção do banco — Admin" };

export default async function ManutencaoPage() {
  await requireAcesso({ tipos: ["ADMIN"] });
  return <ManutencaoClient />;
}
