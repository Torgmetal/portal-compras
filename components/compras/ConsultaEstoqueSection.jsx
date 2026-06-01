"use client";
import { useState, useEffect, useCallback } from "react";
import { PackageSearch, Send, CheckCircle2, AlertTriangle, XCircle, Clock, Loader2, RefreshCw, MessageSquare } from "lucide-react";

const RESPOSTA_CONFIG = {
  DISPONIVEL: { label: "Disponível", cor: "bg-emerald-100 text-emerald-700", icon: CheckCircle2 },
  PARCIAL: { label: "Parcial", cor: "bg-amber-100 text-amber-700", icon: AlertTriangle },
  INDISPONIVEL: { label: "Indisponível", cor: "bg-red-100 text-red-700", icon: XCircle },
};

export default function ConsultaEstoqueSection({ rmId }) {
  const [consultas, setConsultas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const [showForm, setShowForm] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const res = await fetch(`/api/rm/${rmId}/consulta-estoque`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setConsultas(data.consultas || []);
    } catch (e) {
      setErro(e.message);
    } finally {
      setLoading(false);
    }
  }, [rmId]);

  useEffect(() => { carregar(); }, [carregar]);

  const enviarConsulta = async () => {
    setEnviando(true);
    try {
      const res = await fetch(`/api/rm/${rmId}/consulta-estoque`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mensagem: mensagem.trim() || undefined }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setConsultas((prev) => [data.consulta, ...prev]);
      setMensagem("");
      setShowForm(false);
    } catch (e) {
      alert(e.message);
    } finally {
      setEnviando(false);
    }
  };

  const temPendente = consultas.some((c) => c.status === "ENVIADA");

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <PackageSearch size={18} className="text-torg-blue" />
          <h3 className="font-semibold text-torg-dark text-sm">Consulta de Estoque</h3>
        </div>
        <div className="flex items-center gap-2">
          {!loading && (
            <button onClick={carregar} className="p-1.5 text-torg-gray hover:text-torg-dark rounded transition-colors" title="Atualizar">
              <RefreshCw size={14} />
            </button>
          )}
          {!temPendente && !showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-torg-blue text-white text-xs font-medium rounded-lg hover:bg-torg-blue/90 transition-colors"
            >
              <Send size={13} /> Consultar Produção
            </button>
          )}
        </div>
      </div>

      <div className="p-5 space-y-4">
        {/* Formulário de envio */}
        {showForm && (
          <div className="border border-torg-blue/20 rounded-lg p-4 bg-blue-50/30 space-y-3">
            <p className="text-sm text-torg-dark">
              Enviar os itens desta RM para a Produção verificar disponibilidade em estoque.
            </p>
            <div>
              <label className="text-xs text-torg-gray block mb-1">Mensagem (opcional)</label>
              <textarea
                value={mensagem}
                onChange={(e) => setMensagem(e.target.value)}
                placeholder="Ex: Verificar se há chapas em estoque antes de cotar..."
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue/20 focus:border-torg-blue outline-none resize-none"
                rows={2}
                maxLength={500}
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={enviarConsulta}
                disabled={enviando}
                className="flex items-center gap-1.5 px-4 py-2 bg-torg-blue text-white text-sm font-medium rounded-lg hover:bg-torg-blue/90 disabled:opacity-50 transition-colors"
              >
                {enviando ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                {enviando ? "Enviando..." : "Enviar Consulta"}
              </button>
              <button
                onClick={() => { setShowForm(false); setMensagem(""); }}
                className="px-4 py-2 text-sm text-torg-gray hover:text-torg-dark transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-6 text-torg-gray text-sm gap-2">
            <Loader2 size={16} className="animate-spin" /> Carregando...
          </div>
        )}

        {/* Erro */}
        {erro && !loading && (
          <div className="text-center py-6">
            <p className="text-sm text-red-600 mb-2">{erro}</p>
            <button onClick={carregar} className="text-sm text-torg-blue hover:underline">Tentar novamente</button>
          </div>
        )}

        {/* Sem consultas */}
        {!loading && !erro && consultas.length === 0 && !showForm && (
          <div className="text-center py-6">
            <PackageSearch size={32} className="mx-auto text-gray-200 mb-2" />
            <p className="text-sm text-torg-gray">Nenhuma consulta de estoque enviada.</p>
          </div>
        )}

        {/* Lista de consultas */}
        {!loading && !erro && consultas.map((c) => (
          <ConsultaCard key={c.id} consulta={c} />
        ))}
      </div>
    </div>
  );
}

