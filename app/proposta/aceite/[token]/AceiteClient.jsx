"use client";
import { useState, useEffect } from "react";
import { Loader2, CheckCircle2, FileDown, ShieldCheck, AlertCircle } from "lucide-react";

const fmtDH = (d) => (d ? new Date(d).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "");

export default function AceiteClient({ token }) {
  const [data, setData] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [nome, setNome] = useState("");
  const [documento, setDocumento] = useState("");
  const [cargo, setCargo] = useState("");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`/api/proposta/aceite/${token}`);
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Link inválido");
        setData(d.data);
      } catch (e) { setErro(e.message); } finally { setCarregando(false); }
    })();
  }, [token]);

  const aprovar = async () => {
    if (nome.trim().length < 3) return;
    setEnviando(true); setErro("");
    try {
      const r = await fetch(`/api/proposta/aceite/${token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nome, documento: documento || undefined, cargo: cargo || undefined }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Falha ao aprovar");
      setData(d.data);
    } catch (e) { setErro(e.message); } finally { setEnviando(false); }
  };

  if (carregando) return <div className="min-h-screen flex items-center justify-center text-torg-gray"><Loader2 className="animate-spin" /></div>;
  if (erro && !data) return (
    <div className="min-h-screen flex items-center justify-center p-6 text-center">
      <div><AlertCircle size={30} className="mx-auto text-red-400 mb-2" /><p className="text-red-600">{erro}</p></div>
    </div>
  );

  const aceito = !!data.aceitoEm;
  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-xl mx-auto">
        <div className="bg-torg-dark text-white rounded-t-2xl p-6">
          <div className="text-[11px] tracking-[0.2em] text-torg-blue-200 font-semibold">TORG METAL</div>
          <h1 className="text-2xl font-extrabold mt-1">Proposta Comercial</h1>
          <p className="text-white/80 text-sm mt-1">{[data.numeroPtc, data.cliente, data.obra].filter(Boolean).join(" · ")}</p>
        </div>
        <div className="bg-white rounded-b-2xl shadow-sm p-6 space-y-4">
          <p className="text-sm text-torg-gray">Serviços de <strong className="text-torg-dark">{data.escopo}</strong>.</p>

          {Array.isArray(data.servicos) && data.servicos.length > 0 && (
            <div className="border border-gray-100 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead><tr className="bg-gray-50 text-torg-gray text-xs"><th className="text-left px-3 py-2 font-semibold">Serviço</th><th className="text-right px-3 py-2 font-semibold">Qtd.</th><th className="text-right px-3 py-2 font-semibold">Valor</th></tr></thead>
                <tbody>
                  {data.servicos.map((s, i) => (
                    <tr key={i} className="border-t border-gray-100"><td className="px-3 py-2 text-torg-dark">{s.nome}</td><td className="px-3 py-2 text-right text-torg-gray">{s.qtd ? `${s.qtd} ${s.unid || ""}` : "—"}</td><td className="px-3 py-2 text-right text-torg-dark font-medium">{s.vt}</td></tr>
                  ))}
                </tbody>
                <tfoot><tr className="border-t border-gray-200 bg-gray-50"><td className="px-3 py-2 font-bold text-torg-dark" colSpan={2}>Valor total</td><td className="px-3 py-2 text-right font-bold text-torg-dark">{data.valorTotal}</td></tr></tfoot>
              </table>
            </div>
          )}
          <p className="text-xs text-torg-gray">Pagamento: {data.dias} dias · Revisão {String(data.revisao).padStart(2, "0")}</p>

          <a href={`/api/proposta/aceite/${token}/pdf`} target="_blank" rel="noreferrer"
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 border border-torg-blue-200 text-torg-blue rounded-lg hover:bg-torg-blue-50 font-medium">
            <FileDown size={16} /> Ver proposta completa (PDF)
          </a>

          {aceito ? (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
              <CheckCircle2 size={26} className="mx-auto text-green-600 mb-1" />
              <p className="text-green-800 font-medium">Proposta aprovada</p>
              <p className="text-xs text-green-700 mt-1">Por {data.aceitoNome} em {fmtDH(data.aceitoEm)}</p>
            </div>
          ) : (
            <div className="border-t border-gray-100 pt-4">
              <p className="text-sm font-medium text-torg-dark flex items-center gap-1.5"><ShieldCheck size={16} className="text-torg-blue" /> Aprovar proposta</p>
              <p className="text-xs text-torg-gray mb-3">Ao aprovar, você declara concordância com os termos desta proposta. Registramos seu nome, documento, data, hora e IP do aceite.</p>
              <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Seu nome completo *"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-2 focus:ring-2 focus:ring-torg-blue" />
              <input value={documento} onChange={(e) => setDocumento(e.target.value)} placeholder="CPF ou RG (opcional)"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-2 focus:ring-2 focus:ring-torg-blue" />
              <input value={cargo} onChange={(e) => setCargo(e.target.value)} placeholder="Cargo / empresa (opcional)"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-3 focus:ring-2 focus:ring-torg-blue" />
              {erro && <p className="text-xs text-red-600 mb-2">{erro}</p>}
              <button onClick={aprovar} disabled={enviando || nome.trim().length < 3}
                className="w-full px-4 py-2.5 bg-torg-blue text-white rounded-lg hover:bg-torg-blue-700 font-medium inline-flex items-center justify-center gap-2 disabled:opacity-50">
                {enviando ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />} Aprovar proposta
              </button>
            </div>
          )}
          <p className="text-center text-[11px] text-gray-400 pt-2">Torg Metal · documento enviado por link seguro</p>
        </div>
      </div>
    </div>
  );
}
