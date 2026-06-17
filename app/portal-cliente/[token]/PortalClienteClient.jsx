"use client";
import { useState, useEffect, useCallback } from "react";
import { Loader2, AlertCircle, FileText, Eye, Download, ShieldCheck, BadgeCheck, Layers, Users, BookOpen, Factory, Building2, Cog } from "lucide-react";
import { ordenarSecoes } from "@/lib/auditoria-secoes";
import PlantaFabril from "@/components/PlantaFabril";
import MaquinasEquipamentos from "@/components/MaquinasEquipamentos";

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
  const [aba, setAba] = useState(null); // seção (aba) ativa escolhida pelo cliente
  const [painel, setPainel] = useState("documentos"); // aba de topo: documentos | estrutura | maquinas | equipe | modelo

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
  // Aba ativa: a escolhida pelo cliente (se ainda existe) ou a primeira seção.
  const abaAtiva = (aba && porSecao[aba]) ? aba : (grupos[0]?.[0] || null);
  const docsAtivos = abaAtiva ? porSecao[abaAtiva] : [];

  // Abas de topo do portal (o cliente seleciona e abre)
  const tabs = [
    { id: "documentos", label: "Documentos", icon: FileText },
    { id: "estrutura", label: "Estrutura", icon: Layers },
    { id: "maquinas", label: "Máquinas", icon: Cog },
    ...(data.equipe?.length ? [{ id: "equipe", label: "Equipe", icon: Users }] : []),
    ...(data.dataBookModeloUrl ? [{ id: "modelo", label: "Data Book modelo", icon: BookOpen }] : []),
  ];
  const painelAtivo = tabs.some((t) => t.id === painel) ? painel : "documentos";

  return (
    <div className="min-h-screen bg-gray-50">
      <style jsx global>{`
        @keyframes pcUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pcShimmer { 0% { transform: translateX(-120%); } 60%, 100% { transform: translateX(360%); } }
        @keyframes pcShine { to { background-position: -200% 0; } }
        .pc-up { opacity: 0; animation: pcUp .6s cubic-bezier(.2,.7,.3,1) forwards; }
        .pc-bar { position: relative; overflow: hidden; }
        .pc-bar::after { content: ""; position: absolute; top: 0; bottom: 0; width: 28%; background: linear-gradient(90deg, transparent, rgba(255,255,255,.6), transparent); animation: pcShimmer 5s ease-in-out infinite; }
        .pc-shine { background: linear-gradient(90deg, #f4801f 35%, #ffe0bf 50%, #f4801f 65%); background-size: 200% 100%; -webkit-background-clip: text; background-clip: text; color: transparent; animation: pcShine 3.5s linear infinite; }
        @media (prefers-reduced-motion: reduce) { .pc-up { opacity: 1; animation: none; } .pc-bar::after { display: none; } .pc-shine { animation: none; color: #f4801f; } }
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
          <img src="/torg-logo-white.png" alt="Torg Metal" className="h-14 sm:h-16 mb-8 pc-up" style={{ animationDelay: "0ms" }} />
          <p className="pc-shine text-[15px] font-semibold tracking-wide uppercase mb-2 pc-up inline-block" style={{ animationDelay: "80ms" }}>Portal do Cliente · Qualidade</p>
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

      {/* CONTEÚDO em abas de topo */}
      <div className="max-w-4xl mx-auto px-6 py-10 -mt-6">
        {/* Abas de topo — o cliente seleciona a área e abre */}
        <div className="flex flex-wrap gap-1.5 mb-5 bg-white rounded-2xl border border-gray-100 shadow-sm p-2">
          {tabs.map((t) => {
            const on = t.id === painelAtivo;
            const I = t.icon;
            return (
              <button key={t.id} onClick={() => setPainel(t.id)}
                className={`text-[13px] font-medium rounded-xl px-3.5 py-2 inline-flex items-center gap-1.5 transition-colors ${on ? "bg-torg-dark text-white" : "text-torg-gray hover:bg-gray-50 hover:text-torg-dark"}`}>
                <I size={15} className={on ? "text-torg-orange" : ""} /> {t.label}
              </button>
            );
          })}
        </div>

        {painelAtivo === "documentos" && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-lg p-6 sm:p-8">
          <div className="flex items-center justify-between gap-3 mb-5">
            <h2 className="text-xl font-bold text-torg-dark">Documentos da auditoria</h2>
            <span className="text-[13px] text-torg-gray bg-gray-50 rounded-full px-3 py-1">{data.documentos.length} {data.documentos.length === 1 ? "documento" : "documentos"}</span>
          </div>

          {data.documentos.length === 0 ? (
            <div className="text-center py-12 text-torg-gray"><FileText size={32} className="mx-auto mb-2 text-gray-300" /><p className="text-base">Os documentos serão disponibilizados em breve.</p></div>
          ) : (
            <>
              {/* Abas por tipo de documento — o cliente escolhe e vê só aquela seção */}
              <div className="flex flex-wrap gap-2 mb-6">
                {grupos.map(([secao, docs]) => {
                  const ativa = secao === abaAtiva;
                  return (
                    <button key={secao} onClick={() => setAba(secao)}
                      className={`text-[13px] font-medium rounded-full px-3.5 py-1.5 border transition-colors inline-flex items-center gap-2 ${ativa ? "bg-torg-dark text-white border-torg-dark" : "bg-white text-torg-gray border-gray-200 hover:border-torg-blue-300 hover:text-torg-dark"}`}>
                      <span className="uppercase tracking-wide">{secao}</span>
                      <span className={`text-[11px] rounded-full px-1.5 ${ativa ? "bg-white/25 text-white" : "bg-gray-100 text-torg-gray"}`}>{docs.length}</span>
                    </button>
                  );
                })}
              </div>
              {/* Documentos da aba ativa */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {docsAtivos.map((d, di) => (
                  <div key={d.id} className="group border border-gray-100 rounded-xl p-4 hover:border-torg-blue-300 hover:shadow-lg transition-shadow duration-200 pc-up" style={{ animationDelay: `${di * 55}ms` }}>
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-lg bg-torg-blue-50 flex items-center justify-center shrink-0"><FileText size={18} className="text-torg-blue" /></div>
                      <div className="min-w-0 flex-1">
                        <p className="text-base font-semibold text-torg-dark leading-snug break-words uppercase">{d.nome}</p>
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
            </>
          )}
        </div>
        )}

        {painelAtivo === "estrutura" && <PlantaFabril />}

        {painelAtivo === "maquinas" && <MaquinasEquipamentos />}

        {/* Equipe — Administrativo e Fábrica */}
        {painelAtivo === "equipe" && data.equipe?.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-lg p-6 sm:p-8 mt-6">
            <div className="flex items-center justify-between gap-3 mb-1">
              <h2 className="text-xl font-bold text-torg-dark inline-flex items-center gap-2"><Users size={20} className="text-torg-blue" /> Nossa equipe</h2>
              <span className="text-[13px] text-torg-gray bg-gray-50 rounded-full px-3 py-1">{data.totalFuncionarios} colaboradores</span>
            </div>
            <p className="text-[13px] text-torg-gray mb-5">Estrutura organizacional.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {data.equipe.map((g) => (
                <div key={g.grupo} className="border border-gray-100 rounded-xl p-5 flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-torg-blue-50 flex items-center justify-center shrink-0">
                    {g.grupo === "Fábrica" ? <Factory size={24} className="text-torg-blue" /> : <Building2 size={24} className="text-torg-blue" />}
                  </div>
                  <div>
                    <p className="text-[13px] font-semibold text-torg-gray uppercase tracking-wide">{g.grupo}</p>
                    <p className="text-3xl font-bold text-torg-dark leading-tight">{g.funcionarios}</p>
                    <p className="text-[12px] text-torg-gray">{g.funcionarios === 1 ? "colaborador" : "colaboradores"}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Modelo de Data Book */}
        {painelAtivo === "modelo" && data.dataBookModeloUrl && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-lg p-6 sm:p-8 mt-6">
            <h2 className="text-xl font-bold text-torg-dark inline-flex items-center gap-2 mb-1"><BookOpen size={20} className="text-torg-blue" /> Modelo do Data Book</h2>
            <p className="text-[13px] text-torg-gray mb-4">Veja um exemplo de como será entregue o Data Book da Qualidade da sua obra.</p>
            <div className="flex items-center gap-4 border border-gray-100 rounded-xl p-4">
              <div className="w-12 h-12 rounded-lg bg-torg-blue-50 flex items-center justify-center shrink-0"><FileText size={22} className="text-torg-blue" /></div>
              <div className="flex-1 min-w-0">
                <p className="text-[15px] font-medium text-torg-dark">Data Book — modelo de referência</p>
                <div className="flex items-center gap-4 mt-1.5">
                  <a href={data.dataBookModeloUrl} target="_blank" rel="noreferrer" className="text-[14px] font-medium text-torg-blue hover:text-torg-dark inline-flex items-center gap-1.5"><Eye size={16} /> Visualizar</a>
                  <a href={data.dataBookModeloUrl} className="text-[14px] font-medium text-torg-blue hover:text-torg-dark inline-flex items-center gap-1.5"><Download size={16} /> Baixar</a>
                </div>
              </div>
            </div>
          </div>
        )}

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
