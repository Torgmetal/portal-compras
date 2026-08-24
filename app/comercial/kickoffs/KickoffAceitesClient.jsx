"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Loader2, AlertCircle, RefreshCw, Rocket, CheckCircle2, Clock, ChevronDown, ChevronRight, ExternalLink, Send, BellRing } from "lucide-react";
import { fmtOP } from "@/lib/utils";

const fmtData = (d) => (d ? new Date(d).toLocaleDateString("pt-BR") : "—");
const corDias = (n) => (n == null ? "text-torg-gray" : n >= 30 ? "text-red-600" : n >= 14 ? "text-amber-600" : "text-torg-gray");

const TIPO = {
  GERAL: { label: "Geral", cls: "bg-torg-blue-50 text-torg-blue border-torg-blue-100" },
  FISCAL: { label: "Fiscal", cls: "bg-amber-50 text-amber-700 border-amber-200" },
};

export default function KickoffAceitesClient() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [aberto, setAberto] = useState({});
  const [soPend, setSoPend] = useState(true);
  // ⚠⚠ seleção por OP: `marcados[opId]` é um Set de "TIPO|email", NÃO de e-mail.
  // A mesma pessoa pode ter as duas pendências na mesma OP (o Kick Off GERAL e o FISCAL são
  // convites separados, com tokens separados). Chaveado só por e-mail, marcar uma linha marcava
  // as duas e a cobrança saía dobrada.
  //
  // ⚠ Set vazio = cobrar TODOS os pendentes daquela OP. É o caso comum — o botão do cabeçalho —
  // e evita obrigar o comercial a marcar um por um só para cobrar a obra inteira.
  const [marcados, setMarcados] = useState({});
  const [enviando, setEnviando] = useState(null);
  const [aviso, setAviso] = useState(null);

  const carregar = useCallback(async () => {
    setLoading(true); setErro("");
    try {
      const r = await fetch("/api/comercial/kickoff/aceites", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro ao carregar");
      setData(j);
    } catch (e) { setErro(e.message); } finally { setLoading(false); }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const cobrar = useCallback(async (o) => {
    const escolhidos = [...(marcados[o.opId] || [])].map((k) => {
      const [tipo, ...resto] = k.split("|");
      return { tipo, email: resto.join("|") };
    });
    const quantos = escolhidos.length || o.pendentes.length;
    const quem = escolhidos.length ? `${quantos} pessoa${quantos === 1 ? "" : "s"}` : `os ${quantos} pendentes`;
    if (!confirm(`Reenviar o Kick Off da OP ${o.numero} para ${quem}?\n\nCada um recebe o comunicado completo com o botão de aceite dele.`)) return;
    setEnviando(o.opId); setAviso(null);
    try {
      const r = await fetch("/api/comercial/kickoff/aceites/reenviar", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opId: o.opId, alvos: escolhidos.length ? escolhidos : undefined }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro ao reenviar");
      setAviso({
        ok: true,
        texto: `OP ${o.numero}: cobrança enviada para ${j.enviados} ${j.enviados === 1 ? "pessoa" : "pessoas"}.`
          + (j.falhas?.length ? ` Não saiu para ${j.falhas.join(", ")}.` : ""),
      });
      setMarcados((m) => ({ ...m, [o.opId]: new Set() }));
      await carregar();
    } catch (e) {
      setAviso({ ok: false, texto: e.message });
    } finally { setEnviando(null); }
  }, [marcados, carregar]);

  const chave = (p) => `${p.tipo}|${p.email}`;
  const alternar = (opId, p) => setMarcados((m) => {
    const s = new Set(m[opId] || []);
    const k = chave(p);
    s.has(k) ? s.delete(k) : s.add(k);
    return { ...m, [opId]: s };
  });

  const resumo = data?.resumo;
  const ops = (data?.ops || []).filter((o) => (soPend ? o.totalPend > 0 : true));

  return (
    <div className="max-w-5xl space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-torg-dark tracking-tight flex items-center gap-2">
            <Rocket size={22} className="text-torg-orange" /> Kick Offs — Aceites
          </h1>
          <p className="text-sm text-torg-gray mt-1">Quem já confirmou o recebimento do Kick Off, quais obras ainda faltam e a cobrança de quem não respondeu.</p>
        </div>
        <button onClick={carregar} disabled={loading} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-200 rounded-lg text-torg-gray hover:bg-gray-50 disabled:opacity-50">
          <RefreshCw size={15} className={loading ? "animate-spin" : ""} /> Atualizar
        </button>
      </div>

      {resumo && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card n={resumo.obrasComPendencia} l="Obras com pendência" cor="#dc2626" bg="#fdeaea" />
          <Card n={resumo.totalPendencias} l="Aceites aguardando" cor="#b45309" bg="#fff6e6" />
          <Card n={resumo.totalConfirmados} l="Já confirmados" cor="#1e9e6a" bg="#e7f5ee" />
          <Card n={resumo.obrasDivulgadas} l="Obras divulgadas" cor="#006EAB" bg="#e8f2f9" />
        </div>
      )}

      <label className="inline-flex items-center gap-2 text-sm text-torg-gray cursor-pointer">
        <input type="checkbox" checked={soPend} onChange={(e) => setSoPend(e.target.checked)} className="accent-torg-blue" />
        Mostrar só obras com pendência
      </label>

      {aviso && (
        <div className={`rounded-xl border px-4 py-3 text-sm flex items-start gap-2 ${aviso.ok ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-red-50 border-red-200 text-red-700"}`}>
          {aviso.ok ? <CheckCircle2 size={16} className="mt-0.5 shrink-0" /> : <AlertCircle size={16} className="mt-0.5 shrink-0" />}
          <span className="flex-1">{aviso.texto}</span>
          <button onClick={() => setAviso(null)} className="text-xs underline shrink-0">fechar</button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20 gap-3 text-torg-gray"><Loader2 size={22} className="animate-spin" /> Carregando…</div>
      ) : erro ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-5 text-center text-red-700 flex flex-col items-center gap-2"><AlertCircle size={26} /> {erro}</div>
      ) : ops.length === 0 ? (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-8 text-center text-emerald-700 flex flex-col items-center gap-2">
          <CheckCircle2 size={30} /> <p className="font-semibold">Nenhuma pendência</p>
          <p className="text-sm">Todos os Kick Offs divulgados já foram confirmados.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {ops.map((o) => {
            const open = !!aberto[o.opId];
            return (
              <div key={o.opId} className={`bg-white rounded-xl border ${o.totalPend > 0 ? "border-gray-200" : "border-emerald-200"} shadow-[0_1px_3px_rgba(0,41,69,0.06)] overflow-hidden`}>
                <div className="flex items-stretch">
                  <button onClick={() => setAberto((s) => ({ ...s, [o.opId]: !open }))} className="flex-1 min-w-0 flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50">
                    {open ? <ChevronDown size={16} className="text-torg-gray shrink-0" /> : <ChevronRight size={16} className="text-torg-gray shrink-0" />}
                    <div className="min-w-0 flex-1">
                      <div className="font-extrabold text-torg-dark tabular-nums">{fmtOP(o.numero)} <span className="font-medium text-torg-gray">· {o.cliente}{o.obra ? ` — ${o.obra}` : ""}</span></div>
                      <div className="text-xs text-torg-gray-light mt-0.5">Divulgado em {fmtData(o.divulgadoEm)}</div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                      <Badge tipo="GERAL" pend={o.geral.pend} ok={o.geral.ok} />
                      <Badge tipo="FISCAL" pend={o.fiscal.pend} ok={o.fiscal.ok} />
                      {o.totalPend > 0 ? (
                        <span className={`text-xs font-semibold inline-flex items-center gap-1 ${corDias(o.maxDias)}`}><Clock size={12} /> há {o.maxDias}d</span>
                      ) : (
                        <span className="text-xs font-semibold text-emerald-600 inline-flex items-center gap-1"><CheckCircle2 size={13} /> completo</span>
                      )}
                    </div>
                  </button>
                  {o.totalPend > 0 && (
                    <div className="flex items-center pr-3 pl-1 border-l border-gray-100">
                      <button onClick={() => cobrar(o)} disabled={enviando === o.opId}
                        title={(marcados[o.opId]?.size || 0) > 0
                          ? `Reenviar para os ${marcados[o.opId].size} marcados`
                          : `Reenviar para os ${o.totalPend} que faltam confirmar`}
                        className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold rounded-lg border border-torg-orange/40 text-torg-orange hover:bg-torg-orange/10 disabled:opacity-50 whitespace-nowrap">
                        {enviando === o.opId ? <Loader2 size={14} className="animate-spin" /> : <BellRing size={14} />}
                        Cobrar{(marcados[o.opId]?.size || 0) > 0 ? ` (${marcados[o.opId].size})` : ""}
                      </button>
                    </div>
                  )}
                </div>

                {open && (
                  <div className="px-4 pb-4 pt-1 border-t border-gray-100 grid sm:grid-cols-2 gap-4">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wide text-red-600 mb-1.5">Faltam confirmar ({o.pendentes.length})</p>
                      {o.pendentes.length === 0 ? <p className="text-sm text-torg-gray-light italic">ninguém pendente</p> : (
                        <>
                          <ul className="space-y-1">
                            {o.pendentes.map((p, i) => (
                              <li key={i} className="text-sm flex items-center gap-2">
                                <input type="checkbox" checked={!!marcados[o.opId]?.has(chave(p))} onChange={() => alternar(o.opId, p)}
                                  title="Marque para cobrar só estes" className="accent-torg-orange shrink-0" />
                                <span className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold ${TIPO[p.tipo].cls}`}>{TIPO[p.tipo].label}</span>
                                <span className="text-torg-dark truncate flex-1">{p.email}</span>
                                {p.cobrancas > 0 && (
                                  <span className="text-[10px] text-torg-orange font-semibold inline-flex items-center gap-0.5 shrink-0" title={`Última cobrança em ${fmtData(p.cobradoEm)}`}>
                                    <Send size={10} /> {p.cobrancas}×
                                  </span>
                                )}
                                <span className={`text-xs shrink-0 ${corDias(p.dias)}`}>{p.dias}d</span>
                              </li>
                            ))}
                          </ul>
                          {/* ⚠ nada marcado cobra TODOS — é o caso comum, e o botão do cabeçalho já diz isso.
                              Este aviso só aparece quando a escolha muda o alvo, para não virar ruído fixo. */}
                          {(marcados[o.opId]?.size || 0) > 0 && (
                            <p className="text-[11px] text-torg-orange mt-1.5">
                              Cobrar vai só para os {marcados[o.opId].size} marcados.{" "}
                              <button onClick={() => setMarcados((m) => ({ ...m, [o.opId]: new Set() }))} className="underline">limpar</button>
                            </p>
                          )}
                        </>
                      )}
                    </div>
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-600 mb-1.5">Já confirmaram ({o.confirmados.length})</p>
                      {o.confirmados.length === 0 ? <p className="text-sm text-torg-gray-light italic">nenhum ainda</p> : (
                        <ul className="space-y-1">
                          {o.confirmados.map((p, i) => (
                            <li key={i} className="text-sm flex items-center gap-2">
                              <span className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold ${TIPO[p.tipo].cls}`}>{TIPO[p.tipo].label}</span>
                              <span className="text-torg-dark truncate flex-1">{p.email}</span>
                              <span className="text-xs text-emerald-600 inline-flex items-center gap-0.5"><CheckCircle2 size={11} /> {fmtData(p.aceitoEm)}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div className="sm:col-span-2">
                      <Link href={`/comercial/${o.opId}/kickoff`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-torg-blue hover:underline">
                        <ExternalLink size={14} /> Abrir Kick Off da {fmtOP(o.numero)}
                      </Link>
                      {o.totalPend > 0 && (
                        <p className="text-[11px] text-torg-gray-light mt-1.5">
                          Cobrar reenvia o comunicado inteiro, com o botão de aceite de cada um. O link antigo continua valendo — ninguém recebe convite novo.
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Card({ n, l, cor, bg }) {
  return (
    <div className="rounded-xl p-3.5 border border-transparent" style={{ background: bg }}>
      <div className="text-2xl font-extrabold tabular-nums" style={{ color: cor }}>{n ?? "—"}</div>
      <div className="text-xs text-torg-gray mt-0.5">{l}</div>
    </div>
  );
}

function Badge({ tipo, pend, ok }) {
  const total = pend + ok;
  if (total === 0) return null;
  const t = TIPO[tipo];
  return (
    <span className={`text-[11px] px-2 py-1 rounded-lg border font-semibold inline-flex items-center gap-1 ${t.cls}`}>
      {t.label} {pend > 0 ? <span className="text-red-600">{ok}/{total}</span> : <span className="text-emerald-600 inline-flex items-center gap-0.5"><CheckCircle2 size={11} /> {total}</span>}
    </span>
  );
}
