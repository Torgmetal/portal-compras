"use client";
import { useState, useEffect } from "react";
import {
  Loader2, AlertCircle, CheckCircle2, CalendarDays,
  Package, Truck, Clock, History,
} from "lucide-react";

const fmtData = (d) =>
  d ? new Date(d).toLocaleDateString("pt-BR") : "—";

const fmtQtd = (qtd, unidade) => {
  if (qtd == null) return "—";
  const dec = unidade === "KG" ? 1 : 0;
  return `${Number(qtd).toFixed(dec)} ${unidade || ""}`.trim();
};

export default function EntregaFornecedorForm({ token }) {
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  const [novoPrazo, setNovoPrazo] = useState("");
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [sucesso, setSucesso] = useState(false);
  const [erroEnvio, setErroEnvio] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/fornecedores/entrega/${token}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Erro ao carregar");
        setDados(data);
      } catch (e) {
        setErro(e.message);
      } finally {
        setCarregando(false);
      }
    })();
  }, [token]);

  const enviar = async () => {
    if (!novoPrazo) { setErroEnvio("Selecione a data de previsao"); return; }
    setEnviando(true);
    setErroEnvio("");
    try {
      const res = await fetch(`/api/fornecedores/entrega/${token}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ novoPrazo, motivo: motivo.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao enviar");
      setSucesso(true);
    } catch (e) {
      setErroEnvio(e.message);
    } finally {
      setEnviando(false);
    }
  };

  // Loading
  if (carregando) {
    return (
      <div className="flex items-center justify-center py-16 text-torg-gray">
        <Loader2 size={20} className="animate-spin mr-2" />
        Carregando dados do pedido...
      </div>
    );
  }

  // Erro ao carregar
  if (erro) {
    return (
      <div className="text-center py-12">
        <AlertCircle size={40} className="text-red-400 mx-auto mb-3" />
        <p className="text-lg text-red-600 font-medium">{erro}</p>
        <p className="text-sm text-gray-400 mt-2">
          Verifique o link recebido por email ou entre em contato com a equipe de Compras.
        </p>
      </div>
    );
  }

  const d = dados;

  // Pedido ja entregue
  if (d.jaEntregue) {
    return (
      <div className="text-center py-12">
        <CheckCircle2 size={48} className="text-emerald-500 mx-auto mb-3" />
        <h2 className="text-xl font-bold text-torg-dark">Pedido ja entregue</h2>
        <p className="text-sm text-torg-gray mt-2">
          O Pedido #{d.numero} ja foi recebido pela Torg Metal. Nenhuma acao necessaria.
        </p>
      </div>
    );
  }

  // Sucesso ao enviar
  if (sucesso) {
    return (
      <div className="text-center py-12">
        <CheckCircle2 size={48} className="text-emerald-500 mx-auto mb-3" />
        <h2 className="text-xl font-bold text-torg-dark">Previsao registrada!</h2>
        <p className="text-sm text-torg-gray mt-2">
          A nova data de entrega foi registrada com sucesso. A equipe de Compras da Torg Metal ja foi notificada.
        </p>
        <p className="text-sm text-torg-gray mt-1">
          Obrigado, <strong>{d.fornecedor}</strong>.
        </p>
      </div>
    );
  }

  const diasAtraso = d.prazoEntregaPrevisto
    ? Math.max(0, Math.ceil((Date.now() - new Date(d.prazoEntregaPrevisto).getTime()) / (1000 * 60 * 60 * 24)))
    : 0;

  return (
    <div className="space-y-6 max-w-xl mx-auto">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="bg-gradient-to-r from-torg-blue to-torg-dark px-6 py-4">
          <div className="flex items-center gap-3 text-white">
            <div className="p-2 bg-white/20 rounded-lg">
              <Truck size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold">Pedido #{d.numero}</h2>
              <p className="text-white/80 text-sm">{d.fornecedor}</p>
            </div>
          </div>
        </div>

        {/* Info do prazo */}
        <div className="px-6 py-4 space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-torg-gray flex items-center gap-1.5">
              <CalendarDays size={14} /> Prazo atual
            </span>
            <span className="font-semibold text-torg-dark">
              {d.prazoEntregaPrevisto ? fmtData(d.prazoEntregaPrevisto) : "Nao definido"}
            </span>
          </div>
          {d.prazoOriginal && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-torg-gray">Prazo original</span>
              <span className="text-gray-500 line-through">{fmtData(d.prazoOriginal)}</span>
            </div>
          )}
          {diasAtraso > 0 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-torg-gray flex items-center gap-1.5">
                <Clock size={14} /> Alem do prazo
              </span>
              <span className="font-semibold text-red-600">{diasAtraso} dia{diasAtraso !== 1 ? "s" : ""}</span>
            </div>
          )}
        </div>
      </div>

      {/* Itens pendentes */}
      {d.itensPendentes?.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-6 py-3 border-b border-gray-100 flex items-center gap-2">
            <Package size={14} className="text-torg-gray" />
            <h3 className="text-sm font-semibold text-torg-dark">
              Itens pendentes de entrega
            </h3>
            <span className="text-xs text-torg-gray">
              ({d.itensPendentes.length} de {d.totalItens})
            </span>
          </div>
          <div className="divide-y divide-gray-50">
            {d.itensPendentes.map((it, i) => (
              <div key={i} className="px-6 py-2.5 flex items-center justify-between">
                <span className="text-sm text-torg-dark flex-1 mr-3">{it.descricao}</span>
                <div className="text-right shrink-0">
                  <span className="text-sm font-medium text-red-600 tabular-nums">
                    {fmtQtd(it.qtdPendente, it.unidade)}
                  </span>
                  {it.totalRecebido > 0 && (
                    <p className="text-[10px] text-emerald-600">
                      {fmtQtd(it.totalRecebido, it.unidade)} ja recebido
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Historico de prazos */}
      {d.prazoHistorico?.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-6 py-3 border-b border-gray-100 flex items-center gap-2">
            <History size={14} className="text-torg-gray" />
            <h3 className="text-sm font-semibold text-torg-dark">Historico de prazos</h3>
          </div>
          <div className="px-6 py-3 space-y-2">
            {d.prazoOriginal && (
              <div className="flex items-center gap-2 text-xs">
                <div className="w-2 h-2 rounded-full bg-gray-300 shrink-0" />
                <span className="text-torg-gray">Prazo original:</span>
                <span className="font-medium text-torg-dark">{fmtData(d.prazoOriginal)}</span>
              </div>
            )}
            {d.prazoHistorico.map((h, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                <div className={`w-2 h-2 rounded-full mt-0.5 shrink-0 ${
                  i === d.prazoHistorico.length - 1 ? "bg-amber-500" : "bg-amber-300"
                }`} />
                <div>
                  <span className="text-torg-gray">Atualizado para</span>{" "}
                  <span className="font-medium text-amber-700">{fmtData(h.prazoNovo)}</span>
                  <span className="text-gray-400 ml-1.5">em {fmtData(h.criadoEm)}</span>
                  {h.motivo && <p className="text-gray-500 italic mt-0.5">{h.motivo}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Formulario */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-3 border-b border-gray-100 bg-amber-50/50">
          <h3 className="text-sm font-semibold text-amber-800">
            Informar nova previsao de entrega
          </h3>
        </div>
        <div className="px-6 py-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-torg-dark mb-1">
              Data prevista de entrega *
            </label>
            <input
              type="date"
              value={novoPrazo}
              onChange={(e) => setNovoPrazo(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-torg-dark mb-1">
              Observacao <span className="font-normal text-torg-gray">(opcional)</span>
            </label>
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ex: Material em transito, previsao de chegada na proxima semana"
              rows={3}
              maxLength={500}
              className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue"
            />
          </div>

          {erroEnvio && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2 flex items-center gap-2">
              <AlertCircle size={14} /> {erroEnvio}
            </div>
          )}

          <button
            onClick={enviar}
            disabled={enviando || !novoPrazo}
            className="w-full py-3 bg-torg-blue text-white text-sm font-semibold rounded-lg hover:bg-torg-blue/90 disabled:opacity-50 inline-flex items-center justify-center gap-2"
          >
            {enviando ? (
              <><Loader2 size={16} className="animate-spin" /> Enviando...</>
            ) : (
              <><CalendarDays size={16} /> Confirmar previsao de entrega</>
            )}
          </button>
        </div>
      </div>

      {/* Nota */}
      <p className="text-[11px] text-center text-gray-400 pb-4">
        Esta pagina e exclusiva para o fornecedor do pedido acima.
        Em caso de duvidas, entre em contato com a equipe de Compras da Torg Metal.
      </p>
    </div>
  );
}
