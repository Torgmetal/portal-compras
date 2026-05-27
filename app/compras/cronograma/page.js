import { requireRole } from "@/lib/session";
import CronogramaClient from "./CronogramaClient";

export const dynamic = "force-dynamic";

export default async function CronogramaPage() {
  await requireRole(["ADMIN", "COMPRAS"]);

  return (
    <div className="space-y-6 max-w-[1600px]">
      <div>
        <h2 className="text-3xl font-extrabold text-torg-dark tracking-tight">
          Entregas
        </h2>
        <p className="text-sm text-torg-gray mt-1">
          Previsão de entrega por pedido de compra
        </p>
      </div>
      <CronogramaClient />
    </div>
  );
}
