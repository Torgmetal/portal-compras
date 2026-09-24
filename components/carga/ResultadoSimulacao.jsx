"use client";
// Leitura da carga escolhida, pendências de conferência e volumes para separação.
import { useState } from "react";
import { AlertTriangle, Package, Truck, Search, X, Check, Layers, Clock3, Ruler, ChevronDown, ArrowLeftToLine } from "lucide-react";
import { textoTravamento } from "@/lib/carga/travamento";

const fmtKg = (v) => `${Math.round(v || 0).toLocaleString("pt-BR")} kg`;
const metros = (v) => `${((v || 0) / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} m`;
const TIPO_COR = { "caixa de madeira": "bg-amber-50 text-amber-900", "feixe cintado": "bg-blue-50 text-blue-900", "pacote de guarda-corpo cintado": "bg-emerald-50 text-emerald-900", "pacote de grade cintado": "bg-teal-50 text-teal-900", "pacote de degraus cintado": "bg-lime-50 text-lime-900", "peça solta calçada": "bg-gray-100 text-gray-800" };

function Ocupacao({ titulo, valor, detalhe }) {
  return <div>
    <div className="flex justify-between items-baseline gap-2 text-sm"><span className="text-torg-gray">{titulo}</span><strong className="text-torg-dark tabular-nums">{valor == null ? "—" : `${valor}%`}</strong></div>
    <div className="h-2 rounded-full bg-slate-100 mt-2 overflow-hidden"><div className={`h-full rounded-full ${valor > 100 ? "bg-red-500" : "bg-torg-blue"}`} style={{ width: `${Math.min(100, Math.max(0, valor || 0))}%` }} /></div>
    <p className="text-xs text-torg-gray mt-1.5">{detalhe}</p>
  </div>;
}

export function ResumoSimulacao({ resultado, cargaSel, onCarga }) {
  const cargas = resultado.cargas || [], c = cargas[cargaSel];
  const [detalhes, setDetalhes] = useState(false);
  return (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden h-fit">
      <div className="px-5 py-4 border-b border-slate-100">
        <p className="text-xs font-semibold text-torg-gray uppercase tracking-wider">Veículos da simulação</p>
        <h3 className="text-xl font-bold text-torg-dark mt-1">{cargas.length} {cargas.length === 1 ? "carga planejada" : "cargas planejadas"}</h3>
      </div>
      <div className="p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-2 max-h-64 overflow-y-auto">
        {cargas.map((v, i) => <button key={i} onClick={() => onCarga(i)} aria-pressed={cargaSel === i} className={`w-full min-w-0 text-left rounded-xl border p-3 transition-colors focus-visible:ring-2 focus-visible:ring-torg-blue ${cargaSel === i ? "border-torg-blue bg-torg-blue-50" : "border-slate-200 hover:bg-slate-50"}`}>
          <span className="flex items-center gap-2 text-sm font-semibold text-torg-dark"><Truck size={18} className="shrink-0 text-torg-blue" /><span className="flex-1">Carga {i + 1} <span className="font-normal text-torg-gray">/ {cargas.length}</span></span>{cargaSel === i && <Check size={17} className="text-torg-blue" />}</span>
          <span className="block font-bold text-torg-dark mt-2">{v.veiculo?.nome || "Veículo"}</span>
          <span className="block text-xs text-torg-gray mt-1">{fmtKg(v.peso)} · {v.volumes} volumes</span>
        </button>)}
      </div>
      {c ? <div className="p-5 border-t border-slate-100 space-y-5">
        <div className="grid grid-cols-2 gap-5 lg:grid-cols-1">
          <Ocupacao titulo="Capacidade de peso" valor={c.veiculo?.pesoMax ? Math.round(100 * c.peso / c.veiculo.pesoMax) : null} detalhe={`${fmtKg(c.peso)} de ${fmtKg(c.veiculo?.pesoMax)}`} />
          <Ocupacao titulo="Piso ocupado" valor={c.chao ?? null} detalhe="Área utilizada da carroceria" />
        </div>
        <button onClick={() => setDetalhes((v) => !v)} aria-expanded={detalhes} className="lg:hidden min-h-11 w-full text-sm text-torg-blue font-semibold flex items-center justify-between">Detalhes do veículo e da carga<ChevronDown size={17} className={detalhes ? "rotate-180" : ""} /></button>
        <div className={`${detalhes ? "block" : "hidden lg:block"} space-y-5`}>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-5 text-sm">
          {[[Ruler, "Altura da carga", metros(c.altura)], [Layers, "Camadas", c.camadas ?? new Set((c.itens || []).map((u) => u.camada || 0)).size], [Package, "Peças", (c.itens || []).reduce((t, u) => t + (u.membros?.length || 1), 0)], [Clock3, "Tempo estimado", c.tempo?.minutos == null ? "—" : `${c.tempo.minutos} min`]].map(([Icon, label, value]) => <div key={label}><dt className="text-xs text-torg-gray flex items-center gap-1.5"><Icon size={14} />{label}</dt><dd className="font-semibold text-torg-dark mt-1 text-base">{value}</dd></div>)}
        </dl>
        <div className="rounded-lg bg-slate-50 p-3 text-xs text-torg-gray leading-relaxed"><span className="font-semibold text-torg-dark block">Medidas úteis do veículo</span>{metros(c.veiculo?.C)} × {metros(c.veiculo?.L)} × {metros(c.veiculo?.alturaUtil)}<span className="block">comprimento × largura × altura</span></div>
        </div>
      </div> : <p className="p-5 text-sm text-torg-gray">Nenhuma carga foi montada. Confira as pendências da simulação.</p>}
    </section>
  );
}

