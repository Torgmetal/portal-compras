"use client";
import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Truck, Loader2, AlertCircle, CheckCircle2, Package, Layers,
  Undo2, PackageCheck, ArrowRight, Search, Info,
} from "lucide-react";
import { fmtOP } from "@/lib/utils";

const fmtKg = (v) => `${(Number(v) || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} kg`;
const fmtDataHora = (v) =>
  v ? new Date(v).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";

const DESTINOS = [
  { v: "MONTAGEM", label: "Montagem" },
  { v: "SOLDA", label: "Solda" },
  { v: "ACABAMENTO", label: "Acabamento" },
  { v: "JATO", label: "Jato" },
  { v: "PINTURA", label: "Pintura" },
  { v: "EXPEDICAO", label: "Expedição" },
];
const DESTINO_LABEL = { MONTAGEM: "Montagem", SOLDA: "Solda", ACABAMENTO: "Acabamento", JATO: "Jato", PINTURA: "Pintura", EXPEDICAO: "Expedição" };
const DESTINO_COR = {
  MONTAGEM: "bg-blue-50 text-blue-700 border-blue-200",
  SOLDA: "bg-orange-50 text-orange-700 border-orange-200",
  ACABAMENTO: "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200",
  JATO: "bg-cyan-50 text-cyan-700 border-cyan-200",
  PINTURA: "bg-purple-50 text-purple-700 border-purple-200",
  EXPEDICAO: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

const TipoBadge = ({ tipo }) => (
  <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-semibold ${tipo === "CONJUNTO" ? "bg-torg-blue-50 text-torg-blue" : "bg-amber-50 text-amber-700"}`}>
    {tipo === "CONJUNTO" ? <Layers size={11} /> : <Package size={11} />}
    {tipo === "CONJUNTO" ? "Conjunto" : "Croqui"}
  </span>
);

const DestinoBadge = ({ destino }) => (
  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${DESTINO_COR[destino] || "bg-gray-50 text-gray-600 border-gray-200"}`}>
    {DESTINO_LABEL[destino] || destino || "—"}
  </span>
);

