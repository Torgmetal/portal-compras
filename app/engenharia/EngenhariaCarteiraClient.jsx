"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { Loader2, AlertCircle, Ruler, Package, Boxes, ChevronRight } from "lucide-react";

const fmtKg = (v) => `${Number(v || 0).toLocaleString("pt-BR")} kg`;
const fmtNum = (v) => Number(v || 0).toLocaleString("pt-BR");
const fmtData = (d) => (d ? new Date(d).toLocaleDateString("pt-BR") : "—");
const corPct = (p) => (p >= 90 ? "var(--good,#12855B)" : p >= 40 ? "#006EAB" : "#B26A00");

export default function EngenhariaCarteiraClient() {
  const [dados, setDados] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [q, setQ] = useState("");

  useEffect(() => {
    let vivo = true;
    setLoading(true); setErro("");
    fetch("/api/engenharia/carteira")
      .then(async (r) => { const j = await r.json(); if (!r.ok || !j.success) throw new Error(j.error || "Erro"); return j; })
      .then((j) => vivo && setDados(j))
      .catch((e) => vivo && setErro(e.message))
      .finally(() => vivo && setLoading(false));
    return () => { vivo = false; };
  }, []);

  const busca = q.trim().toLowerCase();
  const obras = (dados?.obras || []).filter((o) =>
    !busca || [o.opNumero, o.opReal, o.cliente, o.obra].some((v) => String(v || "").toLowerCase().includes(busca)));

  return (
    <div className="max-w-6xl">
      <div className="flex items-start justify-between mb-6 gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-torg-dark flex items-center gap-2"><Ruler size={20} className="text-torg-blue" /> Engenharia · Visão Geral</h1>
          <p className="text-xs text-torg-gray mt-0.5">Carteira de detalhamento — marcas modeladas no Tekla por frente, peso e progresso de produção.</p>
        </div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar OP, frente ou cliente…"
          className="text-sm border border-gray-300 rounded-lg px-3 py-2 w-64 focus:outline-none focus:ring-2 focus:ring-torg-blue/30" />
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-gray-100 p-10 text-center"><Loader2 size={22} className="mx-auto animate-spin text-torg-blue mb-2" /><p className="text-sm text-torg-gray">Carregando carteira…</p></div>
      ) : erro ? (
        <div className="bg-white rounded-xl border border-red-100 p-6"><div className="flex items-start gap-2 text-red-600 text-sm"><AlertCircle size={16} className="mt-0.5" /><div><p className="font-medium">Erro ao carregar</p><p className="text-xs mt-1">{erro}</p></div></div></div>
      ) : !dados || dados.obras.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-10 text-center"><Package size={30} className="mx-auto text-gray-300 mb-2" /><p className="text-sm text-torg-gray">Nenhuma marca importada ainda. Importe um relatório do Tekla (LPC) para começar.</p></div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <Card icon={Boxes} label="Frentes em engenharia" valor={fmtNum(dados.resumo.nOPs)} sub={`${fmtNum(dados.resumo.nMarcas)} marcas`} />
            <Card icon={Ruler} label="Peso modelado" valor={fmtKg(dados.resumo.pesoModeladoKg)} sub="soma das marcas (Tekla)" />
            <Card icon={Package} label="Produzido" valor={fmtKg(dados.resumo.pesoProduzidoKg)} sub="apontado no Syneco" />
            <Card icon={Boxes} label="Progresso" valor={`${dados.resumo.pct}%`} sub="produzido ÷ modelado" cor={corPct(dados.resumo.pct)} />
          </div>

          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-50 flex items-center gap-2">
              <h3 className="text-sm font-semibold text-torg-dark">Carteira por frente</h3>
              <span className="text-xs text-torg-gray">{obras.length} de {dados.obras.length}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50/60">
                  <tr>
                    <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase">Frente · OP · Obra</th>
                    <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-gray-500 uppercase">Marcas</th>
                    <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-gray-500 uppercase">Peso modelado</th>
                    <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase">Produzido</th>
                    <th className="px-4 py-2.5 text-center text-[11px] font-semibold text-gray-500 uppercase">Atualizado</th>
                    <th className="px-2 py-2.5"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {obras.map((o) => (
                    <tr key={o.opNumero} className="hover:bg-gray-50 group">
                      <td className="px-4 py-3">
                        <Link href={`/engenharia/${encodeURIComponent(o.opNumero)}`} className="flex flex-col">
                          <span className="font-bold text-torg-blue font-mono flex items-center gap-2">{o.opNumero}
                            {o.opReal && <span className="text-[10px] font-semibold text-torg-gray bg-gray-100 rounded px-1.5 py-0.5">OP {o.opReal}</span>}
                            {o.semOp && <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 rounded px-1.5 py-0.5">sem OP</span>}
                          </span>
                          <span className="text-xs text-torg-gray">{o.cliente || "—"}{o.obra ? ` · ${o.obra}` : ""}</span>
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{fmtNum(o.nMarcas)}<span className="text-xs text-torg-gray"> · {fmtNum(o.nConjuntos)} conj.</span></td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium text-torg-dark">{fmtKg(o.pesoModeladoKg)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-2 rounded-full bg-gray-100 overflow-hidden flex-1 min-w-[80px]"><div className="h-full rounded-full" style={{ width: `${Math.min(100, o.pct)}%`, background: corPct(o.pct) }} /></div>
                          <span className="text-xs font-semibold tabular-nums w-10 text-right" style={{ color: corPct(o.pct) }}>{o.pct}%</span>
                        </div>
                        <span className="text-[11px] text-torg-gray">{fmtKg(o.pesoProduzidoKg)}</span>
                      </td>
                      <td className="px-4 py-3 text-center text-xs text-torg-gray whitespace-nowrap">{fmtData(o.atualizadoEm)}</td>
                      <td className="px-2 py-3"><Link href={`/engenharia/${encodeURIComponent(o.opNumero)}`} className="text-gray-300 group-hover:text-torg-blue"><ChevronRight size={18} /></Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <p className="text-[11px] text-torg-gray mt-3">Cada linha é uma <strong>frente</strong> (código Tekla/SKA, ex.: T78A/T78B da mesma OP 078). O peso modelado vem das marcas do LPC; o produzido, do Syneco. Clique numa frente para ver as marcas.</p>
        </>
      )}
    </div>
  );
}

function Card({ icon: Icon, label, valor, sub, cor }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
      <div className="flex items-center gap-1.5 text-torg-gray"><Icon size={13} /><span className="text-[11px] uppercase tracking-wide font-semibold">{label}</span></div>
      <p className="text-2xl font-extrabold tabular-nums mt-1.5 text-torg-dark" style={cor ? { color: cor } : undefined}>{valor}</p>
      {sub && <p className="text-[11px] text-torg-gray mt-0.5">{sub}</p>}
    </div>
  );
}
