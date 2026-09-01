"use client";
// ─── PCP › SOLDA — a fila do que saiu da montagem ─────────────────────────────
// Vitor (01/09/2026): "depois que sair da montagem que foi dado o lançamento de concluído na
// montagem deve ficar uma fila para podermos selecionar o que será feito na solda em cada bancada".
//
// ⚠⚠ A BANCADA AQUI É SUGESTÃO, NÃO ORDEM — escolha do Vitor ("só registra a intenção"): quem manda
// na bancada é o líder no chão. Por isso a tela NÃO cobra aderência e não compara "planejado ×
// realizado" por bancada: transformar a anotação em cobrança seria mudar a regra sem avisar quem
// trabalha. O que a tela mostra do real é só o que o Syneco já apontou.
//
// ⚠ ENTRA NA FILA QUEM TERMINOU A MONTAGEM — pelo apontamento do Syneco, não por clique no portal.
// Conjunto com montagem pela metade não é fila de solda: é montagem em andamento.
import { useState, useMemo } from "react";
import { Flame, Search, Loader2, AlertCircle, X, ArrowRight, CheckCircle2 } from "lucide-react";
import { fmtOP } from "@/lib/utils";

const fmtKg = (v) => `${(Number(v) || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} kg`;
const fmtData = (v) => (v ? new Date(v).toLocaleDateString("pt-BR") : "—");

