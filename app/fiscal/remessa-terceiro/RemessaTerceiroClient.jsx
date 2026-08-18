"use client";
import { useState, useEffect, useMemo, useCallback } from "react";
import { useStore } from "@/lib/store";
import { fmtOP } from "@/lib/utils";
import {
  Factory, Loader2, AlertCircle, X, FileText, Search,
  PackageOpen, ReceiptText, MinusCircle, Undo2, Truck, FilePlus2, Eye, Boxes, Package, Check, Pencil,
} from "lucide-react";

const fmtR$ = (n) => (n == null ? "—" : Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));

const fmtKg = (n) => (n == null ? "—" : `${Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} kg`);
const fmtD = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—");
const inp = "w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-torg-blue outline-none";

const ST = {
  PENDENTE: { label: "Aguardando emissão", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  PEDIDO_CRIADO: { label: "Pedido no Omie (rascunho)", cls: "bg-torg-blue-50 text-torg-blue border-torg-blue-100" },
  EMITIDA: { label: "NF emitida", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
};

export default function RemessaTerceiroClient() {
  const { showToast } = useStore();
  const [remessas, setRemessas] = useState(null);
  const [erro, setErro] = useState("");
  const [filtro, setFiltro] = useState("pendente"); // pendente | emitida | todos
  const [busca, setBusca] = useState("");
  const [emitir, setEmitir] = useState(null); // remessa em emissão
  const [verItens, setVerItens] = useState(null); // remessa cujos itens estão sendo vistos
  const [preparar, setPreparar] = useState(null); // remessa em preparação (gerar pedido)

  const carregar = useCallback(() => {
    setErro("");
    fetch("/api/fiscal/remessa-terceiro?status=todos")
      .then((r) => r.json())
      .then((j) => { if (j.success) setRemessas(j.remessas); else { setRemessas([]); setErro(j.error || "Erro"); } })
      .catch(() => { setRemessas([]); setErro("Erro ao carregar"); });
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const kpis = useMemo(() => {
    const l = remessas || [];
    const pend = l.filter((r) => r.remessaStatus === "PENDENTE");
    const mesAtual = new Date().toISOString().slice(0, 7);
    return {
      pendentes: pend.length,
      pesoPendente: pend.reduce((s, r) => s + (r.pesoEnviadoKg || 0), 0),
      emitidasMes: l.filter((r) => r.remessaStatus === "EMITIDA" && String(r.nfEmitidaEm).slice(0, 7) === mesAtual).length,
    };
  }, [remessas]);

  const filtradas = useMemo(() => {
    let l = remessas || [];
    if (filtro === "pendente") l = l.filter((r) => r.remessaStatus === "PENDENTE" || r.remessaStatus === "PEDIDO_CRIADO");
    else if (filtro === "emitida") l = l.filter((r) => r.remessaStatus === "EMITIDA");
    const q = busca.trim().toLowerCase();
    if (q) l = l.filter((r) => r.terceiro?.nome?.toLowerCase().includes(q) || r.opRefNumero?.toLowerCase().includes(q) || String(r.numero).includes(q) || r.nfNumero?.toLowerCase().includes(q));
    return l;
  }, [remessas, filtro, busca]);

  async function acao(id, payload, msgOk) {
    const res = await fetch(`/api/fiscal/remessa-terceiro/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const j = await res.json();
    if (j.success) { carregar(); showToast(msgOk, "success"); }
    else showToast(j.error || "Erro", "erro");
  }

  return (
    <div className="space-y-6 max-w-7xl">
      <div>
        <h2 className="text-2xl font-extrabold text-torg-dark tracking-tight flex items-center gap-2">
          <Factory size={24} className="text-torg-orange" /> Remessa para Terceiro
        </h2>
        <p className="text-sm text-torg-gray mt-1">
          NF de remessa p/ industrialização — cada romaneio a terceiro (Expedição) pré-cria uma remessa aqui. Emita a NF e registre o número.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <Kpi label="Aguardando emissão" value={String(kpis.pendentes)} sub={`${fmtKg(kpis.pesoPendente)}`} color="bg-amber-500" Icon={PackageOpen} />
        <Kpi label="Peso a remeter" value={fmtKg(kpis.pesoPendente)} sub="pendente" color="bg-torg-orange" Icon={Truck} />
        <Kpi label="NF emitidas (mês)" value={String(kpis.emitidasMes)} sub="remessas" color="bg-emerald-600" Icon={ReceiptText} />
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1 flex-wrap">
          {[["pendente", "Aguardando"], ["emitida", "Emitidas"], ["todos", "Todas"]].map(([v, l]) => (
            <button key={v} onClick={() => setFiltro(v)}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium border ${filtro === v ? "bg-torg-blue text-white border-torg-blue" : "bg-white text-torg-gray border-gray-200 hover:border-torg-blue"}`}>{l}</button>
          ))}
        </div>
        <div className="relative ml-auto min-w-[220px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar terceiro, OP, RT, NF…" className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm" />
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {remessas === null ? (
          <p className="px-6 py-10 text-sm text-torg-gray text-center inline-flex items-center gap-2 justify-center w-full"><Loader2 size={16} className="animate-spin" /> Carregando…</p>
        ) : erro ? (
          <div className="px-6 py-10 text-center"><AlertCircle size={22} className="mx-auto text-red-400 mb-2" /><p className="text-sm text-red-600 mb-3">{erro}</p><button onClick={carregar} className="text-xs text-torg-blue hover:underline">Tentar novamente</button></div>
        ) : filtradas.length === 0 ? (
          <div className="px-6 py-12 text-center"><Factory size={28} className="mx-auto text-gray-300 mb-2" /><p className="text-sm font-semibold text-torg-dark">Nenhuma remessa {filtro === "pendente" ? "aguardando emissão" : ""}</p><p className="text-xs text-torg-gray mt-1">As remessas aparecem aqui quando a Expedição cria um romaneio a terceiro.</p></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[920px]">
              <thead className="bg-gray-50/60">
                <tr className="text-[11px] text-gray-500 uppercase">
                  <th className="px-3 py-2 text-left font-medium">RT</th>
                  <th className="px-3 py-2 text-left font-medium">Terceiro / CNPJ</th>
                  <th className="px-3 py-2 text-left font-medium">OP ref</th>
                  <th className="px-3 py-2 text-right font-medium">Itens</th>
                  <th className="px-3 py-2 text-right font-medium">Peso</th>
                  <th className="px-3 py-2 text-center font-medium">CFOP</th>
                  <th className="px-3 py-2 text-left font-medium">Situação</th>
                  <th className="px-3 py-2 text-right font-medium">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtradas.map((r) => {
                  const st = ST[r.remessaStatus] || ST.PENDENTE;
                  return (
                    <tr key={r.id} className="hover:bg-gray-50/60">
                      <td className="px-3 py-2 font-mono text-torg-dark text-xs whitespace-nowrap">RT-{String(r.numero).padStart(3, "0")}</td>
                      <td className="px-3 py-2">
                        <span className="text-torg-dark font-medium">{r.terceiro?.nome}</span>
                        <span className="block text-[11px] text-torg-gray">{r.terceiro?.cnpj || "sem CNPJ no cadastro"}{r.terceiro?.uf ? ` · ${r.terceiro.uf}` : ""}{r.servico ? ` · ${r.servico}` : ""}</span>
                      </td>
                      <td className="px-3 py-2 text-xs font-mono text-torg-blue">{r.opRefNumero ? fmtOP(r.opRefNumero) : <span className="text-gray-300">—</span>}</td>
                      <td className="px-3 py-2 text-right">
                        <button onClick={() => setVerItens(r)} title="Ver itens da remessa" className="text-xs text-torg-blue hover:text-torg-dark inline-flex items-center gap-1 tabular-nums">
                          <Eye size={13} /> {r.itensCount}{r.materiaisCount ? ` +${r.materiaisCount}` : ""}
                        </button>
                      </td>
                      <td className="px-3 py-2 text-right text-torg-dark font-medium tabular-nums whitespace-nowrap">{fmtKg(r.pesoEnviadoKg)}</td>
                      <td className="px-3 py-2 text-center text-xs font-mono text-torg-gray">{r.cfop}</td>
                      <td className="px-3 py-2">
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full border whitespace-nowrap ${st.cls}`}>{st.label}</span>
                        {r.remessaStatus === "PEDIDO_CRIADO" && r.pedidoNumero && <span className="block text-[10px] text-torg-gray mt-0.5">Pedido nº {r.pedidoNumero} — confira e fature no Omie</span>}
                        {r.remessaStatus === "EMITIDA" && r.nfNumero && <span className="block text-[10px] text-torg-gray mt-0.5">NF {r.nfNumero}{r.nfSerie ? `/${r.nfSerie}` : ""} · {fmtD(r.nfEmitidaEm)}</span>}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
                          {r.remessaStatus === "PENDENTE" && (
                            <>
                              <button onClick={() => setPreparar(r)} title="Preparar e gerar o Pedido de Venda no Omie (rascunho)" className="text-xs font-semibold text-white bg-torg-blue hover:bg-torg-dark px-2.5 py-1 rounded-lg inline-flex items-center gap-1"><FilePlus2 size={12} /> Gerar pedido Omie</button>
                              <button onClick={() => setEmitir(r)} title="Registrar NF já emitida no Omie" className="text-xs text-torg-blue hover:text-torg-dark border border-torg-blue-100 rounded-lg px-2 py-1 inline-flex items-center gap-1"><ReceiptText size={12} /> Registrar NF</button>
                              <button onClick={() => acao(r.id, { acao: "dispensar" }, "Remessa dispensada")} title="Não precisa de NF" className="text-torg-gray hover:text-red-600 p-1"><MinusCircle size={14} /></button>
                            </>
                          )}
                          {r.remessaStatus === "PEDIDO_CRIADO" && (
                            <>
                              <button onClick={() => setEmitir(r)} title="Registrar a NF depois de faturar no Omie" className="text-xs font-semibold text-white bg-torg-blue hover:bg-torg-dark px-2.5 py-1 rounded-lg inline-flex items-center gap-1"><ReceiptText size={12} /> Registrar NF</button>
                              <button onClick={() => acao(r.id, { acao: "reabrir" }, "Remessa reaberta")} title="Reabrir (desvincula do fluxo — o rascunho no Omie precisa ser removido lá)" className="text-torg-gray hover:text-red-600 p-1"><Undo2 size={14} /></button>
                            </>
                          )}
                          {r.remessaStatus === "EMITIDA" && (
                            <button onClick={() => acao(r.id, { acao: "reabrir" }, "Remessa reaberta")} title="Reabrir (corrigir NF)" className="text-xs text-torg-blue hover:text-torg-dark border border-torg-blue-100 rounded-lg px-2 py-1 inline-flex items-center gap-1"><Undo2 size={12} /> Reabrir</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {emitir && <ModalEmitir remessa={emitir} onClose={() => setEmitir(null)} onSalvo={() => { setEmitir(null); carregar(); showToast("NF de remessa registrada", "success"); }} />}
      {verItens && <ModalItens remessa={verItens} onClose={() => setVerItens(null)} />}
      {preparar && <ModalPrepararRemessa remessa={preparar} onClose={() => setPreparar(null)} onGerado={(msg) => { setPreparar(null); carregar(); showToast(msg || "Pedido de remessa criado no Omie (rascunho)", "success"); }} />}
    </div>
  );
}

// Preparação da remessa de MATERIAIS antes de gerar o pedido no Omie: resolve o custo
// (preço de compra → estoque) de cada material e permite escolher manualmente o produto
// dos que estão sem código. Só libera "Gerar remessa" quando todo item tem código + valor.
function ModalPrepararRemessa({ remessa, onClose, onGerado }) {
  const [dados, setDados] = useState(null);
  const [itens, setItens] = useState([]);
  const [erro, setErro] = useState("");
  const [gerando, setGerando] = useState(false);

  useEffect(() => {
    setErro("");
    fetch(`/api/fiscal/remessa-terceiro/${remessa.id}/preparar`)
      .then((r) => r.json())
      .then((j) => { if (j.success) { setDados(j); setItens(j.itens || []); } else setErro(j.error || "Erro"); })
      .catch(() => setErro("Erro ao preparar"));
  }, [remessa.id]);

  const setItem = (idx, patch) => setItens((arr) => arr.map((it) => (it.idx === idx ? { ...it, ...patch } : it)));
  const totalGeral = itens.reduce((s, it) => s + (Number(it.valorUnit) || 0) * (Number(it.qtd) || 0), 0);
  const pendentes = itens.filter((it) => !it.codigoOmie || !(Number(it.valorUnit) > 0));
  const temMateriais = dados?.temMateriais;
  const podeGerar = temMateriais ? (itens.length > 0 && pendentes.length === 0) : (dados?.marcasCount > 0);

  async function gerar() {
    setErro(""); setGerando(true);
    try {
      const payload = { acao: "gerar_pedido_omie" };
      if (temMateriais) payload.materiais = itens.map((it) => ({ idx: it.idx, codigoOmie: it.codigoOmie, descricao: it.descricao || null, qtd: Number(it.qtd), valorUnit: Number(it.valorUnit) }));
      const res = await fetch(`/api/fiscal/remessa-terceiro/${remessa.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const j = await res.json();
      if (!j.success) throw new Error(j.error || "Erro");
      onGerado(j.numeroPedido ? `Pedido ${j.numeroPedido} criado no Omie (rascunho) — confira e fature lá` : undefined);
    } catch (e) { setErro(e.message); setGerando(false); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 overflow-y-auto" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl my-8">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-torg-dark flex items-center gap-2"><FilePlus2 size={16} className="text-torg-blue" /> Preparar remessa — RT-{String(remessa.numero).padStart(3, "0")}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
          {erro && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded px-3 py-2 flex items-start gap-2"><AlertCircle size={14} className="mt-0.5 shrink-0" /><span>{erro}</span></div>}

          {!dados ? (
            <p className="py-8 text-center text-sm text-torg-gray inline-flex items-center gap-2 justify-center w-full"><Loader2 size={16} className="animate-spin" /> Resolvendo custos…</p>
          ) : !temMateriais ? (
            <div className="bg-torg-blue-50/40 border border-torg-blue-100 rounded-lg p-4 text-sm text-torg-dark">
              Este romaneio não tem materiais — a remessa sai como <strong>peças (ARM000001)</strong>{dados.marcasCount ? ` · ${dados.marcasCount} marca(s)` : ""}. Ao gerar, o Omie cria o pedido rascunho pra você conferir e faturar.
            </div>
          ) : (
            <>
              <p className="text-xs text-torg-gray">O valor vem do <strong>preço de compra</strong> (cotação vencedora) ou do <strong>custo do estoque</strong>. Onde faltou código, escolha o produto do Omie. Dá pra ajustar o valor manualmente.</p>
              {pendentes.length > 0 && (
                <p className="text-[12px] text-amber-700 bg-amber-50 border border-amber-100 rounded px-2.5 py-1.5 flex items-start gap-1.5"><AlertCircle size={13} className="mt-0.5 shrink-0" /> {pendentes.length} item(ns) ainda sem código ou valor — resolva pra liberar a geração.</p>
              )}
              <div className="overflow-x-auto border border-gray-100 rounded-lg">
                <table className="w-full text-xs min-w-[760px]">
                  <thead className="bg-gray-50/60"><tr className="text-[10px] text-gray-500 uppercase">
                    <th className="px-2.5 py-1.5 text-left font-medium">Material</th>
                    <th className="px-2.5 py-1.5 text-right font-medium">Qtd</th>
                    <th className="px-2.5 py-1.5 text-left font-medium">Produto Omie</th>
                    <th className="px-2.5 py-1.5 text-right font-medium">Valor un.</th>
                    <th className="px-2.5 py-1.5 text-right font-medium">Total</th>
                  </tr></thead>
                  <tbody className="divide-y divide-gray-50">
                    {itens.map((it) => {
                      const total = (Number(it.valorUnit) || 0) * (Number(it.qtd) || 0);
                      return (
                        <tr key={it.idx} className={!it.codigoOmie || !(it.valorUnit > 0) ? "bg-amber-50/40" : ""}>
                          <td className="px-2.5 py-1.5">
                            <span className="font-mono text-torg-dark">{it.perfil || "—"}</span>
                            {it.descricao && <span className="block text-[11px] text-torg-gray truncate max-w-[220px]" title={it.descricao}>{it.descricao}</span>}
                          </td>
                          <td className="px-2.5 py-1.5 text-right tabular-nums whitespace-nowrap">{it.qtd}{it.unidade ? ` ${it.unidade}` : ""}</td>
                          <td className="px-2.5 py-1.5">
                            {it.codigoOmie ? (
                              <span className="inline-flex items-center gap-1.5">
                                <span className="font-mono text-torg-dark">{it.codigoOmie}</span>
                                <button onClick={() => setItem(it.idx, { codigoOmie: null, valorUnit: it.fonte === "manual" ? it.valorUnit : null, fonte: null, precisaCodigo: true })} title="Trocar produto" className="text-gray-300 hover:text-torg-blue"><Pencil size={11} /></button>
                              </span>
                            ) : (
                              <SeletorProduto onEscolher={(p) => setItem(it.idx, { codigoOmie: p.codigoOmie, descricao: p.descricao, valorUnit: it.valorUnit > 0 ? it.valorUnit : p.valorUnit, fonte: p.fonte || "manual", precisaCodigo: false })} />
                            )}
                            {it.fonte && it.codigoOmie && <span className="block text-[10px] text-torg-gray mt-0.5">{it.fonte === "compra" ? "preço de compra" : it.fonte === "estoque" ? "custo do estoque" : "manual"}</span>}
                          </td>
                          <td className="px-2.5 py-1.5 text-right">
                            <input value={it.valorUnit ?? ""} onChange={(e) => setItem(it.idx, { valorUnit: e.target.value === "" ? null : parseFloat(String(e.target.value).replace(",", ".")), fonte: "manual" })}
                              inputMode="decimal" placeholder="0,00" className="w-24 text-right text-sm border border-gray-200 rounded px-2 py-1 tabular-nums" />
                          </td>
                          <td className="px-2.5 py-1.5 text-right tabular-nums whitespace-nowrap text-torg-dark font-medium">{total > 0 ? fmtR$(total) : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot><tr className="bg-gray-50/60 font-semibold text-torg-dark"><td className="px-2.5 py-2" colSpan={4}>Total da remessa</td><td className="px-2.5 py-2 text-right tabular-nums">{fmtR$(totalGeral)}</td></tr></tfoot>
                </table>
              </div>
            </>
          )}
        </div>
        <div className="px-5 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between gap-3 rounded-b-xl">
          <p className="text-[11px] text-torg-gray">Cria o pedido no Omie como <strong>rascunho</strong> — você confere e fatura lá.</p>
          <div className="flex gap-3">
            <button onClick={onClose} className="px-4 py-2 text-torg-gray border border-gray-300 rounded-lg hover:bg-gray-100 text-sm">Cancelar</button>
            <button onClick={gerar} disabled={gerando || !podeGerar} className="px-5 py-2 bg-torg-blue text-white rounded-lg hover:bg-torg-dark text-sm font-medium flex items-center gap-2 disabled:opacity-50">
              {gerando ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Gerar remessa no Omie
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Busca/seleção de produto do Omie (EstoqueItem) pra materiais sem código.
function SeletorProduto({ onEscolher }) {
  const [q, setQ] = useState("");
  const [lista, setLista] = useState([]);
  const [aberto, setAberto] = useState(false);
  const [carregando, setCarregando] = useState(false);
  useEffect(() => {
    if (!aberto) return;
    const termo = q.trim();
    if (termo.length < 2) { setLista([]); return; }
    setCarregando(true);
    const t = setTimeout(() => {
      fetch(`/api/fiscal/produtos-estoque?q=${encodeURIComponent(termo)}`)
        .then((r) => r.json()).then((j) => setLista(j.produtos || [])).catch(() => setLista([])).finally(() => setCarregando(false));
    }, 250);
    return () => clearTimeout(t);
  }, [q, aberto]);
  return (
    <div className="relative">
      <div className="relative">
        <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
        <input value={q} onChange={(e) => setQ(e.target.value)} onFocus={() => setAberto(true)} placeholder="Buscar produto do Omie…"
          className="w-56 text-sm border border-amber-300 rounded pl-7 pr-2 py-1 focus:ring-2 focus:ring-torg-blue outline-none" />
      </div>
      {aberto && q.trim().length >= 2 && (
        <div className="absolute z-20 mt-1 w-[420px] max-w-[80vw] bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
          {carregando ? (
            <p className="px-3 py-2 text-xs text-torg-gray inline-flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> Buscando…</p>
          ) : lista.length === 0 ? (
            <p className="px-3 py-2 text-xs text-torg-gray">Nenhum produto encontrado.</p>
          ) : lista.map((p) => (
            <button key={p.codigoOmie} type="button" onClick={() => { onEscolher(p); setAberto(false); setQ(""); }}
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-torg-blue-50 border-b border-gray-50 last:border-0">
              <span className="font-mono text-torg-dark">{p.codigoOmie}</span>
              <span className="text-torg-gray"> · {p.unidade || "—"}</span>
              {p.valorUnit > 0 && <span className="text-emerald-700"> · {fmtR$(p.valorUnit)}</span>}
              <span className="block text-torg-dark truncate">{p.descricao}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Visualização dos itens que compõem a remessa: MATERIAIS (matéria-prima → produto
// real do Omie) e MARCAS (peças fabricadas → ARM000001). Só leitura.
function ModalItens({ remessa, onClose }) {
  const materiais = Array.isArray(remessa.materiais) ? remessa.materiais : [];
  const marcas = Array.isArray(remessa.itens) ? remessa.itens : [];
  const semCodigo = materiais.filter((m) => !m.codigoOmie).length;
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 overflow-y-auto" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl my-8">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-torg-dark flex items-center gap-2"><Boxes size={16} className="text-torg-blue" /> Itens da remessa — RT-{String(remessa.numero).padStart(3, "0")}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="px-5 py-4 space-y-5 max-h-[70vh] overflow-y-auto">
          <div className="bg-gray-50 rounded-lg p-3 text-xs text-torg-gray">
            <p><strong className="text-torg-dark">{remessa.terceiro?.nome}</strong>{remessa.terceiro?.uf ? ` · ${remessa.terceiro.uf}` : ""}{remessa.servico ? ` · ${remessa.servico}` : ""}{remessa.opRefNumero ? ` · OP ${remessa.opRefNumero}` : ""}</p>
            <p className="mt-0.5">{marcas.length} marca(s){materiais.length ? ` · ${materiais.length} material(is)` : ""} · {fmtKg(remessa.pesoEnviadoKg)}</p>
          </div>

          {materiais.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-torg-dark uppercase tracking-wider mb-2 flex items-center gap-1.5"><Package size={13} className="text-torg-orange" /> Itens da NF — matéria-prima enviada (produto do Omie)</p>
              {semCodigo > 0 && (
                <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded px-2.5 py-1.5 mb-2 flex items-start gap-1.5"><AlertCircle size={13} className="mt-0.5 shrink-0" /> {semCodigo} item(ns) sem código do Omie — o casamento perfil→produto não achou correspondência segura. Ajustar antes de emitir a NF.</p>
              )}
              <div className="overflow-x-auto border border-gray-100 rounded-lg">
                <table className="w-full text-xs min-w-[640px]">
                  <thead className="bg-gray-50/60"><tr className="text-[10px] text-gray-500 uppercase">
                    <th className="px-2.5 py-1.5 text-left font-medium">Cód. Omie</th>
                    <th className="px-2.5 py-1.5 text-left font-medium">Descrição (Omie)</th>
                    <th className="px-2.5 py-1.5 text-left font-medium">Perfil (Eng.)</th>
                    <th className="px-2.5 py-1.5 text-right font-medium">Qtd</th>
                    <th className="px-2.5 py-1.5 text-right font-medium">Peso</th>
                  </tr></thead>
                  <tbody className="divide-y divide-gray-50">
                    {materiais.map((m, i) => (
                      <tr key={i} className={m.codigoOmie ? "" : "bg-amber-50/40"}>
                        <td className="px-2.5 py-1.5 font-mono text-torg-dark whitespace-nowrap">{m.codigoOmie || <span className="text-amber-600 inline-flex items-center gap-1"><AlertCircle size={11} /> sem código</span>}</td>
                        <td className="px-2.5 py-1.5 text-torg-dark">{m.descricaoOmie || <span className="text-gray-400 italic">—</span>}</td>
                        <td className="px-2.5 py-1.5 text-torg-gray whitespace-nowrap">{m.perfil}{m.descricao ? ` · ${m.descricao}` : ""}</td>
                        <td className="px-2.5 py-1.5 text-right tabular-nums whitespace-nowrap">{m.qtd}{m.unidade ? ` ${m.unidade}` : ""}</td>
                        <td className="px-2.5 py-1.5 text-right tabular-nums whitespace-nowrap">{fmtKg(m.pesoKg)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {marcas.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-torg-dark uppercase tracking-wider mb-2 flex items-center gap-1.5"><Factory size={13} className="text-torg-gray" /> Controle — o que o terceiro deve produzir <span className="normal-case font-normal text-torg-gray">(não vai na NF)</span></p>
              <div className="overflow-x-auto border border-gray-100 rounded-lg">
                <table className="w-full text-xs min-w-[520px]">
                  <thead className="bg-gray-50/60"><tr className="text-[10px] text-gray-500 uppercase">
                    <th className="px-2.5 py-1.5 text-left font-medium">Marca</th>
                    <th className="px-2.5 py-1.5 text-left font-medium">Descrição</th>
                    <th className="px-2.5 py-1.5 text-right font-medium">Qtd</th>
                    <th className="px-2.5 py-1.5 text-right font-medium">Peso</th>
                  </tr></thead>
                  <tbody className="divide-y divide-gray-50">
                    {marcas.map((m, i) => (
                      <tr key={i}>
                        <td className="px-2.5 py-1.5 font-mono text-torg-dark whitespace-nowrap">{m.marca}</td>
                        <td className="px-2.5 py-1.5 text-torg-gray">{m.descricao || <span className="text-gray-400 italic">—</span>}</td>
                        <td className="px-2.5 py-1.5 text-right tabular-nums">{m.qte}</td>
                        <td className="px-2.5 py-1.5 text-right tabular-nums whitespace-nowrap">{fmtKg(m.pesoTotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {materiais.length === 0 && marcas.length === 0 && (
            <p className="text-sm text-torg-gray text-center py-6">Esta remessa não tem itens cadastrados.</p>
          )}
        </div>
        <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex justify-end rounded-b-xl">
          <button onClick={onClose} className="px-4 py-2 text-torg-gray border border-gray-300 rounded-lg hover:bg-gray-100 text-sm">Fechar</button>
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, sub, color, Icon }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex items-center gap-3">
      <div className={`${color} p-2.5 rounded-lg`}><Icon size={20} className="text-white" /></div>
      <div className="min-w-0"><p className="text-xs text-torg-gray truncate">{label}</p><p className="text-xl font-extrabold text-torg-dark tabular-nums truncate">{value}</p>{sub && <p className="text-[10px] text-torg-gray truncate">{sub}</p>}</div>
    </div>
  );
}

function ModalEmitir({ remessa, onClose, onSalvo }) {
  const [f, setF] = useState({
    cfop: remessa.cfop || remessa.cfopSugerido || "5901",
    natureza: remessa.natureza || "Remessa para industrialização",
    nfNumero: remessa.nfNumero || "",
    nfSerie: remessa.nfSerie || "",
    nfChave: remessa.nfChave || "",
    observacao: remessa.observacao || "",
  });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));

  async function salvar() {
    setErro("");
    if (!f.nfNumero.trim()) return setErro("Informe o número da NF.");
    setSalvando(true);
    try {
      const res = await fetch(`/api/fiscal/remessa-terceiro/${remessa.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "registrar", ...f }),
      });
      const j = await res.json();
      if (!j.success) throw new Error(j.error || "Erro");
      onSalvo();
    } catch (e) { setErro(e.message); setSalvando(false); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 overflow-y-auto" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg my-8">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-torg-dark flex items-center gap-2"><ReceiptText size={16} className="text-torg-blue" /> Emitir NF de remessa — RT-{String(remessa.numero).padStart(3, "0")}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="px-5 py-4 space-y-4">
          {erro && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded px-3 py-2 flex items-start gap-2"><AlertCircle size={14} className="mt-0.5" /><span>{erro}</span></div>}
          <div className="bg-gray-50 rounded-lg p-3 text-xs text-torg-gray">
            <p><strong className="text-torg-dark">{remessa.terceiro?.nome}</strong> · {remessa.terceiro?.cnpj || "sem CNPJ"}{remessa.terceiro?.uf ? ` · ${remessa.terceiro.uf}` : ""}</p>
            <p className="mt-0.5">{remessa.itensCount} peça(s){remessa.materiaisCount ? ` + ${remessa.materiaisCount} material(is)` : ""} · {fmtKg(remessa.pesoEnviadoKg)}{remessa.opRefNumero ? ` · OP ${remessa.opRefNumero}` : ""}</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs font-medium text-torg-dark mb-1">CFOP</label><input value={f.cfop} onChange={(e) => set("cfop", e.target.value)} className={inp} /></div>
            <div><label className="block text-xs font-medium text-torg-dark mb-1">Natureza da operação</label><input value={f.natureza} onChange={(e) => set("natureza", e.target.value)} className={inp} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs font-medium text-torg-dark mb-1">Nº da NF *</label><input value={f.nfNumero} onChange={(e) => set("nfNumero", e.target.value)} className={inp} /></div>
            <div><label className="block text-xs font-medium text-torg-dark mb-1">Série</label><input value={f.nfSerie} onChange={(e) => set("nfSerie", e.target.value)} className={inp} /></div>
          </div>
          <div><label className="block text-xs font-medium text-torg-dark mb-1">Chave de acesso (44 díg.)</label><input value={f.nfChave} onChange={(e) => set("nfChave", e.target.value)} className={inp} /></div>
          <div><label className="block text-xs font-medium text-torg-dark mb-1">Observação</label><input value={f.observacao} onChange={(e) => set("observacao", e.target.value)} placeholder="Opcional" className={inp} /></div>
          <p className="text-[11px] text-torg-gray bg-amber-50 border border-amber-100 rounded px-2.5 py-1.5">Fluxo integrado: use <strong>“Gerar pedido Omie”</strong> na lista pra criar o pedido de venda (rascunho) já com as marcas; confira e <strong>fature no Omie</strong> (emite a NF-e). Aqui você só registra o nº/série/chave da NF já emitida.</p>
        </div>
        <div className="px-5 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-3 rounded-b-xl">
          <button onClick={onClose} className="px-4 py-2 text-torg-gray border border-gray-300 rounded-lg hover:bg-gray-100 text-sm">Cancelar</button>
          <button onClick={salvar} disabled={salvando} className="px-5 py-2 bg-torg-blue text-white rounded-lg hover:bg-torg-dark text-sm font-medium flex items-center gap-2 disabled:opacity-50">{salvando && <Loader2 size={14} className="animate-spin" />} Registrar emissão</button>
        </div>
      </div>
    </div>
  );
}
