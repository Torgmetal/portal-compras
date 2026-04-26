import MarketingShell from "@/components/MarketingShell";
import { Truck, Mail, FileText } from "lucide-react";

export const metadata = {
  title: "Torg Metal — Portal de Fornecedores",
  description: "Acesso restrito para envio de cotações por link único.",
};

export default function PortalFornecedores() {
  return (
    <MarketingShell
      image="/obras/torre-escada.jpg"
      kicker="Área do fornecedor"
      title="Portal de Cotações"
      lead="Acesso exclusivo para envio de propostas a Requisições da Torg Metal."
    >
      <div className="bg-white rounded-2xl border border-torg-blue-100 shadow-sm p-7">
        <div className="w-12 h-12 rounded-xl bg-torg-orange flex items-center justify-center mb-5">
          <Truck size={22} className="text-white" />
        </div>
        <h2 className="text-xl font-bold text-torg-dark mb-2">
          Como acessar?
        </h2>
        <p className="text-sm text-torg-gray mb-6">
          Cada cotação tem um link único enviado para o seu email, com acesso
          apenas ao upload da proposta — você não vê outras cotações.
        </p>

        <ol className="space-y-4 mb-7">
          <li className="flex gap-3">
            <div className="w-7 h-7 rounded-full bg-torg-blue-50 text-torg-blue flex items-center justify-center text-sm font-bold flex-shrink-0">1</div>
            <div className="text-sm">
              <p className="font-semibold text-torg-dark">Receba o convite</p>
              <p className="text-torg-gray">A Torg envia um email com o link único quando há uma cotação para você.</p>
            </div>
          </li>
          <li className="flex gap-3">
            <div className="w-7 h-7 rounded-full bg-torg-blue-50 text-torg-blue flex items-center justify-center text-sm font-bold flex-shrink-0">2</div>
            <div className="text-sm">
              <p className="font-semibold text-torg-dark">Suba sua proposta</p>
              <p className="text-torg-gray">PDF, imagem ou planilha — a IA extrai os itens automaticamente.</p>
            </div>
          </li>
          <li className="flex gap-3">
            <div className="w-7 h-7 rounded-full bg-torg-blue-50 text-torg-blue flex items-center justify-center text-sm font-bold flex-shrink-0">3</div>
            <div className="text-sm">
              <p className="font-semibold text-torg-dark">Acompanhe</p>
              <p className="text-torg-gray">Você é avisado por email quando a cotação for analisada.</p>
            </div>
          </li>
        </ol>

        <div className="bg-torg-blue-50/50 border border-torg-blue-100 rounded-lg p-4 text-sm">
          <div className="flex items-start gap-2 text-torg-dark">
            <Mail size={16} className="mt-0.5 text-torg-blue flex-shrink-0" />
            <div>
              <p className="font-semibold mb-0.5">Não recebeu o link?</p>
              <p className="text-torg-gray">Fale com o comprador da Torg que te procurou — ele pode reenviar.</p>
            </div>
          </div>
        </div>
      </div>
    </MarketingShell>
  );
}
