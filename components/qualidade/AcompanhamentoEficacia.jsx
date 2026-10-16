import { acompanhamentoEficacia } from "@/lib/nao-conformidade";

export default function AcompanhamentoEficacia({ rnc, compacto = false }) {
  const avaliacao = acompanhamentoEficacia(rnc);
  if (!avaliacao) return null;
  const aguardando = avaliacao.fase === "AGUARDANDO_EFICACIA";
  const data = avaliacao.avaliarEm.split("-").reverse().join("/");
  return <div className={compacto ? "text-[11px] text-left" : "mt-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm"}>
    <span className={`font-semibold ${aguardando ? "text-torg-blue" : "text-amber-700"}`}>
      {aguardando ? "Aguardando avaliação de eficácia" : "Avaliação de eficácia disponível"}
    </span>
    <p className="text-torg-gray mt-0.5">
      {aguardando ? `Avaliar em ${data} · faltam ${avaliacao.diasRestantes} dia(s)` : `Avaliar reincidência e encerramento · desde ${data}`}
    </p>
    {!compacto && <p className="text-torg-gray mt-1 text-xs">Prazo de 60 dias corridos desde a emissão. O portal avisa uma vez ao completar o período; o encerramento depende da avaliação da Qualidade.</p>}
  </div>;
}
