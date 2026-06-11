"use client";
import { useState, useMemo } from "react";
import Link from "next/link";
import {
  ListOrdered, CalendarRange, Scissors, CheckCircle2, Loader2, AlertCircle,
  Play, Check, Undo2, X, ArrowUp, ArrowDown, ChevronsUp, Search, Target,
  Clock, Package,
} from "lucide-react";
import { fmtOP } from "@/lib/utils";
import { MAQUINA_LABEL, MAQUINA_COR } from "@/lib/maquina-corte";

// ─── helpers de data (comparação só por dia, em UTC) ───────────────────────
const diaUTC = (v) => {
  if (!v) return null;
  const d = new Date(v);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
};
const hojeUTC = () => {
  const d = new Date();
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
};
const difDias = (a, b) => Math.round((a - b) / 86400000);
const fmtData = (v) => (v ? new Date(v).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" }) : "—");
const fmtKg = (v) => {
  const kg = Number(v) || 0;
  if (kg >= 1000) return `${(kg / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} t`;
  return `${kg.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} kg`;
};
const isoHoje = () => new Date().toISOString().split("T")[0];

// Coluna do kanban em que a peça está (derivado — sem status novo no pipeline)
function colunaDa(p) {
  if (p.corteConcluidoEm) return "CORTADA";
  if (p.corteIniciadoEm) return "EM_CORTE";
  if (p.corteDataMetaInicio) return "PROGRAMADA";
  return "FILA";
}

export default function FilaCorteClient({ pecasIniciais }) {
  const [pecas, setPecas] = useState(pecasIniciais);
  const [sel, setSel] = useState(new Set());
  const [filtroOp, setFiltroOp] = useState("");
  const [busca, setBusca] = useState("");
  const [modalProgramar, setModalProgramar] = useState(false);
  const [metaInicio, setMetaInicio] = useState(isoHoje());
  const [metaFim, setMetaFim] = useState(isoHoje());
  const [agindo, setAgindo] = useState(false);
  const [erro, setErro] = useState("");
  const [avisos, setAvisos] = useState([]);
  const [okMsg, setOkMsg] = useState("");

  const hoje = hojeUTC();

  // ── filtros ──────────────────────────────────────────────────
  const filtradas = useMemo(() => {
    const q = busca.trim().toUpperCase();
    return pecas.filter((p) => {
      if (filtroOp && p.opNumero !== filtroOp) return false;
      if (q && !`${p.marca} ${p.perfil || ""} ${p.material || ""} ${p.descricao || ""}`.toUpperCase().includes(q)) return false;
      return true;
    });
  }, [pecas, filtroOp, busca]);

  const cols = useMemo(() => {
    const c = { FILA: [], PROGRAMADA: [], EM_CORTE: [], CORTADA: [] };
    for (const p of filtradas) c[colunaDa(p)].push(p);
    c.CORTADA.sort((a, b) => new Date(b.corteConcluidoEm) - new Date(a.corteConcluidoEm));
    return c;
  }, [filtradas]);

  const ops = useMemo(() => {
    const m = new Map();
    for (const p of pecas) if (!m.has(p.opNumero)) m.set(p.opNumero, p.op?.cliente || "");
    return [...m.entries()].sort();
  }, [pecas]);

  const somaKg = (arr) => arr.reduce((s, p) => s + (Number(p.pesoTotalKg) || 0), 0);
  const atrasadas = useMemo(
    () => filtradas.filter((p) => !p.corteConcluidoEm && p.corteDataMetaFim && diaUTC(p.corteDataMetaFim) < hoje).length,
    [filtradas, hoje]
  );
  const noPrazo30d = useMemo(() => {
    const conc = filtradas.filter((p) => p.corteConcluidoEm && p.corteDataMetaFim);
    if (conc.length === 0) return null;
    const ok = conc.filter((p) => diaUTC(p.corteConcluidoEm) <= diaUTC(p.corteDataMetaFim)).length;
    return Math.round((ok / conc.length) * 100);
  }, [filtradas]);

  // ── seleção ──────────────────────────────────────────────────
  const toggle = (id) => setSel((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleColuna = (lista) => {
    const ids = lista.map((p) => p.id);
    const todas = ids.length > 0 && ids.every((id) => sel.has(id));
    setSel((prev) => { const n = new Set(prev); ids.forEach((id) => (todas ? n.delete(id) : n.add(id))); return n; });
  };

  // ── ações ────────────────────────────────────────────────────
  const agir = async (payload, msg) => {
    setAgindo(true); setErro(""); setAvisos([]); setOkMsg("");
    try {
      const res = await fetch("/api/pcp/fila-corte", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro na ação");
      setPecas(data.pecas);
      setSel(new Set());
      setAvisos(data.avisos || []);
      if (data.atualizados > 0) setOkMsg(`${data.atualizados} peça(s) ${msg}.`);
      return true;
    } catch (e) {
      setErro(e.message);
      return false;
    } finally {
      setAgindo(false);
    }
  };

  const programar = async () => {
    const ok = await agir({ acao: "programar", ids: [...sel], metaInicio, metaFim }, "programada(s) — PMP de corte atualizado");
    if (ok) setModalProgramar(false);
  };

  // Reordenar dentro da fila (só sem filtros — a ordem é da fila inteira)
  const reordenar = (id, modo) => {
    const fila = pecas.filter((p) => colunaDa(p) === "FILA");
    const idx = fila.findIndex((p) => p.id === id);
    if (idx < 0) return;
    const nova = [...fila];
    const [item] = nova.splice(idx, 1);
    const destino = modo === "topo" ? 0 : modo === "subir" ? Math.max(0, idx - 1) : Math.min(nova.length, idx + 1);
    nova.splice(destino, 0, item);
    // otimista: aplica ordem local e persiste a fila inteira
    const ordemIds = nova.map((p) => p.id);
    setPecas((prev) => {
      const fora = prev.filter((p) => colunaDa(p) !== "FILA");
      return [...nova.map((p, i) => ({ ...p, corteOrdem: i + 1 })), ...fora];
    });
    fetch("/api/pcp/fila-corte", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acao: "ordenar", idsOrdenados: ordemIds }),
    }).catch(() => {});
  };

  const selecao = pecas.filter((p) => sel.has(p.id));
  const reordenavel = !filtroOp && !busca.trim();

  // ── render ───────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-torg-dark tracking-tight flex items-center gap-2">
            <Scissors size={26} className="text-torg-blue" /> Fila de Corte
          </h2>
          <p className="text-xs text-torg-gray mt-0.5">
            Peças liberadas entram na fila → programe a meta de início/fim (alimenta o PMP) → acompanhe o real × estimado.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/producao/programacao/corte" className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg text-torg-gray hover:bg-gray-50">
            Liberar peças →
          </Link>
          <Link href="/pcp/corte" className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg text-torg-gray hover:bg-gray-50 inline-flex items-center gap-1">
            <Scissors size={13} /> Corte ao vivo (Syneco)
          </Link>
          <Link href="/pcp/pmp" className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg text-torg-gray hover:bg-gray-50 inline-flex items-center gap-1">
            <Target size={13} /> Ver PMP
          </Link>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi icon={ListOrdered} cor="bg-torg-blue" label="Na fila" valor={`${cols.FILA.length} pç`} sub={fmtKg(somaKg(cols.FILA))} />
        <Kpi icon={CalendarRange} cor="bg-torg-orange" label="Programado" valor={`${cols.PROGRAMADA.length} pç`} sub={fmtKg(somaKg(cols.PROGRAMADA))} />
        <Kpi icon={Scissors} cor="bg-amber-600" label="Em corte" valor={`${cols.EM_CORTE.length} pç`}
          sub={atrasadas > 0 ? `${atrasadas} atrasada(s)` : fmtKg(somaKg(cols.EM_CORTE))} alerta={atrasadas > 0} />
        <Kpi icon={CheckCircle2} cor="bg-emerald-600" label="Cortadas (30d)" valor={`${cols.CORTADA.length} pç`}
          sub={noPrazo30d === null ? fmtKg(somaKg(cols.CORTADA)) : `${noPrazo30d}% no prazo`} />
      </div>

      {/* Filtros + ações em massa */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3 flex items-center gap-2 flex-wrap">
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-torg-gray" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar marca, perfil…"
            className="pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg w-44" />
        </div>
        <select value={filtroOp} onChange={(e) => setFiltroOp(e.target.value)}
          className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg bg-white">
          <option value="">Todas as OPs</option>
          {ops.map(([num, cliente]) => <option key={num} value={num}>OP {fmtOP(num)}{cliente ? ` — ${cliente}` : ""}</option>)}
        </select>
        {!reordenavel && (
          <span className="text-[10px] text-torg-gray italic">limpe os filtros para reordenar a fila</span>
        )}

        {sel.size > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap ml-auto">
            <span className="text-xs font-semibold text-torg-dark">{sel.size} selecionada(s) · {fmtKg(somaKg(selecao))}</span>
            <button onClick={() => { setMetaInicio(isoHoje()); setMetaFim(isoHoje()); setModalProgramar(true); }} disabled={agindo}
              className="px-3 py-1.5 bg-torg-blue text-white text-xs font-medium rounded-lg hover:bg-torg-blue-700 inline-flex items-center gap-1 disabled:opacity-50">
              <CalendarRange size={13} /> Programar…
            </button>
            <button onClick={() => agir({ acao: "iniciar", ids: [...sel] }, "iniciada(s)")} disabled={agindo}
              className="px-3 py-1.5 bg-amber-600 text-white text-xs font-medium rounded-lg hover:bg-amber-700 inline-flex items-center gap-1 disabled:opacity-50">
              <Play size={13} /> Iniciar
            </button>
            <button onClick={() => agir({ acao: "concluir", ids: [...sel] }, "concluída(s)")} disabled={agindo}
              className="px-3 py-1.5 bg-emerald-600 text-white text-xs font-medium rounded-lg hover:bg-emerald-700 inline-flex items-center gap-1 disabled:opacity-50">
              <Check size={13} /> Concluir
            </button>
            <button onClick={() => agir({ acao: "desprogramar", ids: [...sel] }, "devolvida(s) à fila")} disabled={agindo}
              className="px-3 py-1.5 border border-gray-200 text-torg-gray text-xs rounded-lg hover:bg-gray-50 disabled:opacity-50">
              Desprogramar
            </button>
            <button onClick={() => setSel(new Set())} className="p-1.5 text-torg-gray hover:bg-gray-100 rounded-lg" title="Limpar seleção">
              <X size={14} />
            </button>
          </div>
        )}
      </div>

      {erro && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2 flex items-start gap-2">
          <AlertCircle size={14} className="mt-0.5 shrink-0" /> {erro}
        </div>
      )}
      {okMsg && <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs rounded-lg px-3 py-2">{okMsg}</div>}
      {avisos.map((a, i) => (
        <div key={i} className="bg-amber-50 border border-amber-200 text-amber-700 text-xs rounded-lg px-3 py-2 flex items-start gap-2">
          <AlertCircle size={13} className="mt-0.5 shrink-0" /> {a}
        </div>
      ))}

      {/* Kanban */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 items-start">
        <Coluna titulo="Na fila" cor="border-t-torg-blue" lista={cols.FILA} sel={sel} onToggleColuna={toggleColuna}
          vazio="Nenhuma peça aguardando — libere peças na tela Peças / Corte.">
          {(p, i) => (
            <CardPeca key={p.id} p={p} sel={sel} onToggle={toggle} pos={i + 1}>
              {reordenavel && (
                <span className="inline-flex gap-0.5 ml-auto">
                  <BotIcone title="Topo da fila" onClick={() => reordenar(p.id, "topo")}><ChevronsUp size={12} /></BotIcone>
                  <BotIcone title="Subir" onClick={() => reordenar(p.id, "subir")}><ArrowUp size={12} /></BotIcone>
                  <BotIcone title="Descer" onClick={() => reordenar(p.id, "descer")}><ArrowDown size={12} /></BotIcone>
                </span>
              )}
            </CardPeca>
          )}
        </Coluna>

        <Coluna titulo="Programado" cor="border-t-torg-orange" lista={cols.PROGRAMADA} sel={sel} onToggleColuna={toggleColuna}
          vazio="Selecione peças da fila e clique em “Programar…”.">
          {(p) => {
            const dIni = difDias(hoje, diaUTC(p.corteDataMetaInicio));
            return (
              <CardPeca key={p.id} p={p} sel={sel} onToggle={toggle}>
                <span className="text-[10px] text-torg-gray inline-flex items-center gap-1">
                  <CalendarRange size={11} /> Meta {fmtData(p.corteDataMetaInicio)} → {fmtData(p.corteDataMetaFim)}
                </span>
                {dIni > 0 ? (
                  <span className="text-[10px] font-semibold text-red-600">deveria ter começado há {dIni}d</span>
                ) : dIni === 0 ? (
                  <span className="text-[10px] font-semibold text-amber-600">começa hoje</span>
                ) : (
                  <span className="text-[10px] text-torg-gray">começa em {-dIni}d</span>
                )}
              </CardPeca>
            );
          }}
        </Coluna>

        <Coluna titulo="Em corte" cor="border-t-amber-500" lista={cols.EM_CORTE} sel={sel} onToggleColuna={toggleColuna}
          vazio="Nada em corte agora.">
          {(p) => {
            const atrasoFim = difDias(hoje, diaUTC(p.corteDataMetaFim));
            return (
              <CardPeca key={p.id} p={p} sel={sel} onToggle={toggle}>
                <span className="text-[10px] text-torg-gray inline-flex items-center gap-1">
                  <Clock size={11} /> Início real {fmtData(p.corteIniciadoEm)} · meta fim {fmtData(p.corteDataMetaFim)}
                </span>
                {atrasoFim > 0 && <span className="text-[10px] font-bold text-red-600">+{atrasoFim}d de atraso</span>}
              </CardPeca>
            );
          }}
        </Coluna>

        <Coluna titulo="Cortadas" cor="border-t-emerald-500" lista={cols.CORTADA} sel={sel}
          vazio="Nenhuma peça concluída nos últimos 30 dias.">
          {(p) => {
            const atraso = difDias(diaUTC(p.corteConcluidoEm), diaUTC(p.corteDataMetaFim));
            return (
              <CardPeca key={p.id} p={p}>
                <span className="text-[10px] text-torg-gray">
                  Real {fmtData(p.corteIniciadoEm)} → {fmtData(p.corteConcluidoEm)} · meta era {fmtData(p.corteDataMetaFim)}
                </span>
                {p.corteDataMetaFim && (atraso > 0
                  ? <span className="text-[10px] font-bold text-red-600">+{atraso}d além da meta</span>
                  : <span className="text-[10px] font-semibold text-emerald-600">✓ no prazo</span>)}
                {p.status === "CORTE" && (
                  <button onClick={() => agir({ acao: "reabrir", ids: [p.id] }, "reaberta(s)")} disabled={agindo}
                    className="ml-auto text-[10px] text-torg-gray hover:text-torg-dark inline-flex items-center gap-0.5">
                    <Undo2 size={11} /> Reabrir
                  </button>
                )}
              </CardPeca>
            );
          }}
        </Coluna>
      </div>

      {/* Modal Programar */}
      {modalProgramar && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => !agindo && setModalProgramar(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-semibold text-torg-dark flex items-center gap-2"><CalendarRange size={16} className="text-torg-blue" /> Programar corte</h3>
              <button onClick={() => setModalProgramar(false)} disabled={agindo} className="text-torg-gray hover:text-torg-dark"><X size={16} /></button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <p className="text-xs text-torg-gray">
                <strong className="text-torg-dark">{sel.size} peça(s)</strong> · {fmtKg(somaKg(selecao))} ·{" "}
                {[...new Set(selecao.map((p) => p.opNumero))].map((n) => `OP ${fmtOP(n)}`).join(", ")}
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-torg-gray mb-1">Data meta — início *</label>
                  <input type="date" value={metaInicio} onChange={(e) => { setMetaInicio(e.target.value); if (metaFim < e.target.value) setMetaFim(e.target.value); }}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-torg-gray mb-1">Data meta — fim *</label>
                  <input type="date" value={metaFim} min={metaInicio} onChange={(e) => setMetaFim(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg" />
                </div>
              </div>
              <p className="text-[11px] text-torg-gray bg-torg-blue-50/50 border border-torg-blue-100 rounded-lg px-3 py-2">
                As quantidades e o peso são distribuídos pelos <strong>dias úteis (seg–sex)</strong> do período e entram
                como meta de <strong>Corte no PMP</strong>. As datas meta não mudam depois — o atraso aparece no kanban.
              </p>
            </div>
            <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-2">
              <button onClick={() => setModalProgramar(false)} disabled={agindo}
                className="px-4 py-2 text-sm text-torg-gray border border-gray-200 rounded-lg hover:bg-gray-50">Cancelar</button>
              <button onClick={programar} disabled={agindo || !metaInicio || !metaFim}
                className="px-4 py-2 bg-torg-blue text-white text-sm font-medium rounded-lg hover:bg-torg-blue-700 inline-flex items-center gap-2 disabled:opacity-50">
                {agindo ? <Loader2 size={15} className="animate-spin" /> : <CalendarRange size={15} />}
                Programar e alimentar PMP
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── componentes auxiliares ─────────────────────────────────────────────────
function Kpi({ icon: Icon, cor, label, valor, sub, alerta }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3.5 flex items-center gap-3">
      <div className={`${cor} p-2 rounded-lg`}><Icon size={18} className="text-white" /></div>
      <div className="min-w-0">
        <p className="text-[10px] text-torg-gray uppercase tracking-wider">{label}</p>
        <p className="text-lg font-extrabold text-torg-dark leading-tight">{valor}</p>
        <p className={`text-[10px] ${alerta ? "text-red-600 font-semibold" : "text-torg-gray"}`}>{sub}</p>
      </div>
    </div>
  );
}

function Coluna({ titulo, cor, lista, sel, onToggleColuna, vazio, children }) {
  const todas = lista.length > 0 && lista.every((p) => sel?.has(p.id));
  return (
    <div className={`bg-gray-50 rounded-xl border border-gray-100 border-t-4 ${cor}`}>
      <div className="px-3 py-2.5 flex items-center justify-between">
        <p className="text-xs font-bold text-torg-dark uppercase tracking-wide">{titulo}</p>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-torg-gray font-semibold">{lista.length}</span>
          {onToggleColuna && lista.length > 0 && (
            <input type="checkbox" checked={todas} onChange={() => onToggleColuna(lista)}
              title="Selecionar a coluna" className="rounded border-gray-300" />
          )}
        </div>
      </div>
      <div className="px-2 pb-2 space-y-1.5 max-h-[64vh] overflow-y-auto">
        {lista.length === 0
          ? <p className="text-[11px] text-torg-gray italic px-2 py-6 text-center">{vazio}</p>
          : lista.map((p, i) => children(p, i))}
      </div>
    </div>
  );
}

function CardPeca({ p, sel, onToggle, pos, children }) {
  return (
    <div className={`bg-white rounded-lg border p-2.5 text-xs space-y-1 ${sel?.has(p.id) ? "border-torg-blue ring-1 ring-torg-blue" : "border-gray-100"}`}>
      <div className="flex items-center gap-2">
        {onToggle && (
          <input type="checkbox" checked={sel?.has(p.id) || false} onChange={() => onToggle(p.id)} className="rounded border-gray-300" />
        )}
        {pos != null && <span className="text-[10px] font-bold text-torg-gray">#{pos}</span>}
        <span className="font-mono font-bold text-torg-dark truncate">{p.marca}</span>
        <span className="text-torg-gray whitespace-nowrap">{p.qte}× · {fmtKg(p.pesoTotalKg)}</span>
        <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-torg-blue-50 text-torg-blue font-mono font-semibold whitespace-nowrap">
          {fmtOP(p.opNumero)}
        </span>
      </div>
      <div className="flex items-center gap-1.5 flex-wrap text-[10px] text-torg-gray">
        {p.perfil && <span className="font-mono">{p.perfil}</span>}
        {p.material && <span>{p.material}</span>}
        {p.maquina && (
          <span className={`px-1.5 py-0.5 rounded font-medium ${MAQUINA_COR?.[p.maquina] || "bg-gray-100 text-gray-600"}`}>
            {MAQUINA_LABEL?.[p.maquina] || p.maquina}
          </span>
        )}
        {p.dataPrevista && <span className="inline-flex items-center gap-0.5"><Package size={10} /> prev. {fmtData(p.dataPrevista)}</span>}
      </div>
      <div className="flex items-center gap-2 flex-wrap">{children}</div>
    </div>
  );
}

function BotIcone({ title, onClick, children }) {
  return (
    <button title={title} onClick={onClick} className="p-1 text-torg-gray hover:text-torg-blue hover:bg-torg-blue-50 rounded">
      {children}
    </button>
  );
}
