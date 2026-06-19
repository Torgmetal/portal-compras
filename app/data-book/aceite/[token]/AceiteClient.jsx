"use client";
import { useState, useEffect, useCallback } from "react";
import { Loader2, AlertCircle, FileDown, CheckCircle2, ShieldCheck, Weight, Package } from "lucide-react";

const fmtKg = (v) => (v == null ? "—" : `${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} kg`);
const fmtDataHora = (d) => (d ? new Date(d).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—");

export default function AceiteClient({ token }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [nome, setNome] = useState("");
  const [enviando, setEnviando] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const r = await fetch(`/api/qualidade/data-books/aceite/${token}`);
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error || "Link inválido");
      setData(j.data);
    } catch (e) {
      setErro(e.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { carregar(); }, [carregar]);

  async function confirmar() {
    if (nome.trim().length < 3) { alert("Informe seu nome completo."); return; }
    if (!confirm("Confirmar o recebimento e o aceite deste Data Book? Esta ação registra a entrega da obra.")) return;
    setEnviando(true);
    try {
      const r = await fetch(`/api/qualidade/data-books/aceite/${token}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nome: nome.trim() }),
      });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error || "Erro ao registrar o aceite");
      setData(j.data);
    } catch (e) {
      alert(e.message);
    } finally {
      setEnviando(false);
    }
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-gray-50"><Loader2 className="animate-spin text-torg-blue" size={28} /></div>;
  if (erro) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 max-w-md text-center">
        <AlertCircle size={28} className="mx-auto text-red-500 mb-2" />
        <p className="text-sm text-gray-700">{erro}</p>
      </div>
    </div>
  );

  const aceito = data.status === "ACEITO";

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Cabeçalho branded */}
        <div className="bg-torg-dark rounded-t-2xl px-7 py-6">
          <div className="text-white text-2xl font-extrabold tracking-tight">TORG <span className="font-light text-torg-blue-200">METAL</span></div>
          <div className="text-[13px] text-blue-200 mt-1">Data Book da Qualidade — Aceite do Cliente</div>
          <div className="h-1 bg-torg-orange rounded-full mt-4 w-24" />
        </div>

        <div className="bg-white rounded-b-2xl border border-gray-100 shadow-sm p-7 space-y-6">
          {/* Identificação */}
          <div>
            <div className="grid grid-cols-2 gap-y-3 gap-x-4 text-sm">
              <div><p className="text-[11px] font-semibold text-torg-gray uppercase tracking-wide">Cliente</p><p className="font-semibold text-torg-dark">{data.cliente || "—"}</p></div>
              <div><p className="text-[11px] font-semibold text-torg-gray uppercase tracking-wide">Obra</p><p className="font-semibold text-torg-dark">{data.op}</p></div>
              <div className="col-span-2"><p className="text-[11px] font-semibold text-torg-gray uppercase tracking-wide">Empreendimento</p><p className="font-semibold text-torg-dark">{data.obra || "—"}</p></div>
              <div className="flex items-center gap-1.5 text-torg-dark"><Weight size={14} className="text-torg-gray" /> {fmtKg(data.pesoTotalKg)}</div>
              <div className="flex items-center gap-1.5 text-torg-dark"><Package size={14} className="text-torg-gray" /> {data.pecas != null ? `${data.pecas} peças` : "—"}</div>
            </div>
          </div>

          {/* Baixar o dossiê */}
          <a href={`/api/qualidade/data-books/aceite/${token}/pdf?inline=1`} target="_blank" rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full bg-torg-blue text-white rounded-xl py-3 font-semibold hover:bg-torg-blue-700 transition-colors">
            <FileDown size={18} /> Abrir / baixar o Data Book (PDF)
          </a>

          {aceito ? (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5 text-center">
              <CheckCircle2 size={32} className="mx-auto text-emerald-600 mb-2" />
              <p className="font-bold text-emerald-800">Aceite registrado</p>
              <p className="text-sm text-emerald-700 mt-1">Recebimento e entrega confirmados por <strong>{data.aceiteNome}</strong></p>
              <p className="text-xs text-emerald-600 mt-0.5">em {fmtDataHora(data.aceiteEm)}</p>
            </div>
          ) : (
            <>
              {/* Termo de aceite */}
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-5">
                <div className="flex items-center gap-2 mb-2"><ShieldCheck size={16} className="text-torg-blue" /><p className="text-sm font-bold text-torg-dark">Termo de aceite</p></div>
                <p className="text-[13px] leading-relaxed text-gray-700">{data.termo}</p>
              </div>

              {/* Confirmação */}
              <div>
                <label className="text-[13px] font-medium text-torg-dark mb-1.5 block">Seu nome completo</label>
                <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome de quem confirma o aceite"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-torg-blue focus:border-transparent mb-3" />
                <button onClick={confirmar} disabled={enviando}
                  className="flex items-center justify-center gap-2 w-full bg-emerald-600 text-white rounded-xl py-3 font-semibold hover:bg-emerald-700 transition-colors disabled:opacity-50">
                  {enviando ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
                  Confirmar recebimento e aceite da obra
                </button>
                <p className="text-[11px] text-torg-gray text-center mt-2">Ao confirmar, você registra o aceite do dossiê e a confirmação de entrega, com data, hora e identificação.</p>
              </div>
            </>
          )}
        </div>
        <p className="text-center text-[11px] text-gray-400 mt-4">TORG METAL · Sistema de Gestão da Qualidade certificado ABNT NBR ISO 9001</p>
      </div>
    </div>
  );
}
