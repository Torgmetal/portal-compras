"use client";
import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { Loader2, AlertCircle, ArrowLeft, Ruler, Package, AlertTriangle } from "lucide-react";

const fmtKg = (v) => `${Number(v || 0).toLocaleString("pt-BR")} kg`;
const fmtNum = (v) => Number(v || 0).toLocaleString("pt-BR");

// Cor do status da peça no pipeline
function statusChip(s) {
  const up = String(s || "").toUpperCase();
  if (up === "EXPEDIDO") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (up === "PENDENTE" || !up) return "bg-gray-100 text-gray-500 border-gray-200";
  if (up === "CORTE") return "bg-torg-blue-50 text-torg-blue border-torg-blue/20";
  if (up === "TERCEIRIZADO") return "bg-violet-50 text-violet-700 border-violet-200";
  return "bg-amber-50 text-amber-700 border-amber-200"; // em processo (montagem/solda/…)
}

export default function DetalheOPClient({ opNumero }) {
  const [dados, setDados] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [q, setQ] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("");

  useEffect(() => {
    let vivo = true;
    setLoading(true); setErro("");
    fetch(`/api/engenharia/op/${encodeURIComponent(opNumero)}`)
      .then(async (r) => { const j = await r.json(); if (!r.ok || !j.success) throw new Error(j.error || "Erro"); return j; })
      .then((j) => vivo && setDados(j))
      .catch((e) => vivo && setErro(e.message))
      .finally(() => vivo && setLoading(false));
    return () => { vivo = false; };
  }, [opNumero]);

  const marcas = useMemo(() => {
    if (!dados) return [];
    const busca = q.trim().toLowerCase();
    return dados.marcas.filter((m) => {
      if (filtroStatus && String(m.status).toUpperCase() !== filtroStatus) return false;
      if (!busca) return true;
      return [m.marca, m.descricao, m.perfil, m.material].some((v) => String(v || "").toLowerCase().includes(busca));
    });
  }, [dados, q, filtroStatus]);

  return (
    <div className="max-w-6xl">
      <Link href="/engenharia" className="text-sm text-torg-blue hover:underline inline-flex items-center gap-1 mb-4"><ArrowLeft size={15} /> Carteira</Link>

      {loading ? (
        <div className="bg-white rounded-xl border border-gray-100 p-10 text-center"><Loader2 size={22} className="mx-auto animate-spin text-torg-blue mb-2" /><p className="text-sm text-torg-gray">Carregando marcas…</p></div>
      ) : erro ? (
        <div className="bg-white rounded-xl border border-red-100 p-6"><div className="flex items-start gap-2 text-red-600 text-sm"><AlertCircle size={16} className="mt-0.5" /><div><p className="font-medium">Erro ao carregar</p><p className="text-xs mt-1">{erro}</p></div></div></div>
      ) : dados && (
        <>
          <div className="mb-5">
            <h1 className="text-xl font-bold text-torg-dark flex items-center gap-2 flex-wrap">
              <Ruler size={20} className="text-torg-blue" />
              <span className="font-mono">{dados.op.opNumero}</span>
              {dados.op.numero && <span className="text-sm font-semibold text-torg-gray bg-gray-100 rounded px-2 py-0.5">OP {dados.op.numero}</span>}
            </h1>
            <p className="text-sm text-torg-gray mt-1">{dados.op.cliente || "—"}{dados.op.obra ? ` · ${dados.op.obra}` : ""}</p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
            <Card label="Marcas" valor={fmtNum(dados.resumo.nMarcas)} sub={`${fmtNum(dados.resumo.nConjuntos)} conj. · ${fmtNum(dados.resumo.nCroquis)} croquis`} />
            <Card label="Peso modelado" valor={fmtKg(dados.resumo.pesoModeladoKg)} sub={dados.resumo.areaPinturaM2 ? `${fmtNum(dados.resumo.areaPinturaM2)} m² pintura` : "Tekla/LPC"} />
            <Card label="Produzido" valor={`${dados.resumo.pct}%`} sub={fmtKg(dados.resumo.pesoProduzidoKg)} cor={dados.resumo.pct >= 90 ? "#12855B" : dados.resumo.pct >= 40 ? "#006EAB" : "#B26A00"} />
            <Card label="Qualidade do dado" valor={dados.resumo.semGrade + dados.resumo.semPerfil === 0 ? "OK" : `${dados.resumo.semGrade + dados.resumo.semPerfil} ✎`}
              sub={dados.resumo.semGrade + dados.resumo.semPerfil === 0 ? "grade e perfil completos" : `${dados.resumo.semGrade} s/ grade · ${dados.resumo.semPerfil} s/ perfil`}
              cor={dados.resumo.semGrade + dados.resumo.semPerfil === 0 ? "#12855B" : "#B26A00"} alerta={dados.resumo.semGrade + dados.resumo.semPerfil > 0} />
          </div>

          {/* Filtro por status (funil de produção) */}
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <button onClick={() => setFiltroStatus("")} className={`text-xs px-2.5 py-1 rounded-full border font-semibold ${!filtroStatus ? "bg-torg-blue text-white border-torg-blue" : "bg-white text-torg-gray border-gray-200 hover:border-gray-300"}`}>Todas ({fmtNum(dados.resumo.nMarcas)})</button>
            {dados.porStatus.map((s) => (
              <button key={s.status} onClick={() => setFiltroStatus(filtroStatus === String(s.status).toUpperCase() ? "" : String(s.status).toUpperCase())}
                className={`text-xs px-2.5 py-1 rounded-full border font-semibold ${filtroStatus === String(s.status).toUpperCase() ? "bg-torg-blue text-white border-torg-blue" : "bg-white text-torg-gray border-gray-200 hover:border-gray-300"}`}>
                {s.status || "—"} ({fmtNum(s.n)})
              </button>
            ))}
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar marca, perfil, descrição…"
              className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 ml-auto w-56 focus:outline-none focus:ring-2 focus:ring-torg-blue/30" />
          </div>

          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50/60">
                  <tr>
                    <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase">Marca</th>
                    <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase">Descrição</th>
                    <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase">Perfil</th>
                    <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase">Grade</th>
                    <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-gray-500 uppercase">Qte</th>
                    <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-gray-500 uppercase">Peso</th>
                    <th className="px-4 py-2.5 text-center text-[11px] font-semibold text-gray-500 uppercase">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {marcas.slice(0, 800).map((m) => (
                    <tr key={m.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 font-mono font-semibold text-torg-dark whitespace-nowrap">{m.marca}{m.tipoPeca === "CONJUNTO" && <span className="ml-1.5 text-[9px] font-bold text-torg-blue bg-torg-blue-50 rounded px-1">CJ</span>}</td>
                      <td className="px-4 py-2.5 text-torg-dark max-w-[240px] truncate" title={m.descricao || ""}>{m.descricao || "—"}</td>
                      <td className="px-4 py-2.5 font-mono text-xs text-torg-gray whitespace-nowrap">{m.perfil || <span className="text-amber-600">— s/ perfil</span>}</td>
                      <td className="px-4 py-2.5 text-xs whitespace-nowrap">{m.material || <span className="text-amber-600">— s/ grade</span>}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{fmtNum(m.qte)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-torg-dark">{fmtKg(Math.round(m.pesoTotalKg))}</td>
                      <td className="px-4 py-2.5 text-center whitespace-nowrap"><span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full border ${statusChip(m.status)}`}>{m.status || "—"}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {marcas.length > 800 && <p className="text-[11px] text-torg-gray px-4 py-2.5 border-t border-gray-50">Mostrando 800 de {fmtNum(marcas.length)} — refine com a busca ou o filtro de status.</p>}
            {dados.resumo.truncado && <p className="text-[11px] text-amber-700 px-4 py-2 bg-amber-50 border-t border-amber-100">Esta OP tem mais de 3.000 marcas; os totais acima são exatos, mas a lista mostra as 3.000 mais pesadas.</p>}
          </div>
        </>
      )}
    </div>
  );
}

function Card({ label, valor, sub, cor, alerta }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
      <div className="flex items-center gap-1.5 text-torg-gray">{alerta && <AlertTriangle size={13} className="text-amber-600" />}<span className="text-[11px] uppercase tracking-wide font-semibold">{label}</span></div>
      <p className="text-2xl font-extrabold tabular-nums mt-1.5 text-torg-dark" style={cor ? { color: cor } : undefined}>{valor}</p>
      {sub && <p className="text-[11px] text-torg-gray mt-0.5">{sub}</p>}
    </div>
  );
}
