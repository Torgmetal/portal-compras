"use client";
import { useState, useEffect, useMemo, useCallback } from "react";
import { fmtOP } from "@/lib/utils";
import {
  ClipboardPaste, Plus, Trash2, Loader2, AlertTriangle, CheckCircle2, FileText,
  Truck, Weight, Package, Printer, X, Boxes, RotateCcw, Layers,
} from "lucide-react";

const fmtKg = (v) => `${Number(v || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} kg`;
const fmtData = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—");
const up = (s) => String(s || "").trim().toUpperCase();
const hojeISO = () => new Date().toISOString().slice(0, 10);
const uid = () => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2));

const SETORES = [["CORTE", "Corte"], ["MONTAGEM", "Montagem"], ["SOLDA", "Solda"], ["ACABAMENTO", "Acab."], ["JATO", "Jato"], ["PINTURA", "Pintura"]];

// Colagem estilo Excel: uma marca por linha; qtd opcional (tab, ; , ou espaço).
function parseColados(texto) {
  const out = [];
  for (const raw of String(texto || "").split(/\r?\n/)) {
    const l = raw.trim();
    if (!l) continue;
    let marca = l, qtd = null;
    const parts = l.split(/[\t;,]/).map((s) => s.trim()).filter(Boolean);
    if (parts.length >= 2 && /^\d+([.,]\d+)?$/.test(parts[parts.length - 1])) {
      qtd = parseFloat(parts[parts.length - 1].replace(",", "."));
      marca = parts.slice(0, -1).join(" ");
    } else if (parts.length === 1) {
      const m = l.match(/^(.*?)\s+(\d+([.,]\d+)?)$/);
      if (m) { marca = m[1].trim(); qtd = parseFloat(m[2].replace(",", ".")); }
    }
    if (marca) out.push({ marca: up(marca), qtd });
  }
  return out;
}

