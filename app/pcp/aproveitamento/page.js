import { requireRole } from "@/lib/session";
import { Scissors, Construction } from "lucide-react";

export const metadata = { title: "Workspace Torg — PCP Aproveitamento" };

export default async function AproveitamentoPage() {
  await requireRole(["ADMIN", "PLANEJAMENTO", "PRODUCAO"]);

  return (
    <div className="space-y-6 max-w-7xl">
      <div>
        <h2 className="text-3xl font-extrabold text-torg-dark tracking-tight flex items-center gap-2">
          <Scissors size={28} className="text-emerald-600" />
          Aproveitamento de Materiais
        </h2>
        <p className="text-sm text-torg-gray mt-1">
          Controle de chapas, indicadores de perda e planos de corte (nesting).
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-12 text-center">
        <Construction size={48} className="mx-auto text-gray-300 mb-4" />
        <h3 className="text-lg font-semibold text-torg-dark mb-2">Em construção</h3>
        <p className="text-sm text-torg-gray max-w-md mx-auto">
          Este módulo está sendo desenvolvido. Em breve você poderá registrar chapas utilizadas,
          acompanhar % de aproveitamento por OP e importar planos de corte (DXF/PDF).
        </p>
      </div>
    </div>
  );
}
