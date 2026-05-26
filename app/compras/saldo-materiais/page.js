import { requireRole } from "@/lib/session";
import SaldoMateriaisClient from "./SaldoMateriaisClient";

export const dynamic = "force-dynamic";

export default async function SaldoMateriaisPage() {
  await requireRole(["ADMIN", "COMPRAS"]);
  return (
    <div>
      <h1 className="text-2xl font-bold text-torg-dark">Saldo de Materiais</h1>
      <p className="text-torg-gray mt-1 mb-6">
        Acompanhamento consolidado dos materiais solicitados, pedidos e recebidos
      </p>
      <SaldoMateriaisClient />
    </div>
  );
}
