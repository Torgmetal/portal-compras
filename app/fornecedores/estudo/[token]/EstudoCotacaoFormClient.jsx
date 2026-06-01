"use client";
import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import {
  Package, Loader2, CheckCircle2, AlertCircle, Send,
} from "lucide-react";

function fmtNum(v, dec = 2) {
  if (!v && v !== 0) return "—";
  return v.toLocaleString("pt-BR", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function fmtMoeda(v) {
  if (!v && v !== 0) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function EstudoCotacaoFormClient() {
  const { token } = useParams();
  const [dados, setDados] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(null);

  // Form
  const [precos, setPrecos] = useState({});
  const [obsItens, setObsItens] = useState({});
  const [prazoEntrega, setPrazoEntrega] = useState("");
  const [condicaoPgto, setCondicaoPgto] = useState("");
  const [observacao, setObservacao] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [sucesso, setSucesso] = useState(false);
  const [erroEnvio, setErroEnvio] = useState("");

  useEffect(() => {
    fetch(`/api/estudo-cotacao/${token}`)
      .then((r) => r.json())
      .then((json) => {
        if (!json.success) throw new Error(json.error);
        setDados(json.data);
        // Preencher precos se ja respondeu
        const precosInit = {};
        const obsInit = {};
        for (const item of json.data.itens) {
          if (item.precoUnitario != null) precosInit[item.id] = String(item.precoUnitario);
          if (item.observacao) obsInit[item.id] = item.observacao;
        }
        setPrecos(precosInit);
        setObsItens(obsInit);
        if (json.data.prazoEntrega) setPrazoEntrega(json.data.prazoEntrega);
        if (json.data.condicaoPgto) setCondicaoPgto(json.data.condicaoPgto);
        if (json.data.observacao) setObservacao(json.data.observacao);
        if (json.data.status === "RECEBIDA" || json.data.status === "SELECIONADA") setSucesso(true);
      })
      .catch((e) => setErro(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!prazoEntrega.trim()) {
      setErroEnvio("Informe o prazo de entrega");
      return;
    }
    // Verificar se ao menos um preco foi informado
    const itensComPreco = dados.itens.map((item) => ({
      id: item.id,
      precoUnitario: precos[item.id] ? parseFloat(precos[item.id]) : null,
      observacao: obsItens[item.id]?.trim() || undefined,
    }));
    const algumPreco = itensComPreco.some((i) => i.precoUnitario != null && i.precoUnitario > 0);
    if (!algumPreco) {
      setErroEnvio("Informe o preco unitario de pelo menos um item");
      return;
    }

    setEnviando(true);
    setErroEnvio("");
    try {
      const res = await fetch(`/api/estudo-cotacao/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prazoEntrega: prazoEntrega.trim(),
          condicaoPgto: condicaoPgto.trim() || undefined,
          observacao: observacao.trim() || undefined,
          itens: itensComPreco,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setSucesso(true);
    } catch (e) {
      setErroEnvio(e.message);
    } finally {
      setEnviando(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 size={32} className="animate-spin text-[#006EAB]" />
      </div>
    );
  }

  if (erro) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
          <AlertCircle size={48} className="text-red-400 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-800 mb-2">Link invalido</h1>
          <p className="text-gray-500 text-sm">Esta cotacao nao foi encontrada ou o link expirou.</p>
        </div>
      </div>
    );
  }

  if (sucesso) {
    const totalCotado = dados.itens.reduce((s, item) => {
      const p = parseFloat(precos[item.id]) || item.precoUnitario || 0;
      return s + p * (item.quantidade || 0);
    }, 0);

    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
          <CheckCircle2 size={48} className="text-emerald-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-800 mb-2">Cotacao enviada!</h1>
          <p className="text-gray-500 text-sm mb-4">
            Sua cotacao foi registrada com sucesso. A equipe Torg Metal entrara em contato.
          </p>
          {totalCotado > 0 && (
            <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-100">
              <p className="text-sm text-emerald-600 font-medium">Valor total estimado</p>
              <p className="text-2xl font-bold text-emerald-800">{fmtMoeda(totalCotado)}</p>
              {(prazoEntrega || dados.prazoEntrega) && (
                <p className="text-sm text-emerald-600 mt-1">Prazo: {prazoEntrega || dados.prazoEntrega}</p>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  const tipoLabel = dados.tipo === "ACESSORIOS" ? "Acessorios" : "Materiais";

  // Calcular total parcial
  const totalParcial = dados.itens.reduce((s, item) => {
    const p = parseFloat(precos[item.id]) || 0;
    return s + p * (item.quantidade || 0);
  }, 0);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-[#006EAB] text-white">
        <div className="max-w-3xl mx-auto px-4 py-6">
          <div className="flex items-center gap-4 mb-2">
            <img src="/torg-logo-white.png" alt="Torg Metal" className="h-8" />
            <div className="h-6 w-px bg-white/30" />
            <div className="flex items-center gap-2">
              <Package size={22} />
              <h1 className="text-lg font-bold">Cotacao de {tipoLabel}</h1>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {/* Referencia do projeto */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-400">Referencia</span>
            <span className="text-sm font-bold text-gray-800">{dados.ref}</span>
          </div>
        </div>

        {/* Formulario com tabela de precos */}
        <form onSubmit={handleSubmit}>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-6">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-1">Itens para Cotacao</h2>
            <p className="text-sm text-gray-500 mb-4">
              Prezado(a) <strong className="text-gray-800">{dados.fornecedorNome}</strong>, preencha o preco unitario de cada item.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                    <th className="pb-2 pr-2">#</th>
                    <th className="pb-2 px-2">Descricao</th>
                    <th className="pb-2 px-2">Especificacao</th>
                    <th className="pb-2 px-2 text-center">Unid.</th>
                    <th className="pb-2 px-2 text-right">Qtd</th>
                    <th className="pb-2 px-2 text-right">Preco Unit. (R$)</th>
                    <th className="pb-2 px-2 text-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {dados.itens.map((item, idx) => {
                    const preco = parseFloat(precos[item.id]) || 0;
                    const subtotal = preco * (item.quantidade || 0);
                    return (
                      <tr key={item.id}>
                        <td className="py-3 pr-2 text-gray-400">{idx + 1}</td>
                        <td className="py-3 px-2 font-medium text-gray-800">{item.descricao}</td>
                        <td className="py-3 px-2 text-gray-500 text-xs">{item.especificacao || "—"}</td>
                        <td className="py-3 px-2 text-center text-gray-500">{item.unidade}</td>
                        <td className="py-3 px-2 text-right">{fmtNum(item.quantidade, item.quantidade % 1 === 0 ? 0 : 2)}</td>
                        <td className="py-3 px-2">
                          <input
                            type="number"
                            value={precos[item.id] || ""}
                            onChange={(e) => setPrecos((prev) => ({ ...prev, [item.id]: e.target.value }))}
                            placeholder="0,00"
                            min="0"
                            step="0.01"
                            className="w-28 ml-auto block px-3 py-2 border border-gray-200 rounded-lg text-sm text-right focus:ring-2 focus:ring-[#006EAB]/30 focus:border-[#006EAB] outline-none"
                          />
                        </td>
                        <td className="py-3 px-2 text-right font-medium text-gray-700 whitespace-nowrap">
                          {preco > 0 ? fmtMoeda(subtotal) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {totalParcial > 0 && (
                  <tfoot>
                    <tr className="border-t-2 border-gray-200">
                      <td colSpan={5}></td>
                      <td className="py-3 px-2 text-right text-xs font-bold text-gray-500 uppercase">Total</td>
                      <td className="py-3 px-2 text-right font-bold text-gray-800 whitespace-nowrap">{fmtMoeda(totalParcial)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

          {/* Condicoes */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 space-y-4 mb-6">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Condicoes Comerciais</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Prazo de Entrega <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={prazoEntrega}
                  onChange={(e) => setPrazoEntrega(e.target.value)}
                  placeholder="Ex: 15 dias uteis, 30 dias..."
                  required
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-[#006EAB]/30 focus:border-[#006EAB] outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Condicao de Pagamento</label>
                <input
                  type="text"
                  value={condicaoPgto}
                  onChange={(e) => setCondicaoPgto(e.target.value)}
                  placeholder="Ex: 30/60/90 DDL, a vista..."
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-[#006EAB]/30 focus:border-[#006EAB] outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Observacoes</label>
              <textarea
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                placeholder="Condicoes especiais, restricoes, validade da proposta..."
                rows={3}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-[#006EAB]/30 focus:border-[#006EAB] outline-none resize-none"
              />
            </div>
          </div>

          {erroEnvio && (
            <p className="text-sm text-red-600 flex items-center gap-1 mb-4">
              <AlertCircle size={14} /> {erroEnvio}
            </p>
          )}

          <button
            type="submit"
            disabled={enviando}
            className="w-full flex items-center justify-center gap-2 px-6 py-3.5 bg-[#006EAB] text-white rounded-xl text-sm font-semibold hover:bg-[#005a8c] transition-colors disabled:opacity-50"
          >
            {enviando ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
            {enviando ? "Enviando..." : "Enviar Cotacao"}
          </button>
        </form>

        {/* Footer */}
        <p className="text-center text-xs text-gray-400 pb-6">
          Torg Metal Estruturas — Portal de Cotacoes
        </p>
      </div>
    </div>
  );
}
