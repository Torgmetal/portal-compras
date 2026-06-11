"use client";
import { useState, useEffect } from "react";
import { Loader2, AlertCircle, CheckCircle2, Rocket, ThumbsUp } from "lucide-react";

export default function AceiteClient({ token }) {
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [confirmando, setConfirmando] = useState(false);

  useEffect(() => {
    fetch(`/api/kickoff/aceite/${token}`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "Erro");
        setInfo(j);
      })
      .catch((e) => setErro(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  const confirmar = async () => {
    setConfirmando(true);
    try {
      const r = await fetch(`/api/kickoff/aceite/${token}`, { method: "POST" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro");
      setInfo((p) => ({ ...p, aceitoEm: j.aceitoEm }));
    } catch (e) {
      alert("Falha ao confirmar: " + e.message);
    } finally {
      setConfirmando(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl border border-gray-100 max-w-md w-full p-8 text-center">
        {loading ? (
          <div className="flex items-center justify-center gap-2 text-gray-500 py-8">
            <Loader2 size={20} className="animate-spin" /> Carregando…
          </div>
        ) : erro ? (
          <>
            <AlertCircle size={44} className="mx-auto text-red-400 mb-3" />
            <h1 className="text-lg font-bold text-gray-800">Link inválido ou expirado</h1>
            <p className="text-sm text-gray-500 mt-2">Confira se abriu o link correto do e-mail, ou fale com o comercial.</p>
          </>
        ) : info.aceitoEm ? (
          <>
            <CheckCircle2 size={48} className="mx-auto text-emerald-500 mb-3" />
            <h1 className="text-xl font-extrabold text-gray-800">Aceite registrado!</h1>
            <p className="text-sm text-gray-600 mt-2">
              Você confirmou estar de acordo com o kick off da <strong>OP {info.op.numero}</strong> ({info.op.cliente}
              {info.op.obra ? ` · ${info.op.obra}` : ""}) em {new Date(info.aceitoEm).toLocaleString("pt-BR")}.
            </p>
            <p className="text-xs text-gray-400 mt-4">Registro vinculado a {info.email}. Pode fechar esta página.</p>
          </>
        ) : (
          <>
            <Rocket size={44} className="mx-auto text-orange-500 mb-3" />
            <h1 className="text-xl font-extrabold text-gray-800">
              Kick Off — OP {info.op.numero}
            </h1>
            <p className="text-sm text-gray-600 mt-1">
              {info.op.cliente}{info.op.obra ? ` · ${info.op.obra}` : ""}
              {info.tipo === "FISCAL" ? " — comunicado fiscal/financeiro" : ""}
            </p>
            <p className="text-sm text-gray-600 mt-4 bg-slate-50 rounded-lg p-3">
              Ao confirmar, você registra que <strong>leu e está de acordo</strong> com as informações
              divulgadas no e-mail do kick off desta obra.
            </p>
            <button
              onClick={confirmar}
              disabled={confirmando}
              className="mt-5 inline-flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 font-semibold disabled:opacity-50 w-full justify-center"
            >
              {confirmando ? <Loader2 size={18} className="animate-spin" /> : <ThumbsUp size={18} />}
              Estou de acordo
            </button>
            <p className="text-xs text-gray-400 mt-3">Confirmação registrada para {info.email}.</p>
          </>
        )}
      </div>
    </div>
  );
}