function ConsultaCard({ consulta }) {
  const [aberto, setAberto] = useState(consulta.status === "ENVIADA");
  const isRespondida = consulta.status === "RESPONDIDA";

  const resumo = (consulta.itens || []).reduce((acc, it) => {
    if (it.resposta) acc[it.resposta] = (acc[it.resposta] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className={`border rounded-lg ${isRespondida ? "border-emerald-200 bg-emerald-50/20" : "border-amber-200 bg-amber-50/20"}`}>
      <button
        onClick={() => setAberto(!aberto)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2">
          {isRespondida ? (
            <CheckCircle2 size={16} className="text-emerald-600" />
          ) : (
            <Clock size={16} className="text-amber-600" />
          )}
          <span className="text-sm font-medium text-torg-dark">
            {isRespondida ? "Respondida" : "Aguardando resposta"}
          </span>
          <span className="text-xs text-torg-gray">
            — {new Date(consulta.createdAt).toLocaleDateString("pt-BR")} por {consulta.createdBy?.name}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {isRespondida && (
            <div className="flex gap-1">
              {resumo.DISPONIVEL > 0 && (
                <span className="px-1.5 py-0.5 text-xs rounded bg-emerald-100 text-emerald-700">{resumo.DISPONIVEL} disp.</span>
              )}
              {resumo.PARCIAL > 0 && (
                <span className="px-1.5 py-0.5 text-xs rounded bg-amber-100 text-amber-700">{resumo.PARCIAL} parcial</span>
              )}
              {resumo.INDISPONIVEL > 0 && (
                <span className="px-1.5 py-0.5 text-xs rounded bg-red-100 text-red-700">{resumo.INDISPONIVEL} indisp.</span>
              )}
            </div>
          )}
          <span className="text-xs text-torg-gray">{aberto ? "▲" : "▼"}</span>
        </div>
      </button>

      {aberto && (
        <div className="px-4 pb-4 space-y-2">
          {consulta.mensagem && (
            <div className="flex items-start gap-2 text-sm text-torg-gray bg-white/60 rounded p-2">
              <MessageSquare size={14} className="mt-0.5 shrink-0" />
              <span>{consulta.mensagem}</span>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-torg-gray border-b border-gray-200">
                  <th className="pb-2 pr-3">Item</th>
                  <th className="pb-2 pr-3 w-24">Qtd</th>
                  <th className="pb-2 pr-3 w-28">Status</th>
                  <th className="pb-2 pr-3 w-24">Qtd Disp.</th>
                  <th className="pb-2">Obs.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(consulta.itens || []).map((item) => {
                  const cfg = item.resposta ? RESPOSTA_CONFIG[item.resposta] : null;
                  const Icon = cfg?.icon;
                  const qtdLabel = (item.rmItem?.peso || 0) > 0
                    ? `${item.rmItem.peso} KG`
                    : `${item.rmItem?.qtd} ${item.rmItem?.unidade}`;
                  return (
                    <tr key={item.id}>
                      <td className="py-2 pr-3 text-torg-dark">{item.rmItem?.descricao}</td>
                      <td className="py-2 pr-3 text-torg-gray">{qtdLabel}</td>
                      <td className="py-2 pr-3">
                        {cfg ? (
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${cfg.cor}`}>
                            <Icon size={12} /> {cfg.label}
                          </span>
                        ) : (
                          <span className="text-xs text-torg-gray">Pendente</span>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-torg-gray">
                        {item.qtdDisponivel != null ? item.qtdDisponivel : "—"}
                      </td>
                      <td className="py-2 text-torg-gray text-xs">{item.observacao || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {isRespondida && consulta.respondidoEm && (
            <p className="text-xs text-torg-gray pt-1">
              Respondido em {new Date(consulta.respondidoEm).toLocaleDateString("pt-BR")} às {new Date(consulta.respondidoEm).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
              {consulta.itens?.[0]?.respondidoPor?.name && ` por ${consulta.itens[0].respondidoPor.name}`}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
