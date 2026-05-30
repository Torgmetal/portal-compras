"use client";
import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import {
  Truck, MapPin, Loader2, CheckCircle2, AlertCircle, Send, Paperclip,
} from "lucide-react";

function fmtNum(v, dec = 0) {
  if (!v && v !== 0) return "—";
  return v.toLocaleString("pt-BR", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function fmtMoeda(v) {
  if (!v && v !== 0) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function FreteFormClient() {
  const { token } = useParams();
  const [dados, setDados] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(null);

  // Form
  const [valorCotado, setValorCotado] = useState("");
  const [prazoEntrega, setPrazoEntrega] = useState("");
  const [observacao, setObservacao] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [sucesso, setSucesso] = useState(false);
  const [erroEnvio, setErroEnvio] = useState("");

  useEffect(() => {
    fetch(`/api/frete-cotacao/${token}`)
      .then((r) => r.json())
      .then((json) => {
        if (!json.success) throw new Error(json.error);
        setDados(json.data);
        if (json.data.valorCotado) setValorCotado(String(json.data.valorCotado));
        if (json.data.prazoEntrega) setPrazoEntrega(json.data.prazoEntrega);
        if (json.data.observacao) setObservacao(json.data.observacao);
        if (json.data.status === "RECEBIDA" || json.data.status === "SELECIONADA") setSucesso(true);
      })
      .catch((e) => setErro(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!valorCotado || !prazoEntrega.trim()) {
      setErroEnvio("Preencha o valor e os dias de viagem");
      return;
    }
    setEnviando(true);
    setErroEnvio("");
    try {
      const res = await fetch(`/api/frete-cotacao/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          valorCotado: parseFloat(valorCotado),
          prazoEntrega: prazoEntrega.trim(),
          observacao: observacao.trim() || undefined,
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
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
          <CheckCircle2 size={48} className="text-emerald-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-800 mb-2">Cotacao enviada!</h1>
          <p className="text-gray-500 text-sm mb-4">
            Sua cotacao foi registrada com sucesso. A equipe Torg Metal entrara em contato.
          </p>
          {dados.valorCotado || valorCotado ? (
            <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-100">
              <p className="text-sm text-emerald-600 font-medium">Valor cotado</p>
              <p className="text-2xl font-bold text-emerald-800">{fmtMoeda(parseFloat(valorCotado) || dados.valorCotado)}</p>
              {(prazoEntrega || dados.prazoEntrega) && (
                <p className="text-sm text-emerald-600 mt-1">Dias de viagem: {prazoEntrega || dados.prazoEntrega}</p>
              )}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-[#006EAB] text-white">
        <div className="max-w-2xl mx-auto px-4 py-6">
          <div className="flex items-center gap-3 mb-2">
            <Truck size={28} />
            <h1 className="text-xl font-bold">Cotacao de Frete</h1>
          </div>
          <p className="text-blue-100 text-sm">Torg Metal Estruturas</p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Referencia do projeto */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-400">Referencia</span>
            <span className="text-sm font-bold text-gray-800">{dados.ref}</span>
          </div>
        </div>

        {/* Itens de frete */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Itens para Transporte</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                  <th className="pb-2 pr-2">#</th>
                  <th className="pb-2 px-2">Descricao</th>
                  <th className="pb-2 px-2">Rota</th>
                  <th className="pb-2 px-2 text-right">Distancia</th>
                  <th className="pb-2 px-2 text-right">Peso</th>
                  <th className="pb-2 px-2">Veiculo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {dados.itens.map((item, idx) => (
                  <tr key={idx}>
                    <td className="py-2.5 pr-2 text-gray-400">{idx + 1}</td>
                    <td className="py-2.5 px-2 font-medium text-gray-800">{item.descricao}</td>
                    <td className="py-2.5 px-2 text-gray-500 text-xs">
                      {item.origem && item.destino ? `${item.origem} → ${item.destino}` : item.destino ? `→ ${item.destino}` : "—"}
                    </td>
                    <td className="py-2.5 px-2 text-right">{item.distanciaKm ? `${fmtNum(item.distanciaKm)} km` : "—"}</td>
                    <td className="py-2.5 px-2 text-right">{item.pesoTon ? `${fmtNum(item.pesoTon, 2)} ton` : "—"}</td>
                    <td className="py-2.5 px-2 text-gray-500">{item.tipoVeiculo || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {dados.itens.length > 0 && (
            <div className="flex justify-end mt-3 pt-3 border-t border-gray-100">
              <span className="text-sm font-semibold text-gray-700">
                Peso Total: {fmtNum(dados.itens.reduce((s, i) => s + (i.pesoTon || 0), 0), 2)} ton
              </span>
            </div>
          )}
        </div>

        {/* Formulario */}
        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Sua Cotacao</h2>
          <p className="text-sm text-gray-500">
            Prezado(a) <strong className="text-gray-800">{dados.fornecedorNome}</strong>, preencha os campos abaixo com sua proposta de frete.
          </p>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Valor Total do Frete (R$) <span className="text-red-400">*</span>
              </label>
              <input
                type="number"
                value={valorCotado}
                onChange={(e) => setValorCotado(e.target.value)}
                placeholder="0,00"
                min="0"
                step="0.01"
                required
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-[#006EAB]/30 focus:border-[#006EAB] outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Dias de Viagem <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={prazoEntrega}
                onChange={(e) => setPrazoEntrega(e.target.value)}
                placeholder="Ex: 2 dias, 4 dias..."
                required
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-[#006EAB]/30 focus:border-[#006EAB] outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Observacoes</label>
            <textarea
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Condicoes especiais, restricoes, informacoes adicionais..."
              rows={3}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-[#006EAB]/30 focus:border-[#006EAB] outline-none resize-none"
            />
          </div>

          {erroEnvio && (
            <p className="text-sm text-red-600 flex items-center gap-1">
              <AlertCircle size={14} /> {erroEnvio}
            </p>
          )}

          <button
            type="submit"
            disabled={enviando}
            className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-[#006EAB] text-white rounded-xl text-sm font-semibold hover:bg-[#005a8c] transition-colors disabled:opacity-50"
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
