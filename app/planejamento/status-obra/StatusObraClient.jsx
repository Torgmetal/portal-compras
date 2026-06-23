"use client";
import { useEffect, useState } from "react";
import { Loader2, AlertCircle, RefreshCw, Search, X, PackageCheck, Download, CloudDownload, Building2, FileSpreadsheet, AlertTriangle } from "lucide-react";

const fmtKg = (v) => `${Math.round(Number(v) || 0).toLocaleString("pt-BR")} kg`;
const fmtData = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—");
const fmtDataHora = (d) => (d ? new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");
const pct = (e, t) => (t > 0 ? Math.min(100, Math.round((e / t) * 100)) : 0);

// Onde a peça está na fábrica (status de produção da PecaConjunto)
const LOCAL = {
  PENDENTE: { label: "Pendente", cor: "bg-gray-100 text-torg-gray" },
  CORTE: { label: "Corte", cor: "bg-blue-50 text-blue-700" },
  MONTAGEM: { label: "Montagem", cor: "bg-indigo-50 text-indigo-700" },
  SOLDA: { label: "Solda", cor: "bg-purple-50 text-purple-700" },
  ACABAMENTO: { label: "Acabamento", cor: "bg-cyan-50 text-cyan-700" },
  JATO: { label: "Jato", cor: "bg-teal-50 text-teal-700" },
  PINTURA: { label: "Pintura", cor: "bg-amber-50 text-amber-700" },
  EXPEDIDO: { label: "Expedido", cor: "bg-emerald-50 text-emerald-700" },
  TERCEIRIZADO: { label: "Terceirizado", cor: "bg-orange-50 text-torg-orange" },
  SEM_REGISTRO: { label: "Sem registro", cor: "bg-red-50 text-red-700" },
  SEM_OP: { label: "OP fora do portal", cor: "bg-gray-100 text-torg-gray" },
  SEM_STATUS: { label: "—", cor: "bg-gray-100 text-torg-gray" },
};
const localLabel = (k) => LOCAL[k]?.label || k;

export default function StatusObraClient() {
  const [listas, setListas] = useState(null);
  const [erro, setErro] = useState("");
  const [opInput, setOpInput] = useState("");
  const [importando, setImportando] = useState("");
  const [msg, setMsg] = useState("");
  const [descobertas, setDescobertas] = useState(null);
  const [descobrindo, setDescobrindo] = useState(false);
  const [detalhe, setDetalhe] = useState(null);

  useEffect(() => { carregar(); }, []);

  async function carregar() {
    setErro("");
    try {
      const r = await fetch("/api/planejamento/status-obra");
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro ao carregar");
      setListas(j.listas || []);
    } catch (e) { setErro(e.message); }
  }

  async function importar(op) {
    const numero = String(op || "").replace(/\D/g, "");
    if (!numero) { setErro("Informe o número da OP."); return; }
    setImportando(numero); setErro(""); setMsg("");
    try {
      const r = await fetch("/api/planejamento/status-obra/importar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: numero }) });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error || "Erro ao importar");
      const oks = (j.resultados || []).filter((x) => x.ok);
      setMsg(`OP-${numero}: ${oks.length} frente(s) importada(s) — ${oks.map((x) => `${x.frente} (${x.marcas} marcas)`).join(", ")}`);
      await carregar();
    } catch (e) { setErro(e.message); } finally { setImportando(""); }
  }

  async function descobrir() {
    setDescobrindo(true); setErro("");
    try {
      const r = await fetch("/api/planejamento/status-obra?descobrir=1");
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro ao varrer SharePoint");
      setDescobertas(j.opsComLista || []);
    } catch (e) { setErro(e.message); } finally { setDescobrindo(false); }
  }

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-4">
      <div>
        <h1 className="text-xl font-bold text-torg-dark flex items-center gap-2"><PackageCheck size={20} className="text-torg-blue" /> Status da obra — Listas de Expedição</h1>
        <p className="text-[12px] text-torg-gray mt-0.5">Importa a "Lista Avançada Expedição" da pasta da OP no SharePoint e mostra previsto × expedido × faltante por frente.</p>
      </div>

      {/* Toolbar */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-center gap-2 flex-wrap">
        <span className="text-[12px] text-torg-gray">Importar OP:</span>
        <input value={opInput} onChange={(e) => setOpInput(e.target.value.replace(/\D/g, ""))} onKeyDown={(e) => { if (e.key === "Enter") importar(opInput); }} placeholder="ex: 67" className="w-24 text-sm border border-gray-300 rounded-lg px-2 py-1.5 focus:border-torg-blue outline-none" />
        <button onClick={() => importar(opInput)} disabled={!!importando} className="text-sm font-semibold text-white bg-torg-blue rounded-lg px-4 py-1.5 hover:bg-torg-dark disabled:opacity-50 inline-flex items-center gap-1.5">
          {importando ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Importar
        </button>
        <button onClick={descobrir} disabled={descobrindo} className="ml-auto text-sm text-torg-blue hover:text-torg-dark inline-flex items-center gap-1.5 border border-torg-blue/30 rounded-lg px-3 py-1.5 disabled:opacity-50">
          {descobrindo ? <Loader2 size={14} className="animate-spin" /> : <CloudDownload size={14} />} Descobrir listas no SharePoint
        </button>
        <button onClick={carregar} className="p-1.5 text-torg-gray hover:text-torg-blue rounded-lg hover:bg-gray-100" title="Atualizar"><RefreshCw size={15} /></button>
      </div>

      {erro && <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm"><AlertCircle size={18} /> {erro}<button onClick={() => setErro("")} className="ml-auto"><X size={14} /></button></div>}
      {msg && <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg px-4 py-3 text-[13px]"><PackageCheck size={16} /> {msg}<button onClick={() => setMsg("")} className="ml-auto"><X size={14} /></button></div>}

      {/* Catálogo descoberto no SharePoint */}
      {descobertas && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-bold text-torg-dark">Listas encontradas no SharePoint ({descobertas.length} OP)</h2>
            <button onClick={() => setDescobertas(null)} className="text-[12px] text-torg-gray hover:text-torg-dark">fechar</button>
          </div>
          {descobertas.length === 0 ? (
            <p className="text-[12px] text-torg-gray italic">Nenhuma "Lista Avançada Expedição" encontrada nas pastas 4. Expedição.</p>
          ) : (
            <div className="space-y-1.5 max-h-72 overflow-y-auto">
              {descobertas.map((o) => (
                <div key={o.folder} className="flex items-center gap-2 text-[12px] border border-gray-100 rounded-lg px-3 py-2">
                  <span className="font-semibold text-torg-dark">OP-{o.op}</span>
                  {o.finalizada && <span className="text-[9px] bg-gray-100 text-torg-gray rounded px-1.5 py-0.5">finalizada</span>}
                  <span className="text-torg-gray truncate flex-1" title={o.folder}>{o.arquivos.map((a) => a.frente || a.name).join(", ")}</span>
                  <button onClick={() => importar(o.op)} disabled={!!importando} className="text-[11px] font-semibold text-torg-blue hover:text-torg-dark inline-flex items-center gap-1 disabled:opacity-50">
                    {importando === String(o.op).replace(/^0+/, "") ? <Loader2 size={11} className="animate-spin" /> : <Download size={11} />} importar
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Listas importadas */}
      {listas === null ? (
        <div className="text-center py-12 text-torg-gray text-sm"><Loader2 size={20} className="animate-spin mx-auto mb-2" /> Carregando…</div>
      ) : listas.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-10 text-center">
          <FileSpreadsheet size={30} className="mx-auto text-gray-300 mb-2" />
          <p className="text-sm text-torg-gray">Nenhuma lista importada ainda. Informe uma OP acima ou use "Descobrir listas".</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {listas.map((l) => {
            const p = pct(l.pesoExpedido, l.pesoContratado);
            return (
              <button key={l.id} onClick={() => setDetalhe(l.id)} className="text-left bg-white rounded-xl border border-gray-100 shadow-sm p-4 hover:border-torg-blue/40 transition-colors">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-torg-dark flex items-center gap-1.5"><Building2 size={14} className="text-torg-blue" /> {l.frente}</span>
                  <span className="text-[10px] text-torg-gray">{l.marcas} marcas · {l.qtdItens} itens</span>
                </div>
                <p className="text-[11px] text-torg-gray mt-0.5 truncate" title={l.arquivo}>{l.arquivo}{l.revisao ? ` · rev ${l.revisao}` : ""}</p>
                <div className="mt-2 h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500" style={{ width: `${p}%` }} />
                </div>
                <div className="flex items-center justify-between mt-1.5 text-[11px]">
                  <span className="text-emerald-700 font-semibold">{p}% expedido</span>
                  <span className="text-torg-gray">{fmtKg(l.pesoExpedido)} / {fmtKg(l.pesoContratado)}</span>
                </div>
                <div className="flex items-center justify-between mt-1 text-[10px] text-torg-gray">
                  <span>Faltam <b className="text-torg-orange">{fmtKg(l.pesoFaltante)}</b></span>
                  <span>importada {fmtDataHora(l.importadoEm)}</span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {detalhe && <DetalheLista id={detalhe} onClose={() => setDetalhe(null)} />}
    </div>
  );
}

function DetalheLista({ id, onClose }) {
  const [lista, setLista] = useState(null);
  const [producao, setProducao] = useState(null);
  const [erro, setErro] = useState("");
  const [q, setQ] = useState("");
  const [soFaltantes, setSoFaltantes] = useState(true);
  const [baixando, setBaixando] = useState(false);

  useEffect(() => {
    fetch(`/api/planejamento/status-obra/${id}`).then((r) => r.json())
      .then((j) => { if (j.lista) { setLista(j.lista); setProducao(j.producao); } else setErro(j.error || "Erro"); })
      .catch((e) => setErro(e.message));
  }, [id]);

  const marcas = lista?.marcasJson || [];
  const termo = q.trim().toLowerCase();
  const base = soFaltantes ? marcas.filter((m) => !m.expedidoArquivo) : marcas;
  const filtradas = termo ? base.filter((m) => String(m.marca).toLowerCase().includes(termo) || String(m.descricao || "").toLowerCase().includes(termo)) : base;
  const mostradas = filtradas.slice(0, 800);
  const furos = producao?.furos || {};

  async function baixarRelatorio() {
    if (!lista) return;
    setBaixando(true);
    try {
      const { criarRelatorioTorg, adicionarHeaderTabela, adicionarLinhaTabela, downloadWorkbook } = await import("@/lib/excel-relatorio");
      const faltantes = marcas.filter((m) => !m.expedidoArquivo);
      const kpis = [
        `Faltam expedir: ${faltantes.length} marca(s) · ${fmtKg(producao?.pesoFaltante || 0)} de ${fmtKg(lista.pesoContratado)}`,
        ...((producao?.resumoLocal || []).length ? [producao.resumoLocal.map((r) => `${localLabel(r.local)}: ${r.marcas} (${fmtKg(r.peso)})`).join("   |   ")] : []),
      ];
      const { workbook, sheet: ws, linhaInicio } = await criarRelatorioTorg({
        titulo: `Status da obra — ${lista.frente} — o que falta expedir`,
        subtitulo: lista.arquivo,
        nomePlanilha: `Falta ${lista.frente}`.slice(0, 28),
        codigoDoc: "REL-EXP-003",
        totalColunas: 5,
        kpis,
      });
      [16, 40, 7, 12, 16].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
      let row = linhaInicio;
      adicionarHeaderTabela(ws, row, ["Marca", "Descrição", "Qte", "Peso (kg)", "Local na fábrica"]);
      row++;
      for (const m of faltantes) {
        adicionarLinhaTabela(ws, row, [m.marca, (m.descricao || "").trim(), m.qte, Math.round(m.pesoTotal || 0), localLabel(m.local)]);
        row++;
      }
      await downloadWorkbook(workbook, `Status_obra_${lista.frente}_falta.xlsx`.replace(/\s+/g, "_"));
    } catch (e) { setErro("Falha ao gerar Excel: " + e.message); } finally { setBaixando(false); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-torg-dark flex items-center gap-2"><Building2 size={16} className="text-torg-blue" /> {lista?.frente || "…"}</h3>
            {lista && <p className="text-[11px] text-torg-gray mt-0.5 truncate">{lista.arquivo} · contratado {fmtKg(lista.pesoContratado)} · expedido {fmtKg(lista.pesoExpedido)} · <b className="text-torg-orange">falta {fmtKg(lista.pesoFaltante)}</b></p>}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {lista && <button onClick={baixarRelatorio} disabled={baixando} className="text-[12px] font-semibold text-white bg-torg-blue rounded-lg px-3 py-1.5 hover:bg-torg-dark disabled:opacity-50 inline-flex items-center gap-1.5">{baixando ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} Relatório do que falta</button>}
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
          </div>
        </div>

        {erro ? (
          <div className="p-6 text-sm text-red-600">{erro}</div>
        ) : !lista ? (
          <div className="p-10 text-center text-torg-gray text-sm"><Loader2 size={18} className="animate-spin mx-auto mb-2" /> Carregando…</div>
        ) : (
          <>
            {(furos.semRegistro > 0 || furos.divergente > 0) && (
              <div className="mx-5 mt-3 flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-[12px]">
                <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                <span>
                  {furos.semRegistro > 0 && <><b>{furos.semRegistro}</b> faltante(s) <b>sem registro na produção</b> (furo — peça não encontrada na fábrica). </>}
                  {furos.divergente > 0 && <><b>{furos.divergente}</b> com divergência (produção diz expedido, mas a lista diz que falta).</>}
                </span>
              </div>
            )}

            {producao?.resumoLocal?.length > 0 && (
              <div className="px-5 pt-3 flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] text-torg-gray">Faltante por local:</span>
                {producao.resumoLocal.map((r) => (
                  <span key={r.local} className={`px-2 py-0.5 text-[11px] font-medium rounded-full ${LOCAL[r.local]?.cor || "bg-gray-100 text-torg-gray"}`}>{localLabel(r.local)}: {r.marcas} · {fmtKg(r.peso)}</span>
                ))}
              </div>
            )}

            <div className="px-5 py-2 flex items-center gap-3">
              <label className="text-[12px] inline-flex items-center gap-1.5 cursor-pointer text-torg-dark whitespace-nowrap">
                <input type="checkbox" checked={soFaltantes} onChange={(e) => setSoFaltantes(e.target.checked)} className="accent-torg-blue" /> Só faltantes
              </label>
              <div className="relative flex-1">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-torg-gray" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="filtrar por marca ou descrição…" className="w-full text-[13px] border border-gray-200 rounded-lg pl-8 pr-3 py-1.5 focus:border-torg-blue outline-none" />
              </div>
            </div>

            <div className="overflow-auto flex-1 border-t border-gray-100">
              <table className="w-full text-sm">
                <thead className="bg-gray-50/60 sticky top-0">
                  <tr>
                    <th className="px-4 py-2 text-left text-[10px] font-semibold text-torg-gray uppercase">Marca</th>
                    <th className="px-3 py-2 text-left text-[10px] font-semibold text-torg-gray uppercase">Descrição</th>
                    <th className="px-3 py-2 text-center text-[10px] font-semibold text-torg-gray uppercase">Qte</th>
                    <th className="px-3 py-2 text-right text-[10px] font-semibold text-torg-gray uppercase">Peso</th>
                    <th className="px-3 py-2 text-center text-[10px] font-semibold text-torg-gray uppercase">Local na fábrica</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {mostradas.map((m, i) => (
                    <tr key={i} className={m.local === "SEM_REGISTRO" && !m.expedidoArquivo ? "bg-red-50/40" : ""}>
                      <td className="px-4 py-1.5 font-mono text-[12px] text-torg-dark">{m.marca}</td>
                      <td className="px-3 py-1.5 text-[12px] text-torg-gray truncate max-w-[230px]" title={m.descricao}>{(m.descricao || "").trim()}</td>
                      <td className="px-3 py-1.5 text-center text-[12px]">{m.qte}</td>
                      <td className="px-3 py-1.5 text-right text-[12px] tabular-nums">{fmtKg(m.pesoTotal)}</td>
                      <td className="px-3 py-1.5 text-center">
                        {m.expedidoArquivo
                          ? <span className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-emerald-50 text-emerald-700">Expedido</span>
                          : <span className={`px-2 py-0.5 text-[10px] font-medium rounded-full ${LOCAL[m.local]?.cor || "bg-gray-100 text-torg-gray"}`}>{localLabel(m.local)}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filtradas.length > 800 && <p className="text-[11px] text-torg-gray text-center py-2">mostrando 800 de {filtradas.length} — refine o filtro</p>}
              {filtradas.length === 0 && <p className="text-[12px] text-torg-gray text-center py-6">{soFaltantes ? "nada faltante 🎉" : "nenhuma marca"}</p>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
