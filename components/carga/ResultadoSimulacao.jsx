"use client";
// Resultado de uma simulação de carga: resumo, avisos e a lista de volumes da carga escolhida.
import { AlertTriangle, Package, Truck } from "lucide-react";

const fmtKg = (v) => `${Math.round(v || 0).toLocaleString("pt-BR")} kg`;
const TIPO_COR = { "caixa de madeira": "bg-amber-100 text-amber-900", "feixe cintado": "bg-blue-100 text-blue-900", "pacote de guarda-corpo cintado": "bg-emerald-100 text-emerald-900", "pacote de grade cintado": "bg-teal-100 text-teal-900", "pacote de degraus cintado": "bg-lime-100 text-lime-900", "peça solta calçada": "bg-gray-100 text-gray-800" };

export function ResumoSimulacao({ resultado, cargaSel, onCarga }) {
  const r = resultado, cargas = r.cargas || [];
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {cargas.map((c, i) => (
          <button key={i} onClick={() => onCarga(i)} className={`text-left rounded-lg border px-3 py-2 min-w-[210px] ${cargaSel === i ? "border-torg-blue bg-torg-blue-50" : "border-gray-200 bg-white hover:border-torg-blue"}`}>
            <div className="text-[12px] font-bold text-torg-dark inline-flex items-center gap-1.5"><Truck size={14} className="text-torg-blue" /> {cargas.length > 1 ? `Carga ${i + 1} · ` : ""}{c.veiculo?.nome}</div>
            <div className="text-[11px] text-torg-gray mt-0.5">{fmtKg(c.peso)} · {Math.round(100 * c.peso / (c.veiculo?.pesoMax || 1))} % do veículo · altura {(c.altura / 1000).toFixed(2).replace(".", ",")} m · chão {c.chao} %</div>
            <div className="text-[11px] text-torg-gray">{c.volumes} volumes · {c.itens?.length ? c.itens.reduce((t, u) => t + (u.membros?.length || 1), 0) : 0} peças · ≈ {c.tempo?.minutos} min de carregamento</div>
          </button>
        ))}
      </div>
      {cargas.length > 1 && (
        <p className="text-[12px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 inline-flex items-start gap-2"><AlertTriangle size={14} className="mt-0.5 shrink-0" /><span><b>Não cabe num veículo só:</b> a lista pede {cargas.length} cargas. Tire peças do romaneio ou passe parte para o próximo, e simule de novo.</span></p>
      )}
      {r.estimadas?.length > 0 && (
        <p className="text-[12px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2"><b>Medidas estimadas pelo peso</b> (não estão no IFC da obra; conferir no pátio): {r.estimadas.map((e) => `${e.marca} ${Math.round(e.C / 10)}×${Math.round(e.L / 10)}×${Math.round(e.A / 10)} cm`).join(", ")}</p>
      )}
      {(r.resumo?.especiais > 0 || r.resumo?.semLugar?.length > 0 || r.semCaixa?.length > 0) && (
        <div className="text-[12px] text-red-800 bg-red-50 border border-red-200 rounded-lg px-3 py-2 space-y-1">
          {r.especiais?.map((e) => <div key={e.id}><b>Transporte especial:</b> {e.rotulo} — {e.aviso}</div>)}
          {r.resumo?.semLugar?.map((s, i) => <div key={i}><b>Sem lugar:</b> {s}</div>)}
          {r.semCaixa?.length > 0 && <div><b>Sem peso e sem geometria ({r.semCaixa.length} pç, ficaram fora):</b> {[...new Set(r.semCaixa.map((s) => s.marca))].join(", ")}</div>}
        </div>
      )}
    </div>
  );
}

export function VolumesDaCarga({ carga }) {
  const rom = carga?.romaneio || [];
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-3 py-2 border-b border-gray-100 text-[12px] font-bold text-torg-dark inline-flex items-center gap-1.5"><Package size={14} className="text-torg-blue" /> Volumes desta carga <span className="font-normal text-torg-gray">· {rom.length} volumes · madeira: {carga?.madeira?.pecas?.caibro || 0} caibros, {carga?.madeira?.pecas?.sarrafo || 0} sarrafos, {carga?.madeira?.pecas?.tabua || 0} tábuas (peças de 3 m)</span></div>
      <div className="max-h-72 overflow-y-auto">
        <table className="w-full text-[12px]">
          <thead className="bg-gray-50/60 sticky top-0 text-torg-gray"><tr>
            <th className="text-left px-3 py-1 font-medium w-12">Vol.</th><th className="text-left px-2 py-1 font-medium w-40">Tipo</th><th className="text-left px-2 py-1 font-medium">Conteúdo</th>
            <th className="text-right px-2 py-1 font-medium w-12">Pç</th><th className="text-right px-2 py-1 font-medium w-20">kg</th><th className="text-right px-2 py-1 font-medium w-32">C×L×A (cm)</th><th className="text-right px-3 py-1 font-medium w-16">Camada</th>
          </tr></thead>
          <tbody className="divide-y divide-gray-50">
            {rom.map((v) => { const u = carga.itens.find((x) => x.id === v.id); return (
              <tr key={v.volume}>
                <td className="px-3 py-1 font-mono font-bold text-torg-dark">{v.volume}</td>
                <td className="px-2 py-1"><span className={`px-1.5 py-0.5 rounded text-[11px] ${TIPO_COR[v.tipo] || "bg-gray-100 text-gray-800"}`}>{v.tipo}</span></td>
                <td className="px-2 py-1 text-torg-dark">{(() => { const g = new Map(); for (const m of u?.membros || []) g.set(m.marca, (g.get(m.marca) || 0) + 1); return [...g].map(([k, n]) => `${k}${n > 1 ? ` ×${n}` : ""}`).join(", "); })()}</td>
                <td className="px-2 py-1 text-right tabular-nums">{v.pecas}</td>
                <td className="px-2 py-1 text-right tabular-nums">{v.kgBruto.toLocaleString("pt-BR")}</td>
                <td className="px-2 py-1 text-right tabular-nums whitespace-nowrap">{v.dimsCm.join(" × ")}</td>
                <td className="px-3 py-1 text-right tabular-nums">{(u?.camada || 0) + 1}</td>
              </tr>); })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
