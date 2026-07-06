"use client";
import { useState, useEffect, useCallback } from "react";
import {
  Megaphone, Loader2, AlertCircle, RefreshCw, Inbox, Send, Trash2, Pin,
  Mail, MessageSquare, CheckCircle2,
} from "lucide-react";
import { useStore } from "@/lib/store";

const CAT_LABEL = { SUGESTAO: "Sugestão", RECLAMACAO: "Reclamação", ELOGIO: "Elogio", DUVIDA: "Dúvida", OUTRO: "Outro" };
const CAT_COR = {
  SUGESTAO: "bg-blue-100 text-blue-700", RECLAMACAO: "bg-red-100 text-red-700",
  ELOGIO: "bg-green-100 text-green-700", DUVIDA: "bg-amber-100 text-amber-700", OUTRO: "bg-gray-100 text-gray-600",
};
const ST_COR = { NOVO: "bg-torg-orange/15 text-torg-orange", LIDO: "bg-blue-100 text-blue-700", RESOLVIDO: "bg-green-100 text-green-700" };
const ST_LABEL = { NOVO: "Novo", LIDO: "Lido", RESOLVIDO: "Resolvido" };

const fmt = (d) => new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

export default function MuralClient() {
  const { showToast } = useStore();
  const [aba, setAba] = useState("comunicados");

  // Comunicados
  const [avisos, setAvisos] = useState([]);
  const [carregandoA, setCarregandoA] = useState(true);
  const [erroA, setErroA] = useState("");
  const [titulo, setTitulo] = useState("");
  const [corpo, setCorpo] = useState("");
  const [fixado, setFixado] = useState(false);
  const [enviarEmail, setEnviarEmail] = useState(false);
  const [publicando, setPublicando] = useState(false);

  // Sugestões
  const [feedbacks, setFeedbacks] = useState([]);
  const [novos, setNovos] = useState(0);
  const [carregandoF, setCarregandoF] = useState(true);
  const [erroF, setErroF] = useState("");

  const carregarAvisos = useCallback(async () => {
    setCarregandoA(true); setErroA("");
    try {
      const r = await fetch("/api/rh/mural");
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Falha ao carregar");
      setAvisos(d.avisos || []);
    } catch (e) { setErroA(e.message); } finally { setCarregandoA(false); }
  }, []);

  const carregarFeedbacks = useCallback(async () => {
    setCarregandoF(true); setErroF("");
    try {
      const r = await fetch("/api/rh/feedback");
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Falha ao carregar");
      setFeedbacks(d.feedbacks || []);
      setNovos(d.novos || 0);
    } catch (e) { setErroF(e.message); } finally { setCarregandoF(false); }
  }, []);

  useEffect(() => { carregarAvisos(); carregarFeedbacks(); }, [carregarAvisos, carregarFeedbacks]);

  const publicar = async () => {
    if (titulo.trim().length < 3 || corpo.trim().length < 3) { showToast("Preencha título e comunicado", "error"); return; }
    if (enviarEmail && !confirm("Enviar este comunicado por e-mail para TODOS os funcionários ativos?")) return;
    setPublicando(true);
    try {
      const r = await fetch("/api/rh/mural", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ titulo, corpo, fixado, enviarEmail }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Falha ao publicar");
      showToast(`Comunicado publicado${d.emailEnviados ? ` · ${d.emailEnviados} e-mails` : ""}${d.emailFalhas ? ` · ${d.emailFalhas} falhas` : ""}`, "success");
      setTitulo(""); setCorpo(""); setFixado(false); setEnviarEmail(false);
      await carregarAvisos();
    } catch (e) { showToast(e.message, "error"); } finally { setPublicando(false); }
  };

  const excluir = async (id) => {
    if (!confirm("Excluir este comunicado do mural?")) return;
    try {
      const r = await fetch(`/api/rh/mural/${id}`, { method: "DELETE" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Falha ao excluir");
      setAvisos((prev) => prev.filter((a) => a.id !== id));
      showToast("Comunicado excluído", "success");
    } catch (e) { showToast(e.message, "error"); }
  };

  const mudarStatusFb = async (id, status) => {
    try {
      const r = await fetch(`/api/rh/feedback/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Falha");
      const next = feedbacks.map((f) => (f.id === id ? { ...f, status } : f));
      setFeedbacks(next);
      setNovos(next.filter((f) => f.status === "NOVO").length);
    } catch (e) { showToast(e.message, "error"); }
  };

  return (
    <div className="space-y-6 max-w-[1100px]">
      <div>
        <h2 className="text-3xl font-extrabold text-torg-dark tracking-tight flex items-center gap-2">
          <Megaphone className="text-torg-blue" /> Mural & Comunicação
        </h2>
        <p className="text-sm text-torg-gray mt-1">Publique avisos para todos os funcionários (com opção de e-mail) e acompanhe as sugestões que eles enviam.</p>
      </div>

      {/* Abas */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        <button onClick={() => setAba("comunicados")}
          className={`px-4 py-2 text-sm font-medium rounded-lg inline-flex items-center gap-2 transition-colors ${aba === "comunicados" ? "bg-white text-torg-dark shadow-sm" : "text-torg-gray hover:text-torg-dark"}`}>
          <Megaphone size={15} /> Comunicados
        </button>
        <button onClick={() => setAba("sugestoes")}
          className={`px-4 py-2 text-sm font-medium rounded-lg inline-flex items-center gap-2 transition-colors ${aba === "sugestoes" ? "bg-white text-torg-dark shadow-sm" : "text-torg-gray hover:text-torg-dark"}`}>
          <MessageSquare size={15} /> Sugestões
          {novos > 0 && <span className="bg-torg-orange text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 leading-none">{novos}</span>}
        </button>
      </div>

      {aba === "comunicados" && (
        <>
          {/* Novo comunicado */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 space-y-3">
            <h3 className="text-lg font-semibold text-torg-dark">Novo comunicado</h3>
            <input value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={160}
              placeholder="Título (ex.: Ponto facultativo na sexta)"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue" />
            <textarea value={corpo} onChange={(e) => setCorpo(e.target.value)} maxLength={5000} rows={5}
              placeholder="Escreva o comunicado para os funcionários…"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue resize-y" />
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-4">
                <label className="text-sm text-torg-gray inline-flex items-center gap-1.5 cursor-pointer select-none">
                  <input type="checkbox" checked={fixado} onChange={(e) => setFixado(e.target.checked)} className="accent-torg-blue" />
                  <Pin size={14} /> Fixar no topo
                </label>
                <label className="text-sm text-torg-gray inline-flex items-center gap-1.5 cursor-pointer select-none">
                  <input type="checkbox" checked={enviarEmail} onChange={(e) => setEnviarEmail(e.target.checked)} className="accent-torg-blue" />
                  <Mail size={14} /> Enviar por e-mail para todos
                </label>
              </div>
              <button onClick={publicar} disabled={publicando}
                className="px-4 py-2 bg-torg-blue text-white text-sm rounded-lg hover:bg-torg-blue-700 font-medium inline-flex items-center gap-2 disabled:opacity-50">
                {publicando ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} Publicar
              </button>
            </div>
          </div>

          {/* Lista de avisos */}
          {carregandoA ? (
            <div className="py-12 text-center text-torg-gray"><Loader2 size={26} className="mx-auto animate-spin mb-2" /> Carregando...</div>
          ) : erroA ? (
            <div className="py-12 text-center">
              <AlertCircle size={26} className="mx-auto text-red-400 mb-2" />
              <p className="text-sm text-red-600 mb-3">{erroA}</p>
              <button onClick={carregarAvisos} className="px-3 py-1.5 text-sm bg-torg-blue text-white rounded-lg inline-flex items-center gap-2"><RefreshCw size={14} /> Tentar novamente</button>
            </div>
          ) : avisos.length === 0 ? (
            <div className="py-12 text-center bg-white rounded-xl border border-gray-100">
              <Inbox size={36} className="mx-auto text-gray-300 mb-3" />
              <p className="text-torg-gray text-sm">Nenhum comunicado publicado ainda.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {avisos.map((a) => (
                <div key={a.id} className={`bg-white rounded-xl border shadow-sm p-4 ${a.fixado ? "border-torg-blue-200" : "border-gray-100"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {a.fixado && <Pin size={14} className="text-torg-blue shrink-0" />}
                        <span className="font-semibold text-torg-dark">{a.titulo}</span>
                        {a.emailEnviadoEm && <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium inline-flex items-center gap-1"><Mail size={11} /> {a.emailDestinatarios || 0} e-mails</span>}
                      </div>
                      <p className="text-sm text-torg-dark/80 mt-1.5 whitespace-pre-wrap">{a.corpo}</p>
                      <p className="text-[11px] text-torg-gray mt-2">{a.criadoPorNome ? `${a.criadoPorNome} · ` : ""}{fmt(a.createdAt)}</p>
                    </div>
                    <button onClick={() => excluir(a.id)} className="text-red-400 hover:text-red-600 shrink-0" title="Excluir"><Trash2 size={16} /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {aba === "sugestoes" && (
        carregandoF ? (
          <div className="py-12 text-center text-torg-gray"><Loader2 size={26} className="mx-auto animate-spin mb-2" /> Carregando...</div>
        ) : erroF ? (
          <div className="py-12 text-center">
            <AlertCircle size={26} className="mx-auto text-red-400 mb-2" />
            <p className="text-sm text-red-600 mb-3">{erroF}</p>
            <button onClick={carregarFeedbacks} className="px-3 py-1.5 text-sm bg-torg-blue text-white rounded-lg inline-flex items-center gap-2"><RefreshCw size={14} /> Tentar novamente</button>
          </div>
        ) : feedbacks.length === 0 ? (
          <div className="py-12 text-center bg-white rounded-xl border border-gray-100">
            <Inbox size={36} className="mx-auto text-gray-300 mb-3" />
            <p className="text-torg-gray text-sm">Nenhuma sugestão recebida ainda.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {feedbacks.map((f) => (
              <div key={f.id} className={`bg-white rounded-xl border shadow-sm p-4 ${f.status === "NOVO" ? "border-torg-orange/40" : "border-gray-100"}`}>
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${CAT_COR[f.categoria] || CAT_COR.OUTRO}`}>{CAT_LABEL[f.categoria] || f.categoria}</span>
                    <span className="text-sm font-medium text-torg-dark">{f.anonimo ? "Anônimo" : (f.funcionarioNome || "—")}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${ST_COR[f.status] || ""}`}>{ST_LABEL[f.status] || f.status}</span>
                  </div>
                  <span className="text-[11px] text-torg-gray">{fmt(f.createdAt)}</span>
                </div>
                <p className="text-sm text-torg-dark/80 mt-2 whitespace-pre-wrap">{f.mensagem}</p>
                <div className="flex items-center gap-2 mt-3">
                  {f.status !== "LIDO" && (
                    <button onClick={() => mudarStatusFb(f.id, "LIDO")} className="text-xs text-torg-blue border border-torg-blue-200 rounded-lg px-2.5 py-1 hover:bg-torg-blue-50 inline-flex items-center gap-1"><CheckCircle2 size={13} /> Marcar lido</button>
                  )}
                  {f.status !== "RESOLVIDO" && (
                    <button onClick={() => mudarStatusFb(f.id, "RESOLVIDO")} className="text-xs text-green-700 border border-green-200 rounded-lg px-2.5 py-1 hover:bg-green-50 inline-flex items-center gap-1"><CheckCircle2 size={13} /> Resolvido</button>
                  )}
                  {f.status !== "NOVO" && (
                    <button onClick={() => mudarStatusFb(f.id, "NOVO")} className="text-xs text-torg-gray border border-gray-200 rounded-lg px-2.5 py-1 hover:bg-gray-50">Reabrir</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}
