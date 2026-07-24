"use client";
import { useState } from "react";
import { FileSpreadsheet, Loader2 } from "lucide-react";
import { montarResumoFDWorkbook } from "@/lib/resumo-fd-excel";
import { downloadWorkbook } from "@/lib/excel-relatorio";

/**
 * Botão "Resumo FD (cliente)" — exporta a planilha padrão Torg com os itens de
 * Faturamento Direto que cada fornecedor venceu na OP + dados cadastrais, forma
 * de pagamento, nº da proposta e prazo de entrega. Pra mandar ao cliente.
 */
export default function BotaoResumoFD({ opId, numero }) {
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");

  async function gerar() {
    setLoading(true);
    setErro("");
    try {
      const res = await fetch(`/api/compras/op/${opId}/resumo-fd`);
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `Erro ${res.status}`);
      if (!j.fornecedores?.length) {
        setErro("Nenhum item de Faturamento Direto com vencedor nesta OP.");
        return;
      }
      const wb = await montarResumoFDWorkbook(j);
      const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
      await downloadWorkbook(wb, `Torg_Resumo-FD_OP-${numero || "s-n"}_${hoje}.xlsx`);
    } catch (e) {
      setErro("Erro ao gerar: " + e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="inline-flex flex-col gap-1">
      <button
        onClick={gerar}
        disabled={loading}
        className="px-4 py-2 bg-white border border-torg-blue-200 text-torg-blue text-sm rounded-lg hover:bg-torg-blue-50 font-medium flex items-center gap-2 disabled:opacity-50"
        title="Exporta a planilha de Faturamento Direto (fornecedores, itens e dados cadastrais) pra enviar ao cliente"
      >
        {loading ? <Loader2 size={16} className="animate-spin" /> : <FileSpreadsheet size={16} />}
        Resumo FD (cliente)
      </button>
      {erro && <span className="text-xs text-red-600 max-w-xs">{erro}</span>}
    </div>
  );
}
