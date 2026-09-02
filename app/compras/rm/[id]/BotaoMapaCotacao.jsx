"use client";
import { useState } from "react";
import { FileSpreadsheet, Loader2 } from "lucide-react";
import { montarMapaCotacaoWorkbook } from "@/lib/mapa-cotacao-excel";
import { downloadWorkbook } from "@/lib/excel-relatorio";

/**
 * Botão "Mapa de cotação" — exporta a comparação das cotações recebidas da RM em R$/kg, com
 * cobertura, observações do item, prazo e histórico de entrega de cada fornecedor.
 *
 * ⚠ SÓ LEITURA, como o Resumo FD: a rota não escreve nada e o Excel é montado aqui no navegador.
 * Nada nesta tela muda de comportamento por causa dele.
 */
export default function BotaoMapaCotacao({ rmId, numero, cotacoes = 0 }) {
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");

  // ⚠ sem cotação recebida não há mapa — e um botão que só sabe dizer "não deu" depois do clique
  // ensina a não clicar. Ele some.
  if (!cotacoes) return null;

  async function gerar() {
    setLoading(true); setErro("");
    try {
      const res = await fetch(`/api/compras/rm/${rmId}/mapa-cotacao`, { cache: "no-store" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `Erro ${res.status}`);
      const wb = await montarMapaCotacaoWorkbook(j);
      const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
      await downloadWorkbook(wb, `Torg_Mapa-cotacao_${numero || "RM"}_${hoje}.xlsx`);
    } catch (e) {
      setErro(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="inline-flex flex-col items-start">
      <button onClick={gerar} disabled={loading}
        title="Compara as cotações recebidas em R$/kg (bruto e líquido), com cobertura, observações do fornecedor e histórico de entrega"
        className="px-3 py-1.5 text-xs font-medium rounded-lg border border-torg-blue-200 text-torg-blue bg-white hover:bg-torg-blue-50 inline-flex items-center gap-1.5 disabled:opacity-50">
        {loading ? <Loader2 size={14} className="animate-spin" /> : <FileSpreadsheet size={14} />}
        Mapa de cotação
      </button>
      {erro && <span className="text-[11px] text-red-600 mt-1">{erro}</span>}
    </div>
  );
}