export default function SoldaClient({ conjuntosIniciais, montados = {}, soldados = {}, bancadas = [] }) {
  const [conjuntos, setConjuntos] = useState(conjuntosIniciais);
  const [sel, setSel] = useState(new Set());
  const [filtroOp, setFiltroOp] = useState("");
  const [filtroBancada, setFiltroBancada] = useState("");
  const [busca, setBusca] = useState("");
  const [bancadaEscolhida, setBancadaEscolhida] = useState(bancadas[0] || "");
  const [agindo, setAgindo] = useState(false);
  const [erro, setErro] = useState("");
  const [okMsg, setOkMsg] = useState("");

  const fila = useMemo(() => conjuntos
    .map((c) => {
      const q = Number(c.qte) || 1;
      const feitoMont = Number(montados[c.marca] || 0);
      const feitoSolda = Number(soldados[c.marca] || 0);
      return { ...c, montado: feitoMont >= q, soldado: feitoSolda >= q, emSolda: feitoSolda > 0 && feitoSolda < q, feitoSolda, q };
    })
    // saiu da montagem e ainda não fechou a solda
    .filter((c) => c.montado && !c.soldado),
    [conjuntos, montados, soldados]);

  const ops = useMemo(() => [...new Set(fila.map((c) => c.opNumero).filter(Boolean))]
    .sort((a, b) => String(a).localeCompare(String(b), "pt-BR", { numeric: true })), [fila]);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return fila.filter((c) => {
      if (filtroOp && c.opNumero !== filtroOp) return false;
      if (filtroBancada === "__sem") { if (c.soldaBancada) return false; }
      else if (filtroBancada && c.soldaBancada !== filtroBancada) return false;
      if (!q) return true;
      return [c.marca, c.descricao, c.op?.cliente, c.op?.obra].some((v) => String(v ?? "").toLowerCase().includes(q));
    });
  }, [fila, filtroOp, filtroBancada, busca]);

  // agrupa pela bancada sugerida; sem sugestão vem primeiro, que é o que precisa de decisão
  const grupos = useMemo(() => {
    const m = new Map();
    for (const c of filtrados) {
      const k = c.soldaBancada || "";
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(c);
    }
    return [...m.entries()]
      .sort((a, b) => (!a[0] ? -1 : !b[0] ? 1 : a[0].localeCompare(b[0], "pt-BR", { numeric: true })))
      .map(([bancada, lista]) => ({
        bancada, lista,
        kg: lista.reduce((s, c) => s + (Number(c.pesoTotalKg) || 0), 0),
      }));
  }, [filtrados]);

  const semBancada = useMemo(() => filtrados.filter((c) => !c.soldaBancada).length, [filtrados]);
  const somaKg = (arr) => arr.reduce((s, c) => s + (Number(c.pesoTotalKg) || 0), 0);
  const selecao = useMemo(() => filtrados.filter((c) => sel.has(c.id)), [filtrados, sel]);

  const toggle = (id) => setSel((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const marcarLista = (lista) => {
    const ids = lista.map((c) => c.id);
    const todas = ids.length > 0 && ids.every((id) => sel.has(id));
    setSel((p) => { const n = new Set(p); ids.forEach((id) => (todas ? n.delete(id) : n.add(id))); return n; });
  };

  async function definir(bancada) {
    setAgindo(true); setErro(""); setOkMsg("");
    const ids = [...sel];
    try {
      const r = await fetch("/api/pcp/solda", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, bancada }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro ao gravar a bancada");
      const set = new Set(ids);
      setConjuntos((prev) => prev.map((c) => (set.has(c.id) ? { ...c, soldaBancada: bancada, soldaBancadaEm: new Date().toISOString() } : c)));
      setOkMsg(bancada ? `${j.atualizados} conjunto(s) sugerido(s) para ${bancada}.` : `${j.atualizados} conjunto(s) sem bancada.`);
      setSel(new Set());
    } catch (e) { setErro(e.message); } finally { setAgindo(false); }
  }

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-xl font-extrabold text-torg-dark flex items-center gap-2">
          <Flame size={20} className="text-torg-blue" /> Solda — fila da montagem
        </h1>
        <p className="text-xs text-torg-gray mt-1 max-w-3xl">
          Conjuntos com a <strong>montagem concluída</strong> (baixa do Syneco) e a solda ainda aberta. A bancada aqui é
          <strong> sugestão para o líder</strong> — o que valeu de verdade continua vindo do apontamento.
        </p>
      </div>

      {erro && <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700 flex items-center gap-2"><AlertCircle size={14} /> {erro}</div>}
      {okMsg && <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 text-xs text-emerald-800">{okMsg}</div>}

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Kpi cor="bg-torg-blue" label="Na fila da solda" valor={`${filtrados.length}`} sub={fmtKg(somaKg(filtrados))} />
        <Kpi cor="bg-amber-500" label="Sem bancada sugerida" valor={`${semBancada}`} sub="esperando decisão do PCP" alerta={semBancada > 0} />
        <Kpi cor="bg-emerald-600" label="Já em solda" valor={`${filtrados.filter((c) => c.emSolda).length}`} sub="o Syneco já apontou" />
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <select value={filtroOp} onChange={(e) => setFiltroOp(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white">
          <option value="">Todas as obras</option>
          {ops.map((o) => <option key={o} value={o}>{fmtOP(o)}</option>)}
        </select>
        <select value={filtroBancada} onChange={(e) => setFiltroBancada(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white">
          <option value="">Todas as bancadas</option>
          <option value="__sem">Sem bancada sugerida</option>
          {bancadas.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-torg-gray" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Marca, cliente, obra…"
            className="pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg w-64" />
        </div>
      </div>

      {sel.size > 0 && (
        <div className="bg-torg-blue-50/60 border border-torg-blue-100 rounded-xl px-3 py-2.5 flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold text-torg-dark">{sel.size} conjunto(s) · {fmtKg(somaKg(selecao))}</span>
          <select value={bancadaEscolhida} onChange={(e) => setBancadaEscolhida(e.target.value)}
            className="px-2 py-1.5 text-sm border border-gray-200 rounded-lg bg-white">
            {bancadas.length === 0 && <option value="">nenhuma bancada no Syneco</option>}
            {bancadas.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
          <button onClick={() => definir(bancadaEscolhida)} disabled={agindo || !bancadaEscolhida}
            className="px-3 py-1.5 bg-torg-blue text-white text-xs font-medium rounded-lg hover:bg-torg-blue-700 inline-flex items-center gap-1 disabled:opacity-50">
            {agindo ? <Loader2 size={13} className="animate-spin" /> : <ArrowRight size={13} />} Sugerir bancada
          </button>
          <button onClick={() => definir(null)} disabled={agindo}
            className="px-3 py-1.5 border border-gray-200 text-torg-gray text-xs rounded-lg hover:bg-gray-50 disabled:opacity-50">
            Tirar sugestão
          </button>
          <button onClick={() => setSel(new Set())} className="ml-auto p-1.5 text-torg-gray hover:bg-white rounded-lg"><X size={14} /></button>
        </div>
      )}

      <div className="bg-gray-50 rounded-xl border border-gray-100 border-t-4 border-t-torg-blue">
        <div className="px-2 py-2 space-y-1.5 max-h-[70vh] overflow-y-auto">
          {grupos.length === 0 && (
            <p className="text-[11px] text-torg-gray italic px-2 py-8 text-center">
              Nada na fila — nenhum conjunto com montagem concluída e solda aberta.
            </p>
          )}
          {grupos.map((g) => (
            <div key={g.bancada || "sem"} className="space-y-1.5 pb-1">
              <div className={`flex items-center gap-1.5 flex-wrap px-2 py-1.5 rounded-md border text-[10px] ${
                g.bancada ? "bg-white border-gray-100 text-torg-gray" : "bg-amber-50 border-amber-200 text-amber-800"}`}>
                <Flame size={11} />
                <span className="font-bold uppercase tracking-wide">{g.bancada || "sem bancada sugerida"}</span>
                <span className="font-semibold">{g.lista.length} conj · {fmtKg(g.kg)}</span>
                <button onClick={() => marcarLista(g.lista)} className="ml-auto underline font-semibold">selecionar</button>
              </div>
              {g.lista.map((c) => (
                <div key={c.id} className={`rounded-lg border p-2.5 text-xs space-y-1 ${sel.has(c.id) ? "border-torg-blue ring-1 ring-torg-blue bg-white" : "bg-white border-gray-100"}`}>
                  <div className="flex items-center gap-2">
                    <input type="checkbox" checked={sel.has(c.id)} onChange={() => toggle(c.id)} className="rounded border-gray-300" />
                    <span className="font-mono font-bold text-torg-dark truncate">{c.marca}</span>
                    <span className="text-torg-gray whitespace-nowrap">{c.qte}× · {fmtKg(c.pesoTotalKg)}</span>
                    <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-torg-blue-50 text-torg-blue font-mono font-semibold whitespace-nowrap">
                      {fmtOP(c.opNumero)}
                    </span>
                  </div>
                  {c.descricao && <p className="text-[10px] text-torg-gray truncate">{c.descricao}</p>}
                  <div className="flex items-center gap-2 flex-wrap text-[10px]">
                    <span className="text-emerald-700 font-semibold inline-flex items-center gap-1"><CheckCircle2 size={10} /> montagem concluída</span>
                    {c.emSolda && <span className="text-torg-blue font-semibold">solda iniciada · {c.feitoSolda}/{c.q}</span>}
                    {c.soldaBancada && c.soldaBancadaEm && (
                      <span className="text-torg-gray">sugerida em {fmtData(c.soldaBancadaEm)}{c.soldaBancadaPor ? ` por ${c.soldaBancadaPor}` : ""}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Kpi({ cor, label, valor, sub, alerta }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3.5 flex items-center gap-3">
      <div className={`${cor} p-2 rounded-lg`}><Flame size={18} className="text-white" /></div>
      <div className="min-w-0">
        <p className="text-[10px] text-torg-gray uppercase tracking-wider">{label}</p>
        <p className="text-lg font-extrabold text-torg-dark leading-tight">{valor}</p>
        <p className={`text-[10px] ${alerta ? "text-amber-700 font-semibold" : "text-torg-gray"}`}>{sub}</p>
      </div>
    </div>
  );
}
