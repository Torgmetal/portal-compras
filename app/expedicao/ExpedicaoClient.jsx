"use client";
import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { fmtOP } from "@/lib/utils";
import { Loader2, X, ClipboardList, ArrowRight, PackageCheck, Truck, Clock } from "lucide-react";
import RomaneiosSharepoint from "@/components/RomaneiosSharepoint";

const fmtKg = (v) =>
  v != null ? `${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} kg` : "—";
const fmtData = (d) => (d ? new Date(d).toLocaleDateString("pt-BR") : "—");

export default function ExpedicaoClient({ ops }) {
  const [filtroOp, setFiltroOp] = useState("");

  // Fila de pré-romaneios (RomaneioPrevio) que o Planejamento cria dentro da OP.
  // É o mesmo que a Expedição vê dentro do módulo OPs, reunido aqui.
  const [previos, setPrevios] = useState(null); // null = carregando
  const [erroPrevios, setErroPrevios] = useState("");
  useEffect(() => {
    let vivo = true;
    fetch("/api/expedicao/romaneios-previos")
      .then((r) => r.json())
      .then((j) => { if (!vivo) return; if (j.success) setPrevios(j.previos); else { setPrevios([]); setErroPrevios(j.error || "Erro"); } })
      .catch(() => { if (vivo) { setPrevios([]); setErroPrevios("Erro ao carregar"); } });
    return () => { vivo = false; };
  }, []);

  const previosFiltrados = useMemo(() => {
    const lista = previos || [];
    return filtroOp ? lista.filter((p) => p.opId === filtroOp) : lista;
  }, [previos, filtroOp]);

  // Indicadores da aba (fila + expedidos na semana/mês + atrasados)
  const [ind, setInd] = useState(null);
  useEffect(() => {
    let vivo = true;
    fetch("/api/expedicao/indicadores")
      .then((r) => r.json())
      .then((j) => { if (vivo && j.success) setInd(j.indicadores); })
      .catch(() => {});
    return () => { vivo = false; };
  }, []);

  return (
    <div className="space-y-6 max-w-7xl">
      <div>
        <h2 className="text-3xl font-extrabold text-torg-dark tracking-tight">
          Portal de Expedição
        </h2>
        <p className="text-sm text-torg-gray mt-1">
          Romaneios de saída — cargas montadas no Planejamento e romaneios por OP.
        </p>
      </div>

      {/* Indicadores */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Kpi label="Aguardando emissão" value={ind ? String(ind.pendentes.qtd) : "—"} sub={ind ? fmtKg(ind.pendentes.pesoKg) : ""} color="bg-torg-orange" Icon={ClipboardList} />
        <Kpi label="Romaneios emitidos (semana)" value={ind ? String(ind.semana.qtd) : "—"} sub={ind ? fmtKg(ind.semana.pesoKg) : ""} color="bg-torg-blue" Icon={Truck} />
        <Kpi label="Romaneios emitidos (mês)" value={ind ? String(ind.mes.qtd) : "—"} sub={ind ? fmtKg(ind.mes.pesoKg) : ""} color="bg-emerald-600" Icon={PackageCheck} />
        <Kpi label="Atrasados" value={ind ? String(ind.atrasados.qtd) : "—"} sub="previsão vencida" color={ind && ind.atrasados.qtd > 0 ? "bg-red-600" : "bg-torg-gray"} Icon={Clock} />
      </div>

      {/* Filtro */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex items-center gap-3 flex-wrap">
        <label className="text-sm text-torg-gray">Filtrar por OP:</label>
        <select
          value={filtroOp}
          onChange={(e) => setFiltroOp(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
        >
          <option value="">Todas as OPs</option>
          {ops.map((o) => (
            <option key={o.id} value={o.id}>{o.numero} — {o.cliente}</option>
          ))}
        </select>
        {filtroOp && (
          <button
            onClick={() => setFiltroOp("")}
            className="text-xs text-torg-blue hover:text-torg-blue-700 inline-flex items-center gap-1"
          >
            <X size={12} /> Limpar
          </button>
        )}
        <span className="text-xs text-torg-gray ml-auto">
          {previosFiltrados.length} pré-romaneio{previosFiltrados.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Pré-romaneios do Planejamento (fila da Expedição) */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="text-lg font-semibold text-torg-dark flex items-center gap-2">
              <ClipboardList size={18} className="text-torg-blue" /> Pré-romaneios do Planejamento
            </h3>
            <p className="text-xs text-torg-gray mt-0.5">
              Cargas montadas pelo Planejamento dentro da OP. Clique em "Abrir na OP" para emitir o romaneio (FORM 22).
            </p>
          </div>
          {previosFiltrados.length > 0 && (
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 whitespace-nowrap">
              {previosFiltrados.length} aguardando emissão
            </span>
          )}
        </div>
        {previos === null ? (
          <p className="px-6 py-8 text-sm text-torg-gray text-center inline-flex items-center gap-2 justify-center w-full">
            <Loader2 size={16} className="animate-spin" /> Carregando pré-romaneios…
          </p>
        ) : erroPrevios ? (
          <p className="px-6 py-8 text-sm text-red-600 text-center">{erroPrevios}</p>
        ) : previosFiltrados.length === 0 ? (
          <p className="px-6 py-8 text-sm text-torg-gray text-center">
            Nenhum pré-romaneio {filtroOp ? "pra essa OP" : "pendente"}. Eles aparecem aqui assim que o Planejamento monta uma carga na OP.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50/60">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Nº</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">OP / Cliente</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Marcas</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Peso</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Data prev.</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Situação</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {previosFiltrados.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 font-mono text-torg-dark text-xs whitespace-nowrap">
                      R{String(p.numero).padStart(2, "0")}
                    </td>
                    <td className="px-4 py-2 text-xs">
                      <span className="font-mono text-torg-blue">{fmtOP(p.op?.numero)}</span>
                      <span className="text-torg-gray block text-[10px] truncate max-w-[220px]">{p.op?.cliente}{p.op?.obra ? ` — ${p.op.obra}` : ""}</span>
                    </td>
                    <td className="px-4 py-2 text-right text-torg-gray tabular-nums text-xs">{p.itensCount}</td>
                    <td className="px-4 py-2 text-right text-torg-dark font-medium tabular-nums">{fmtKg(p.pesoKg)}</td>
                    <td className="px-4 py-2 text-xs text-torg-gray whitespace-nowrap">{p.dataPrevista ? fmtData(p.dataPrevista) : "—"}</td>
                    <td className="px-4 py-2"><SituacaoBadge p={p} /></td>
                    <td className="px-4 py-2 text-right whitespace-nowrap">
                      <Link href={`/expedicao/op?op=${p.opId}`}
                        className="text-xs font-semibold text-white bg-torg-blue hover:bg-torg-dark px-2.5 py-1 rounded-lg inline-flex items-center gap-1">
                        Abrir na OP <ArrowRight size={12} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Romaneios do SharePoint (marcas e pesos) */}
      <div>
        <h3 className="text-lg font-semibold text-torg-dark mb-3">Romaneios SharePoint (por OP)</h3>
        <p className="text-xs text-torg-gray mb-4">
          Selecione uma OP para visualizar os romaneios com marcas e pesos detalhados.
        </p>
        <RomaneiosSharepoint ops={ops} />
      </div>
    </div>
  );
}

function Kpi({ label, value, sub, color, Icon }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex items-center gap-3">
      <div className={`${color} p-2.5 rounded-lg`}><Icon size={20} className="text-white" /></div>
      <div className="min-w-0">
        <p className="text-xs text-torg-gray truncate">{label}</p>
        <p className="text-xl font-extrabold text-torg-dark tabular-nums truncate">{value}</p>
        {sub && <p className="text-[10px] text-torg-gray truncate">{sub}</p>}
      </div>
    </div>
  );
}

function SituacaoBadge({ p }) {
  if (p.situacao === "APROVADO") {
    return <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-torg-blue-50 text-torg-blue border border-torg-blue-100 whitespace-nowrap">Liberado</span>;
  }
  return <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 whitespace-nowrap">Em aberto</span>;
}
