import MarketingShell from "@/components/MarketingShell";
import { ClipboardList, Lock } from "lucide-react";

export const metadata = {
  title: "Torg Metal — Portal RM",
  description: "Portal interno para lançamento de Requisições de Material.",
};

export default function PortalRM() {
  return (
    <MarketingShell
      image="/obras/ponte-trelica.jpg"
      kicker="Equipe interna"
      title="Portal de Requisições"
      lead="Lance suas requisições de material e consumíveis. Cada RM segue para o time de Compras, que cuida das cotações e do pedido no Omie."
    >
      <div className="bg-white rounded-2xl border border-torg-blue-100 shadow-sm p-7">
        <div className="w-12 h-12 rounded-xl bg-torg-blue flex items-center justify-center mb-5">
          <ClipboardList size={22} className="text-white" />
        </div>
        <h2 className="text-xl font-bold text-torg-dark mb-1">Acesso restrito</h2>
        <p className="text-sm text-torg-gray mb-6">
          Faça login com seu email Torg para criar uma nova RM ou acompanhar as
          que você já lançou.
        </p>

        <button
          disabled
          className="w-full py-3 bg-torg-blue/40 text-white rounded-lg font-semibold inline-flex items-center justify-center gap-2 cursor-not-allowed"
          title="Login em breve — entre pelo Portal de Compras por enquanto"
        >
          <Lock size={16} /> Entrar com email Torg (em breve)
        </button>

        <div className="mt-5 pt-5 border-t border-torg-blue-100 text-xs text-torg-gray">
          Por enquanto, RMs são lançadas pelo time de Compras —
          <a href="/compras/nova-rm" className="text-torg-blue font-medium hover:underline ml-1">
            ir para Nova RM no Compras
          </a>
          .
        </div>
      </div>
    </MarketingShell>
  );
}
