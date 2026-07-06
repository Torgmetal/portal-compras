"use client";
import { useState, useEffect } from "react";
import { Loader2, FileText, Download, Image as ImageIcon, Briefcase, FileCheck2 } from "lucide-react";

const GRUPOS = [
  { tipo: "CADASTRAL", label: "Documentos cadastrais", icon: FileCheck2 },
  { tipo: "PORTFOLIO", label: "Portfólio", icon: Briefcase },
  { tipo: "OUTRO", label: "Outros documentos", icon: FileText },
];

export default function ApresentacaoClient({ token }) {
  const [dados, setDados] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");

  useEffect(() => {
    let vivo = true;
    fetch(`/api/apresentacao/${token}`)
      .then(async (r) => { const j = await r.json(); if (!r.ok || !j.success) throw new Error(j.error || "Erro"); return j; })
      .then((j) => vivo && setDados(j))
      .catch((e) => vivo && setErro(e.message))
      .finally(() => vivo && setLoading(false));
    return () => { vivo = false; };
  }, [token]);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-[#F3F6F9]"><Loader2 className="animate-spin text-[#006EAB]" size={28} /></div>;
  }
  if (erro || !dados) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F3F6F9] p-6">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 max-w-md text-center">
          <div className="w-12 h-12 rounded-full bg-gray-100 grid place-items-center mx-auto mb-3"><FileText className="text-gray-400" size={22} /></div>
          <h1 className="text-lg font-bold text-[#00263F]">Apresentação indisponível</h1>
          <p className="text-sm text-[#5C7285] mt-1">{erro || "Link inválido ou expirado."}</p>
        </div>
      </div>
    );
  }

  const { apresentacao: ap, docs } = dados;
  const porGrupo = GRUPOS.map((g) => ({ ...g, itens: docs.filter((d) => d.tipo === g.tipo) })).filter((g) => g.itens.length > 0);

  return (
    <div className="min-h-screen bg-[#F3F6F9]">
      {/* Hero */}
      <header className="relative overflow-hidden">
        <div className="absolute inset-0" style={ap.capaUrl
          ? { backgroundImage: `url(${ap.capaUrl})`, backgroundSize: "cover", backgroundPosition: "center" }
          : { background: "linear-gradient(135deg,#006EAB,#00263F)" }} />
        <div className="absolute inset-0" style={{ background: "linear-gradient(120deg,rgba(0,38,63,.92),rgba(0,38,63,.55))" }} />
        <div className="relative max-w-3xl mx-auto px-6 py-16 sm:py-20 text-white">
          <div className="inline-flex items-center gap-2 bg-white/95 rounded-lg px-3 py-1.5 mb-6">
            <span className="w-6 h-6 rounded bg-gradient-to-br from-[#006EAB] to-[#00263F] grid place-items-center text-white font-extrabold text-xs">T</span>
            <span className="font-extrabold text-[#00263F] text-sm tracking-tight">Torg Metal</span>
          </div>
          <p className="text-[#F4801F] font-semibold uppercase tracking-widest text-xs mb-2">Apresentação</p>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight leading-tight text-balance">
            Bem-vindo, {ap.contato}
          </h1>
          {ap.empresa && <p className="text-white/80 text-lg mt-1">{ap.empresa}</p>}
          {ap.mensagemBoasVindas && <p className="text-white/90 text-sm sm:text-base mt-5 max-w-2xl leading-relaxed whitespace-pre-line">{ap.mensagemBoasVindas}</p>}
        </div>
      </header>

      {/* Documentos */}
      <main className="max-w-3xl mx-auto px-6 py-10">
        {porGrupo.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 p-8 text-center text-[#5C7285] text-sm">Nenhum documento disponível ainda.</div>
        ) : porGrupo.map((g) => {
          const Icon = g.icon;
          return (
            <section key={g.tipo} className="mb-8">
              <h2 className="text-sm font-bold text-[#00263F] uppercase tracking-wide flex items-center gap-2 mb-3"><Icon size={16} className="text-[#006EAB]" /> {g.label}</h2>
              <div className="grid sm:grid-cols-2 gap-3">
                {g.itens.map((d, i) => {
                  const isImg = /^image\//.test(d.arquivoTipo || "") || /\.(png|jpe?g|webp|gif)$/i.test(d.url);
                  return (
                    <a key={i} href={d.url} target="_blank" rel="noopener noreferrer"
                      className="group bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-center gap-3 hover:border-[#006EAB]/40 hover:shadow transition-all">
                      <span className="w-10 h-10 rounded-lg bg-[#E9F2F8] text-[#006EAB] grid place-items-center flex-none">{isImg ? <ImageIcon size={18} /> : <FileText size={18} />}</span>
                      <span className="flex-1 min-w-0"><span className="block text-sm font-semibold text-[#00263F] truncate">{d.nome}</span><span className="block text-xs text-[#5C7285]">Clique para abrir</span></span>
                      <Download size={16} className="text-gray-300 group-hover:text-[#006EAB] flex-none" />
                    </a>
                  );
                })}
              </div>
            </section>
          );
        })}

        <footer className="mt-10 pt-6 border-t border-gray-200 text-center">
          <p className="text-xs text-[#5C7285]">Torg Metal — Estruturas Metálicas · Documento controlado, uso restrito ao destinatário.</p>
        </footer>
      </main>
    </div>
  );
}
