"use client";
import { useState, useEffect, useMemo } from "react";
import { Factory, Search, Loader2, AlertCircle, X, CheckCircle2, FileSpreadsheet } from "lucide-react";

const fmtKg = (n) => `${Number(n || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} kg`;
const fmtD = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—");
const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const LIMITE = 300;

// etapas na ordem do fluxo, com rótulo e cor
const ETAPA = {
  PENDENTE: { l: "Não iniciada", c: "bg-gray-100 text-gray-600", dot: "bg-gray-300" },
  CORTE: { l: "Corte", c: "bg-sky-100 text-sky-800", dot: "bg-sky-400" },
  MONTAGEM: { l: "Montagem", c: "bg-indigo-100 text-indigo-800", dot: "bg-indigo-400" },
  SOLDA: { l: "Solda", c: "bg-violet-100 text-violet-800", dot: "bg-violet-400" },
  ACABAMENTO: { l: "Acabamento", c: "bg-amber-100 text-amber-800", dot: "bg-amber-400" },
  JATO: { l: "Jato", c: "bg-orange-100 text-orange-800", dot: "bg-orange-400" },
  PINTURA: { l: "Pintura", c: "bg-emerald-100 text-emerald-800", dot: "bg-emerald-500" },
  EXPEDIDO: { l: "Expedido", c: "bg-emerald-600 text-white", dot: "bg-emerald-600" },
};
const ORDEM = ["PENDENTE", "CORTE", "MONTAGEM", "SOLDA", "ACABAMENTO", "JATO", "PINTURA", "EXPEDIDO"];

