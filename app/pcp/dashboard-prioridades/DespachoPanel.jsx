"use client";
// Painel da OP na TV do PCP — duas abas:
//   • Liberar       → área de trabalho do setor: lista as peças a concluir (filtro + seleção),
//                     dá BAIXA (por quantidade), importa planilha (marca + qtd) e ainda destina
//                     as em aberto (Prioridade / Terceiro / Revisão / Aguardando / Cancelar).
//   • Peças prontas → histórico do que já teve baixa NAQUELE setor: qtd total, qtd baixada, qtd
//                     produzida no Syneco, peso unitário e peso total (extremo sincronismo).
// Baixa é SÓ do portal (PecaConjunto.baixaSetores[setor] = { qtd, em, por }); não escreve no Syneco.
// Reusa /api/pcp/despacho (GET peças+placar+reconciliação, POST despacha / dá baixa por qtd).
import { useState, useEffect, useCallback, useMemo } from "react";
import { X, Loader2, Star, Truck, RotateCcw, Ban, Package, FileDown, FileUp, CheckCircle2, Undo2, ClipboardList } from "lucide-react";
import { criarRelatorioTorg, adicionarHeaderTabela, adicionarLinhaTabela, adicionarLinhaTotais, downloadWorkbook, CORES } from "@/lib/excel-relatorio";

const DESTINOS = [
  { key: "PRIORIDADE", label: "Prioridade", icon: Star, cor: "bg-amber-500 hover:bg-amber-600", desc: "libera p/ desenho e corte" },
  { key: "TERCEIRO", label: "Terceiro", icon: Truck, cor: "bg-indigo-600 hover:bg-indigo-700", desc: "terceiriza (vai p/ /pcp/terceirizados)" },
  { key: "REVISAO", label: "Revisão", icon: RotateCcw, cor: "bg-sky-600 hover:bg-sky-700", desc: "volta p/ engenharia revisar" },
  { key: "AGUARDANDO_MATERIAL", label: "Aguard. material", icon: Package, cor: "bg-slate-500 hover:bg-slate-600", desc: "trava esperando matéria-prima" },
  { key: "CANCELADA", label: "Cancelar", icon: Ban, cor: "bg-red-600 hover:bg-red-700", desc: "tira do escopo" },
];
const VOLTA = ["MONTAGEM", "SOLDA", "ACABAMENTO", "JATO", "PINTURA", "EXPEDICAO"];
const ROTULO = { ABERTO: "Em aberto", PRIORIDADE: "Prioridade", TERCEIRO: "Terceiro", REVISAO: "Revisão", AGUARDANDO_MATERIAL: "Aguard. material", CANCELADA: "Cancelada" };
const SETOR_LABEL = { CORTE: "Preparação", MONTAGEM: "Montagem", SOLDA: "Solda", ACABAMENTO: "Acabamento", JATO: "Jato", PINTURA: "Pintura", EXPEDICAO: "Expedição" };
const LIMITE = 400;
const fmtN = (n) => Number(n || 0).toLocaleString("pt-BR");
const fmtKg = (n) => Number(n || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 });

