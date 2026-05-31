import { requireRole } from "@/lib/session";
import PlantaClient from "./PlantaClient";

export default async function PlantaPage() {
  await requireRole(["ADMIN", "RH"]);
  return <PlantaClient />;
}