export default function AbaProducao({ opId, opNumero, obra, cliente, refCliente }) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState("");
  const [busca, setBusca] = useState("");
  const [etapa, setEtapa] = useState("");
  const [exportando, setExportando] = useState(false);

  useEffect(() => {
    setDados(null); setErro("");
    fetch(`/api/comercial/op/${opId}/producao`).then((r) => r.json())
      .then((j) => { if (j.success) setDados(j); else setErro(j.error || "Erro ao carregar"); })
      .catch(() => setErro("Não foi possível carregar a produção."));
  }, [opId]);

  const pecas = dados?.pecas || [];
  const resumo = dados?.resumo || [];
  const filtradas = useMemo(() => {
    const b = norm(busca);
    return pecas.filter((p) => {
      if (etapa && p.setor !== etapa) return false;
      if (!b) return true;
      return norm(p.marca).includes(b) || norm(p.descricao).includes(b);
    });
  }, [pecas, busca, etapa]);
  const pesoFiltrado = filtradas.reduce((s, p) => s + (p.pesoTotal || 0), 0);

  async function exportar() {
    setExportando(true); setErro("");
    try {
      const { criarRelatorioTorg, adicionarHeaderTabela, adicionarLinhaTabela, adicionarLinhaTotais, downloadWorkbook } = await import("@/lib/excel-relatorio");
      const filtrando = busca.trim() || etapa;
      const linhas = filtrando ? filtradas : pecas;
      if (!linhas.length) throw new Error("Nada para exportar.");
      const opNum = String(opNumero || "").padStart(3, "0");
      const kpi = ORDEM.filter((s) => resumo.some((r) => r.setor === s)).map((s) => { const r = resumo.find((x) => x.setor === s); return `${ETAPA[s].l}: ${r.qtd}`; }).join(" · ");

      const { workbook, sheet: ws, linhaInicio } = await criarRelatorioTorg({
        titulo: `Status de Produção — OP-${opNum}`,
        subtitulo: [obra, cliente, refCliente ? `Ref. ${refCliente}` : null, filtrando ? `filtro: ${[ETAPA[etapa]?.l, busca.trim() ? `"${busca.trim()}"` : null].filter(Boolean).join(" / ")}` : null].filter(Boolean).join(" · "),
        kpis: [`${dados.total} peças · ${fmtKg(dados.pesoTotal)}`, kpi, dados.temSyneco ? null : "⚠ Sem apontamento do Syneco nesta OP — etapa não reflete a produção."].filter(Boolean),
        totalColunas: 7,
        nomePlanilha: "Produção",
        codigoDoc: "REL-PRD-005",
      });
      ws.columns = [{ width: 20 }, { width: 34 }, { width: 8 }, { width: 14 }, { width: 16 }, { width: 12 }, { width: 14 }];
      let row = linhaInicio;
      adicionarHeaderTabela(ws, row, ["Marca", "Descrição", "Qtd", "Peso (kg)", "Etapa", "Romaneio", "Data expedição"]);
      row++;
      const primeira = row;
      for (const p of linhas) {
        adicionarLinhaTabela(ws, row, [
          p.marca, p.descricao || "—", p.qte ?? "—", Number((p.pesoTotal || 0).toFixed(1)),
          (ETAPA[p.setor] || ETAPA.PENDENTE).l,
          p.expedido ? (p.romaneio || "—") : "—",
          p.expedido && p.dataExpedicao ? fmtD(p.dataExpedicao) : "—",
        ], {
          fillColor: p.setor === "EXPEDIDO" ? "E8F8E8" : undefined,
          alinhamento: { 2: "right", 3: "right", 4: "center", 5: "center", 6: "center" },
        });
        row++;
      }
      adicionarLinhaTotais(ws, row, ["TOTAL", "", "", { formula: `SUM(D${primeira}:D${row - 1})` }, "", "", ""]);
      await downloadWorkbook(workbook, `Producao_OP-${opNum}_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (e) { setErro("Erro ao exportar: " + e.message); } finally { setExportando(false); }
  }

  const inp = "text-xs border border-gray-300 rounded-lg px-2 py-1.5 bg-white";

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
        <h3 className="text-lg font-semibold text-torg-dark flex items-center gap-2"><Factory size={18} className="text-torg-blue" /> Produção</h3>
        <button onClick={exportar} disabled={exportando || !pecas.length} className="text-xs text-torg-gray border border-gray-300 rounded-lg px-2.5 py-1.5 font-medium inline-flex items-center gap-1 hover:bg-gray-50 disabled:opacity-40">{exportando ? <Loader2 size={13} className="animate-spin" /> : <FileSpreadsheet size={13} />} Exportar</button>
      </div>
      <p className="text-sm text-torg-gray mb-4">Status de cada peça da Lista de Expedição. A etapa vem do <strong>setor mais avançado com apontamento no Syneco</strong> — não do status cadastrado.</p>

      {erro && <p className="text-xs text-red-600 mb-2 inline-flex items-center gap-1"><AlertCircle size={13} /> {erro}</p>}

      {dados === null && !erro ? (
        <div className="py-10 text-center text-torg-gray"><Loader2 size={22} className="mx-auto animate-spin" /></div>
      ) : dados?.semLista ? (
        <div className="border border-dashed border-gray-200 rounded-lg py-10 text-center">
          <Factory size={26} className="mx-auto text-gray-300 mb-2" />
          <p className="text-sm font-semibold text-torg-dark">Sem Lista de Expedição</p>
          <p className="text-xs text-torg-gray mt-1 max-w-md mx-auto">O status de produção usa as marcas da Lista de Expedição — importe-a na aba <strong>Engenharia</strong> primeiro.</p>
        </div>
      ) : (<>
        {!dados.temSyneco && (
          <p className="text-[12px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3 inline-flex items-center gap-1.5"><AlertCircle size={13} /> Nenhum apontamento do Syneco para esta OP ainda — todas as peças aparecem como “não iniciadas”.</p>
        )}

        {/* funil por etapa (clicável = filtro) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-px bg-gray-100 border border-gray-100 rounded-lg overflow-hidden mb-3">
          <button onClick={() => setEtapa("")} className={`bg-white p-2.5 text-left hover:bg-gray-50 ${etapa === "" ? "ring-2 ring-torg-blue ring-inset" : ""}`}>
            <p className="text-[10px] font-medium text-torg-gray uppercase tracking-wide">Total</p>
            <p className="text-base font-extrabold text-torg-dark tabular-nums">{dados.total}</p>
            <p className="text-[10px] text-torg-gray">{fmtKg(dados.pesoTotal)}</p>
          </button>
          {ORDEM.map((s) => {
            const r = resumo.find((x) => x.setor === s);
            if (!r) return null;
            const e = ETAPA[s];
            return (
              <button key={s} onClick={() => setEtapa(etapa === s ? "" : s)} className={`bg-white p-2.5 text-left hover:bg-gray-50 ${etapa === s ? "ring-2 ring-torg-blue ring-inset" : ""}`}>
                <p className="text-[10px] font-medium text-torg-gray uppercase tracking-wide inline-flex items-center gap-1"><span className={`w-2 h-2 rounded-full ${e.dot}`} /> {e.l}</p>
                <p className="text-base font-extrabold text-torg-dark tabular-nums">{r.qtd}</p>
                <p className="text-[10px] text-torg-gray">{fmtKg(r.pesoKg)}</p>
              </button>
            );
          })}
        </div>

        {/* filtros */}
        <div className="flex items-center gap-2 flex-wrap mb-2">
          <div className="relative flex-1 min-w-[180px]">
            <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-torg-gray" />
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar marca ou descrição…" className={`${inp} w-full pl-7 pr-7`} />
            {busca && <button onClick={() => setBusca("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-torg-gray hover:text-torg-dark"><X size={13} /></button>}
          </div>
          <select value={etapa} onChange={(e) => setEtapa(e.target.value)} className={inp}>
            <option value="">Todas as etapas</option>
            {ORDEM.filter((s) => resumo.some((r) => r.setor === s)).map((s) => <option key={s} value={s}>{ETAPA[s].l}</option>)}
          </select>
          <span className="text-[11px] text-torg-gray whitespace-nowrap">{filtradas.length} de {pecas.length} · {fmtKg(pesoFiltrado)}</span>
        </div>

        {/* tabela */}
        <div className="overflow-x-auto border border-gray-100 rounded-lg max-h-[520px] overflow-y-auto">
          <table className="w-full text-sm min-w-[680px]">
            <thead className="bg-gray-50 sticky top-0 z-10">
              <tr className="text-[11px] text-torg-gray uppercase">
                <th className="text-left px-3 py-2 font-medium">Marca</th>
                <th className="text-left px-3 py-2 font-medium">Descrição</th>
                <th className="text-right px-3 py-2 font-medium w-16">Qtd</th>
                <th className="text-right px-3 py-2 font-medium w-24">Peso</th>
                <th className="text-left px-3 py-2 font-medium w-32">Etapa</th>
                <th className="text-left px-3 py-2 font-medium w-40">Expedição</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtradas.slice(0, LIMITE).map((p, i) => {
                const e = ETAPA[p.setor] || ETAPA.PENDENTE;
                return (
                  <tr key={`${p.frente}-${p.marca}-${i}`} className={p.setor === "EXPEDIDO" ? "bg-emerald-50/40" : ""}>
                    <td className="px-3 py-1.5 font-mono text-torg-dark whitespace-nowrap">{p.marca}</td>
                    <td className="px-3 py-1.5 text-torg-gray truncate max-w-[260px]" title={p.descricao}>{p.descricao || "—"}</td>
                    <td className="px-3 py-1.5 text-right text-torg-gray tabular-nums">{p.qte ?? "—"}</td>
                    <td className="px-3 py-1.5 text-right text-torg-dark tabular-nums whitespace-nowrap">{fmtKg(p.pesoTotal)}</td>
                    <td className="px-3 py-1.5"><span className={`text-[10px] px-2 py-0.5 rounded-full font-medium inline-flex items-center gap-1 ${e.c}`}><span className={`w-1.5 h-1.5 rounded-full ${p.setor === "EXPEDIDO" ? "bg-white" : e.dot}`} /> {e.l}</span></td>
                    <td className="px-3 py-1.5 text-[11px] text-torg-gray whitespace-nowrap">{p.expedido ? <span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle2 size={11} /> Rom. {p.romaneio || "—"} · {fmtD(p.dataExpedicao)}</span> : "—"}</td>
                  </tr>
                );
              })}
              {!filtradas.length && <tr><td colSpan={6} className="px-3 py-6 text-center text-sm text-torg-gray">Nenhuma peça nesse filtro.</td></tr>}
            </tbody>
          </table>
        </div>
        {filtradas.length > LIMITE && <p className="text-[11px] text-torg-gray mt-1.5">Mostrando as {LIMITE} primeiras de {filtradas.length} — refine a busca.</p>}
      </>)}
    </div>
  );
}
