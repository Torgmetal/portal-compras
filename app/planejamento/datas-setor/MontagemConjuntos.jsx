"use client";
// ─── MONTAGEM: os conjuntos da obra e o dia em que cada um começa ─────────────
// Vitor (01/09/2026): "precisamos criar uma espécie de aba para selecionar a montagem, isso será
// necessário para trazer os conjuntos da obra, e o planejamento programa de acordo com o tempo da
// preparação a data que deverá iniciar a montagem" — e, ao ver a primeira versão numa tela própria:
// "não era isso, queria dentro da aba de datas por setor".
//
// ⚠ MORA AQUI DENTRO DE PROPÓSITO. É a mesma conversa da liberação para o PCP: o planejamento já
// está com a obra aberta, olhando o marco de cada setor. Tela separada obrigava a escolher a obra
// duas vezes e deixava a data da montagem longe do marco que a justifica.
//
// ⚠ DUAS RÉGUAS DE PRONTIDÃO, separadas. "Todas as sub peças cortadas" é o critério para MARCAR O
// DIA (pedido do Vitor); "pelo menos metade" segue sendo a regra da fábrica para PODER COMEÇAR
// (decisão dele em 12/06). Misturar marcaria data para conjunto com croqui ainda na máquina.
import { useState, useEffect, useCallback, useMemo } from "react";
import { Loader2, AlertCircle, CalendarClock, ArrowRight, CheckCircle2, X } from "lucide-react";

const isoHoje = () => new Date().toISOString().split("T")[0];
const isoDe = (v) => (v ? String(v).slice(0, 10) : "");
const fmtKg = (v) => `${(Number(v) || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} kg`;
const fmtDiaLongo = (iso) => {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00Z");
  const semana = d.toLocaleDateString("pt-BR", { weekday: "short", timeZone: "UTC" }).replace(".", "");
  return `${semana} ${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" })}`;
};

