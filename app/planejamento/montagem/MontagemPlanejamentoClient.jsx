"use client";
// ─── PLANEJAMENTO › MONTAGEM ──────────────────────────────────────────────────
// Vitor (01/09/2026): "o planejamento programa de acordo com o tempo da preparação a data que
// deverá iniciar a montagem", "será por conjunto que tenha todas as sub peças prontas".
//
// ⚠⚠ A UNIDADE AQUI É O CONJUNTO, não a peça. Croqui não se monta — ele se corta e vira parte de um
// conjunto. É por isso que a tela não se parece com a fila de corte: lá o PCP dá uma janela e o
// portal reparte; aqui o que manda é a prontidão de CADA conjunto, e ela não chega em bloco.
//
// ⚠ DUAS RÉGUAS DE PRONTIDÃO, de propósito separadas. "Todas as sub peças cortadas" é o critério
// para MARCAR O DIA (pedido do Vitor); "pelo menos metade" é a regra da fábrica para PODER COMEÇAR
// (decisão dele em 12/06). Misturar as duas marcaria data para conjunto que ainda tem croqui na
// máquina — então o grupo da metade aparece à parte, e programar de lá exige confirmar.
import { useState, useMemo } from "react";
import {
  Wrench, CalendarClock, Search, Loader2, AlertCircle, CheckCircle2, ArrowRight, X, Layers,
} from "lucide-react";
import { fmtOP } from "@/lib/utils";
import { calcularProntidao } from "@/lib/prontidao-conjunto";

const isoHoje = () => new Date().toISOString().split("T")[0];
const isoDe = (v) => (v ? String(v).slice(0, 10) : "");
const fmtKg = (v) => `${(Number(v) || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} kg`;
const fmtDiaLongo = (iso) => {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00Z");
  const semana = d.toLocaleDateString("pt-BR", { weekday: "short", timeZone: "UTC" }).replace(".", "");
  return `${semana} ${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" })}`;
};

