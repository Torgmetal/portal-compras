import { requireRole } from "@/lib/session";
import IndicadoresClient from "./IndicadoresClient";

export const metadata = {
  title: "Indicadores — Portal de Compras",
};

export default async function IndicadoresPage() {
  await requireRole(["ADMIN", "COMPRAS"]);
  return <IndicadoresClient />;
}