export default function TerceirizadosClient() {
  const [data, setData] = useState({ aguardando: [], recebidas: [], markaveis: [], ops: [] });
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [okMsg, setOkMsg] = useState("");
  const [agindo, setAgindo] = useState(false);

  const [opSel, setOpSel] = useState("");
  const [busca, setBusca] = useState("");
  const [destino, setDestino] = useState("MONTAGEM");
  const [selMark, setSelMark] = useState(new Set());
  const [selAg, setSelAg] = useState(new Set());

  const carregar = useCallback(async (op) => {
    setLoading(true);
    setErro("");
    try {
      const url = op ? `/api/producao/pecas/terceirizados?op=${encodeURIComponent(op)}` : "/api/producao/pecas/terceirizados";
      const r = await fetch(url, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Falha ao carregar");
      setData(j);
    } catch (e) {
      setErro(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { carregar(opSel); }, [opSel, carregar]);

  // limpa seleção de markáveis quando troca de OP
  useEffect(() => { setSelMark(new Set()); }, [opSel]);

  const markaveisFiltradas = useMemo(() => {
    const q = busca.trim().toUpperCase();
    if (!q) return data.markaveis;
    return data.markaveis.filter((p) => `${p.marca} ${p.descricao || ""}`.toUpperCase().includes(q));
  }, [data.markaveis, busca]);

  const toggle = (set, setter) => (id) => {
    const n = new Set(set);
    n.has(id) ? n.delete(id) : n.add(id);
    setter(n);
  };
  const toggleMark = toggle(selMark, setSelMark);
  const toggleAg = toggle(selAg, setSelAg);

  const pesoSel = (lista, set) => lista.filter((p) => set.has(p.id)).reduce((s, p) => s + (Number(p.pesoTotalKg) || 0), 0);

  async function acao(url, body, msgOk) {
    setAgindo(true);
    setErro("");
    setOkMsg("");
    try {
      const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Falha na ação");
      setOkMsg(`${msgOk} (${j.atualizados || 0})`);
      setSelMark(new Set());
      setSelAg(new Set());
      await carregar(opSel);
    } catch (e) {
      setErro(e.message);
    } finally {
      setAgindo(false);
    }
  }

  const terceirizar = () =>
    acao("/api/producao/pecas/marcar-terceirizado", { ids: [...selMark], destino }, "Peças enviadas para terceirização");
  const receber = () =>
    acao("/api/producao/pecas/receber-terceirizado", { ids: [...selAg] }, "Peças recebidas e liberadas");
  const voltarCorte = (ids) =>
    acao("/api/producao/pecas/marcar-terceirizado", { ids, reverter: true }, "Peças retornadas ao corte");

  // agrupa aguardando por OP
  const aguardandoPorOp = useMemo(() => {
    const m = new Map();
    for (const p of data.aguardando) {
      if (!m.has(p.opNumero)) m.set(p.opNumero, []);
      m.get(p.opNumero).push(p);
    }
    return [...m.entries()];
  }, [data.aguardando]);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* cabeçalho */}
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-xl bg-torg-orange/10 flex items-center justify-center shrink-0">
          <Truck className="text-torg-orange" size={22} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-torg-dark">Serviço Terceirizado</h1>
          <p className="text-torg-gray text-sm mt-0.5">
            Peças e conjuntos que não passam pelo corte interno. Marque o destino de retorno; o Compras libera ao receber do terceiro.
          </p>
        </div>
      </div>

      {/* banners */}
      {erro && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
          <AlertCircle size={18} /> {erro}
        </div>
      )}
      {okMsg && (
        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg px-4 py-3 text-sm">
          <CheckCircle2 size={18} /> {okMsg}
        </div>
      )}

      {/* ─── Painel: marcar como terceirizado ─── */}
      <section className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-torg-dark flex items-center gap-2">
            <ArrowRight size={18} className="text-torg-orange" /> Marcar como terceirizado
          </h2>
          <p className="text-xs text-torg-gray mt-1">Selecione a OP, escolha as peças e o destino de retorno. Elas saem da fila de corte automaticamente.</p>
        </div>

        <div className="p-5 space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-torg-gray uppercase tracking-wide">OP</span>
              <select
                value={opSel}
                onChange={(e) => setOpSel(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm min-w-[160px] focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue outline-none"
              >
                <option value="">— selecione a OP —</option>
                {data.ops.map((op) => (
                  <option key={op} value={op}>{fmtOP(op)}</option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-torg-gray uppercase tracking-wide">Destino ao receber</span>
              <select
                value={destino}
                onChange={(e) => setDestino(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue outline-none"
              >
                {DESTINOS.map((d) => <option key={d.v} value={d.v}>{d.label}</option>)}
              </select>
            </label>

            {opSel && (
              <label className="flex flex-col gap-1 flex-1 min-w-[180px]">
                <span className="text-xs font-semibold text-torg-gray uppercase tracking-wide">Buscar</span>
                <div className="relative">
                  <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    placeholder="marca ou descrição"
                    className="w-full border border-gray-200 rounded-lg pl-8 pr-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue outline-none"
                  />
                </div>
              </label>
            )}

            <button
              onClick={terceirizar}
              disabled={agindo || selMark.size === 0}
              className="ml-auto inline-flex items-center gap-2 bg-torg-orange text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-torg-orange/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {agindo ? <Loader2 size={16} className="animate-spin" /> : <Truck size={16} />}
              Terceirizar {selMark.size > 0 ? `${selMark.size} • ${fmtKg(pesoSel(markaveisFiltradas, selMark))}` : ""}
            </button>
          </div>

          {!opSel ? (
            <div className="text-center py-10 text-torg-gray text-sm">
              <Info size={26} className="mx-auto mb-2 text-gray-300" />
              Selecione uma OP para listar as peças que ainda não foram cortadas.
            </div>
          ) : loading ? (
            <div className="text-center py-10 text-torg-gray text-sm"><Loader2 size={22} className="animate-spin mx-auto mb-2" /> Carregando…</div>
          ) : markaveisFiltradas.length === 0 ? (
            <div className="text-center py-10 text-torg-gray text-sm">
              <Package size={26} className="mx-auto mb-2 text-gray-300" />
              Nenhuma peça pendente de corte nesta OP.
            </div>
          ) : (
            <div className="overflow-x-auto border border-gray-100 rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-gray-50/60 text-torg-gray text-xs uppercase tracking-wide">
                  <tr>
                    <th className="w-10 px-3 py-2">
                      <input
                        type="checkbox"
                        checked={markaveisFiltradas.length > 0 && markaveisFiltradas.every((p) => selMark.has(p.id))}
                        onChange={(e) => setSelMark(e.target.checked ? new Set(markaveisFiltradas.map((p) => p.id)) : new Set())}
                      />
                    </th>
                    <th className="px-3 py-2 text-left">Marca</th>
                    <th className="px-3 py-2 text-left">Descrição</th>
                    <th className="px-3 py-2 text-left">Tipo</th>
                    <th className="px-3 py-2 text-right">Qtde</th>
                    <th className="px-3 py-2 text-right">Peso</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {markaveisFiltradas.map((p) => (
                    <tr key={p.id} className={`hover:bg-gray-50/50 cursor-pointer ${selMark.has(p.id) ? "bg-torg-orange/5" : ""}`} onClick={() => toggleMark(p.id)}>
                      <td className="px-3 py-2"><input type="checkbox" checked={selMark.has(p.id)} onChange={() => toggleMark(p.id)} onClick={(e) => e.stopPropagation()} /></td>
                      <td className="px-3 py-2 font-semibold text-torg-dark">{p.marca}</td>
                      <td className="px-3 py-2 text-torg-gray">{p.descricao || "—"}</td>
                      <td className="px-3 py-2"><TipoBadge tipo={p.tipoPeca} /></td>
                      <td className="px-3 py-2 text-right tabular-nums">{p.qte}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtKg(p.pesoTotalKg)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* ─── Painel: aguardando recebimento ─── */}
      <section className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-torg-dark flex items-center gap-2">
              <Truck size={18} className="text-torg-blue" /> Aguardando recebimento
              {data.aguardando.length > 0 && <span className="bg-torg-blue/10 text-torg-blue text-xs font-bold px-2 py-0.5 rounded-full">{data.aguardando.length}</span>}
            </h2>
            <p className="text-xs text-torg-gray mt-1">No terceiro. Quando chegar, selecione e clique em <b>Receber</b> para liberar ao destino.</p>
          </div>
          <button
            onClick={receber}
            disabled={agindo || selAg.size === 0}
            className="inline-flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
          >
            {agindo ? <Loader2 size={16} className="animate-spin" /> : <PackageCheck size={16} />}
            Receber {selAg.size > 0 ? `${selAg.size}` : ""}
          </button>
        </div>

        <div className="p-5">
          {loading ? (
            <div className="text-center py-8 text-torg-gray text-sm"><Loader2 size={22} className="animate-spin mx-auto mb-2" /> Carregando…</div>
          ) : data.aguardando.length === 0 ? (
            <div className="text-center py-10 text-torg-gray text-sm">
              <Truck size={26} className="mx-auto mb-2 text-gray-300" />
              Nenhuma peça terceirizada aguardando recebimento.
            </div>
          ) : (
            <div className="space-y-5">
              {aguardandoPorOp.map(([op, pecas]) => (
                <div key={op} className="border border-gray-100 rounded-lg overflow-hidden">
                  <div className="bg-gray-50/60 px-4 py-2 flex items-center justify-between">
                    <span className="font-semibold text-torg-dark text-sm">{fmtOP(op)} <span className="text-torg-gray font-normal">· {pecas.length} peça(s) · {fmtKg(pecas.reduce((s, p) => s + (Number(p.pesoTotalKg) || 0), 0))}</span></span>
                    <button
                      onClick={() => voltarCorte(pecas.map((p) => p.id))}
                      disabled={agindo}
                      className="text-xs text-torg-gray hover:text-red-600 inline-flex items-center gap-1 disabled:opacity-40"
                      title="Cancelar terceirização e voltar à fila de corte"
                    >
                      <Undo2 size={13} /> Voltar ao corte
                    </button>
                  </div>
                  <table className="w-full text-sm">
                    <tbody className="divide-y divide-gray-50">
                      {pecas.map((p) => (
                        <tr key={p.id} className={`hover:bg-gray-50/50 cursor-pointer ${selAg.has(p.id) ? "bg-emerald-50/40" : ""}`} onClick={() => toggleAg(p.id)}>
                          <td className="w-10 px-3 py-2"><input type="checkbox" checked={selAg.has(p.id)} onChange={() => toggleAg(p.id)} onClick={(e) => e.stopPropagation()} /></td>
                          <td className="px-3 py-2 font-semibold text-torg-dark">{p.marca}</td>
                          <td className="px-3 py-2 text-torg-gray">{p.descricao || "—"}</td>
                          <td className="px-3 py-2"><TipoBadge tipo={p.tipoPeca} /></td>
                          <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{p.qte} · {fmtKg(p.pesoTotalKg)}</td>
                          <td className="px-3 py-2 text-right"><DestinoBadge destino={p.destinoTerceirizado} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ─── Recebidos recentemente ─── */}
      {data.recebidas.length > 0 && (
        <section className="bg-white rounded-xl border border-gray-100 shadow-sm">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-torg-dark flex items-center gap-2">
              <PackageCheck size={18} className="text-emerald-600" /> Recebidos recentemente
            </h2>
          </div>
          <div className="p-5 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50/60 text-torg-gray text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-3 py-2 text-left">OP</th>
                  <th className="px-3 py-2 text-left">Marca</th>
                  <th className="px-3 py-2 text-left">Tipo</th>
                  <th className="px-3 py-2 text-left">Destino</th>
                  <th className="px-3 py-2 text-right">Recebido em</th>
                  <th className="px-3 py-2 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {data.recebidas.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50/50">
                    <td className="px-3 py-2 text-torg-gray whitespace-nowrap">{fmtOP(p.opNumero)}</td>
                    <td className="px-3 py-2 font-semibold text-torg-dark">{p.marca}</td>
                    <td className="px-3 py-2"><TipoBadge tipo={p.tipoPeca} /></td>
                    <td className="px-3 py-2"><DestinoBadge destino={p.destinoTerceirizado} /></td>
                    <td className="px-3 py-2 text-right text-torg-gray whitespace-nowrap">{fmtDataHora(p.terceirizadoRecebidoEm)}</td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => acao("/api/producao/pecas/receber-terceirizado", { ids: [p.id], reverter: true }, "Recebimento desfeito")}
                        disabled={agindo}
                        className="text-xs text-torg-gray hover:text-red-600 inline-flex items-center gap-1 disabled:opacity-40"
                        title="Desfazer recebimento"
                      >
                        <Undo2 size={13} /> Desfazer
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
