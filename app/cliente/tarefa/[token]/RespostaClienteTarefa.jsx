"use client";
import { useEffect, useState } from "react";
import { CheckCircle2, CalendarClock, Loader2, AlertCircle, Building2 } from "lucide-react";

const fmt = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : null);

export default function RespostaClienteTarefa({ token }) {
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [tarefa, setTarefa] = useState(null);
  const [acao, setAcao] = useState(""); // "concluido" | "nova_data"
  const [novaData, setNovaData] = useState("");
  const [comentario, setComentario] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);

  useEffect(() => {
    try {
      const a = new URLSearchParams(window.location.search).get("acao");
      if (a === "concluido" || a === "nova_data") setAcao(a);
    } catch {}
    fetch(`/api/cliente/tarefa/${token}`)
      .then((r) => r.json())
      .then((j) => { if (!j.success) throw new Error(j.error || "Link inválido"); setTarefa(j.tarefa); })
      .catch((e) => setErro(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  async function enviar() {
    if (!acao) { setErro("Escolha uma das opções."); return; }
    if (acao === "nova_data" && !novaData) { setErro("Informe a nova data."); return; }
    setEnviando(true); setErro("");
    try {
      const r = await fetch(`/api/cliente/tarefa/${token}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao, novaData: acao === "nova_data" ? novaData : null, comentario: comentario || null }),
      });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error || "Erro ao enviar");
      setEnviado(true);
    } catch (e) { setErro(e.message); } finally { setEnviando(false); }
  }

  const op = tarefa?.opNumero ? `OP-${String(tarefa.opNumero).padStart(3, "0")}` : null;

  return (
    <div className="min-h-screen bg-gray-50 flex items-start sm:items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-torg-blue text-white rounded-t-2xl px-6 py-5">
          <div className="flex items-center gap-2 text-sm font-semibold opacity-90"><Building2 size={16} /> Torg Metal</div>
          <h1 className="text-lg font-bold mt-1">{op ? `${op} — ` : ""}Acompanhamento</h1>
          {tarefa?.obra || tarefa?.cliente ? <p className="text-[13px] opacity-90 mt-0.5">{tarefa.obra || tarefa.cliente}</p> : null}
        </div>

        <div className="bg-white rounded-b-2xl shadow-sm border border-gray-100 border-t-0 p-6">
          {loading ? (
            <div className="flex items-center gap-2 text-torg-gray text-sm py-8 justify-center"><Loader2 size={18} className="animate-spin" /> Carregando…</div>
          ) : erro && !tarefa ? (
            <div className="text-center py-8"><AlertCircle size={28} className="mx-auto text-red-400 mb-2" /><p className="text-sm text-red-600">{erro}</p></div>
          ) : enviado ? (
            <div className="text-center py-6">
              <CheckCircle2 size={44} className="mx-auto text-emerald-600 mb-3" />
              <p className="text-lg font-bold text-torg-dark">Resposta registrada!</p>
              <p className="text-sm text-torg-gray mt-1">Obrigado — o time de Planejamento da Torg já foi avisado. Pode fechar esta página.</p>
            </div>
          ) : (
            <>
              {tarefa?.clienteNome && <p className="text-sm text-torg-dark mb-1">Olá, <b>{tarefa.clienteNome}</b>!</p>}
              <p className="text-[13px] text-torg-gray mb-3">Precisamos da sua confirmação sobre este item:</p>

              <div className="bg-gray-50 rounded-xl p-4 mb-4">
                <p className="text-[15px] font-bold text-torg-dark">{tarefa?.titulo}</p>
                {tarefa?.prazo && <p className="text-[12px] text-torg-gray mt-1">Data combinada: <b>{fmt(tarefa.prazo)}</b></p>}
                {tarefa?.descricao && <p className="text-[12px] text-torg-gray mt-1">{tarefa.descricao}</p>}
              </div>

              {tarefa?.respostaEm && (
                <p className="text-[12px] text-amber-600 bg-amber-50 rounded-lg px-3 py-2 mb-3">Você já respondeu em {fmt(tarefa.respostaEm)}. Pode atualizar abaixo se quiser.</p>
              )}

              <div className="space-y-2">
                <button onClick={() => setAcao("concluido")}
                  className={`w-full flex items-center gap-2 rounded-xl border-2 px-4 py-3 text-sm font-semibold transition-colors ${acao === "concluido" ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-gray-200 text-torg-dark hover:border-emerald-300"}`}>
                  <CheckCircle2 size={18} /> Já concluí / forneci
                </button>
                <button onClick={() => setAcao("nova_data")}
                  className={`w-full flex items-center gap-2 rounded-xl border-2 px-4 py-3 text-sm font-semibold transition-colors ${acao === "nova_data" ? "border-torg-orange bg-orange-50 text-torg-orange" : "border-gray-200 text-torg-dark hover:border-orange-300"}`}>
                  <CalendarClock size={18} /> Ainda não — informar nova data
                </button>
              </div>

              {acao === "nova_data" && (
                <div className="mt-3">
                  <label className="block text-[12px] text-torg-gray mb-1">Nova data prevista</label>
                  <input type="date" value={novaData} onChange={(e) => setNovaData(e.target.value)} className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:border-torg-blue outline-none" />
                </div>
              )}

              <textarea value={comentario} onChange={(e) => setComentario(e.target.value)} rows={2} placeholder="Comentário (opcional)"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 mt-3 focus:border-torg-blue outline-none resize-y" />

              {erro && <p className="text-[13px] text-red-600 mt-2">{erro}</p>}

              <button onClick={enviar} disabled={enviando || !acao}
                className="w-full mt-4 bg-torg-blue text-white text-sm font-semibold rounded-xl px-4 py-3 hover:bg-torg-dark disabled:opacity-50 inline-flex items-center justify-center gap-2">
                {enviando ? <Loader2 size={16} className="animate-spin" /> : null} Enviar resposta
              </button>
              <p className="text-[11px] text-torg-gray text-center mt-3">Não é necessário login. Sua resposta vai direto para a Torg.</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
