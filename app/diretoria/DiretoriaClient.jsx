"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Lock, Loader2, AlertCircle, UserPlus, X, ShieldCheck, ArrowLeft } from "lucide-react";

export default function DiretoriaClient({ isDono, userNome }) {
  const [dono, setDono] = useState(null);
  const [liberados, setLiberados] = useState([]);
  const [loading, setLoading] = useState(isDono);
  const [erro, setErro] = useState("");
  const [novoEmail, setNovoEmail] = useState("");
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true); setErro("");
    try {
      const r = await fetch("/api/diretoria/acesso", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro");
      setDono(j.dono);
      setLiberados(j.liberados || []);
    } catch (e) { setErro(e.message); } finally { setLoading(false); }
  }, []);

  useEffect(() => { if (isDono) carregar(); }, [isDono, carregar]);

  async function liberar(e) {
    e.preventDefault();
    const email = novoEmail.trim().toLowerCase();
    if (!email) return;
    setSalvando(true); setErro("");
    try {
      const r = await fetch("/api/diretoria/acesso", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro ao liberar");
      setNovoEmail("");
      await carregar();
    } catch (e) { setErro(e.message); } finally { setSalvando(false); }
  }

  async function revogar(email) {
    if (!confirm(`Revogar o acesso de ${email} ao módulo Diretoria?`)) return;
    setSalvando(true); setErro("");
    try {
      const r = await fetch(`/api/diretoria/acesso?email=${encodeURIComponent(email)}`, { method: "DELETE" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro ao revogar");
      await carregar();
    } catch (e) { setErro(e.message); } finally { setSalvando(false); }
  }

  return (
    <div className="min-h-screen bg-torg-blue-50/30">
      <header className="bg-torg-dark text-white">
        <div className="max-w-4xl mx-auto px-6 py-5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
              <Lock size={20} />
            </div>
            <div>
              <h1 className="text-xl font-extrabold tracking-tight">Diretoria</h1>
              <p className="text-[11px] text-white/70">Área restrita · acesso controlado</p>
            </div>
          </div>
          <Link href="/" className="text-xs text-white/80 hover:text-white inline-flex items-center gap-1.5">
            <ArrowLeft size={14} /> Portal
          </Link>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        {/* Conteúdo do módulo (a definir) */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-8 text-center">
          <p className="text-sm text-torg-gray">
            Olá, <strong className="text-torg-dark">{userNome}</strong>. O conteúdo deste módulo está em definição.
          </p>
          <p className="text-xs text-torg-gray mt-1">É só me dizer o que vai aqui dentro que eu monto.</p>
        </div>

        {/* Gerenciar acesso — só o dono */}
        {isDono && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-torg-dark flex items-center gap-2">
                <ShieldCheck size={18} className="text-torg-blue" /> Gerenciar acesso
              </h2>
              <p className="text-[11px] text-torg-gray mt-0.5">
                Só você libera/revoga. Quem você adicionar passa a ver este módulo (pode precisar entrar de novo no sistema para o atalho aparecer no menu).
              </p>
            </div>

            <div className="p-5 space-y-4">
              {erro && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm">
                  <AlertCircle size={16} /> {erro}
                </div>
              )}

              <form onSubmit={liberar} className="flex items-end gap-2 flex-wrap">
                <label className="flex-1 min-w-[220px]">
                  <span className="block text-xs font-medium text-torg-gray mb-1">Liberar acesso para (e-mail)</span>
                  <input
                    type="email" value={novoEmail} onChange={(e) => setNovoEmail(e.target.value)}
                    placeholder="fulano@torg.com.br"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-torg-blue/20 focus:border-torg-blue outline-none"
                  />
                </label>
                <button type="submit" disabled={salvando || !novoEmail.trim()}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-torg-blue text-white text-sm font-medium rounded-lg hover:bg-torg-blue-700 disabled:opacity-50">
                  {salvando ? <Loader2 size={15} className="animate-spin" /> : <UserPlus size={15} />} Liberar
                </button>
              </form>

              <div>
                <p className="text-xs font-semibold text-torg-gray uppercase tracking-wide mb-2">Quem tem acesso</p>
                <div className="border border-gray-100 rounded-lg divide-y divide-gray-50">
                  {/* dono */}
                  <div className="flex items-center justify-between px-3 py-2 text-sm bg-gray-50/50">
                    <span className="text-torg-dark">{dono || "vitor@torg.com.br"}</span>
                    <span className="text-[10px] font-bold text-torg-blue bg-torg-blue-50 px-2 py-0.5 rounded-full">DONO</span>
                  </div>
                  {loading ? (
                    <div className="px-3 py-4 text-center text-torg-gray text-sm"><Loader2 size={16} className="animate-spin inline" /> carregando…</div>
                  ) : liberados.length === 0 ? (
                    <div className="px-3 py-4 text-center text-torg-gray text-xs italic">Ninguém mais liberado — só você.</div>
                  ) : (
                    liberados.map((l) => (
                      <div key={l.id} className="flex items-center justify-between px-3 py-2 text-sm">
                        <span className="text-torg-dark truncate">
                          {l.email}{l.nome ? <span className="text-torg-gray"> · {l.nome}</span> : null}
                        </span>
                        <button onClick={() => revogar(l.email)} disabled={salvando}
                          className="text-torg-gray hover:text-red-600 disabled:opacity-50" title="Revogar acesso">
                          <X size={16} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
