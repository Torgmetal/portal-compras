"use client";
import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Loader2, AlertCircle, Send, AlertTriangle, Truck } from "lucide-react";
import TorgLogo from "@/components/TorgLogo";

const fmtMoeda = (v) =>
  Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtData = (d) => (d ? new Date(d).toLocaleDateString("pt-BR") : "—");

export default function CotacaoFornecedorForm({ cotacao, vencida }) {
  const router = useRouter();
  const [linhas, setLinhas] = useState(() =>
    cotacao.itens.map((it) => ({
      id: it.id,
      descricao: it.rmItem.descricao,
      material: it.rmItem.material,
      qtdRm: it.rmItem.qtd,
      unidade: it.rmItem.unidade,
      precoUnit: "",
      qtdCotada: it.qtdCotada,
      observacao: "",
    }))
  );
  const [prazoEntrega, setPrazoEntrega] = useState("");
  const [condicaoPagamento, setCondicaoPagamento] = useState("");
  const [observacaoGeral, setObservacaoGeral] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  const setLinha = (id, k, v) => {
    setLinhas((prev) => prev.map((l) => (l.id === id ? { ...l, [k]: v } : l)));
  };

  const total = useMemo(
    () =>
      linhas.reduce((s, l) => {
        const p = parseFloat(String(l.precoUnit).replace(",", ".")) || 0;
        const q = parseFloat(String(l.qtdCotada).replace(",", ".")) || 0;
        return s + p * q;
      }, 0),
    [linhas]
  );

  const submit = async (e) => {
    e.preventDefault();
    setErro("");
    const itens = linhas
      .map((l) => ({
        cotacaoItemId: l.id,
        precoUnit: parseFloat(String(l.precoUnit).replace(",", ".")) || 0,
        qtdCotada: parseFloat(String(l.qtdCotada).replace(",", ".")) || 0,
        observacao: l.observacao || null,
      }))
      .filter((l) => l.precoUnit > 0);
    if (itens.length === 0) {
      return setErro("Preencha pelo menos um preço unitário maior que zero.");
    }
    setEnviando(true);
    try {
      const res = await fetch(`/api/cotacao/submeter/${cotacao.token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itens,
          prazoEntrega: prazoEntrega || null,
          condicaoPagamento: condicaoPagamento || null,
          observacao: observacaoGeral || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao enviar");
      router.refresh();
    } catch (e) {
      setErro(e.message);
      setEnviando(false);
    }
  };

  return (
    <div className="min-h-screen bg-torg-blue-50/30">
      {/* Header */}
      <header className="bg-white border-b border-torg-blue-100 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <TorgLogo size="sm" />
            <span className="text-xs text-torg-gray hidden sm:inline">Portal de Cotações</span>
          </Link>
          <span className="text-xs text-torg-gray">RM {cotacao.rm.numero}</span>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        {/* Boas-vindas + dados da RM */}
        <div className="bg-white rounded-xl shadow-sm border border-torg-blue-100 p-6">
          <p className="text-sm text-torg-gray">Olá, <strong className="text-torg-dark">{cotacao.fornecedorNome}</strong></p>
          <h1 className="text-2xl font-extrabold text-torg-dark tracking-tight mt-1">
            Solicitação de Cotação — RM {cotacao.rm.numero}
          </h1>
          <p className="text-sm text-torg-gray mt-2">{cotacao.rm.descricao}</p>
          {cotacao.rm.observacao && (
            <p className="text-sm text-torg-gray mt-1">Observação: {cotacao.rm.observacao}</p>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4 pt-4 border-t border-gray-100 text-sm">
            <div>
              <p className="text-xs text-torg-gray">Itens pra cotar</p>
              <p className="font-medium text-torg-dark">{cotacao.itens.length}</p>
            </div>
            <div>
              <p className="text-xs text-torg-gray">Prazo de resposta</p>
              <p className={`font-medium ${vencida ? "text-red-600" : "text-torg-dark"}`}>
                {fmtData(cotacao.prazoResposta)}
                {vencida && " (vencido)"}
              </p>
            </div>
            <div>
              <p className="text-xs text-torg-gray">Status</p>
              <p className="font-medium text-torg-blue">Aguardando proposta</p>
            </div>
          </div>
        </div>

        {vencida && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700 flex items-start gap-2">
            <AlertTriangle size={18} className="mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium">Esse pedido está fora do prazo</p>
              <p className="text-xs">Você ainda pode enviar a proposta, mas talvez o comprador já tenha decidido com outros fornecedores. Sugerimos contatar o comprador antes.</p>
            </div>
          </div>
        )}

        {erro && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2 flex items-start gap-2">
            <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
            <span>{erro}</span>
          </div>
        )}

        <form onSubmit={submit} className="space-y-6">
          {/* Itens */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-torg-dark">Itens solicitados</h2>
              <p className="text-xs text-torg-gray mt-1">
                Preencha o preço unitário e ajuste a quantidade se necessário. Itens sem preço serão ignorados.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">#</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Descrição</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Qtd RM</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Qtd cotada *</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Preço unit. (R$) *</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {linhas.map((l, i) => {
                    const total = (parseFloat(String(l.precoUnit).replace(",", ".")) || 0) * (parseFloat(String(l.qtdCotada).replace(",", ".")) || 0);
                    return (
                      <tr key={l.id}>
                        <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                        <td className="px-3 py-2">
                          <p className="text-torg-dark font-medium">{l.descricao}</p>
                          {l.material && <p className="text-xs text-torg-gray">{l.material}</p>}
                        </td>
                        <td className="px-3 py-2 text-right text-torg-gray text-xs tabular-nums">
                          {l.qtdRm} {l.unidade}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={l.qtdCotada}
                            onChange={(e) => setLinha(l.id, "qtdCotada", e.target.value)}
                            className="w-24 border border-gray-300 rounded px-2 py-1 text-sm text-right tabular-nums focus:ring-1 focus:ring-torg-blue"
                          />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={l.precoUnit}
                            onChange={(e) => setLinha(l.id, "precoUnit", e.target.value)}
                            placeholder="0,00"
                            className="w-28 border border-gray-300 rounded px-2 py-1 text-sm text-right tabular-nums focus:ring-1 focus:ring-torg-blue"
                          />
                        </td>
                        <td className="px-3 py-2 text-right text-torg-dark font-medium tabular-nums">
                          {total > 0 ? fmtMoeda(total) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-gray-50">
                  <tr>
                    <td colSpan={5} className="px-3 py-3 text-right font-semibold text-torg-dark">Total da proposta:</td>
                    <td className="px-3 py-3 text-right font-bold text-torg-orange-700 text-base tabular-nums">{fmtMoeda(total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Condições gerais */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
            <h2 className="text-lg font-semibold text-torg-dark">Condições</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-torg-dark mb-1">Prazo de entrega</label>
                <input
                  type="text"
                  value={prazoEntrega}
                  onChange={(e) => setPrazoEntrega(e.target.value)}
                  placeholder="Ex: 15 dias úteis"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-torg-dark mb-1">Condição de pagamento</label>
                <input
                  type="text"
                  value={condicaoPagamento}
                  onChange={(e) => setCondicaoPagamento(e.target.value)}
                  placeholder="Ex: 30 dias / 28 dias com 2% desc."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-torg-dark mb-1">Observação geral</label>
              <textarea
                value={observacaoGeral}
                onChange={(e) => setObservacaoGeral(e.target.value)}
                rows={3}
                placeholder="Frete, embalagem, validade da proposta, restrições, etc."
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={enviando}
              className="px-6 py-2.5 bg-torg-orange text-white rounded-lg hover:bg-torg-orange-600 font-semibold flex items-center gap-2 disabled:opacity-50"
            >
              {enviando ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              {enviando ? "Enviando..." : "Enviar proposta"}
            </button>
          </div>
        </form>

        <footer className="text-center text-xs text-torg-gray pt-4">
          Esse link é exclusivo da sua empresa. Não compartilhe — você não vê propostas de outros fornecedores e eles não veem a sua.
        </footer>
      </div>
    </div>
  );
}