export function AvisosSimulacao({ resultado: r }) {
  const cargas = r.cargas || [];
  return <div className="space-y-3 text-sm">
    {cargas.length > 1 && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex items-start gap-3 text-amber-900"><AlertTriangle size={19} className="shrink-0 mt-0.5" /><div><b>A lista precisa de {cargas.length} veículos.</b><p className="mt-1">Para usar um só, transfira parte das peças para outro romaneio e simule novamente.</p></div></div>}
    {r.estimadas?.length > 0 && <details className="rounded-xl border border-amber-200 bg-amber-50 text-amber-900">
      <summary className="p-4 cursor-pointer font-semibold">Conferir medidas no pátio · {r.estimadas.length} marcas com estimativa</summary>
      <div className="px-4 pb-4"><p className="mb-3">Estas marcas não estão no IFC. A embalagem foi estimada pelo peso.</p><ul className="space-y-2 max-h-56 overflow-y-auto">{r.estimadas.map((e) => <li key={e.marca} className="border-t border-amber-200 pt-2"><b>{e.marca}</b> · {e.desc || "Sem descrição"}<span className="block text-xs mt-1">{fmtKg(e.kg)} · estimativa {Math.round(e.C / 10)} × {Math.round(e.L / 10)} × {Math.round(e.A / 10)} cm</span></li>)}</ul></div>
    </details>}
    {(r.especiais?.length > 0 || r.resumo?.semLugar?.length > 0 || r.semCaixa?.length > 0) && <div role="alert" className="text-red-800 bg-red-50 border border-red-200 rounded-xl p-4 space-y-2">
      <p className="font-bold flex items-center gap-2"><AlertTriangle size={18} /> Pendências para fechar a carga</p>{r.especiais?.length>0&&<p>Estes volumes não estão nos veículos simulados. Planejamento e transportadora devem definir veículo, apoios, amarração e necessidade de AET antes do embarque.</p>}
      {r.especiais?.map((e) => <p key={e.id}><b>Transporte especial:</b> {e.rotulo} — {e.aviso}</p>)}
      {r.resumo?.semLugar?.map((s, i) => <p key={i}><b>Sem lugar:</b> {s}</p>)}
      {r.semCaixa?.length > 0 && <p><b>Fora da carga, sem peso e sem geometria ({r.semCaixa.length} peças):</b> {[...new Set(r.semCaixa.map((s) => s.marca))].join(", ")}</p>}
    </div>}
  </div>;
}

export function VolumesDaCarga({ carga, onAjustar, ajustes }) {
  const [busca, setBusca] = useState("");
  const rom = carga?.romaneio || [], itens = new Map((carga?.itens || []).map((u) => [u.id, u]));
  // o romaneio leva o travamento; o item cobre a montagem editada à mão antes de ir ao romaneio
  const trav = (v) => v.travamento || itens.get(v.id)?.travamento || null;
  const nTrav = (tipo) => rom.filter((v) => trav(v)?.tipo === tipo).length;
  const q = busca.trim().toLocaleLowerCase("pt-BR");
  const filtrados = rom.filter((v) => !q || [v.volume, v.tipo, v.rotulo, ...(v.marcas || []), ...(itens.get(v.id)?.membros || []).flatMap((m) => [m.marca, m.desc])].join(" ").toLocaleLowerCase("pt-BR").includes(q));
  const marcas = (v) => {
    const grupo = new Map();
    for (const m of itens.get(v.id)?.membros || []) grupo.set(m.marca, { n: (grupo.get(m.marca)?.n || 0) + 1, desc: m.desc });
    if (!grupo.size) for (const m of v.marcas || []) grupo.set(m, { n: 1 });
    return <div className="flex flex-wrap gap-1.5">{[...grupo].map(([m, d]) => <span key={m} className="inline-flex items-center gap-1">{onAjustar ? <button onClick={() => onAjustar(m, d.desc)} className={`min-h-9 border rounded-md px-2 text-sm hover:border-torg-blue hover:bg-torg-blue-50 ${ajustes?.[m] ? "border-torg-blue-200 text-torg-blue font-semibold bg-torg-blue-50" : "border-slate-200 text-torg-dark"}`} title="Ajustar esta marca">{m}</button> : m}{d.n > 1 && <span className="text-xs text-torg-gray">×{d.n}</span>}</span>)}</div>;
  };
  return (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex-1"><h3 className="text-base font-bold text-torg-dark flex items-center gap-2"><Package size={19} className="text-torg-blue" /> Volumes desta carga <span className="text-xs font-semibold rounded-full bg-slate-100 px-2 py-1">{rom.length}</span></h3><p className="text-xs text-torg-gray mt-1">Localize as peças para separar. Toque na marca para ajustar a embalagem.</p></div>
        <div className="relative w-full sm:w-64"><Search size={17} className="absolute left-3 top-3.5 text-torg-gray" /><input type="search" aria-label="Buscar volume ou marca" placeholder="Buscar volume ou marca" value={busca} onChange={(e) => setBusca(e.target.value)} className="w-full min-h-11 rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-torg-blue/30" />{busca && <button onClick={() => setBusca("")} aria-label="Limpar busca" className="absolute right-0 top-0 w-10 h-11 flex items-center justify-center text-torg-gray"><X size={16} /></button>}</div>
      </div>
      <div className="max-h-[520px] overflow-auto">
        <table className="w-full text-sm max-sm:block">
          <thead className="bg-gray-50/60 sticky top-0 text-torg-gray max-sm:hidden"><tr>{["Volume / embalagem", "Marcas e quantidades", "Peças", "Peso bruto", "C × L × A (cm)", "Camada"].map((h, i) => <th key={h} className={`px-4 py-3 font-medium whitespace-nowrap ${i < 2 ? "text-left" : "text-right"}`}>{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-gray-100 max-sm:block">
            {filtrados.map((v) => <tr key={v.volume} className="hover:bg-slate-50/60 max-sm:block max-sm:p-4">
              <td className="px-4 py-3 max-sm:p-0 max-sm:block"><b className="text-torg-dark">Volume {String(v.volume).padStart(2, "0")}</b><span className={`block w-fit mt-1.5 px-2 py-1 rounded-md text-xs ${TIPO_COR[v.tipo] || "bg-gray-100 text-gray-800"}`}>{v.tipo}</span>{trav(v) && <span className={`flex w-fit max-w-[18rem] items-start gap-1 mt-1.5 px-2 py-1 rounded-md text-xs font-medium ${trav(v).tipo === "escorar" ? "bg-amber-50 text-amber-900" : "bg-red-50 text-red-800"}`}><ArrowLeftToLine size={14} className="shrink-0 mt-px" aria-hidden="true" />{textoTravamento(trav(v), (id) => itens.get(id)?.volume)}</span>}</td>
              <td className="px-4 py-3 max-sm:px-0 max-sm:block">{marcas(v)}</td>
              <td className="px-4 py-3 text-right tabular-nums text-torg-dark max-sm:inline-block max-sm:pl-0 max-sm:py-1"><span className="sm:hidden text-torg-gray mr-1">Peças:</span>{v.pecas}</td>
              <td className="px-4 py-3 text-right tabular-nums text-torg-dark whitespace-nowrap max-sm:inline-block max-sm:pl-0 max-sm:py-1">{fmtKg(v.kgBruto)}</td>
              <td className="px-4 py-3 text-right tabular-nums text-torg-gray whitespace-nowrap max-sm:block max-sm:p-0 max-sm:text-left max-sm:mt-2">{v.dimsCm?.join(" × ")}<span className="sm:hidden"> cm</span></td>
              <td className="px-4 py-3 text-right text-torg-dark max-sm:block max-sm:p-0 max-sm:text-left max-sm:mt-2"><span className="sm:hidden text-torg-gray">Camada </span>{(itens.get(v.id)?.camada || 0) + 1}</td>
            </tr>)}
          </tbody>
        </table>
        {!filtrados.length && <p className="p-8 text-center text-sm text-torg-gray">{q ? "Nenhum volume encontrado." : "Esta carga ainda não tem volumes."}</p>}
      </div>
      <div className="px-4 sm:px-5 py-3 bg-slate-50 border-t border-slate-100 text-xs text-torg-gray flex flex-wrap gap-x-5 gap-y-2">
        <b className="text-torg-dark">Madeira para esta carga</b><span>{carga?.madeira?.pecas?.caibro || 0} caibros</span><span>{carga?.madeira?.pecas?.sarrafo || 0} sarrafos</span><span>{carga?.madeira?.pecas?.tabua || 0} tábuas</span><span>Peças de 3 m</span>
        {(nTrav("escorar") > 0 || nTrav("amarrar") > 0) && <span className="basis-full flex flex-wrap gap-x-3 gap-y-1"><b className="text-torg-dark">Travar para a frente</b>{nTrav("escorar") > 0 && <span className="text-amber-900">{nTrav("escorar")} {nTrav("escorar") === 1 ? "volume escorado" : "volumes escorados"} (caibros já na conta)</span>}{nTrav("amarrar") > 0 && <span className="text-red-800">{nTrav("amarrar")} {nTrav("amarrar") === 1 ? "volume amarrado" : "volumes amarrados"} com cinta e catraca</span>}</span>}
      </div>
    </section>
  );
}
