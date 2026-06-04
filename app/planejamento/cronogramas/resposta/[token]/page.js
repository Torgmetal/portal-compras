"use client";
import { useState, useEffect } from "react";
import {
  Loader2, AlertTriangle, CheckCircle2, Clock, Calendar, Send, AlertCircle,
} from "lucide-react";

const DEPT_LABEL = {
  COMERCIAL: "Comercial",
  ENGENHARIA: "Engenharia",
  SUPRIMENTOS: "Suprimentos",
  FABRICACAO: "Fabricação",
  EXPEDICAO: "Expedição",
  MONTAGEM: "Montagem",
};

export default function RespostaCobrancaPage({ params }) {
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [respostas, setRespostas] = useState({});
  const [nome, setNome] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);

  useEffect(() => {
    params.then((p) => setToken(p.token));
  }, [params]);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/planejamento/cronogramas/cobranca/${token}`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.success) throw new Error(d.error);
        setData(d);
        // Inicializa respostas
        const init = {};
        d.tarefas.forEach((t) => { init[t.id] = { novaData: "", comentario: "" }; });
        setRespostas(init);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  const enviar = async () => {
    if (!nome.trim()) {
      alert("Informe seu nome para registrar a resposta.");
      return;
    }
    setEnviando(true);
    try {
      const respostasArray = Object.entries(respostas).map(([tarefaId, r]) => ({
        tarefaId,
        novaData: r.novaData || null,
        comentario: r.comentario || null,
      }));
      const res = await fetch(`/api/planejamento/cronogramas/cobranca/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ respondidoPor: nome.trim(), respostas: respostasArray }),
      });
      const d = await res.json();
      if (!d.success) throw new Error(d.error);
      setEnviado(true);
    } catch (e) {
      alert("Erro ao enviar: " + e.message);
    } finally {
      setEnviando(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex items-center gap-3 text-gray-500">
          <Loader2 className="animate-spin" size={24} />
          <span>Carregando...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-xl shadow-sm border border-red-200 p-8 max-w-md text-center">
          <AlertCircle size={40} className="text-red-400 mx-auto mb-3" />
          <h2 className="text-lg font-bold text-gray-800 mb-2">Link inválido</h2>
          <p className="text-sm text-gray-500">{error}</p>
        </div>
      </div>
    );
  }

  if (enviado) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-xl shadow-sm border border-emerald-200 p-8 max-w-md text-center">
          <CheckCircle2 size={48} className="text-emerald-500 mx-auto mb-3" />
          <h2 className="text-lg font-bold text-gray-800 mb-2">Resposta enviada!</h2>
          <p className="text-sm text-gray-500">As novas datas foram registradas. O planejamento será notificado.</p>
        </div>
      </div>
    );
  }

  if (data.cobranca.respondido) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 max-w-md text-center">
          <CheckCircle2 size={40} className="text-gray-400 mx-auto mb-3" />
          <h2 className="text-lg font-bold text-gray-800 mb-2">Já respondido</h2>
          <p className="text-sm text-gray-500">
            Esta cobrança já foi respondida por <strong>{data.cobranca.respondidoPor}</strong> em{" "}
            {new Date(data.cobranca.respondidoAt).toLocaleDateString("pt-BR")}.
          </p>
        </div>
      </div>
    );
  }

  const { cronograma, tarefas, cobranca } = data;
  const now = new Date();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-[#002945] text-white">
        <div className="max-w-3xl mx-auto px-4 py-6">
          <div className="flex items-center gap-3 mb-2">
            <img src="/torg-logo.svg" alt="Torg" className="h-8 bg-white/90 rounded px-2 py-1" />
            <span className="text-xs text-white/60">Cronograma</span>
          </div>
          <h1 className="text-xl font-bold">Resposta de Cobrança</h1>
          <p className="text-sm text-white/70 mt-1">
            {cronograma.op
              ? `OP ${cronograma.op.numero} — ${cronograma.op.cliente}${cronograma.op.obra ? ` — ${cronograma.op.obra}` : ""}`
              : cronograma.titulo}
          </p>
          <div className="flex items-center gap-4 mt-3 text-xs text-white/60">
            <span>Departamento: <strong className="text-amber-300">{DEPT_LABEL[cobranca.departamento] || cobranca.departamento}</strong></span>
            <span>Cobrado por: {cobranca.cobradoPor}</span>
            <span>{new Date(cobranca.createdAt).toLocaleDateString("pt-BR")}</span>
          </div>
        </div>
      </div>

      {/* Instrucao */}
      <div className="max-w-3xl mx-auto px-4 py-4">
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-5">
          <p className="text-sm text-amber-800 font-medium flex items-center gap-2">
            <AlertTriangle size={16} />
            Informe a nova data prevista de conclusão para cada atividade atrasada
          </p>
          <p className="text-xs text-amber-600 mt-1">
            Preencha a data e opcionalmente um comentário explicando o motivo do atraso. As datas serão atualizadas no cronograma automaticamente.
          </p>
        </div>

        {/* Tarefas */}
        <div className="space-y-3">
          {tarefas.map((t) => {
            const diasAtraso = t.dataFimPrevista ? Math.ceil((now - new Date(t.dataFimPrevista)) / 86400000) : 0;
            return (
              <div key={t.id} className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-gray-800">{t.nome}</h3>
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      <span className="text-xs text-gray-500 flex items-center gap-1">
                        <Clock size={10} />
                        Prazo: {t.dataFimPrevista ? new Date(t.dataFimPrevista).toLocaleDateString("pt-BR") : "—"}
                      </span>
                      {diasAtraso > 0 && (
                        <span className="text-xs text-red-600 font-semibold">
                          {diasAtraso} dia{diasAtraso > 1 ? "s" : ""} de atraso
                        </span>
                      )}
                      <span className="text-xs text-gray-400">
                        Progresso: {t.percentualRealizado}%
                      </span>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-500 font-medium mb-1 block flex items-center gap-1">
                      <Calendar size={10} /> Nova data prevista
                    </label>
                    <input
                      type="date"
                      value={respostas[t.id]?.novaData || ""}
                      onChange={(e) => setRespostas((prev) => ({ ...prev, [t.id]: { ...prev[t.id], novaData: e.target.value } }))}
                      className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#006EAB] focus:border-transparent outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 font-medium mb-1 block">Comentário (opcional)</label>
                    <input
                      value={respostas[t.id]?.comentario || ""}
                      onChange={(e) => setRespostas((prev) => ({ ...prev, [t.id]: { ...prev[t.id], comentario: e.target.value } }))}
                      placeholder="Ex: aguardando material..."
                      className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#006EAB] focus:border-transparent outline-none"
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Identificacao + Enviar */}
        <div className="mt-6 bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
          <label className="text-sm text-gray-700 font-medium mb-2 block">Seu nome (para registro)</label>
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Digite seu nome..."
            className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg mb-4 focus:ring-2 focus:ring-[#006EAB] focus:border-transparent outline-none"
          />
          <button
            onClick={enviar}
            disabled={enviando}
            className="w-full py-3 bg-[#006EAB] text-white rounded-lg hover:bg-[#005a8c] font-semibold flex items-center justify-center gap-2 disabled:opacity-50 transition-colors"
          >
            {enviando ? (
              <><Loader2 size={16} className="animate-spin" /> Enviando...</>
            ) : (
              <><Send size={16} /> Enviar resposta</>
            )}
          </button>
          <p className="text-xs text-gray-400 mt-3 text-center">
            As datas informadas serão atualizadas no cronograma e o planejamento será notificado.
          </p>
        </div>

        <div className="py-8 text-center">
          <p className="text-xs text-gray-400">Torg Metal — Workspace</p>
        </div>
      </div>
    </div>
  );
}
