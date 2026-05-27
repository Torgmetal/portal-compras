import { requireRole } from "@/lib/session";
import SaldoMateriaisClient from "./SaldoMateriaisClient";

export const dynamic = "force-dynamic";

export default async function SaldoMateriaisPage() {
  await requireRole(["ADMIN", "COMPRAS"]);
  return (
    <div>
      <h1 className="text-2xl font-bold text-torg-dark">Saldo de Materiais</h1>
      <p className="text-torg-gray mt-1 mb-6">
        Acompanhamento consolidado: solicitado, pedido e recebido — por tipo de RM
      </p>
      <SaldoMateriaisClient />
    </div>
  );
}
