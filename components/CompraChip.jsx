"use client";
// Status de COMPRA do material da OP (mostrado na Preparação — o corte não começa sem material).
// Fonte: CMR do Almoxarifado (recebido) × RM do portal (solicitado). Clicar abre a
// RASTREABILIDADE completa: corrida/lote, certificado, NF, pedido, fornecedor. (Vitor 18/08.)
import { useState, useEffect } from "react";
import { X, Loader2, Package, AlertTriangle } from "lucide-react";

const ESTILO = {
  RECEBIDO_TOTAL: { label: "material recebido", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  PARCIAL: { label: "recebido parcial", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  AGUARDANDO_ENTREGA: { label: "aguardando entrega", cls: "bg-sky-50 text-sky-700 border-sky-200" },
  FALTA_COMPRAR: { label: "falta comprar", cls: "bg-red-50 text-red-700 border-red-200" },
  SEM_RM: { label: "sem requisição lançada", cls: "bg-slate-100 text-slate-600 border-slate-300" },
  SEM_DADOS: { label: "sem informação", cls: "bg-slate-100 text-slate-500 border-slate-200" },
};
const fmtKg = (n) => `${Number(n || 0).toLocaleString("pt-BR")} kg`;
const fmtD = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : "—");

export default function CompraChip({ compra, opNumero, mini }) {
  const [aberto, setAberto] = useState(false);
  if (!compra) return null;
  const e = ESTILO[compra.status] || ESTILO.SEM_DADOS;
  const alerta = compra.status === "SEM_RM" || compra.status === "SEM_DADOS";
  const texto = compra.pct != null ? `${e.label} ${compra.pct}%` : e.label;

  return (
    <>
      <button onClick={(ev) => { ev.stopPropagation(); setAberto(true); }}
        title={`Material: ${fmtKg(compra.recebidoKg)} recebido${compra.solicitadoKg ? ` de ${fmtKg(compra.solicitadoKg)} solicitados` : ""}. Clique para ver a rastreabilidade.`}
        className={`inline-flex items-center gap-1 rounded-full border font-semibold whitespace-nowrap hover:brightness-95 ${e.cls} ${mini ? "text-[10px] px-1.5 py-0.5" : "text-[11px] px-2 py-0.5"}`}>
        {alerta ? <AlertTriangle size={mini ? 9 : 11} /> : <Package size={mini ? 9 : 11} />} {texto}
      </button>
      {aberto && <ModalRastreabilidade opNumero={opNumero} onClose={() => setAberto(false)} />}
    </>
  );
}

// Rastreabilidade completa da OP (corrida/lote, certificado, NF, pedido, fornecedor). Exportada
// porque o painel de Liberar do PCP também abre ela direto, sem passar pelo chip.
export function ModalRastreabilidade({ opNumero, onClose }) {
  const [d, setD] = useState(null);
  const [erro, setErro] = useState("");
  useEffect(() => {
    fetch(`/api/planejamento/rastreabilidade/${encodeURIComponent(opNumero)}`)
      .then((r) => r.json())
      .then((j) => (j.error ? setErro(j.error) : setD(j)))
      .catch(() => setErro("Não foi possível carregar."));
  }, [opNumero]);

  const c = d?.compra;
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="bg-white text-torg-dark rounded-2xl w-full max-w-4xl shadow-2xl max-h-[85vh] flex flex-col" onClick={(ev) => ev.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <h2 className="text-lg font-bold inline-flex items-center gap-2"><Package size={18} className="text-torg-blue" /> Material da OP-{opNumero}</h2>
          <button onClick={onClose} className="text-torg-gray hover:text-red-600"><X size={20} /></button>
        </div>

        {c && (
          <div className="px-5 py-3 border-b border-gray-100 grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            <div><p className="text-[10px] uppercase text-torg-gray">Recebido</p><p className="text-base font-extrabold tabular-nums">{fmtKg(c.recebidoKg)}</p></div>
            <div><p className="text-[10px] uppercase text-torg-gray">Solicitado (RM)</p><p className="text-base font-extrabold tabular-nums">{c.solicitadoKg ? fmtKg(c.solicitadoKg) : "—"}</p></div>
            <div><p className="text-[10px] uppercase text-torg-gray">Notas fiscais</p><p className="text-base font-extrabold tabular-nums">{c.nfs}</p></div>
            <div><p className="text-[10px] uppercase text-torg-gray">Última entrada</p><p className="text-base font-extrabold tabular-nums">{fmtD(c.ultimoRecebimento)}</p></div>
          </div>
        )}
        {c?.semRM && (
          <p className="mx-5 mt-3 text-[12px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 inline-flex items-center gap-1.5">
            <AlertTriangle size={13} /> Esta OP não tem requisição de material lançada no portal — dá pra ver o que chegou, mas não o que falta comprar.
          </p>
        )}

        <div className="px-5 py-4 overflow-y-auto">
          {erro && <p className="text-sm text-red-600">{erro}</p>}
          {!d && !erro ? (
            <div className="py-10 text-center text-torg-gray"><Loader2 size={22} className="mx-auto animate-spin" /></div>
          ) : d?.linhas?.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-[12px] min-w-[760px]">
                <thead>
                  <tr className="text-[10px] uppercase text-torg-gray border-b border-gray-100">
                    <th className="text-left py-1.5">Recebido</th><th className="text-left py-1.5">NF</th>
                    <th className="text-left py-1.5">Pedido</th><th className="text-left py-1.5">Corrida / lote</th>
                    <th className="text-left py-1.5">Certificado</th><th className="text-left py-1.5">Fornecedor</th>
                    <th className="text-left py-1.5">Material</th><th className="text-right py-1.5">Peso</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {d.linhas.map((l, i) => (
                    <tr key={i}>
                      <td className="py-1.5 whitespace-nowrap tabular-nums">{fmtD(l.recebidoEm)}</td>
                      <td className="py-1.5 whitespace-nowrap font-mono">{l.nf || "—"}</td>
                      <td className="py-1.5 whitespace-nowrap font-mono">{l.pedido || "—"}</td>
                      <td className="py-1.5 whitespace-nowrap font-mono">{l.corrida || <span className="text-amber-600">sem corrida</span>}</td>
                      <td className="py-1.5 whitespace-nowrap font-mono text-torg-gray">{l.certificado || "—"}</td>
                      <td className="py-1.5 whitespace-nowrap">{l.fornecedor || "—"}</td>
                      <td className="py-1.5 truncate max-w-[280px]" title={l.material}>{l.material}</td>
                      <td className="py-1.5 text-right tabular-nums whitespace-nowrap">{l.pesoKg ? fmtKg(l.pesoKg) : l.quantidade ? `${l.quantidade} pç` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-torg-gray py-6 text-center">Nenhum material desta OP no CMR ainda.</p>
          )}
        </div>
        <div className="px-5 py-2.5 border-t border-gray-100">
          <p className="text-[11px] text-torg-gray">Fonte: CMR (planilha de rastreabilidade do Almoxarifado), sincronizado todo dia. O "solicitado" vem das requisições de material do portal.</p>
        </div>
      </div>
    </div>
  );
}
