import MarketingShell from "@/components/MarketingShell";
import { Lock, ArrowLeft } from "lucide-react";
import Link from "next/link";

export const metadata = {
  title: "Torg Metal — Upload de Cotação",
};

export default function UploadCotacaoPorToken({ params }) {
  // Quando a auth de token estiver ligada, este componente vai:
  // 1) Validar params.token contra a RM/cotação no banco
  // 2) Se válido: mostrar form de upload (PDF/imagem/texto) + IA
  // 3) Se inválido/expirado: mostrar mensagem de erro
  // Por enquanto é shell de placeholder.
  return (
    <MarketingShell
      image="/obras/torre-escada.jpg"
      kicker="Upload de Cotação"
      title="Acesso por link único"
      lead="Token recebido por email — válido por 30 dias e específico desta cotação."
    >
      <div className="bg-white rounded-2xl border border-torg-blue-100 shadow-sm p-7">
        <div className="w-12 h-12 rounded-xl bg-torg-orange/20 flex items-center justify-center mb-5">
          <Lock size={22} className="text-torg-orange" />
        </div>
        <h2 className="text-xl font-bold text-torg-dark mb-2">Em breve</h2>
        <p className="text-sm text-torg-gray mb-2">
          Token: <code className="bg-torg-blue-50 px-2 py-0.5 rounded text-torg-dark font-mono text-xs">{params.token}</code>
        </p>
        <p className="text-sm text-torg-gray mb-6">
          O upload por token único será liberado quando a integração de email
          (Resend) estiver configurada. Por enquanto, esta página é um shell
          de pré-visualização.
        </p>

        <Link
          href="/fornecedores"
          className="text-sm text-torg-blue font-medium inline-flex items-center gap-1 hover:underline"
        >
          <ArrowLeft size={14} /> Voltar
        </Link>
      </div>
    </MarketingShell>
  );
}
