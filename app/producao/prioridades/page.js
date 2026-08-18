import { Suspense } from "react";
import { requireRole } from "@/lib/session";
import PrioridadesProducaoClient from "./PrioridadesProducaoClient";

export const metadata = { title: "Prioridades de Produção — Torg Metal" };
export const dynamic = "force-dynamic";

const EDIT = ["ADMIN", "PLANEJAMENTO", "PCP"];

export default async function PrioridadesProducaoPage() {
  const user = await requireRole(["ADMIN", "PLANEJAMENTO", "PCP", "PRODUCAO", "COMERCIAL"]);
  const podeEditar = user.tipo === "ADMIN" || EDIT.includes(user.tipo) || (user.modulos || []).some((m) => EDIT.includes(m));
  return (
    <Suspense fallback={null}>
      <PrioridadesProducaoClient podeEditar={podeEditar} />
    </Suspense>
  );
}