export default function MontagemConjuntos({ opId, marcoMontagem }) {
  const [conjuntos, setConjuntos] = useState(null);
  const [montados, setMontados] = useState({});
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [okMsg, setOkMsg] = useState("");
  const [avisos, setAvisos] = useState([]);
  const [sel, setSel] = useState(new Set());
  // ⚠ o dia sugerido é o MARCO do cronograma, não hoje: é ele que o planejamento veio olhar.
  const [dia, setDia] = useState(marcoMontagem || isoHoje());
  const [agindo, setAgindo] = useState(false);
  const [verMetade, setVerMetade] = useState(false);
  const [verSemCroqui, setVerSemCroqui] = useState(false);

  const carregar = useCallback(async () => {
    if (!opId) return;
    setCarregando(true); setErro("");
    try {
      const r = await fetch(`/api/planejamento/montagem?opId=${encodeURIComponent(opId)}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro ao carregar os conjuntos");
      setConjuntos(j.conjuntos || []);
      setMontados(j.montados || {});
      setSel(new Set());
    } catch (e) { setErro(e.message); } finally { setCarregando(false); }
  }, [opId]);
  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => { if (marcoMontagem) setDia(marcoMontagem); }, [marcoMontagem]);

  const lista = useMemo(() => (conjuntos || []).map((c) => {
    const q = Number(c.qte) || 1;
    const feito = Number(montados[c.marca] || 0);
    return { ...c, montado: feito >= q, emMontagem: feito > 0 && feito < q, feito, q };
  }), [conjuntos, montados]);

  const aProgramar = useMemo(() => lista.filter((c) => !c.montagemDiaProgramado && !c.montado), [lista]);
  const prontos = useMemo(() => aProgramar.filter((c) => c.prontidao?.pronto), [aProgramar]);
  const meioCaminho = useMemo(() => aProgramar.filter((c) => !c.prontidao?.pronto && c.prontidao?.liberavel), [aProgramar]);
  const semCroqui = useMemo(() => aProgramar.filter((c) => (c.prontidao?.total || 0) === 0), [aProgramar]);
  const semCorte = useMemo(() => aProgramar.filter((c) => (c.prontidao?.total || 0) > 0 && !c.prontidao?.podeLiberar), [aProgramar]);
  const montadosN = useMemo(() => lista.filter((c) => c.montado).length, [lista]);

  const grupos = useMemo(() => {
    const hojeIso = isoHoje();
    const m = new Map();
    for (const c of lista.filter((c) => c.montagemDiaProgramado && !c.montado)) {
      const k = isoDe(c.montagemDiaProgramado);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(c);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([iso, l]) => ({
      iso, lista: l,
      kg: l.reduce((s, c) => s + (Number(c.pesoTotalKg) || 0), 0),
      // ⚠ vermelho = passou do dia e a montagem não terminou. Começar não é entregar.
      atrasado: !!iso && iso < hojeIso,
      hoje: iso === hojeIso,
    }));
  }, [lista]);

  const somaKg = (arr) => arr.reduce((s, c) => s + (Number(c.pesoTotalKg) || 0), 0);
  const selecao = useMemo(() => lista.filter((c) => sel.has(c.id)), [lista, sel]);
  const selForaDoPronto = selecao.some((c) => !c.prontidao?.pronto);

  const toggle = (id) => setSel((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const marcarLista = (l) => {
    const ids = l.map((c) => c.id);
    const todas = ids.length > 0 && ids.every((id) => sel.has(id));
    setSel((p) => { const n = new Set(p); ids.forEach((id) => (todas ? n.delete(id) : n.add(id))); return n; });
  };

  async function agir(payload, msg) {
    setAgindo(true); setErro(""); setOkMsg(""); setAvisos([]);
    try {
      const r = await fetch("/api/planejamento/montagem", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro na ação");
      setAvisos(j.avisos || []);
      if (j.atualizados > 0) setOkMsg(`${j.atualizados} conjunto(s) ${msg}.`);
      await carregar();
    } catch (e) { setErro(e.message); } finally { setAgindo(false); }
  }

  if (!opId) return null;
  if (carregando) return <p className="text-[12px] text-torg-gray inline-flex items-center gap-2 py-4"><Loader2 size={14} className="animate-spin" /> carregando os conjuntos…</p>;
  if (erro && !conjuntos) return <p className="text-[12px] text-red-700 inline-flex items-center gap-2 py-4"><AlertCircle size={14} /> {erro}</p>;
  if (!lista.length) return <p className="text-[12px] text-torg-gray py-4">Esta obra não tem conjuntos na LPC.</p>;

  return (
    <div className="space-y-3">
      {erro && <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-[12px] text-red-700">{erro}</div>}
      {okMsg && <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 text-[12px] text-emerald-800">{okMsg}</div>}
      {avisos.map((a, i) => (
        <div key={i} className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-[12px] text-amber-800 flex items-start gap-2">
          <AlertCircle size={14} className="mt-0.5 shrink-0" /> {a}
        </div>
      ))}

      <div className="flex items-center gap-3 flex-wrap text-[12px] text-torg-gray">
        <span><b className="text-emerald-700">{prontos.length}</b> prontos · {fmtKg(somaKg(prontos))}</span>
        <span><b className="text-torg-dark">{grupos.reduce((s, g) => s + g.lista.length, 0)}</b> programados</span>
        <span><b className="text-torg-dark">{montadosN}</b> já montados</span>
        {meioCaminho.length > 0 && <span><b className="text-amber-700">{meioCaminho.length}</b> com ≥ metade</span>}
        {semCorte.length > 0 && <span>{semCorte.length} sem corte suficiente</span>}
      </div>

      {sel.size > 0 && (
        <div className="bg-torg-blue-50/60 border border-torg-blue-100 rounded-lg px-3 py-2 flex items-center gap-2 flex-wrap">
          <span className="text-[12px] font-semibold text-torg-dark">{sel.size} conjunto(s) · {fmtKg(somaKg(selecao))}</span>
          <label className="text-[12px] text-torg-gray ml-1">Início da montagem</label>
          <input type="date" value={dia} onChange={(e) => setDia(e.target.value)}
            className="px-2 py-1 text-[12px] border border-gray-200 rounded-lg" />
          <button onClick={() => agir({ acao: "programar", ids: [...sel], dia, forcar: selForaDoPronto }, "programado(s)")}
            disabled={agindo || !dia}
            className="px-3 py-1.5 bg-torg-blue text-white text-[12px] font-medium rounded-lg hover:bg-torg-blue-700 inline-flex items-center gap-1 disabled:opacity-50">
            {agindo ? <Loader2 size={12} className="animate-spin" /> : <CalendarClock size={12} />} Programar
          </button>
          <button onClick={() => agir({ acao: "adiar", ids: [...sel] }, "levado(s) para o próximo dia útil")} disabled={agindo}
            className="px-2.5 py-1.5 border border-red-200 text-red-700 text-[12px] rounded-lg hover:bg-red-50 disabled:opacity-50">
            Adiar 1 dia
          </button>
          <button onClick={() => agir({ acao: "desprogramar", ids: [...sel] }, "tirado(s) do plano")} disabled={agindo}
            className="px-2.5 py-1.5 border border-gray-200 text-torg-gray text-[12px] rounded-lg hover:bg-gray-50 disabled:opacity-50">
            Desprogramar
          </button>
          {selForaDoPronto && (
            <span className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1">
              tem conjunto sem todos os croquis cortados — vai entrar assim mesmo
            </span>
          )}
          <button onClick={() => setSel(new Set())} className="ml-auto p-1 text-torg-gray hover:bg-white rounded"><X size={13} /></button>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-3">
        {/* A programar */}
        <div className="rounded-lg border border-gray-100 bg-gray-50/70">
          <div className="px-2.5 py-2 flex items-center gap-1.5 text-[10px] text-emerald-800 bg-emerald-50 border-b border-emerald-100 rounded-t-lg">
            <CheckCircle2 size={11} />
            <span className="font-bold uppercase tracking-wide">todas as sub peças cortadas</span>
            <span className="font-semibold">{prontos.length} conj · {fmtKg(somaKg(prontos))}</span>
            {prontos.length > 0 && <button onClick={() => marcarLista(prontos)} className="ml-auto underline font-semibold">selecionar todos</button>}
          </div>
          <div className="p-2 space-y-1.5 max-h-[46vh] overflow-y-auto">
            {prontos.length === 0 && <p className="text-[11px] text-torg-gray italic py-4 text-center">Nenhum conjunto com o corte completo nesta obra.</p>}
            {prontos.map((c) => <Card key={c.id} c={c} sel={sel} onToggle={toggle} />)}

            {meioCaminho.length > 0 && (
              <>
                <button onClick={() => setVerMetade((v) => !v)}
                  className="w-full text-left px-2 py-1.5 rounded-md border border-amber-200 bg-amber-50 text-[10px] text-amber-800 font-bold uppercase tracking-wide">
                  {verMetade ? "▾" : "▸"} {meioCaminho.length} com pelo menos metade cortada · {fmtKg(somaKg(meioCaminho))}
                  <span className="block font-normal normal-case mt-0.5">a fábrica pode começar, mas ainda há croqui na máquina</span>
                </button>
                {verMetade && meioCaminho.map((c) => <Card key={c.id} c={c} sel={sel} onToggle={toggle} aviso />)}
              </>
            )}

            {semCroqui.length > 0 && (
              <>
                <button onClick={() => setVerSemCroqui((v) => !v)}
                  className="w-full text-left px-2 py-1.5 rounded-md border border-gray-200 bg-white text-[10px] text-torg-gray font-bold uppercase tracking-wide">
                  {verSemCroqui ? "▾" : "▸"} {semCroqui.length} sem croqui vinculado · {fmtKg(somaKg(semCroqui))}
                  <span className="block font-normal normal-case mt-0.5">não dá para medir a prontidão — LPC sem amarração ou conjunto de item comprado</span>
                </button>
                {verSemCroqui && semCroqui.map((c) => <Card key={c.id} c={c} sel={sel} onToggle={toggle} aviso />)}
              </>
            )}

            {semCorte.length > 0 && (
              <p className="text-[11px] text-torg-gray italic py-2 text-center border-t border-gray-100 mt-1">
                + {semCorte.length} ainda sem corte suficiente · {fmtKg(somaKg(semCorte))}
              </p>
            )}
          </div>
        </div>

        {/* Programado, dia a dia */}
        <div className="rounded-lg border border-gray-100 bg-gray-50/70">
          <div className="px-2.5 py-2 flex items-center gap-1.5 text-[10px] text-torg-gray bg-white border-b border-gray-100 rounded-t-lg">
            <CalendarClock size={11} />
            <span className="font-bold uppercase tracking-wide">programado</span>
            <span className="font-semibold">{grupos.reduce((s, g) => s + g.lista.length, 0)} conj</span>
          </div>
          <div className="p-2 space-y-1.5 max-h-[46vh] overflow-y-auto">
            {grupos.length === 0 && <p className="text-[11px] text-torg-gray italic py-6 text-center">Nada programado — selecione conjuntos ao lado e marque o dia.</p>}
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
                {g.lista.map((c) => <Card key={c.id} c={c} sel={sel} onToggle={toggle} alerta={g.atrasado} />)}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Card({ c, sel, onToggle, alerta, aviso }) {
  const p = c.prontidao || {};
  const original = isoDe(c.montagemDiaOriginal);
  const moveu = original && original !== isoDe(c.montagemDiaProgramado);
  const borda = sel?.has(c.id) ? "border-torg-blue ring-1 ring-torg-blue bg-white"
    : alerta ? "border-red-200 bg-red-50/40" : aviso ? "border-amber-200 bg-amber-50/30" : "border-gray-100 bg-white";
  return (
    <div className={`rounded-lg border p-2 text-[12px] space-y-1 ${borda}`}>
      <div className="flex items-center gap-2">
        <input type="checkbox" checked={sel?.has(c.id) || false} onChange={() => onToggle(c.id)} className="rounded border-gray-300" />
        <span className="font-mono font-bold text-torg-dark truncate">{c.marca}</span>
        <span className="text-torg-gray whitespace-nowrap text-[11px]">{c.qte}× · {fmtKg(c.pesoTotalKg)}</span>
        <span className="ml-auto text-[10px] text-torg-gray-light font-mono">{c.opNumero}</span>
      </div>
      {c.descricao && <p className="text-[10px] text-torg-gray truncate">{c.descricao}</p>}
      <div className="flex items-center gap-2 flex-wrap text-[10px]">
        <span className={p.pronto ? "text-emerald-700 font-semibold" : p.liberavel ? "text-amber-700 font-semibold" : "text-torg-gray"}>
          {p.atendidos ?? 0}/{p.total ?? 0} croquis cortados
        </span>
        {c.emMontagem && <span className="text-torg-blue font-semibold">montagem iniciada · {c.feito}/{c.q}</span>}
        {moveu && <span className="text-red-600 font-semibold">era {fmtDiaLongo(original)} · adiado {c.montagemAdiado}×</span>}
        {!moveu && alerta && <span className="text-red-600 font-semibold">não terminou no dia</span>}
      </div>
    </div>
  );
}
