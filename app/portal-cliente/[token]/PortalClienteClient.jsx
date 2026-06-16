"use client";
import { useState, useEffect, useCallback } from "react";
import { Loader2, AlertCircle, FileText, Eye, Download, ShieldCheck, BadgeCheck, Layers } from "lucide-react";
import { ordenarSecoes } from "@/lib/auditoria-secoes";

function Chip({ icon: Icon, label }) {
  return (
    <span className="inline-flex items-center gap-1.5 bg-white/10 border border-white/15 rounded-full px-3 py-1.5 text-[13px] text-white">
      <Icon size={14} className="text-torg-orange" /> {label}
    </span>
  );
}

const fmtTam = (b) => {
  if (!b) return "";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${Math.round(b / 1024)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
};

export default function PortalClienteClient({ token }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");

  const carregar = useCallback(async () => {
    try {
      const r = await fetch(`/api/qualidade/auditorias/portal/${token}`);
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error || "Portal indisponível");
      setData(j.data);
    } catch (e) { setErro(e.message); } finally { setLoading(false); }
  }, [token]);
  useEffect(() => { carregar(); }, [carregar]);

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-torg-dark"><Loader2 className="animate-spin text-white" size={30} /></div>;
  if (erro) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-10 max-w-md text-center">
        <AlertCircle size={30} className="mx-auto text-red-500 mb-3" />
        <p className="text-sm text-gray-700">{erro}</p>
      </div>
    </div>
  );

  const base = `/api/qualidade/auditorias/portal/${token}/doc`;

  // Agrupa os documentos por seção, na ordem padrão.
  const porSecao = {};
  for (const d of data.documentos) { const s = d.secao || "Outros"; (porSecao[s] ||= []).push(d); }
  const grupos = ordenarSecoes(Object.keys(porSecao)).map((s) => [s, porSecao[s]]);

  return (
    <div className="min-h-screen bg-gray-50">
      <style jsx global>{`
        @keyframes pcUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pcShimmer { 0% { transform: translateX(-120%); } 60%, 100% { transform: translateX(360%); } }
        .pc-up { opacity: 0; animation: pcUp .6s cubic-bezier(.2,.7,.3,1) forwards; }
        .pc-bar { position: relative; overflow: hidden; }
        .pc-bar::after { content: ""; position: absolute; top: 0; bottom: 0; width: 28%; background: linear-gradient(90deg, transparent, rgba(255,255,255,.6), transparent); animation: pcShimmer 5s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) { .pc-up { opacity: 1; animation: none; } .pc-bar::after { display: none; } }
      `}</style>

      {/* HERO imersivo */}
      <div className="relative bg-torg-dark overflow-hidden">
        {data.capaUrl ? (
          <>
            <div className="absolute inset-0 bg-cover bg-center scale-105" style={{ backgroundImage: `url(${data.capaUrl})` }} />
            <div className="absolute inset-0" style={{ background: "linear-gradient(115deg, rgba(0,41,69,.95) 0%, rgba(0,41,69,.82) 42%, rgba(0,41,69,.55) 100%)" }} />
          </>
        ) : (
          <>
            <div className="absolute inset-0 opacity-[0.06]" style={{ backgroundImage: "radial-gradient(circle at 1px 1px, #fff 1px, transparent 0)", backgroundSize: "22px 22px" }} />
            <div className="absolute -top-24 -right-24 w-80 h-80 rounded-full bg-torg-blue/20 blur-3xl" />
          </>
        )}
        <div className="absolute top-0 left-0 right-0 h-1 bg-torg-orange pc-bar z-10" />
        <div className="relative z-10 max-w-4xl mx-auto px-6 py-16 sm:py-20">
          <img src="/torg-logo-white.png" alt="Torg Metal" className="h-9 mb-8 pc-up" style={{ animationDelay: "0ms" }} />
          <p className="text-torg-orange text-[15px] font-semibold tracking-wide uppercase mb-2 pc-up" style={{ animationDelay: "80ms" }}>Portal do Cliente · Qualidade</p>
          <h1 className="text-white text-4xl sm:text-5xl font-extrabold leading-tight mb-3 pc-up" style={{ animationDelay: "160ms" }}>
            {data.contato ? `Bem-vindo(a), ${data.contato}!` : "Seja bem-vindo(a)!"}
          </h1>
          <p className="text-blue-100 text-lg max-w-2xl leading-relaxed pc-up" style={{ animationDelay: "240ms" }}>
            {data.mensagemBoasVindas || `É um prazer receber a ${data.empresa}. Reunimos aqui, de forma organizada e transparente, toda a documentação da qualidade solicitada para a sua conferência.`}
          </p>
          <div className="flex flex-wrap items-center gap-2.5 mt-7 pc-up" style={{ animationDelay: "320ms" }}>
            <Chip icon={Layers} label={`${grupos.length} ${grupos.length === 1 ? "seção" : "seções"}`} />
            <Chip icon={FileText} label={`${data.documentos.length} ${data.documentos.length === 1 ? "documento" : "documentos"}`} />
            <Chip icon={BadgeCheck} label="ISO 9001 · Bureau Veritas" />
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mt-5 text-[15px] pc-up" style={{ animationDelay: "400ms" }}>
            <span className="text-blue-200"><span className="text-blue-400">Empresa:</span> <strong className="text-white">{data.empresa}</strong></span>
            {data.titulo && <span className="text-blue-200"><span className="text-blue-400">Auditoria:</span> <strong className="text-white">{data.titulo}</strong></span>}
          </div>
        </div>
      </div>

      {/* DOCUMENTOS */}
      <div className="max-w-4xl mx-auto px-6 py-10 -mt-6">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-lg p-6 sm:p-8">
          <div className="flex items-center justify-between gap-3 mb-5">
            <h2 className="text-xl font-bold text-torg-dark">Documentos da auditoria</h2>
            <span className="text-[13px] text-torg-gray bg-gray-50 rounded-full px-3 py-1">{data.documentos.length} {data.documentos.length === 1 ? "documento" : "documentos"}</span>
          </div>

          {data.documentos.length === 0 ? (
            <div className="text-center py-12 text-torg-gray"><FileText size={32} className="mx-auto mb-2 text-gray-300" /><p className="text-base">Os documentos serão disponibilizados em breve.</p></div>
          ) : (
            <div className="space-y-6">
              {grupos.map(([secao, docs], gi) => (
                <div key={secao}>
                  <div className="flex items-center gap-3 mb-2.5 pc-up" style={{ animationDelay: `${gi * 120}ms` }}>
                    <span className="w-1.5 h-1.5 rounded-full bg-torg-orange shrink-0" />
                    <h3 className="text-[14px] font-semibold text-torg-dark uppercase tracking-wide whitespace-nowrap">{secao}</h3>
                    <span className="h-px bg-gray-100 flex-1" />
                    <span className="text-[12px] text-torg-gray">{docs.length}</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {docs.map((d, di) => (
                      <div key={d.id} className="group border border-gray-100 rounded-xl p-4 hover:border-torg-blue-300 hover:shadow-lg transition-shadow duration-200 pc-up" style={{ animationDelay: `${gi * 120 + di * 55}ms` }}>
                        <div className="flex items-start gap-3">
                          <div className="w-10 h-10 rounded-lg bg-torg-blue-50 flex items-center justify-center shrink-0"><FileText size={18} className="text-torg-blue" /></div>
                          <div className="min-w-0 flex-1">
                            <p className="text-base font-medium text-torg-dark leading-snug break-words">{d.nome}</p>
                            {d.arquivoTamanho ? <p className="text-[13px] text-torg-gray mt-0.5">{fmtTam(d.arquivoTamanho)}</p> : null}
                            <div className="flex items-center gap-4 mt-2.5">
                              <a href={`${base}/${d.id}?inline=1`} target="_blank" rel="noreferrer" className="text-[14px] font-medium text-torg-blue hover:text-torg-dark inline-flex items-center gap-1.5"><Eye size={16} /> Visualizar</a>
                              <a href={`${base}/${d.id}`} className="text-[14px] font-medium text-torg-blue hover:text-torg-dark inline-flex items-center gap-1.5"><Download size={16} /> Baixar</a>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* selo de confiança */}
        <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-2 mt-8 text-[13px] text-torg-gray">
          <span className="inline-flex items-center gap-1.5"><ShieldCheck size={16} className="text-torg-blue" /> Documentação controlada</span>
          <span className="inline-flex items-center gap-1.5"><BadgeCheck size={16} className="text-torg-blue" /> Sistema de Gestão certificado ABNT NBR ISO 9001</span>
        </div>
        <p className="text-center text-[12px] text-gray-400 mt-3">© TORG METAL · Estruturas Metálicas</p>
      </div>
    </div>
  );
}
