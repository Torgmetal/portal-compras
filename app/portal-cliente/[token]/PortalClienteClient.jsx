"use client";
import { useState, useEffect, useCallback } from "react";
import { Loader2, AlertCircle, FileText, Eye, Download, ShieldCheck, BadgeCheck, Layers, Users, BookOpen, Factory, Building2, Cog, ChevronDown } from "lucide-react";
import PlantaFabril from "@/components/PlantaFabril";
import MaquinasEquipamentos from "@/components/MaquinasEquipamentos";

function DocCard({ d, base, i = 0, destaque }) {
  return (
    <div id={`doc-${d.id}`} className={`group border rounded-xl p-4 hover:shadow-lg transition-shadow duration-200 pc-up ${destaque ? "border-torg-orange ring-2 ring-torg-orange/40 bg-orange-50/40" : "border-gray-100 hover:border-torg-blue-300"}`} style={{ animationDelay: `${i * 45}ms` }}>
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
  const [secoesAbertas, setSecoesAbertas] = useState(() => new Set()); // seções expandidas (accordion) — tudo fechado por padrão
  const toggleSecao = (id) => setSecoesAbertas((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const [painel, setPainel] = useState("documentos"); // aba de topo: documentos | estrutura | maquinas | equipe | modelo
  const [focoDoc, setFocoDoc] = useState(null); // ?doc=<id> — abre direto no documento

  // Lê o ?doc= do link do índice (PDF) — sem sair do portal (boas-vindas continuam).
  useEffect(() => {
    const d = new URLSearchParams(window.location.search).get("doc");
    if (d) setFocoDoc(d);
  }, []);
  // Quando há foco, seleciona a aba do documento e rola até ele (com destaque).
  useEffect(() => {
    if (!data || !focoDoc) return;
    const d = data.documentos.find((x) => x.id === focoDoc);
    if (!d) return;
    const sid = new Set((data.itensAdicionais || []).map((i) => i.id));
    const alvo = (d.requisito && sid.has(d.requisito)) ? d.requisito : "__outros__";
    setPainel("documentos");
    setSecoesAbertas((prev) => new Set(prev).add(alvo)); // abre a seção do documento
    const t = setTimeout(() => { document.getElementById(`doc-${focoDoc}`)?.scrollIntoView({ behavior: "smooth", block: "center" }); }, 360);
    return () => clearTimeout(t);
  }, [data, focoDoc]);

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

  // Seções são criadas pela Torg (data.itensAdicionais = [{id,titulo}]). Cada documento
  // liga a uma seção via requisito = id da seção. Docs sem seção correspondente caem em
  // "Outros documentos". Cada seção com documento publicado vira uma aba.
  const secoesUsuario = data.itensAdicionais || [];
  const secaoIds = new Set(secoesUsuario.map((s) => s.id));
  const grupos = secoesUsuario
    .map((s) => ({ id: s.id, titulo: s.titulo || "Documentos", descricao: s.descricao || null, docs: data.documentos.filter((d) => d.requisito === s.id) }))
    .filter((g) => g.docs.length);
  const docsOutros = data.documentos.filter((d) => !d.requisito || !secaoIds.has(d.requisito));
  if (docsOutros.length) grupos.push({ id: "__outros__", titulo: "Outros documentos", docs: docsOutros });

  // Abas de topo do portal (o cliente seleciona e abre). Documentos sempre aparece; as
  // demais o Vitor liga/desliga por auditoria (data.mostrarSecoes).
  const ms = data.mostrarSecoes || {};
  const tabs = [
    { id: "documentos", label: "Documentos", icon: FileText },
    ...(ms.estrutura !== false ? [{ id: "estrutura", label: "Estrutura", icon: Layers }] : []),
    ...(ms.maquinas !== false ? [{ id: "maquinas", label: "Máquinas", icon: Cog }] : []),
    ...(ms.equipe !== false && data.equipe?.length ? [{ id: "equipe", label: "Equipe", icon: Users }] : []),
    ...(ms.modelo !== false ? [{ id: "modelo", label: "Data Book modelo", icon: BookOpen }] : []),
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
            {data.empresa}
          </h1>
          <p className="text-blue-100 text-lg max-w-2xl leading-relaxed pc-up whitespace-pre-line" style={{ animationDelay: "240ms" }}>
            {data.mensagemBoasVindas || `Seja bem-vindo(a)! É um prazer receber a ${data.empresa}. Reunimos aqui, de forma organizada e transparente, toda a documentação da qualidade solicitada para a sua conferência.`}
          </p>
          {data.titulo && (
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mt-7 text-[15px] pc-up" style={{ animationDelay: "320ms" }}>
              <span className="text-blue-200"><span className="text-blue-400">Auditoria:</span> <strong className="text-white">{data.titulo}</strong></span>
            </div>
          )}
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

          {grupos.length === 0 ? (
            <div className="text-center py-10 text-torg-gray border border-dashed border-gray-200 rounded-xl">
              <FileText size={28} className="mx-auto mb-2 text-gray-300" />
              <p className="text-[14px]">Os documentos serão disponibilizados em breve.</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              <p className="text-[13px] text-torg-gray mb-1">Clique numa seção para ver os documentos.</p>
              {grupos.map((g) => {
                const aberta = secoesAbertas.has(g.id);
                return (
                  <div key={g.id} className="border border-gray-100 rounded-xl overflow-hidden">
                    <button onClick={() => toggleSecao(g.id)} className="w-full flex items-center justify-between gap-3 px-4 py-3.5 hover:bg-gray-50 transition-colors">
                      <span className="inline-flex items-center gap-2.5 min-w-0">
                        <span className="w-2 h-2 rounded-full bg-torg-orange shrink-0" />
                        <span className="text-[15px] font-semibold text-torg-dark truncate">{g.titulo}</span>
                        <span className="text-[12px] text-torg-gray bg-gray-100 rounded-full px-2 py-0.5 shrink-0">{g.docs.length}</span>
                      </span>
                      <ChevronDown size={18} className={`text-torg-gray shrink-0 transition-transform duration-200 ${aberta ? "rotate-180" : ""}`} />
                    </button>
                    {aberta && (
                      <div className="px-4 pb-4 pt-3 border-t border-gray-50">
                        {g.descricao && <p className="text-[14px] text-torg-gray leading-relaxed mb-3 whitespace-pre-line">{g.descricao}</p>}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {g.docs.map((d, i) => <DocCard key={d.id} d={d} base={base} i={i} destaque={focoDoc === d.id} />)}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
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
        {painelAtivo === "modelo" && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-lg p-6 sm:p-8 mt-6">
            <h2 className="text-xl font-bold text-torg-dark inline-flex items-center gap-2 mb-1"><BookOpen size={20} className="text-torg-blue" /> Modelo do Data Book</h2>
            <p className="text-[13px] text-torg-gray mb-4">Veja um exemplo de como será entregue o Data Book da Qualidade da sua obra.</p>
            {data.dataBookModeloUrl ? (
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
            ) : (
              <div className="text-center py-10 text-torg-gray border border-dashed border-gray-200 rounded-xl">
                <BookOpen size={28} className="mx-auto mb-2 text-gray-300" />
                <p className="text-[14px]">O modelo do Data Book será disponibilizado em breve.</p>
              </div>
            )}
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