export default function MontagemPlanejamentoClient({ conjuntosIniciais, montados = {} }) {
  const [conjuntos, setConjuntos] = useState(conjuntosIniciais);
  const [sel, setSel] = useState(new Set());
  const [filtroOp, setFiltroOp] = useState("");
  const [busca, setBusca] = useState("");
  const [dia, setDia] = useState(isoHoje());
  const [agindo, setAgindo] = useState(false);
  const [erro, setErro] = useState("");
  const [okMsg, setOkMsg] = useState("");
  const [avisos, setAvisos] = useState([]);
  const [verMetade, setVerMetade] = useState(false);
  const [verSemCroqui, setVerSemCroqui] = useState(false);

  const enriquecidos = useMemo(() => conjuntos.map((c) => {
    const prontidao = calcularProntidao(c);
    const feito = Number(montados[c.marca] || 0);
    const necessario = Number(c.qte) || 1;
    return {
      ...c, prontidao,
      montado: feito >= necessario,
      emMontagem: feito > 0 && feito < necessario,
      feito,
    };
  }), [conjuntos, montados]);

  const ops = useMemo(
    () => [...new Set(enriquecidos.map((c) => c.opNumero).filter(Boolean))]
      .sort((a, b) => String(a).localeCompare(String(b), "pt-BR", { numeric: true })),
    [enriquecidos]
  );

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return enriquecidos.filter((c) => {
      if (filtroOp && c.opNumero !== filtroOp) return false;
      if (!q) return true;
      return [c.marca, c.descricao, c.op?.cliente, c.op?.obra].some((v) => String(v ?? "").toLowerCase().includes(q));
    });
  }, [enriquecidos, filtroOp, busca]);

  // ⚠ o conjunto MONTADO sai da tela de planejamento: ele já não é decisão de ninguém aqui.
  const aProgramar = useMemo(
    () => filtrados.filter((c) => !c.montagemDiaProgramado && !c.montado),
    [filtrados]
  );
  const programados = useMemo(
    () => filtrados.filter((c) => c.montagemDiaProgramado && !c.montado),
    [filtrados]
  );
  const prontos = useMemo(() => aProgramar.filter((c) => c.prontidao.pronto), [aProgramar]);
  const meioCaminho = useMemo(() => aProgramar.filter((c) => !c.prontidao.pronto && c.prontidao.liberavel), [aProgramar]);
  // ⚠⚠ CONJUNTO SEM CROQUI VINCULADO NÃO TEM PRONTIDÃO MEDÍVEL — e some da tela para sempre se
  // ficar junto do "falta cortar". São 30 hoje: ou a LPC não amarrou os croquis, ou o conjunto é
  // montado de item comprado. Aparecem à parte, selecionáveis, porque a alternativa é o
  // planejamento nunca conseguir marcar a data deles e ninguém entender por quê.
  const semCroqui = useMemo(() => aProgramar.filter((c) => c.prontidao.total === 0), [aProgramar]);
  const semCorte = useMemo(() => aProgramar.filter((c) => c.prontidao.total > 0 && !c.prontidao.podeLiberar), [aProgramar]);
  const montadosCount = useMemo(() => filtrados.filter((c) => c.montado).length, [filtrados]);

  const grupos = useMemo(() => {
    const hojeIso = isoHoje();
    const m = new Map();
    for (const c of programados) {
      const k = isoDe(c.montagemDiaProgramado);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(c);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([iso, lista]) => ({
      iso, lista,
      kg: lista.reduce((s, c) => s + (Number(c.pesoTotalKg) || 0), 0),
      // ⚠ VERMELHO = passou do dia e a montagem não terminou. Conjunto que a fábrica já começou
      // continua vermelho: começar não é entregar, e o dia era para estar pronto.
      atrasado: !!iso && iso < hojeIso,
      hoje: iso === hojeIso,
    }));
  }, [programados]);

  const atrasados = useMemo(() => grupos.filter((g) => g.atrasado).reduce((s, g) => s + g.lista.length, 0), [grupos]);
  const selecao = useMemo(() => filtrados.filter((c) => sel.has(c.id)), [filtrados, sel]);
  const somaKg = (arr) => arr.reduce((s, c) => s + (Number(c.pesoTotalKg) || 0), 0);

  const toggle = (id) => setSel((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const marcarLista = (lista) => {
    const ids = lista.map((c) => c.id);
    const todas = ids.length > 0 && ids.every((id) => sel.has(id));
    setSel((p) => { const n = new Set(p); ids.forEach((id) => (todas ? n.delete(id) : n.add(id))); return n; });
  };

  const agir = async (payload, msg) => {
    setAgindo(true); setErro(""); setOkMsg(""); setAvisos([]);
    try {
      const res = await fetch("/api/planejamento/montagem", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro na ação");
      setAvisos(data.avisos || []);
      if (data.atualizados > 0) setOkMsg(`${data.atualizados} conjunto(s) ${msg}.`);
      // ⚠ aplica só o que a rota confirmou: ela PULA conjunto sem o corte completo, e recarregar a
      // página perderia o aviso que diz exatamente quais ficaram de fora.
      const mudou = new Map((data.afetados || []).map((a) => [a.id, a]));
      setConjuntos((prev) => prev.map((c) => {
        const a = mudou.get(c.id);
        if (!a) return c;
        return {
          ...c,
          montagemDiaProgramado: a.montagemDiaProgramado,
          montagemDiaOriginal: a.montagemDiaProgramado == null ? null : (c.montagemDiaOriginal || a.montagemDiaProgramado),
          montagemAdiado: a.montagemDiaProgramado == null ? 0 : (c.montagemAdiado || 0) + (a.adiou ? 1 : 0),
        };
      }));
      setSel(new Set());
      return true;
    } catch (e) { setErro(e.message); return false; }
    finally { setAgindo(false); }
  };

  const selTemMeioCaminho = selecao.some((c) => !c.prontidao.pronto);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-extrabold text-torg-dark flex items-center gap-2">
            <Wrench size={20} className="text-torg-blue" /> Montagem — programação
          </h1>
          <p className="text-xs text-torg-gray mt-1 max-w-2xl">
            O dia em que cada <strong>conjunto</strong> deve entrar na montagem. Só entram no plano os que têm
            <strong> todas as sub peças cortadas</strong>; o que ainda tem croqui na máquina fica separado abaixo.
          </p>
        </div>
      </div>

      {erro && <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700 flex items-center gap-2"><AlertCircle size={14} /> {erro}</div>}
      {okMsg && <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 text-xs text-emerald-800">{okMsg}</div>}
      {avisos.map((a, i) => (
        <div key={i} className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800 flex items-start gap-2">
          <AlertCircle size={14} className="mt-0.5 shrink-0" /> {a}
        </div>
      ))}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi icon={CheckCircle2} cor="bg-emerald-600" label="Prontos para programar" valor={`${prontos.length}`} sub={fmtKg(somaKg(prontos))} />
        <Kpi icon={CalendarClock} cor="bg-torg-orange" label="Programados" valor={`${programados.length}`}
          sub={atrasados > 0 ? `${atrasados} passaram do dia` : fmtKg(somaKg(programados))} alerta={atrasados > 0} />
        <Kpi icon={Layers} cor="bg-amber-500" label="Falta cortar" valor={`${meioCaminho.length + semCorte.length}`}
          sub={`${meioCaminho.length} com ≥ metade${semCroqui.length ? ` · ${semCroqui.length} sem croqui` : ""}`} />
        <Kpi icon={Wrench} cor="bg-torg-blue" label="Já montados" valor={`${montadosCount}`} sub="baixa do Syneco" />
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <select value={filtroOp} onChange={(e) => setFiltroOp(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white">
          <option value="">Todas as obras</option>
          {ops.map((o) => <option key={o} value={o}>{fmtOP(o)}</option>)}
        </select>
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-torg-gray" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Marca, cliente, obra…"
            className="pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg w-64" />
        </div>
      </div>

      {sel.size > 0 && (
        <div className="bg-torg-blue-50/60 border border-torg-blue-100 rounded-xl px-3 py-2.5 flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold text-torg-dark">
            {sel.size} conjunto(s) · {fmtKg(somaKg(selecao))}
          </span>
          <label className="text-xs text-torg-gray ml-2">Início da montagem</label>
          <input type="date" value={dia} onChange={(e) => setDia(e.target.value)}
            className="px-2 py-1.5 text-sm border border-gray-200 rounded-lg" />
          <button onClick={() => agir({ acao: "programar", ids: [...sel], dia, forcar: selTemMeioCaminho }, "programado(s)")}
            disabled={agindo || !dia}
            className="px-3 py-1.5 bg-torg-blue text-white text-xs font-medium rounded-lg hover:bg-torg-blue-700 inline-flex items-center gap-1 disabled:opacity-50">
            {agindo ? <Loader2 size={13} className="animate-spin" /> : <CalendarClock size={13} />} Programar
          </button>
          <button onClick={() => agir({ acao: "adiar", ids: [...sel] }, "levado(s) para o próximo dia útil")} disabled={agindo}
            className="px-3 py-1.5 border border-red-200 text-red-700 text-xs font-medium rounded-lg hover:bg-red-50 inline-flex items-center gap-1 disabled:opacity-50">
            <ArrowRight size={13} /> Adiar 1 dia
          </button>
          <button onClick={() => agir({ acao: "desprogramar", ids: [...sel] }, "tirado(s) do plano")} disabled={agindo}
            className="px-3 py-1.5 border border-gray-200 text-torg-gray text-xs rounded-lg hover:bg-gray-50 disabled:opacity-50">
            Desprogramar
          </button>
          {selTemMeioCaminho && (
            <span className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1">
              a seleção tem conjunto sem todos os croquis cortados — vai entrar assim mesmo
            </span>
          )}
          <button onClick={() => setSel(new Set())} className="ml-auto p-1.5 text-torg-gray hover:bg-white rounded-lg"><X size={14} /></button>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-4">
        {/* ── A PROGRAMAR ───────────────────────────────────────────────────── */}
        <div className="bg-gray-50 rounded-xl border border-gray-100 border-t-4 border-t-emerald-500">
          <div className="px-3 py-2.5 flex items-center justify-between">
            <p className="text-xs font-bold text-torg-dark uppercase tracking-wide">A programar</p>
            <span className="text-[10px] text-torg-gray font-semibold">{prontos.length + (verMetade ? meioCaminho.length : 0)}</span>
          </div>
          <div className="px-2 pb-2 space-y-1.5 max-h-[64vh] overflow-y-auto">
            <CabecalhoGrupo cor="emerald" titulo="todas as sub peças cortadas" n={prontos.length} kg={somaKg(prontos)}
              onMarcar={prontos.length ? () => marcarLista(prontos) : null} />
            {prontos.length === 0 && <p className="text-[11px] text-torg-gray italic px-2 py-4 text-center">Nenhum conjunto com o corte completo nesta obra.</p>}
            {prontos.map((c) => <CardConjunto key={c.id} c={c} sel={sel} onToggle={toggle} />)}

            {meioCaminho.length > 0 && (
              <>
                <button onClick={() => setVerMetade((v) => !v)}
                  className="w-full text-left px-2 py-1.5 rounded-md border border-amber-200 bg-amber-50 text-[10px] text-amber-800 font-bold uppercase tracking-wide">
                  {verMetade ? "▾" : "▸"} {meioCaminho.length} com pelo menos metade cortada · {fmtKg(somaKg(meioCaminho))}
                  <span className="block font-normal normal-case mt-0.5">
                    a fábrica pode começar, mas ainda há croqui na máquina — programar daqui é decisão sua
                  </span>
                </button>
                {verMetade && meioCaminho.map((c) => <CardConjunto key={c.id} c={c} sel={sel} onToggle={toggle} aviso />)}
              </>
            )}

            {semCroqui.length > 0 && (
              <>
                <button onClick={() => setVerSemCroqui((v) => !v)}
                  className="w-full text-left px-2 py-1.5 rounded-md border border-gray-200 bg-white text-[10px] text-torg-gray font-bold uppercase tracking-wide">
                  {verSemCroqui ? "▾" : "▸"} {semCroqui.length} sem croqui vinculado · {fmtKg(somaKg(semCroqui))}
                  <span className="block font-normal normal-case mt-0.5">
                    não dá para medir a prontidão — ou a LPC não amarrou os croquis, ou o conjunto é montado de item comprado
                  </span>
                </button>
                {verSemCroqui && semCroqui.map((c) => <CardConjunto key={c.id} c={c} sel={sel} onToggle={toggle} aviso />)}
              </>
            )}

            {semCorte.length > 0 && (
              <p className="text-[11px] text-torg-gray italic px-2 py-2 text-center border-t border-gray-100 mt-1">
                + {semCorte.length} conjunto(s) ainda sem corte suficiente · {fmtKg(somaKg(semCorte))}
              </p>
            )}
          </div>
        </div>

        {/* ── PROGRAMADO, DIA A DIA ─────────────────────────────────────────── */}
        <div className="bg-gray-50 rounded-xl border border-gray-100 border-t-4 border-t-torg-orange">
          <div className="px-3 py-2.5 flex items-center justify-between">
            <p className="text-xs font-bold text-torg-dark uppercase tracking-wide">Programado</p>
            <span className="text-[10px] text-torg-gray font-semibold">{programados.length}</span>
          </div>
          <div className="px-2 pb-2 space-y-1.5 max-h-[64vh] overflow-y-auto">
            {grupos.length === 0 && <p className="text-[11px] text-torg-gray italic px-2 py-6 text-center">Nada programado — selecione conjuntos à esquerda e marque o dia.</p>}
            {grupos.map((g) => (
              <div key={g.iso} className="space-y-1.5 pb-1">
                <div className={`flex items-center gap-1.5 flex-wrap px-2 py-1.5 rounded-md border text-[10px] ${
                  g.atrasado ? "bg-red-50 border-red-200 text-red-700"
                    : g.hoje ? "bg-amber-50 border-amber-200 text-amber-800"
                    : "bg-white border-gray-100 text-torg-gray"}`}>
                  <CalendarClock size={11} />
                  <span className="font-bold uppercase tracking-wide">{fmtDiaLongo(g.iso)}</span>
                  <span className="font-semibold">{g.lista.length} conj · {fmtKg(g.kg)}</span>
                  {g.hoje && <span className="font-semibold">· hoje</span>}
                  {g.atrasado && (
                    <button onClick={() => agir({ acao: "adiar", ids: g.lista.map((c) => c.id) }, "levado(s) para o próximo dia útil")}
                      disabled={agindo}
                      className="ml-auto inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-600 text-white font-semibold hover:bg-red-700 disabled:opacity-50">
                      <ArrowRight size={10} /> levar p/ o próximo dia
                    </button>
                  )}
                </div>
                {g.lista.map((c) => <CardConjunto key={c.id} c={c} sel={sel} onToggle={toggle} alerta={g.atrasado} />)}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

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

function CabecalhoGrupo({ cor, titulo, n, kg, onMarcar }) {
  const cls = cor === "emerald" ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-white border-gray-100 text-torg-gray";
  return (
    <div className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md border text-[10px] ${cls}`}>
      <CheckCircle2 size={11} />
      <span className="font-bold uppercase tracking-wide">{titulo}</span>
      <span className="font-semibold">{n} conj · {fmtKg(kg)}</span>
      {onMarcar && (
        <button onClick={onMarcar} className="ml-auto underline font-semibold">selecionar todos</button>
      )}
    </div>
  );
}

function CardConjunto({ c, sel, onToggle, alerta, aviso }) {
  const p = c.prontidao;
  const original = isoDe(c.montagemDiaOriginal);
  const moveu = original && original !== isoDe(c.montagemDiaProgramado);
  const borda = sel?.has(c.id) ? "border-torg-blue ring-1 ring-torg-blue"
    : alerta ? "border-red-200 bg-red-50/40" : aviso ? "border-amber-200 bg-amber-50/30" : "border-gray-100";
  return (
    <div className={`rounded-lg border p-2.5 text-xs space-y-1 ${alerta || aviso ? "" : "bg-white"} ${borda}`}>
      <div className="flex items-center gap-2">
        <input type="checkbox" checked={sel?.has(c.id) || false} onChange={() => onToggle(c.id)} className="rounded border-gray-300" />
        <span className="font-mono font-bold text-torg-dark truncate">{c.marca}</span>
        <span className="text-torg-gray whitespace-nowrap">{c.qte}× · {fmtKg(c.pesoTotalKg)}</span>
        <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-torg-blue-50 text-torg-blue font-mono font-semibold whitespace-nowrap">
          {fmtOP(c.opNumero)}
        </span>
      </div>
      {c.descricao && <p className="text-[10px] text-torg-gray truncate">{c.descricao}</p>}
      <div className="flex items-center gap-2 flex-wrap text-[10px]">
        <span className={p.pronto ? "text-emerald-700 font-semibold" : p.liberavel ? "text-amber-700 font-semibold" : "text-torg-gray"}>
          {p.atendidos}/{p.total} croquis cortados
        </span>
        {c.emMontagem && <span className="text-torg-blue font-semibold">montagem iniciada · {c.feito}/{c.qte}</span>}
        {moveu && <span className="text-red-600 font-semibold">era {fmtDiaLongo(original)} · adiado {c.montagemAdiado}×</span>}
        {!moveu && alerta && <span className="text-red-600 font-semibold">não terminou no dia</span>}
      </div>
    </div>
  );
}