export default function DespachoPanel({ obra, setor, onClose, abaInicial = "despacho" }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [sel, setSel] = useState(() => new Set());
  const [enviando, setEnviando] = useState(false);
  const [terceiroVolta, setTerceiroVolta] = useState("MONTAGEM");
  const [aba, setAba] = useState(setor ? abaInicial : "despacho"); // "despacho"(Liberar) | "prontas"
  const [filtro, setFiltro] = useState("");
  const podeBaixa = !!setor;

  const carregar = useCallback(async () => {
    setLoading(true); setErro("");
    try {
      const r = await fetch(`/api/pcp/despacho?obra=${encodeURIComponent(obra)}${setor ? `&setor=${setor}` : ""}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro");
      setData(j); setSel(new Set());
    } catch (e) { setErro(e.message); } finally { setLoading(false); }
  }, [obra, setor]);
  useEffect(() => { carregar(); }, [carregar]);

  const pecas = data?.pecas || [];
  const filtrar = (arr) => { const q = filtro.trim().toLowerCase(); return q ? arr.filter((p) => `${p.marca} ${p.descricao || ""}`.toLowerCase().includes(q)) : arr; };
  // Liberar: peças ainda NÃO concluídas (baixado < qtd total) — o que falta liberar no setor.
  const pendentes = useMemo(() => pecas.filter((p) => (p.baixadoQtd || 0) < (p.qte || 0)), [pecas]);
  // Peças prontas: já tiveram baixa no portal (histórico).
  const prontas = useMemo(() => pecas.filter((p) => (p.baixadoQtd || 0) > 0), [pecas]);
  const listaLiberar = useMemo(() => filtrar(pendentes), [pendentes, filtro]);
  const listaProntas = useMemo(() => filtrar(prontas), [prontas, filtro]);
  const visiveis = aba === "prontas" ? listaProntas : listaLiberar;
  const visLimit = visiveis.slice(0, LIMITE);

  // em aberto (pra destinos) = sem destino e PENDENTE, dentro do que está selecionado
  const emAbertoSel = () => [...sel].filter((id) => { const p = pecas.find((x) => x.id === id); return p && !p.destino && p.status === "PENDENTE"; });

  const toggle = (id) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const selTodas = () => setSel((s) => (s.size === visLimit.length && visLimit.length ? new Set() : new Set(visLimit.map((p) => p.id))));
  const trocaAba = (a) => { setAba(a); setSel(new Set()); };

  async function post(body, okMsg) {
    setEnviando(true);
    try {
      const r = await fetch("/api/pcp/despacho", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro");
      await carregar();
      if (okMsg) alert(okMsg(j));
    } catch (e) { alert(e.message); } finally { setEnviando(false); }
  }

  async function despachar(destino) {
    const ids = emAbertoSel();
    if (!ids.length) return alert("Selecione peças em aberto (sem destino) para destinar.");
    const body = { ids, destino };
    if (destino === "TERCEIRO") body.destinoTerceirizado = terceiroVolta;
    await post(body);
  }
  async function baixar() {
    const alvo = pendentes.filter((p) => sel.has(p.id));
    if (!alvo.length) return;
    const baixas = alvo.map((p) => ({ id: p.id, qtd: p.qte || 1 })); // baixa a peça inteira
    await post({ baixaSetor: setor, baixas });
  }
  async function reverterBaixa() {
    if (!sel.size) return;
    await post({ baixaSetor: setor, reverterBaixa: true, ids: [...sel] });
  }

  // Baixa em massa por planilha: coluna "Peça"/"Marca" + (opcional) "Qtd"/"Quantidade"; casa por
  // marca e dá baixa na quantidade informada (sem coluna de qtd → peça inteira).
  async function importar(file) {
    if (!file || !setor) return;
    setEnviando(true);
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer());
      const grid = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, blankrows: false, defval: "" });
      let hRow = -1, cMarca = -1, cQtd = -1;
      for (let r = 0; r < grid.length && hRow < 0; r++) {
        const row = (grid[r] || []).map((x) => String(x).trim().toLowerCase());
        const jm = row.findIndex((x) => x === "peça" || x === "peca" || x === "marca");
        if (jm >= 0) { hRow = r; cMarca = jm; cQtd = row.findIndex((x) => x === "qtd" || x.includes("quantidade") || x === "qtd baixada" || x === "qtde"); }
      }
      if (hRow < 0) throw new Error('Não achei a coluna "Peça"/"Marca" na planilha.');
      const idx = new Map();
      for (const p of pecas) idx.set(String(p.marca).trim().toUpperCase(), p);
      const baixas = [], naoAchou = []; const vistos = new Set();
      for (let r = hRow + 1; r < grid.length; r++) {
        const m = String(grid[r]?.[cMarca] ?? "").trim();
        if (!m) continue;
        const p = idx.get(m.toUpperCase());
        if (!p) { naoAchou.push(m); continue; }
        if (vistos.has(p.id)) continue; vistos.add(p.id);
        let qtd = p.qte || 1;
        if (cQtd >= 0) { const q = parseInt(String(grid[r][cQtd]).replace(/\D/g, ""), 10); if (Number.isFinite(q) && q > 0) qtd = q; }
        baixas.push({ id: p.id, qtd });
      }
      if (!baixas.length) throw new Error(`Nenhuma das marcas da planilha bate com peças desta OP/setor.`);
      const aviso = naoAchou.length ? `\n\n${naoAchou.length} não encontrada(s): ${naoAchou.slice(0, 8).join(", ")}${naoAchou.length > 8 ? "…" : ""}` : "";
      if (!confirm(`Dar baixa em ${baixas.length} peça(s) de ${SETOR_LABEL[setor] || setor}?${aviso}`)) { setEnviando(false); return; }
      await post({ baixaSetor: setor, baixas }, (j) => `Baixa aplicada em ${j.atualizados} peça(s).${naoAchou.length ? ` ${naoAchou.length} não encontradas.` : ""}`);
    } catch (e) { alert(e.message); setEnviando(false); }
  }

  const synecoTxt = (p) => {
    if (!setor || !p.baixadoPortal) return "—";
    return p.precisaSyneco ? "Falta no Syneco" : "OK";
  };

  async function exportar() {
    const base = aba === "prontas" ? prontas : pendentes;
    const hoje = new Date().toISOString().split("T")[0];
    const nomeSetor = setor ? SETOR_LABEL[setor] || setor : "Geral";
    const tituloAba = aba === "prontas" ? "Pecas prontas" : "A liberar";
    const headers = ["Peça", "Descrição", "Qtd total", "Qtd baixada", "Qtd produzida (Syneco)", "Peso un. (kg)", "Peso total (kg)", "Syneco"];
    const { workbook, sheet: ws, linhaInicio } = await criarRelatorioTorg({
      titulo: `${tituloAba} — ${obra}${setor ? ` (${nomeSetor})` : ""}`,
      subtitulo: `Coluna Syneco = falta acertar no Syneco (baixado no portal, sem producao equivalente no Syneco)`,
      kpis: [`${base.length} pecas  |  Baixadas: ${data?.baixados ?? 0}  |  Precisam Syneco: ${data?.precisamSyneco ?? 0}`],
      totalColunas: headers.length, nomePlanilha: `${tituloAba} ${obra}`.slice(0, 31), codigoDoc: "REL-PRD-005",
    });
    ws.columns = [{ width: 16 }, { width: 30 }, { width: 10 }, { width: 12 }, { width: 20 }, { width: 12 }, { width: 13 }, { width: 16 }];
    let row = linhaInicio;
    adicionarHeaderTabela(ws, row, headers); row++;
    const first = row;
    for (const p of base) {
      const fill = !p.baixadoPortal ? undefined : p.precisaSyneco ? CORES.LIGHT_ORANGE : CORES.LIGHT_GREEN;
      adicionarLinhaTabela(ws, row, [p.marca, p.descricao || "", p.qte ?? "", p.baixadoQtd || 0, p.produzidoSyneco ?? "", p.pesoUnitKg ? Number(p.pesoUnitKg.toFixed(1)) : "", p.pesoTotalKg ? Math.round(p.pesoTotalKg) : "", synecoTxt(p)],
        { fillColor: fill, alinhamento: { 2: "right", 3: "right", 4: "right", 5: "right", 6: "right", 7: "center" } });
      row++;
    }
    const last = row - 1;
    if (last >= first) adicionarLinhaTotais(ws, row, ["TOTAL", "", { formula: `SUM(C${first}:C${last})` }, { formula: `SUM(D${first}:D${last})` }, { formula: `SUM(E${first}:E${last})` }, "", { formula: `SUM(G${first}:G${last})` }, ""]);
    await downloadWorkbook(workbook, `Torg_${tituloAba.replace(/ /g, "_")}_${obra}${setor ? "_" + nomeSetor : ""}_${hoje}.xlsx`);
  }

  const th = "text-left px-2.5 py-2 font-semibold text-torg-gray";
  const td = "px-2.5 py-1.5";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3" onClick={onClose}>
      <div className="bg-white text-torg-dark rounded-2xl w-full max-w-6xl max-h-[92vh] flex flex-col shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* Cabeçalho */}
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-bold">{obra}{setor ? ` · ${SETOR_LABEL[setor] || setor}` : ""}</h2>
            {data && <p className="text-[12px] text-torg-gray">{fmtN(data.total)} peça(s){podeBaixa ? ` · ${fmtN(pendentes.length)} a liberar · ${fmtN(prontas.length)} prontas` : ""}{podeBaixa && data.precisamSyneco > 0 ? ` · ${fmtN(data.precisamSyneco)} p/ acertar no Syneco` : ""}</p>}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={exportar} disabled={!data} title="Exportar a lista (com coluna Syneco)" className="text-[12px] font-semibold text-torg-blue border border-torg-blue-100 rounded-lg px-2.5 py-1.5 hover:bg-blue-50 disabled:opacity-40 inline-flex items-center gap-1"><FileDown size={13} /> Exportar</button>
            <button onClick={onClose} className="text-torg-gray hover:text-red-600"><X size={20} /></button>
          </div>
        </div>

        {/* Abas */}
        <div className="flex gap-1 px-5 pt-2 border-b border-gray-100">
          <button onClick={() => trocaAba("despacho")} className={`text-[13px] font-semibold px-3 py-1.5 rounded-t-lg ${aba === "despacho" ? "bg-torg-blue text-white" : "text-torg-gray hover:bg-gray-50"}`} title="Liberar a peça pro próximo passo do fluxo">Liberar</button>
          <button onClick={() => trocaAba("prontas")} disabled={!podeBaixa} title={podeBaixa ? "Histórico do que já teve baixa" : "Abra por setor"} className={`text-[13px] font-semibold px-3 py-1.5 rounded-t-lg disabled:opacity-40 inline-flex items-center gap-1 ${aba === "prontas" ? "bg-emerald-600 text-white" : "text-torg-gray hover:bg-gray-50"}`}><ClipboardList size={13} /> Peças prontas{data ? ` (${fmtN(prontas.length)})` : ""}</button>
        </div>

        {/* Toolbar: filtro + importar + placar */}
        <div className="flex items-center gap-2 flex-wrap px-5 py-2 border-b border-gray-50">
          <input value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Filtrar por marca ou descrição…" className="flex-1 min-w-[200px] border border-gray-300 rounded-lg px-3 py-1.5 text-[13px]" />
          {podeBaixa && aba === "despacho" && (
            <label className={`text-[12px] font-semibold text-torg-blue border border-torg-blue-100 rounded-lg px-3 py-1.5 inline-flex items-center gap-1.5 ${enviando ? "opacity-40 pointer-events-none" : "hover:bg-blue-50 cursor-pointer"}`} title="Dá baixa em massa a partir de uma planilha (colunas Peça/Marca e Qtd)">
              <FileUp size={13} /> Importar planilha
              <input type="file" accept=".xlsx,.xls,.csv" className="hidden" disabled={enviando} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) importar(f); }} />
            </label>
          )}
          {data && aba === "despacho" && Object.entries(data.placar).filter(([, v]) => v > 0).map(([k, v]) => (
            <span key={k} className="bg-gray-100 rounded-full px-2 py-0.5 text-[11px] font-medium">{ROTULO[k] || k}: {v}</span>
          ))}
        </div>

        {/* Tabela */}
        <div className="flex-1 overflow-auto px-5 py-2">
          {loading && <div className="py-10 text-center text-torg-gray"><Loader2 className="mx-auto animate-spin" /></div>}
          {erro && <p className="text-red-600 text-sm">{erro}</p>}
          {!loading && !erro && visiveis.length === 0 && (
            <p className="text-torg-gray text-sm text-center py-10">{aba === "prontas" ? "Nenhuma peça com baixa ainda." : filtro ? "Nenhuma peça no filtro." : "Nada a liberar — tudo pronto. 🎉"}</p>
          )}
          {!loading && visiveis.length > 0 && (
            <table className="w-full text-[13px] min-w-[820px]">
              <thead className="sticky top-0 bg-white z-10">
                <tr className="border-b border-gray-200 text-[11px] uppercase tracking-wide">
                  <th className="px-2 py-2 w-8"><input type="checkbox" checked={sel.size === visLimit.length && visLimit.length > 0} onChange={selTodas} /></th>
                  <th className={th}>Marca</th>
                  <th className={th}>Descrição</th>
                  <th className={`${th} text-right`}>Qtd</th>
                  <th className={`${th} text-right`}>Baixada</th>
                  <th className={`${th} text-right`}>Produz. Syneco</th>
                  <th className={`${th} text-right`}>Peso un.</th>
                  <th className={`${th} text-right`}>Peso tot.</th>
                  <th className={`${th} text-center`}>Syneco</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {visLimit.map((p) => (
                  <tr key={p.id} className={`hover:bg-gray-50 cursor-pointer ${sel.has(p.id) ? "bg-blue-50/50" : ""}`} onClick={() => toggle(p.id)}>
                    <td className="px-2 py-1.5"><input type="checkbox" checked={sel.has(p.id)} onChange={() => toggle(p.id)} onClick={(e) => e.stopPropagation()} /></td>
                    <td className={`${td} font-mono font-semibold whitespace-nowrap`}>{p.marca}</td>
                    <td className={`${td} text-torg-gray max-w-[280px] truncate`} title={p.descricao || ""}>{p.descricao || "—"}</td>
                    <td className={`${td} text-right tabular-nums`}>{fmtN(p.qte)}</td>
                    <td className={`${td} text-right tabular-nums ${p.baixadoQtd ? "text-emerald-700 font-semibold" : "text-gray-300"}`}>{p.baixadoQtd ? fmtN(p.baixadoQtd) : "—"}</td>
                    <td className={`${td} text-right tabular-nums text-torg-gray`}>{p.produzidoSyneco ? fmtN(p.produzidoSyneco) : "—"}</td>
                    <td className={`${td} text-right tabular-nums text-torg-gray`}>{p.pesoUnitKg ? fmtKg(p.pesoUnitKg) : "—"}</td>
                    <td className={`${td} text-right tabular-nums`}>{p.pesoTotalKg ? fmtKg(p.pesoTotalKg) : "—"}</td>
                    <td className={`${td} text-center`}>
                      {p.baixadoPortal
                        ? (p.precisaSyneco
                          ? <span className="text-amber-700 bg-amber-50 text-[10px] rounded px-1.5 py-0.5 whitespace-nowrap" title="Baixado no portal, mas o Syneco ainda não tem produção equivalente">falta Syneco</span>
                          : <span className="text-emerald-700 bg-emerald-50 text-[10px] rounded px-1.5 py-0.5">ok</span>)
                        : <span className="text-gray-300">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {visiveis.length > LIMITE && <p className="text-[11px] text-torg-gray mt-2">Mostrando {LIMITE} de {fmtN(visiveis.length)} — use o filtro pra refinar (o "Selecionar todas" pega as {LIMITE} visíveis).</p>}
        </div>

        {/* Ações por aba */}
        {aba === "prontas" ? (
          <div className="border-t border-gray-100 px-5 py-3 flex items-center gap-2 flex-wrap">
            <button onClick={reverterBaixa} disabled={!sel.size || enviando} className="text-[12px] font-semibold text-torg-dark rounded-lg px-3 py-2 inline-flex items-center gap-1.5 disabled:opacity-40 bg-gray-100 hover:bg-gray-200"><Undo2 size={13} /> Reverter baixa</button>
            <p className="text-[11px] text-torg-gray">{sel.size} selecionada(s) · histórico do que já teve baixa neste setor.</p>
          </div>
        ) : (
          <div className="border-t border-gray-100 px-5 py-3 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              {podeBaixa && (
                <button onClick={baixar} disabled={!sel.size || enviando} title="Dá baixa (peça inteira) nas selecionadas neste setor"
                  className="text-[12px] font-semibold text-white rounded-lg px-3 py-2 inline-flex items-center gap-1.5 disabled:opacity-40 bg-emerald-600 hover:bg-emerald-700"><CheckCircle2 size={13} /> Dar baixa em {setor ? SETOR_LABEL[setor] || setor : ""}</button>
              )}
              <span className="w-px h-6 bg-gray-200 mx-1" />
              <span className="text-[11px] text-torg-gray">Destinar em aberto:</span>
              <select value={terceiroVolta} onChange={(e) => setTerceiroVolta(e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1 text-[11px]" title="Volta do terceiro">
                {VOLTA.map((v) => <option key={v} value={v}>{v[0] + v.slice(1).toLowerCase()}</option>)}
              </select>
              {DESTINOS.map((d) => (
                <button key={d.key} onClick={() => despachar(d.key)} disabled={!sel.size || enviando} title={d.desc}
                  className={`text-[11px] font-semibold text-white rounded-lg px-2.5 py-2 inline-flex items-center gap-1 disabled:opacity-40 ${d.cor}`}><d.icon size={12} /> {d.label}</button>
              ))}
            </div>
            <p className="text-[11px] text-torg-gray">{sel.size} selecionada(s) · <b>Dar baixa</b> = concluída no setor (vai pro histórico). Destinar age só nas <b>em aberto</b>. A baixa é do portal; a coluna Syneco mostra o que falta acertar lá.</p>
          </div>
        )}
      </div>
    </div>
  );
}
