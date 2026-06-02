"use client";
import { useState, useMemo, useEffect } from "react";
import { FileText, RefreshCw, Clock, Search, Loader2, AlertCircle, ArrowUp, ArrowDown, ChevronsUpDown } from "lucide-react";

const fmtMoeda = (v) =>
  v != null ? Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";
const fmtData = (d) => (d ? new Date(d).toLocaleDateString("pt-BR") : "—");

export default function FaturamentoClient() {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro]       = useState("");
  const [busca, setBusca]     = useState("");
  const [soAFaturar, setSoAFaturar] = useState(false);
  const [expandida, setExpandida] = useState(null);
  // Ordenação: campo + direção. Default = mais a faturar primeiro (igual ao backend).
  const [ordenarPor, setOrdenarPor] = useState("aFaturar");
  const [direcao, setDirecao] = useState("desc");

  const clicarOrdenar = (campo) => {
    if (ordenarPor === campo) {
      setDirecao((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setOrdenarPor(campo);
      // texto começa A→Z; números começam do maior pro menor
      setDirecao(campo === "projeto" ? "asc" : "desc");
    }
  };

  const carregar = async (forcar = false) => {
    setLoading(true); setErro("");
    try {
      const res = await fetch(`/api/financeiro/pedidos-venda${forcar ? "?forcar=1" : ""}`);
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Erro");
      setData(d);
    } catch (e) { setErro(e.message); } finally { setLoading(false); }
  };
  useEffect(() => { carregar(false); }, []);

  const obras = useMemo(() => {
    if (!data?.obras) return [];
    let base = data.obras;
    if (soAFaturar) base = base.filter((o) => o.aFaturar > 0);
    const t = busca.trim().toLowerCase();
    if (t) base = base.filter((o) => (o.projeto || "").toLowerCase().includes(t));

    const fator = direcao === "asc" ? 1 : -1;
    const ordenada = [...base].sort((a, b) => {
      if (ordenarPor === "projeto") {
        return fator * String(a.projeto || "").localeCompare(String(b.projeto || ""), "pt-BR", { numeric: true });
      }
      const va = Number(a[ordenarPor] || 0), vb = Number(b[ordenarPor] || 0);
      return fator * (va - vb);
    });
    return ordenada;
  }, [data, busca, soAFaturar, ordenarPor, direcao]);

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-3xl font-extrabold text-torg-dark tracking-tight flex items-center gap-2">
            <FileText size={26} className="text-torg-blue" /> Faturamento por obra
          </h2>
          <p className="text-sm text-torg-gray mt-1">
Vendas de produto + Ordens de Serviço do Omie por obra: quanto já foi faturado e quanto falta. A tag mostra se a obra tem venda, serviço ou os dois.
            {data?.atualizadoEm && ` Atualizado ${fmtData(data.atualizadoEm)} ${new Date(data.atualizadoEm).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}.`}
          </p>
        </div>
        <button onClick={() => carregar(true)} disabled={loading}
          className="px-3 py-2 text-sm border border-gray-300 text-torg-gray rounded-lg hover:bg-gray-50 inline-flex items-center gap-2 disabled:opacity-50">
          {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Atualizar
        </button>
      </div>

      {/* KPIs */}
      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl shadow-sm border border-green-100 p-4">
            <p className="text-xs text-torg-gray">Já faturado</p>
            <p className="text-xl font-extrabold text-green-700 tabular-nums mt-1">{fmtMoeda(data.totalFaturado)}</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-amber-100 p-4">
            <p className="text-xs text-torg-gray">A faturar</p>
            <p className="text-xl font-extrabold text-amber-700 tabular-nums mt-1">{fmtMoeda(data.totalAFaturar)}</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-torg-blue-100 p-4">
            <p className="text-xs text-torg-gray">Total contratado</p>
            <p className="text-xl font-extrabold text-torg-blue tabular-nums mt-1">{fmtMoeda(data.totalContratado)}</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <p className="text-xs text-torg-gray">Obras</p>
            <p className="text-xl font-extrabold text-torg-dark tabular-nums mt-1">{data.totalObras}</p>
            <p className="text-[10px] text-red-600 mt-0.5">{data.obrasComAtraso} com atraso</p>
          </div>
        </div>
      )}

      {/* Filtros */}
      {data && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[220px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar obra/projeto…"
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-torg-blue focus:border-torg-blue" />
          </div>
          <button onClick={() => setSoAFaturar(v => !v)}
            className={`px-3 py-2 rounded-lg border text-sm inline-flex items-center gap-1.5 ${soAFaturar ? "bg-amber-500 text-white border-amber-500" : "bg-amber-50 text-amber-700 border-amber-200 hover:opacity-80"}`}>
            Só com a faturar
          </button>
        </div>
      )}

      {erro && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2 flex items-start gap-2">
          <AlertCircle size={14} className="mt-0.5 shrink-0" /> <span>{erro}</span>
        </div>
      )}

      {loading && !data ? (
        <div className="flex items-center justify-center gap-2 py-16 text-torg-gray">
          <Loader2 size={20} className="animate-spin" /> <span>Consultando pedidos no Omie… (pode levar ~40s na 1ª vez)</span>
        </div>
      ) : data && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50/60 border-b border-gray-100">
                <tr>
                  <Th campo="projeto"   label="Obra / Projeto" align="left"   {...{ ordenarPor, direcao, clicarOrdenar }} />
                  <Th campo="faturado"  label="Faturado"       align="right"  {...{ ordenarPor, direcao, clicarOrdenar }} />
                  <Th campo="aFaturar"  label="A faturar"      align="right"  {...{ ordenarPor, direcao, clicarOrdenar }} />
                  <Th campo="total"     label="Total"          align="right"  {...{ ordenarPor, direcao, clicarOrdenar }} />
                  <Th campo="pctFaturado" label="% Fat."       align="center" {...{ ordenarPor, direcao, clicarOrdenar }} />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {obras.map((o) => (
                  <FragmentObra key={o.codProj} obra={o} aberta={expandida === o.codProj}
                    onToggle={() => setExpandida(expandida === o.codProj ? null : o.codProj)} />
                ))}
                {obras.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-torg-gray text-sm">Nenhuma obra encontrada.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function Th({ campo, label, align, ordenarPor, direcao, clicarOrdenar }) {
  const ativo = ordenarPor === campo;
  const just = align === "right" ? "justify-end" : align === "center" ? "justify-center" : "justify-start";
  const txt = align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";
  const Icon = !ativo ? ChevronsUpDown : direcao === "asc" ? ArrowUp : ArrowDown;
  return (
    <th className={`px-4 py-3 ${txt} text-xs font-medium uppercase whitespace-nowrap select-none`}>
      <button onClick={() => clicarOrdenar(campo)}
        className={`inline-flex items-center gap-1 ${just} w-full hover:text-torg-blue transition-colors ${ativo ? "text-torg-blue" : "text-gray-500"}`}>
        {label}
        <Icon size={13} className={ativo ? "opacity-100" : "opacity-40"} />
      </button>
    </th>
  );
}

function TagTipo({ tipo }) {
  const cor = tipo === "Venda+Serviço" ? "bg-teal-100 text-teal-700 border-teal-200"
    : tipo === "Serviço" ? "bg-purple-100 text-purple-700 border-purple-200"
    : "bg-blue-100 text-blue-700 border-blue-200";
  return <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium whitespace-nowrap ${cor}`}>{tipo}</span>;
}

function FragmentObra({ obra, aberta, onToggle }) {
  return (
    <>
      <tr className={`hover:bg-gray-50 cursor-pointer ${obra.atrasado ? "bg-red-50/20" : ""}`} onClick={onToggle}>
        <td className="px-4 py-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-gray-400 transition-transform ${aberta ? "rotate-90" : ""}`}>▶</span>
            <span className="text-torg-dark font-medium">{obra.projeto}</span>
            <TagTipo tipo={obra.tipo} />
            {obra.atrasado && <Clock size={13} className="text-red-500" />}
          </div>
        </td>
        <td className="px-4 py-3 text-right tabular-nums text-green-700 font-semibold whitespace-nowrap">{fmtMoeda(obra.faturado)}</td>
        <td className={`px-4 py-3 text-right tabular-nums font-semibold whitespace-nowrap ${obra.aFaturar > 0 ? "text-amber-700" : "text-gray-400"}`}>{fmtMoeda(obra.aFaturar)}</td>
        <td className="px-4 py-3 text-right tabular-nums text-torg-dark font-bold whitespace-nowrap">{fmtMoeda(obra.total)}</td>
        <td className="px-4 py-3">
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-xs font-semibold text-torg-dark">{obra.pctFaturado}%</span>
            <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-green-500 rounded-full" style={{ width: `${obra.pctFaturado}%` }} />
            </div>
          </div>
        </td>
      </tr>
      {aberta && obra.pedidos.map((ped) => (
        <tr key={ped.numero} className="bg-gray-50/40">
          <td colSpan={5} className="px-4 py-2">
            <div className="pl-6">
              <div className="text-xs font-semibold text-torg-gray mb-1 flex items-center gap-1.5">
                <span className={`px-1.5 py-0.5 rounded text-[10px] ${ped.origem === "servico" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"}`}>
                  {ped.origem === "servico" ? "Serviço (OS)" : "Venda"}
                </span>
                #{ped.numero} — {ped.parcelas.length} parcela(s) · faturado {fmtMoeda(ped.faturado)} · a faturar {fmtMoeda(ped.aFaturar)}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {ped.parcelas.map((pc) => {
                  const cor = pc.situacao === "Cancelado" ? "bg-gray-100 text-gray-400 line-through border-gray-200"
                    : pc.situacao === "Faturado" ? "bg-green-50 text-green-700 border-green-200"
                    : pc.atrasado ? "bg-red-50 text-red-700 border-red-200"
                    : "bg-amber-50 text-amber-700 border-amber-200";
                  return (
                    <span key={pc.codigoPedido} className={`text-[11px] px-2 py-0.5 rounded border ${cor}`}
                      title={`Seq ${pc.sequencial} — ${pc.situacao}`}>
                      {ped.numero}/{pc.sequencial} · {fmtMoeda(pc.valor)} · {pc.situacao}
                    </span>
                  );
                })}
              </div>
            </div>
          </td>
        </tr>
      ))}
    </>
  );
}
