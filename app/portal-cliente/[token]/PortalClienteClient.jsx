"use client";
import { useState, useEffect, useCallback } from "react";
import { Loader2, AlertCircle, FileText, Eye, Download, ShieldCheck, BadgeCheck } from "lucide-react";
import { ordenarSecoes } from "@/lib/auditoria-secoes";

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
      {/* HERO imersivo */}
      <div className="relative bg-torg-dark overflow-hidden">
        <div className="absolute inset-0 opacity-[0.06]" style={{ backgroundImage: "radial-gradient(circle at 1px 1px, #fff 1px, transparent 0)", backgroundSize: "22px 22px" }} />
        <div className="absolute top-0 left-0 right-0 h-1 bg-torg-orange" />
        <div className="relative max-w-4xl mx-auto px-6 py-14">
          <div className="text-white text-2xl font-extrabold tracking-tight mb-8">TORG <span className="font-light text-blue-300">METAL</span></div>
          <p className="text-torg-orange text-sm font-semibold tracking-wide uppercase mb-2">Portal do Cliente · Qualidade</p>
          <h1 className="text-white text-3xl sm:text-4xl font-extrabold leading-tight mb-3">
            {data.contato ? `Bem-vindo(a), ${data.contato}!` : "Seja bem-vindo(a)!"}
          </h1>
          <p className="text-blue-100 text-base max-w-2xl leading-relaxed">
            {data.mensagemBoasVindas || `É um prazer receber a ${data.empresa}. Reunimos aqui, de forma organizada e transparente, toda a documentação da qualidade solicitada para a sua conferência.`}
          </p>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mt-6 text-sm">
            <span className="text-blue-200"><span className="text-blue-400">Empresa:</span> <strong className="text-white">{data.empresa}</strong></span>
            {data.titulo && <span className="text-blue-200"><span className="text-blue-400">Auditoria:</span> <strong className="text-white">{data.titulo}</strong></span>}
          </div>
        </div>
      </div>

      {/* DOCUMENTOS */}
      <div className="max-w-4xl mx-auto px-6 py-10 -mt-6">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-lg p-6 sm:p-8">
          <div className="flex items-center justify-between gap-3 mb-5">
            <h2 className="text-lg font-bold text-torg-dark">Documentos da auditoria</h2>
            <span className="text-[12px] text-torg-gray bg-gray-50 rounded-full px-3 py-1">{data.documentos.length} {data.documentos.length === 1 ? "documento" : "documentos"}</span>
          </div>

          {data.documentos.length === 0 ? (
            <div className="text-center py-12 text-torg-gray"><FileText size={32} className="mx-auto mb-2 text-gray-300" /><p className="text-sm">Os documentos serão disponibilizados em breve.</p></div>
          ) : (
            <div className="space-y-6">
              {grupos.map(([secao, docs]) => (
                <div key={secao}>
                  <div className="flex items-center gap-3 mb-2.5">
                    <h3 className="text-[12px] font-semibold text-torg-dark uppercase tracking-wide whitespace-nowrap">{secao}</h3>
                    <span className="h-px bg-gray-100 flex-1" />
                    <span className="text-[11px] text-torg-gray">{docs.length}</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {docs.map((d) => (
                      <div key={d.id} className="group border border-gray-100 rounded-xl p-4 hover:border-torg-blue-200 hover:shadow-sm transition-all">
                        <div className="flex items-start gap-3">
                          <div className="w-10 h-10 rounded-lg bg-torg-blue-50 flex items-center justify-center shrink-0"><FileText size={18} className="text-torg-blue" /></div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-torg-dark leading-snug break-words">{d.nome}</p>
                            {d.arquivoTamanho ? <p className="text-[11px] text-torg-gray mt-0.5">{fmtTam(d.arquivoTamanho)}</p> : null}
                            <div className="flex items-center gap-3 mt-2">
                              <a href={`${base}/${d.id}?inline=1`} target="_blank" rel="noreferrer" className="text-[12px] font-medium text-torg-blue hover:text-torg-dark inline-flex items-center gap-1"><Eye size={13} /> Visualizar</a>
                              <a href={`${base}/${d.id}`} className="text-[12px] font-medium text-torg-blue hover:text-torg-dark inline-flex items-center gap-1"><Download size={13} /> Baixar</a>
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
        <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-2 mt-8 text-[12px] text-torg-gray">
          <span className="inline-flex items-center gap-1.5"><ShieldCheck size={15} className="text-torg-blue" /> Documentação controlada</span>
          <span className="inline-flex items-center gap-1.5"><BadgeCheck size={15} className="text-torg-blue" /> Sistema de Gestão certificado ABNT NBR ISO 9001</span>
        </div>
        <p className="text-center text-[11px] text-gray-400 mt-3">© TORG METAL · Estruturas Metálicas</p>
      </div>
    </div>
  );
}
