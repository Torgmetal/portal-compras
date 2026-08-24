"use client";
import { useState, useEffect, useCallback } from "react";
import { Loader2, RefreshCw, CheckCircle2, AlertCircle } from "lucide-react";

const kg = (v) => `${Number(v || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} kg`;

export default function RecebimentoCmrClient() {
  const [d, setD] = useState(null);
  const [erro, setErro] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [aplicando, setAplicando] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true); setErro(null);
    try {
      const r = await fetch("/api/compras/recebimento-cmr", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ simular: true }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro ao conciliar");
      setD(j);
    } catch (e) { setErro(e.message); } finally { setCarregando(false); }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const aplicar = async () => {
    if (!confirm(`Lançar ${d?.resumo?.itens || 0} recebimento(s)? Isso dá baixa nos itens da RM.`)) return;
    setAplicando(true);
    try {
      const r = await fetch("/api/compras/recebimento-cmr", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ simular: false }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro ao aplicar");
      await carregar();
    } catch (e) { setErro(e.message); } finally { setAplicando(false); }
  };

  if (carregando) return <div className="p-6"><Loader2 className="animate-spin text-torg-blue" size={22} /></div>;

  const semCmr = d?.semCmr || [];
  // ⚠ agrupa por MOTIVO: "não achei descrição igual" e "chegou antes do pedido" pedem ações
  // diferentes — a primeira é casar nome, a segunda é conferir data.
  const porMotivo = semCmr.reduce((m, x) => {
    const k = x.motivo || "descrição não encontrada no CMR";
    (m[k] || (m[k] = [])).push(x);
    return m;
  }, {});

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-torg-dark">Recebimento pelo CMR</h1>
          <p className="text-[12px] text-torg-gray mt-0.5">
            O que o Almoxarifado já lançou no CMR e ainda aparece como aguardando entrega no Compras.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={carregar} disabled={aplicando}
            className="text-[12px] inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 hover:bg-gray-50 disabled:opacity-50">
            <RefreshCw size={13} /> Recalcular
          </button>
          {d?.resumo?.itens > 0 && (
            <button onClick={aplicar} disabled={aplicando}
              className="text-[12px] inline-flex items-center gap-1.5 rounded-lg bg-torg-blue text-white px-3 py-1.5 hover:opacity-90 disabled:opacity-50">
              {aplicando ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
              Lançar {d.resumo.itens} recebimento{d.resumo.itens > 1 ? "s" : ""}
            </button>
          )}
        </div>
      </div>

      {erro && <p className="text-[12px] text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{erro}</p>}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-gray-100 border border-gray-100 rounded-xl overflow-hidden">
        {[["Casaram", d?.resumo?.itens || 0], ["Peso a lançar", kg(d?.resumo?.kg)],
          ["Itens que fecham", d?.resumo?.fechados || 0], ["Sem casar", semCmr.length]].map(([r, v]) => (
          <div key={r} className="bg-white p-3 min-w-0">
            <p className="text-[10px] font-medium text-torg-gray uppercase tracking-wider truncate">{r}</p>
            <p className="text-[14px] font-extrabold tabular-nums text-torg-dark whitespace-nowrap">{v}</p>
          </div>
        ))}
      </div>

      {/* ⚠ ESTA É A LISTA QUE NÃO EXISTIA. O cron lança o que casa e descarta o resto em silêncio;
          é aqui que o comprador vê o que o Almoxarifado tem e o portal não sabe. */}
      {semCmr.length > 0 && (
        <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="text-[12px] font-bold text-torg-dark inline-flex items-center gap-1.5">
              <AlertCircle size={14} className="text-torg-orange-700" /> Não casaram com o CMR
            </p>
            <p className="text-[11px] text-torg-gray mt-0.5">
              A conciliação exige descrição idêntica entre a RM e o CMR. Quando o Almoxarifado escreve o
              perfil de um jeito e a RM de outro, o item fica aqui — parado como “aguardando entrega”
              mesmo com o material no galpão.
            </p>
          </div>
          {Object.entries(porMotivo).map(([motivo, lista]) => (
            <div key={motivo}>
              <p className="text-[11px] font-semibold text-torg-dark px-4 py-1.5 bg-gray-50 border-y border-gray-100">
                {motivo} <span className="font-normal text-torg-gray">· {lista.length} {lista.length === 1 ? "item" : "itens"}</span>
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]" style={{ minWidth: 560 }}>
                  <thead className="text-[10px] uppercase text-torg-gray">
                    <tr><th className="text-left px-4 py-1.5">OP</th><th className="text-left px-3 py-1.5">RM</th>
                      <th className="text-left px-3 py-1.5">Descrição</th><th className="text-right px-4 py-1.5">Peso</th></tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {lista.map((x) => (
                      <tr key={x.rmItemId}>
                        <td className="px-4 py-1 whitespace-nowrap font-mono text-[11px]">{x.op || "—"}</td>
                        <td className="px-3 py-1 whitespace-nowrap font-mono text-[11px] text-torg-gray">{x.rm || "—"}</td>
                        <td className="px-3 py-1">{x.descricao}</td>
                        <td className="px-4 py-1 text-right tabular-nums whitespace-nowrap">{kg(x.pesoKg)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {d?.lancamentos?.length > 0 && (
        <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
          <p className="text-[12px] font-bold text-torg-dark px-4 py-2 bg-gray-50">Prontos para lançar</p>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]" style={{ minWidth: 620 }}>
              <thead className="text-[10px] uppercase text-torg-gray">
                <tr><th className="text-left px-4 py-1.5">OP</th><th className="text-left px-3 py-1.5">RM</th>
                  <th className="text-left px-3 py-1.5">Descrição</th><th className="text-right px-3 py-1.5">A lançar</th>
                  <th className="text-right px-4 py-1.5">Fecha?</th></tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {d.lancamentos.map((l) => (
                  <tr key={l.rmItemId}>
                    <td className="px-4 py-1 whitespace-nowrap font-mono text-[11px]">{l.op || "—"}</td>
                    <td className="px-3 py-1 whitespace-nowrap font-mono text-[11px] text-torg-gray">{l.rm || "—"}</td>
                    <td className="px-3 py-1">{l.descricao}</td>
                    <td className="px-3 py-1 text-right tabular-nums whitespace-nowrap">{kg(l.lancarKg)}</td>
                    <td className="px-4 py-1 text-right text-[11px]">{l.fecha ? <span className="text-green-700 font-semibold">sim</span> : <span className="text-torg-gray">parcial</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
