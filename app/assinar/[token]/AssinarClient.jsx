"use client";
import { useState, useEffect, useCallback } from "react";
import { FileText, CheckCircle2, Loader2, Lock, PenLine, ShieldCheck, Download } from "lucide-react";

const fmtDT = (d) => (d ? new Date(d).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "");

export default function AssinarClient({ token }) {
  const [info, setInfo] = useState(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [concordo, setConcordo] = useState(false);
  const [assinando, setAssinando] = useState(false);

  const carregar = useCallback(() => {
    setCarregando(true);
    fetch(`/api/assinar/${token}`)
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => { if (!ok || j.error) setErro(j.error || "Não foi possível carregar."); else setInfo(j); })
      .catch(() => setErro("Erro de conexão."))
      .finally(() => setCarregando(false));
  }, [token]);
  useEffect(() => { carregar(); }, [carregar]);

  async function assinar() {
    setAssinando(true); setErro("");
    try {
      const r = await fetch(`/api/assinar/${token}`, { method: "POST" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro ao assinar");
      setInfo((v) => ({ ...v, assinadoEm: j.assinadoEm, ip: j.ip }));
    } catch (e) { setErro(e.message); } finally { setAssinando(false); }
  }

  const invalido = erro && !info;
  const assinado = info?.assinadoEm;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-[#0D1F3C] text-white">
        <div className="max-w-3xl mx-auto px-5 py-5 flex items-center gap-4">
          <img src="/torg-logo-white.png" alt="Torg Metal" className="h-9 sm:h-10 shrink-0" />
          <div className="min-w-0 border-l border-white/15 pl-4">
            <p className="text-[11px] uppercase tracking-widest text-white/60">Torg Metal · Assinatura eletrônica</p>
            <h1 className="text-lg font-bold truncate">{info?.titulo || "Documento para assinatura"}</h1>
          </div>
        </div>
        <div className="h-1 bg-[#F4801F]" />
      </header>

      <main className="max-w-3xl mx-auto px-5 py-6">
        {carregando ? (
          <div className="py-16 text-center text-torg-gray"><Loader2 size={24} className="mx-auto animate-spin" /></div>
        ) : invalido ? (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-10 text-center">
            <Lock size={30} className="mx-auto text-gray-300 mb-3" />
            <p className="font-semibold text-torg-dark">{erro}</p>
            <p className="text-sm text-torg-gray mt-1">Peça um novo link à equipe da Torg Metal.</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
              <p className="text-sm text-torg-gray">Olá <strong className="text-torg-dark">{info.nome}</strong>{info.setor ? ` · ${info.setor}` : ""} — você foi indicado para validar este documento.</p>
              <p className="text-[12px] text-torg-gray mt-1">Revisão <strong className="text-torg-dark">R{String(info.revisao ?? 0).padStart(2, "0")}</strong> · enviado em {fmtDT(info.enviadoEm)}</p>
              <a href={`/api/assinar/${token}/pdf`} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-sm text-torg-blue hover:text-torg-dark font-medium">
                <Download size={15} /> Abrir / baixar o documento (PDF)
              </a>
            </div>

            {/* preview do PDF */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <iframe src={`/api/assinar/${token}/pdf`} title="Documento" className="w-full" style={{ height: "70vh", border: "none" }} />
            </div>

            {assinado ? (
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 flex items-start gap-3">
                <CheckCircle2 size={22} className="text-emerald-600 shrink-0" />
                <div>
                  <p className="font-semibold text-emerald-800">Documento assinado</p>
                  <p className="text-sm text-emerald-700 mt-0.5">Assinatura registrada em <strong>{fmtDT(info.assinadoEm)}</strong>{info.ip ? ` · IP ${info.ip}` : ""}. Obrigado!</p>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                <p className="text-[12px] text-torg-gray mb-3 inline-flex items-center gap-1.5"><ShieldCheck size={14} className="text-emerald-600" /> Ao assinar, ficam registrados a sua confirmação, a data/hora e o IP deste acesso.</p>
                <label className="flex items-start gap-2 text-sm text-torg-dark mb-3 cursor-pointer">
                  <input type="checkbox" checked={concordo} onChange={(e) => setConcordo(e.target.checked)} className="mt-0.5 accent-torg-blue" />
                  <span>Confirmo que li o documento acima e <strong>valido</strong> as informações como responsável do meu setor.</span>
                </label>
                {erro && <p className="text-xs text-red-600 mb-2">{erro}</p>}
                <button onClick={assinar} disabled={!concordo || assinando} className="px-5 py-2.5 bg-torg-blue text-white text-sm rounded-lg hover:bg-torg-dark font-semibold inline-flex items-center gap-2 disabled:opacity-50">
                  {assinando ? <Loader2 size={16} className="animate-spin" /> : <PenLine size={16} />} Assinar documento
                </button>
              </div>
            )}
            <p className="text-[11px] text-torg-gray text-center">Torg Metal · assinatura eletrônica registrada no portal</p>
          </div>
        )}
      </main>
    </div>
  );
}
