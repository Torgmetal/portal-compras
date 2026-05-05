import { requireUser } from "@/lib/session";
import PerfilClient from "./PerfilClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Workspace Torg — Perfil",
};

export default async function PerfilPage() {
  const user = await requireUser();
  return <PerfilClient user={user} />;
}