const ORIGEM = {
  carga: { label: "Carga", cls: "bg-torg-blue-50 text-torg-blue border-torg-blue-200" },
  reprogramado: { label: "Prioridade", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  manual: { label: "Incluída", cls: "bg-gray-50 text-gray-500 border-gray-200" },
};

export default function MontarRomaneio({ op, marcas, onCriado, showToast }) {
  const marcasMap = useMemo(() => {
    const m = new Map();
    for (const x of marcas || []) m.set(up(x.marca), x);
    return m;
  }, [marcas]);

  const [texto, setTexto] = useState("");
  const [linhas, setLinhas] = useState([]); // { key, marca, qtd, descricao, pesoUnit, encontrada, cargaItemId?, cargaId?, pecaConjuntoId?, origem }
  const [statusMap, setStatusMap] = useState({});
  const [carregandoStatus, setCarregandoStatus] = useState(false);
  const [gerando, setGerando] = useState(false);

  // Dados da carga / transportadora
  const [data, setData] = useState(hojeISO());
  const [destino, setDestino] = useState("");
  const [transportadora, setTransportadora] = useState("");
  const [motorista, setMotorista] = useState("");
  const [placa, setPlaca] = useState("");
  const [contato, setContato] = useState("");
  const [observacao, setObservacao] = useState("");

  // Carga do Planejamento (origem das peças)
  const [cargas, setCargas] = useState([]);
  const [cargaSel, setCargaSel] = useState(null);   // id da carga primária
  const [removidos, setRemovidos] = useState([]);   // [{cargaItemId, marca, motivo, reprogramar}]
  const [modalRemover, setModalRemover] = useState(null); // linha em remoção

  useEffect(() => {
    fetch(`/api/expedicao/planejamento?opId=${op.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setCargas(j?.planejamentos || []))
      .catch(() => {});
  }, [op.id]);

  const cargasDisp = useMemo(() => cargas.filter((c) => !c.romaneio && ["PLANEJADO", "EM_CARGA"].includes(c.status)), [cargas]);
  const nReprog = useMemo(() => cargas.reduce((s, c) => s + (c.itens || []).filter((it) => it.status === "REPROGRAMADO").length, 0), [cargas]);
  const itensAtivos = (c) => (c.itens || []).filter((it) => ["PLANEJADO", "PARCIAL"].includes(it.status)).length;

  // Linha a partir de um item da carga (peça ou acessório).
  function linhaDeCargaItem(it, cargaId, origem) {
    const pc = it.pecaConjunto, rm = it.rmItem;
    const marca = pc?.marca || (rm?.descricao || it.descricao || "").slice(0, 40) || "ITEM";
    const qtd = Number(it.qtdPlanejada) || pc?.qte || rm?.qtd || 1;
    const pesoTotal = it.pesoEstimadoKg ?? pc?.pesoTotalKg ?? rm?.peso ?? null;
    return {
      key: uid(), marca: up(marca), qtd, descricao: pc?.descricao || rm?.descricao || it.descricao || "",
      pesoUnit: pesoTotal != null && qtd ? pesoTotal / qtd : null, encontrada: true,
      cargaItemId: it.id, cargaId, pecaConjuntoId: pc?.id || null, origem,
    };
  }

  // Carrega as peças da carga + as reprogramadas (prioridade) da OP.
  function carregarCarga(carga) {
    const itensCarga = (carga.itens || []).filter((it) => ["PLANEJADO", "PARCIAL"].includes(it.status));
    const reprog = [];
    for (const c of cargas) for (const it of c.itens || []) if (it.status === "REPROGRAMADO") reprog.push({ it, cargaId: c.id });
    const jaNaCarga = new Set(itensCarga.map((it) => it.id));
    setLinhas([
      ...itensCarga.map((it) => linhaDeCargaItem(it, carga.id, "carga")),
      ...reprog.filter(({ it }) => !jaNaCarga.has(it.id)).map(({ it, cargaId }) => linhaDeCargaItem(it, cargaId, "reprogramado")),
    ]);
    setCargaSel(carga.id);
    setRemovidos([]);
    setStatusMap({});
  }

  const montarLinha = useCallback((marca, qtd) => {
    const ref = marcasMap.get(up(marca));
    const pesoUnit = ref?.pesoUnit ?? (ref && ref.qte ? (ref.pesoTotal || 0) / ref.qte : null);
    const q = qtd != null && qtd > 0 ? qtd : (ref?.qte || 1);
    return { key: uid(), marca: up(marca), qtd: q, descricao: ref?.descricao || "", pesoUnit: pesoUnit ?? null, encontrada: !!ref, pecaConjuntoId: ref?.pecaConjuntoId || null, origem: "manual" };
  }, [marcasMap]);

  function adicionar() {
    const parsed = parseColados(texto);
    if (!parsed.length) return;
    setLinhas((prev) => {
      const existentes = new Set(prev.map((l) => l.marca));
      const novas = parsed.filter((p) => !existentes.has(p.marca)).map((p) => montarLinha(p.marca, p.qtd));
      return [...prev, ...novas];
    });
    setTexto("");
  }

  const setQtd = (key, v) => setLinhas((prev) => prev.map((l) => (l.key === key ? { ...l, qtd: v === "" ? "" : Number(v) } : l)));
  // Tirar peça: se veio da carga, exige justificar (modal); se foi incluída na mão, sai direto.
  const remover = (key) => {
    const l = linhas.find((x) => x.key === key);
    if (l?.cargaItemId) { setModalRemover(l); return; }
    setLinhas((prev) => prev.filter((x) => x.key !== key));
  };
  function confirmarRemocao(motivo, reprogramar) {
    const l = modalRemover;
    if (!l) return;
    setRemovidos((prev) => [...prev, { cargaItemId: l.cargaItemId, marca: l.marca, motivo, reprogramar }]);
    setLinhas((prev) => prev.filter((x) => x.key !== l.key));
    setModalRemover(null);
  }
  const limpar = () => { setLinhas([]); setCargaSel(null); setRemovidos([]); };

  // Busca o status do Syneco pras marcas da carga (montagem/solda etc.)
  useEffect(() => {
    const faltam = linhas.map((l) => l.marca).filter((m) => !(m in statusMap));
    if (!faltam.length) return;
    let vivo = true;
    setCarregandoStatus(true);
    (async () => {
      try {
        const res = await fetch(`/api/expedicao/op/${op.id}/marcas-status`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ marcas: faltam }),
        });
        const j = await res.json();
        if (vivo && j.status) setStatusMap((prev) => ({ ...prev, ...j.status }));
      } catch { /* silencioso */ } finally { if (vivo) setCarregandoStatus(false); }
    })();
    return () => { vivo = false; };
  }, [linhas, op.id, statusMap]);

  const validas = linhas.filter((l) => l.encontrada && Number(l.qtd) > 0);
  const invalidas = linhas.filter((l) => !l.encontrada);
  const totalUn = validas.reduce((s, l) => s + (Number(l.qtd) || 0), 0);
  const totalKg = validas.reduce((s, l) => s + (Number(l.qtd) || 0) * (l.pesoUnit || 0), 0);

  async function gerar() {
    if (!validas.length) { showToast("Inclua ao menos uma marca válida.", "error"); return; }
    setGerando(true);
    try {
      const itens = validas.map((l) => ({
        marca: l.marca, descricao: l.descricao || null, qtd: Number(l.qtd),
        pesoKg: (Number(l.qtd) || 0) * (l.pesoUnit || 0),
        pecaConjuntoId: l.pecaConjuntoId || null, cargaItemId: l.cargaItemId || null,
      }));
      const res = await fetch(`/api/expedicao/op/${op.id}/romaneio`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data, destino: destino || null, transportadora: transportadora || null, motorista: motorista || null,
          placaVeiculo: placa || null, contatoTransporte: contato || null, observacao: observacao || null,
          cargaId: cargaSel, removidos: removidos.map((r) => ({ cargaItemId: r.cargaItemId, motivo: r.motivo, reprogramar: r.reprogramar })),
          itens,
        }),
      });
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j.error || "Erro ao gerar romaneio");
      if (j.sharepoint?.ok) showToast(`Romaneio ${j.numero} gerado e salvo no servidor (4.2 Romaneios)`, "success");
      else if (j.sharepoint) showToast(`Romaneio ${j.numero} gerado — mas não salvou no SharePoint: ${j.sharepoint.erro}`, "error");
      else showToast(`Romaneio ${j.numero} gerado`, "success");
      window.open(`/expedicao/romaneio/${j.id}/imprimir`, "_blank");
      setLinhas([]); setStatusMap({}); setCargaSel(null); setRemovidos([]);
      setDestino(""); setTransportadora(""); setMotorista(""); setPlaca(""); setContato(""); setObservacao("");
      onCriado?.();
    } catch (e) { showToast(e.message, "error"); } finally { setGerando(false); }
  }

  return (
    <div className="space-y-5">
      {/* Cargas do Planejamento */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <p className="text-sm font-semibold text-torg-dark flex items-center gap-2 mb-1"><Layers size={16} className="text-torg-blue" /> Cargas do Planejamento</p>
        {cargasDisp.length === 0 ? (
          <p className="text-xs text-torg-gray">Nenhuma carga planejada aberta pra esta OP. Você pode montar colando as marcas abaixo.{nReprog > 0 ? ` (há ${nReprog} peça(s) reprogramada(s) aguardando uma carga.)` : ""}</p>
        ) : (
          <div className="space-y-2 mt-1">
            {cargasDisp.map((c) => (
              <div key={c.id} className={`flex items-center justify-between gap-2 border rounded-lg px-3 py-2 ${cargaSel === c.id ? "border-torg-blue bg-torg-blue-50/40" : "border-gray-200"}`}>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-torg-dark truncate">{c.descricao || `Carga de ${fmtData(c.dataPrevista)}`}</p>
                  <p className="text-[11px] text-torg-gray">{itensAtivos(c)} peça(s) · prevista {fmtData(c.dataPrevista)}</p>
                </div>
                <button onClick={() => carregarCarga(c)}
                  className="text-xs font-semibold text-white bg-torg-blue hover:bg-torg-dark px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5 shrink-0">
                  <Boxes size={13} /> {cargaSel === c.id ? "Recarregar" : "Carregar"}
                </button>
              </div>
            ))}
            {nReprog > 0 && <p className="text-[11px] text-amber-700 inline-flex items-center gap-1"><RotateCcw size={12} /> {nReprog} peça(s) reprogramada(s) (prioridade) entram junto ao carregar.</p>}
          </div>
        )}
      </div>

      {/* Incluir marcas na mão */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <p className="text-sm font-semibold text-torg-dark flex items-center gap-2 mb-1"><ClipboardPaste size={16} className="text-torg-blue" /> Incluir marcas (opcional)</p>
        <p className="text-xs text-torg-gray mb-2">Uma marca por linha (igual no Excel). Quantidade opcional na frente (tab, vírgula ou espaço) — sem qtd, usa a prevista.</p>
        <textarea value={texto} onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") adicionar(); }}
          rows={3} placeholder={"T64A1\nT64A2  2\nT64A10;6"}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-torg-blue focus:border-transparent" />
        <div className="flex items-center justify-between mt-2">
          <span className="text-[11px] text-torg-gray">Dica: Ctrl+Enter adiciona.</span>
          <button onClick={adicionar} disabled={!texto.trim()}
            className="text-sm font-semibold text-white bg-torg-blue hover:bg-torg-dark px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5 disabled:opacity-50">
            <Plus size={15} /> Adicionar à carga
          </button>
        </div>
      </div>

      {/* Carga montada */}
      {linhas.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm text-center py-12 text-torg-gray">
          <Package size={30} className="mx-auto mb-2 text-gray-300" />
          <p className="text-sm">Nenhuma peça na carga ainda. Carregue uma carga do Planejamento acima, ou cole as marcas.</p>
        </div>
      ) : (
        <>
          {invalidas.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 flex items-start gap-2">
              <AlertTriangle size={15} className="text-red-500 mt-0.5 shrink-0" />
              <p className="text-xs text-red-700"><strong>{invalidas.length}</strong> marca(s) não encontrada(s) na Lista de Expedição desta OP — serão ignoradas na geração: <span className="font-mono">{invalidas.slice(0, 10).map((l) => l.marca).join(", ")}</span>{invalidas.length > 10 ? "…" : ""}</p>
            </div>
          )}

          {removidos.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 text-xs text-amber-800">
              <strong>{removidos.length}</strong> peça(s) tirada(s) da carga:{" "}
              {removidos.map((r) => `${r.marca} (${r.reprogramar ? "→ próximo romaneio" : "não enviada"})`).join(", ")}
            </div>
          )}

          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="bg-gray-100 border-b border-gray-200"><tr className="text-torg-dark">
                <th className="px-3 py-2.5 font-semibold text-left">Marca</th>
                <th className="px-3 py-2.5 font-semibold text-left">Origem</th>
                <th className="px-3 py-2.5 font-semibold text-left">Descrição</th>
                <th className="px-3 py-2.5 font-semibold text-center">Syneco {carregandoStatus && <Loader2 size={11} className="inline animate-spin ml-1" />}</th>
                <th className="px-3 py-2.5 font-semibold text-right">Qtd</th>
                <th className="px-3 py-2.5 font-semibold text-right">Peso</th>
                <th className="px-3 py-2.5 font-semibold text-center"></th>
              </tr></thead>
              <tbody className="divide-y divide-gray-50">
                {linhas.map((l) => {
                  const org = ORIGEM[l.origem] || ORIGEM.manual;
                  return (
                    <tr key={l.key} className={`hover:bg-gray-50/50 ${!l.encontrada ? "bg-red-50/40" : ""}`}>
                      <td className="px-3 py-2 font-mono font-semibold text-torg-dark whitespace-nowrap">
                        {l.marca}
                        {!l.encontrada && <span className="ml-1.5 text-[10px] text-red-600 font-sans">não encontrada</span>}
                      </td>
                      <td className="px-3 py-2"><span className={`inline-block text-[10px] font-medium px-2 py-0.5 rounded-full border ${org.cls}`}>{org.label}</span></td>
                      <td className="px-3 py-2 text-torg-gray max-w-[260px] truncate" title={l.descricao || ""}>{l.descricao || "—"}</td>
                      <td className="px-3 py-2"><SynecoDots st={statusMap[l.marca]} /></td>
                      <td className="px-3 py-2 text-right">
                        <input type="number" min="0" value={l.qtd} onChange={(e) => setQtd(l.key, e.target.value)}
                          className="w-20 text-right text-[13px] tabular-nums border border-gray-300 rounded px-2 py-1 focus:border-torg-blue outline-none" />
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap text-torg-gray">{l.pesoUnit ? fmtKg((Number(l.qtd) || 0) * l.pesoUnit) : "—"}</td>
                      <td className="px-3 py-2 text-center">
                        <button onClick={() => remover(l.key)} className="text-gray-400 hover:text-red-600" title={l.cargaItemId ? "Tirar (exige motivo)" : "Remover"}><Trash2 size={15} /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-gray-50/60 border-t border-gray-200">
                <tr className="font-semibold text-torg-dark">
                  <td className="px-3 py-2" colSpan={4}>
                    <button onClick={limpar} className="text-[11px] text-torg-gray hover:text-red-600 font-normal inline-flex items-center gap-1"><X size={12} /> limpar carga</button>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{totalUn} un</td>
                  <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap inline-flex items-center gap-1 justify-end"><Weight size={12} /> {fmtKg(totalKg)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Legenda Syneco */}
          <div className="flex items-center gap-3 flex-wrap text-[11px] text-torg-gray">
            <span className="font-medium">Syneco:</span>
            <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-torg-blue" /> Montagem/Solda</span>
            <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Outros setores</span>
            <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-gray-200" /> não apontado</span>
          </div>

          {/* Dados da carga */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-3">
            <p className="text-sm font-semibold text-torg-dark flex items-center gap-2"><Truck size={16} className="text-torg-blue" /> Dados da carga</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <Campo label="Data de saída"><input type="date" value={data} onChange={(e) => setData(e.target.value)} className="inp" /></Campo>
              <Campo label="Local de entrega"><input value={destino} onChange={(e) => setDestino(e.target.value)} placeholder="Local de entrega" className="inp" /></Campo>
              <Campo label="Transportadora"><input value={transportadora} onChange={(e) => setTransportadora(e.target.value)} placeholder="Transportadora" className="inp" /></Campo>
              <Campo label="Motorista"><input value={motorista} onChange={(e) => setMotorista(e.target.value)} placeholder="Motorista" className="inp" /></Campo>
              <Campo label="Placa"><input value={placa} onChange={(e) => setPlaca(e.target.value)} placeholder="Placa do veículo" className="inp" /></Campo>
              <Campo label="Contato"><input value={contato} onChange={(e) => setContato(e.target.value)} placeholder="Telefone" className="inp" /></Campo>
            </div>
            <Campo label="Observação"><input value={observacao} onChange={(e) => setObservacao(e.target.value)} placeholder="Opcional" className="inp" /></Campo>
          </div>

          {/* Ação */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <p className="text-xs text-torg-gray">
              {validas.length} peça(s) · {totalUn} un · {fmtKg(totalKg)}
              <span className="text-[11px] text-torg-gray/80"> — o nº do romaneio (R#) é gerado automático por OP; a planilha é salva no servidor.</span>
            </p>
            <button onClick={gerar} disabled={gerando || !validas.length}
              className="text-sm font-semibold text-white bg-torg-blue hover:bg-torg-dark px-4 py-2 rounded-lg inline-flex items-center gap-2 disabled:opacity-50">
              {gerando ? <Loader2 size={15} className="animate-spin" /> : <Printer size={15} />} Gerar romaneio
            </button>
          </div>
        </>
      )}

      {modalRemover && <ModalRemover linha={modalRemover} onCancel={() => setModalRemover(null)} onConfirm={confirmarRemocao} />}

      <style jsx>{`.inp{ width:100%; border:1px solid #d1d5db; border-radius:0.5rem; padding:0.375rem 0.625rem; font-size:0.8125rem; outline:none; }
        .inp:focus{ border-color:#006EAB; box-shadow:0 0 0 1px rgba(0,110,171,.3); }`}</style>
    </div>
  );
}

// Modal de remoção de peça da carga: motivo obrigatório + mandar pro próximo romaneio.
function ModalRemover({ linha, onCancel, onConfirm }) {
  const [motivo, setMotivo] = useState("");
  const [reprogramar, setReprogramar] = useState(true);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onCancel}>
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-5" onClick={(e) => e.stopPropagation()}>
        <p className="text-base font-bold text-torg-dark flex items-center gap-2 mb-1"><AlertTriangle size={18} className="text-amber-500" /> Tirar <span className="font-mono">{linha.marca}</span> da carga</p>
        <p className="text-xs text-torg-gray mb-3">Essa peça foi selecionada pelo Planejamento. Justifique por que está saindo deste romaneio.</p>
        <label className="block mb-3">
          <span className="text-[11px] font-medium text-torg-gray uppercase tracking-wide">Motivo</span>
          <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} autoFocus
            placeholder="Ex.: peça ainda na pintura / avaria / não coube na carga"
            className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue focus:border-transparent" />
        </label>
        <label className="flex items-start gap-2 mb-4 cursor-pointer">
          <input type="checkbox" checked={reprogramar} onChange={(e) => setReprogramar(e.target.checked)} className="mt-0.5 rounded border-gray-300" />
          <span className="text-[13px] text-torg-dark">
            <strong>Mandar pro próximo romaneio</strong> (prioridade)
            <span className="block text-[11px] text-torg-gray">Marcada, a peça reaparece na próxima montagem. Desmarcada, volta pra lista como <b>não enviada</b>.</span>
          </span>
        </label>
        <div className="flex items-center justify-end gap-2">
          <button onClick={onCancel} className="text-sm text-torg-gray hover:text-torg-dark px-3 py-1.5">Cancelar</button>
          <button onClick={() => motivo.trim() && onConfirm(motivo.trim(), reprogramar)} disabled={!motivo.trim()}
            className="text-sm font-semibold text-white bg-red-600 hover:bg-red-700 px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5 disabled:opacity-50">
            <Trash2 size={14} /> Tirar da carga
          </button>
        </div>
      </div>
    </div>
  );
}

function Campo({ label, children }) {
  return (
    <label className="block">
      <span className="text-[11px] font-medium text-torg-gray uppercase tracking-wide">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function SynecoDots({ st }) {
  if (!st) return <span className="inline-flex justify-center w-full"><Loader2 size={12} className="animate-spin text-gray-300" /></span>;
  if (!st.encontrado) return <span className="block text-center text-[10px] text-gray-300" title="Sem apontamento no Syneco">— s/ apont.</span>;
  return (
    <span className="flex items-center justify-center gap-1">
      {SETORES.map(([s, label]) => {
        const feito = !!st.setores?.[s];
        const destaque = s === "MONTAGEM" || s === "SOLDA";
        const cor = feito ? (destaque ? "bg-torg-blue" : "bg-emerald-500") : "bg-gray-200";
        return <span key={s} title={`${label}: ${feito ? "apontado" : "—"}`} className={`w-2.5 h-2.5 rounded-full ${cor}`} />;
      })}
    </span>
  );
}
