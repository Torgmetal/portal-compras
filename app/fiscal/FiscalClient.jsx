"use client";
import { useState, useEffect, useMemo } from "react";
import { fmtOP } from "@/lib/utils";
import {
  ReceiptText, FileSpreadsheet, Loader2, CheckCircle2, Clock, Truck, Weight,
  X, Pencil, ExternalLink, AlertTriangle, Search, FilePlus2, RefreshCw, Check,
} from "lucide-react";

const fmtKg = (v) => `${Number(v || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} kg`;
const fmtData = (d) => (d ? new Date(d).toLocaleDateString("pt-BR") : "—");
const fmtDataHora = (d) => (d ? new Date(d).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—");
const rotuloRomaneio = (r) => `R${r.numero}${r.revisao > 0 ? ` · rev ${String(r.revisao).padStart(2, "0")}` : ""}`;

const TIPO_NF = [
  { value: "VENDA", label: "Venda" },
  { value: "SERVICO", label: "Serviço" },
  { value: "REMESSA", label: "Remessa" },
];
const tipoLabel = (v) => TIPO_NF.find((t) => t.value === v)?.label || v || "—";

export default function FiscalClient() {
  const [romaneios, setRomaneios] = useState(null);
  const [aba, setAba] = useState("aguardando"); // aguardando | finalizado
  const [busca, setBusca] = useState("");
  const [editar, setEditar] = useState(null); // romaneio em edição de NF
  const [remessaOmie, setRemessaOmie] = useState(null); // romaneio no fluxo NF Remessa (Omie)
  const [toast, setToast] = useState(null);

  const carregar = () => {
    fetch("/api/fiscal/romaneios")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setRomaneios(j?.romaneios || []))
      .catch(() => setRomaneios([]));
  };
  useEffect(() => { carregar(); }, []);

  const showToast = (msg, tipo = "success") => { setToast({ msg, tipo }); setTimeout(() => setToast(null), 3500); };

  const { aguardando, finalizados } = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const filtra = (r) =>
      !q ||
      String(r.op?.numero || "").toLowerCase().includes(q) ||
      String(r.op?.cliente || "").toLowerCase().includes(q) ||
      String(r.op?.obra || "").toLowerCase().includes(q) ||
      String(r.nfNumero || "").toLowerCase().includes(q);
    const lista = (romaneios || []).filter(filtra);
    return {
      aguardando: lista.filter((r) => !r.finalizado),
      finalizados: lista.filter((r) => r.finalizado),
    };
  }, [romaneios, busca]);

  const pesoAguardando = aguardando.reduce((s, r) => s + (Number(r.pesoKg) || 0), 0);
  const visiveis = aba === "aguardando" ? aguardando : finalizados;

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-torg-dark flex items-center gap-2">
          <ReceiptText size={24} className="text-violet-600" /> Fiscal
        </h1>
        <p className="text-sm text-torg-gray mt-0.5">
          Romaneios emitidos aguardando emissão de NF. Ao emitir a nota, registre o número e o tipo — o romaneio fica <b>finalizado</b>.
        </p>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card icon={Clock} cor="text-amber-600" bg="bg-amber-50" titulo="Aguardando NF" valor={romaneios ? aguardando.length : "…"} />
        <Card icon={Weight} cor="text-torg-blue" bg="bg-torg-blue-50" titulo="Peso aguardando" valor={romaneios ? fmtKg(pesoAguardando) : "…"} />
        <Card icon={CheckCircle2} cor="text-green-600" bg="bg-green-50" titulo="Finalizados" valor={romaneios ? finalizados.length : "…"} />
      </div>

      {/* Abas + busca */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="inline-flex rounded-lg border border-gray-200 bg-white overflow-hidden">
          <TabBtn ativo={aba === "aguardando"} onClick={() => setAba("aguardando")}>
            Aguardando NF {romaneios && <span className="ml-1 text-[11px] opacity-80">({aguardando.length})</span>}
          </TabBtn>
          <TabBtn ativo={aba === "finalizado"} onClick={() => setAba("finalizado")}>
            Finalizados {romaneios && <span className="ml-1 text-[11px] opacity-80">({finalizados.length})</span>}
          </TabBtn>
        </div>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar OP, cliente, obra, NF…"
            className="w-64 pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-torg-blue focus:border-transparent" />
        </div>
      </div>

      {/* Tabela */}
      {romaneios === null ? (
        <div className="text-center py-16 text-torg-gray"><Loader2 size={22} className="animate-spin mx-auto" /></div>
      ) : visiveis.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm text-center py-14 text-torg-gray">
          {aba === "aguardando" ? <CheckCircle2 size={30} className="mx-auto mb-2 text-green-400" /> : <ReceiptText size={30} className="mx-auto mb-2 text-gray-300" />}
          <p className="text-sm">{aba === "aguardando" ? "Nenhum romaneio aguardando NF." : "Nenhum romaneio finalizado ainda."}</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="bg-gray-100 border-b border-gray-200"><tr className="text-torg-dark text-left">
              <th className="px-3 py-2.5 font-semibold">OP</th>
              <th className="px-3 py-2.5 font-semibold">Obra / Cliente</th>
              <th className="px-3 py-2.5 font-semibold">Romaneio</th>
              <th className="px-3 py-2.5 font-semibold text-right">Peso</th>
              <th className="px-3 py-2.5 font-semibold">Emitido</th>
              <th className="px-3 py-2.5 font-semibold">Transportador</th>
              <th className="px-3 py-2.5 font-semibold text-center">FORM 22</th>
              <th className="px-3 py-2.5 font-semibold">NF</th>
              <th className="px-3 py-2.5 font-semibold text-center"></th>
            </tr></thead>
            <tbody className="divide-y divide-gray-50">
              {visiveis.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50/50 align-top">
                  <td className="px-3 py-2.5 font-mono font-semibold text-torg-dark whitespace-nowrap">{fmtOP(r.op?.numero)}</td>
                  <td className="px-3 py-2.5 max-w-[220px]">
                    <p className="text-torg-dark truncate" title={r.op?.obra || ""}>{r.op?.obra || "—"}</p>
                    <p className="text-[11px] text-torg-gray truncate" title={r.op?.cliente || ""}>{r.op?.cliente || ""}</p>
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <span className="font-mono font-semibold text-torg-dark">{rotuloRomaneio(r)}</span>
                    {r.lote?.nome && <span className="block text-[11px] text-torg-gray truncate max-w-[140px]" title={r.lote.nome}>{r.lote.nome}</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">{fmtKg(r.pesoKg)}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-torg-gray">{fmtData(r.emitidoEm)}</td>
                  <td className="px-3 py-2.5 max-w-[160px]">
                    {r.lote?.transportadora ? (
                      <>
                        <p className="text-torg-dark truncate flex items-center gap-1" title={r.lote.transportadora}><Truck size={12} className="text-torg-gray shrink-0" /> {r.lote.transportadora}</p>
                        {(r.lote.placaVeiculo || r.lote.placaCarreta) && (
                          <p className="text-[11px] text-torg-gray font-mono">{[r.lote.placaVeiculo, r.lote.placaCarreta].filter(Boolean).join(" / ")}</p>
                        )}
                      </>
                    ) : <span className="text-torg-gray">—</span>}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    {r.arquivoUrl ? (
                      <a href={r.arquivoUrl} target="_blank" rel="noopener noreferrer" title="Abrir o FORM 22 no SharePoint"
                        className="inline-flex items-center gap-1 text-torg-blue hover:text-torg-dark">
                        <FileSpreadsheet size={16} /><ExternalLink size={11} />
                      </a>
                    ) : <span className="text-gray-300" title="Arquivo não disponível">—</span>}
                  </td>
                  <td className="px-3 py-2.5">
                    {r.finalizado ? (
                      <span className="inline-flex flex-col">
                        <span className="font-semibold text-torg-dark">NF {r.nfNumero}</span>
                        <span className="text-[11px]"><BadgeTipo tipo={r.nfTipo} /></span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
                        <Clock size={11} /> aguardando
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap">
                    {r.finalizado ? (
                      <button onClick={() => setEditar(r)} className="text-gray-400 hover:text-torg-blue" title="Editar NF"><Pencil size={15} /></button>
                    ) : (
                      <div className="inline-flex items-center gap-1.5">
                        {r.nfPedidoOmie ? (
                          <button onClick={() => setRemessaOmie(r)} className="text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 px-2.5 py-1.5 rounded-lg inline-flex items-center gap-1"><ReceiptText size={12} /> Emitir NF</button>
                        ) : (
                          <button onClick={() => setRemessaOmie(r)} title="Gerar e emitir NF de Remessa pelo Omie" className="text-xs font-semibold text-emerald-700 border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1.5 rounded-lg inline-flex items-center gap-1"><FilePlus2 size={12} /> NF Remessa</button>
                        )}
                        <button onClick={() => setEditar(r)} title="Registrar NF manualmente (venda/serviço/remessa)" className="text-xs text-torg-blue hover:text-torg-dark border border-torg-blue-100 rounded-lg px-2 py-1.5 inline-flex items-center gap-1"><Pencil size={12} /> Manual</button>
                      </div>
                    )}
                    {r.nfErroEmissao && !r.finalizado && <p className="text-[10px] text-red-600 mt-1 max-w-[200px] ml-auto text-right" title={r.nfErroEmissao}><AlertTriangle size={9} className="inline mr-0.5" /> {r.nfErroEmissao.length > 60 ? "aguardando/erro — ver detalhe" : r.nfErroEmissao}</p>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editar && (
        <RegistrarNFModal
          romaneio={editar}
          onClose={() => setEditar(null)}
          onSalvo={(msg) => { setEditar(null); showToast(msg); carregar(); }}
        />
      )}

      {remessaOmie && (
        <NFRemessaOmieModal
          romaneio={remessaOmie}
          onClose={() => setRemessaOmie(null)}
          onFim={(msg, tipo = "success") => { setRemessaOmie(null); showToast(msg, tipo); carregar(); }}
          onAtualizar={carregar}
        />
      )}

      {toast && (
        <div className={`fixed bottom-5 right-5 z-50 px-4 py-2.5 rounded-lg shadow-lg text-sm text-white ${toast.tipo === "error" ? "bg-red-600" : "bg-green-600"}`}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

function Card({ icon: Icon, cor, bg, titulo, valor }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
      <span className={`flex items-center justify-center w-10 h-10 rounded-lg ${bg} ${cor}`}><Icon size={18} /></span>
      <div>
        <p className="text-[11px] text-torg-gray uppercase tracking-wide">{titulo}</p>
        <p className="text-lg font-bold text-torg-dark">{valor}</p>
      </div>
    </div>
  );
}

function TabBtn({ ativo, onClick, children }) {
  return (
    <button onClick={onClick} className={`px-4 py-2 text-sm font-medium transition-colors ${ativo ? "bg-torg-blue text-white" : "text-torg-dark hover:bg-gray-50"}`}>
      {children}
    </button>
  );
}

function BadgeTipo({ tipo }) {
  const cor = tipo === "VENDA" ? "bg-blue-50 text-blue-700 border-blue-200"
    : tipo === "SERVICO" ? "bg-purple-50 text-purple-700 border-purple-200"
    : "bg-slate-50 text-slate-600 border-slate-200";
  return <span className={`inline-block text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${cor}`}>{tipoLabel(tipo)}</span>;
}

const TP_FRETE = [["0", "0 - CIF (remetente)"], ["1", "1 - FOB (destinatário)"], ["2", "2 - Terceiros"], ["9", "9 - Sem transporte"]];
const finp = "w-full text-sm border border-gray-300 rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-torg-blue outline-none";

// Modal — NF de Remessa via Omie: gera a remessa (CFOP + frete) e emite a NF-e (confere DANFE).
function NFRemessaOmieModal({ romaneio, onClose, onFim, onAtualizar }) {
  const gerado = !!romaneio.nfPedidoOmie;
  const [cfop, setCfop] = useState("");
  const [frete, setFrete] = useState({ tpFrete: "0", especie: "PEÇAS", pesoBruto: romaneio.pesoKg || "", pesoLiq: romaneio.pesoKg || "" });
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");
  const [conf, setConf] = useState(gerado ? { estado: "conferindo" } : null);
  const setF = (k, v) => setFrete((s) => ({ ...s, [k]: v }));
  const num = (v) => (v === "" || v == null ? null : parseFloat(String(v).replace(",", ".")));

  useEffect(() => { if (gerado) conferir(); /* eslint-disable-next-line */ }, [gerado]);

  async function patch(payload) {
    const res = await fetch(`/api/fiscal/romaneios/${romaneio.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    return res.json();
  }
  async function conferir() {
    setConf({ estado: "conferindo" });
    const j = await patch({ acao: "conferir_omie" }).catch(() => ({ error: "Falha ao conferir" }));
    setConf(j.success ? { estado: "ok", mensagem: j.mensagem } : { estado: "erro", mensagem: j.error });
  }
  async function gerar() {
    if (!cfop.trim()) { setErro("Informe o CFOP da remessa ao cliente."); return; }
    setErro(""); setBusy(true);
    const j = await patch({ acao: "gerar_remessa_omie", cfop: cfop.trim(), frete: {
      tpFrete: frete.tpFrete || "0", nCodTransp: frete.nCodTransp || null, transpNome: frete.transpNome || null,
      placa: frete.placa || null, uf: frete.uf || null, qtdVol: num(frete.qtdVol), especie: frete.especie || null,
      pesoLiq: num(frete.pesoLiq), pesoBruto: num(frete.pesoBruto), valorFrete: num(frete.valorFrete),
    } }).catch(() => ({ error: "Falha ao gerar" }));
    if (!j.success) { setErro(j.error); setBusy(false); return; }
    onFim(`Remessa ${j.numeroPedido || ""} criada no Omie — agora emita a NF.`, "success");
  }
  async function emitir() {
    setErro(""); setBusy(true);
    const j = await patch({ acao: "emitir_omie" }).catch(() => ({ error: "Falha ao emitir" }));
    if (!j.success) { setErro(j.error); setBusy(false); return; }
    onFim(j.nf?.numero ? `NF-e ${j.nf.numero} autorizada!` : "NF-e autorizada!", "success");
  }
  async function atualizar() {
    setBusy(true);
    const j = await patch({ acao: "atualizar_status" }).catch(() => ({ error: "Falha" }));
    setBusy(false);
    if (j.success && j.estado === "AUTORIZADA") return onFim(`NF-e ${j.nf?.numero || ""} autorizada!`, "success");
    onAtualizar();
    setErro("Ainda sem confirmação da autorização. Se autorizou no Omie, aguarde o DANFE e tente de novo; se rejeitou, veja o motivo no Omie.");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg my-8" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-torg-dark flex items-center gap-2"><ReceiptText size={16} className="text-emerald-600" /> NF Remessa — R{romaneio.numero} · OP {fmtOP(romaneio.op?.numero)}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div className="bg-gray-50 rounded-lg p-3 text-xs text-torg-gray">
            <p><strong className="text-torg-dark">{romaneio.op?.cliente}</strong>{romaneio.op?.clienteUF ? ` · ${romaneio.op.clienteUF}` : ""} · {fmtKg(romaneio.pesoKg)}</p>
            <p className="mt-0.5">{romaneio.op?.clienteCnpj || "sem CNPJ na OP"}{romaneio.op?.obra ? ` · ${romaneio.op.obra}` : ""}</p>
          </div>
          {erro && <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded px-3 py-2 flex items-start gap-1.5"><AlertTriangle size={13} className="mt-0.5 shrink-0" /><span>{erro}</span></div>}
          {romaneio.nfErroEmissao && <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded px-3 py-2">{romaneio.nfErroEmissao}</div>}

          {!gerado ? (
            <>
              <div>
                <label className="block text-xs font-medium text-torg-dark mb-1">CFOP da remessa *</label>
                <input value={cfop} onChange={(e) => setCfop(e.target.value)} placeholder="ex.: 5.949 / 6.949" className={finp} />
                <p className="text-[11px] text-torg-gray mt-1">Confirme com o contador o CFOP correto da remessa ao cliente (formato pontuado, ex.: 5.949).</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs font-medium text-torg-dark mb-1">Tipo do frete</label>
                  <select value={frete.tpFrete} onChange={(e) => setF("tpFrete", e.target.value)} className={finp}>{TP_FRETE.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
                <div><label className="block text-xs font-medium text-torg-dark mb-1">Transportadora</label>
                  <SeletorTransp onEscolher={(t) => setFrete((s) => ({ ...s, nCodTransp: t?.nCodTransp || null, transpNome: t?.nome || null, uf: t?.uf || s.uf }))} /></div>
                <div><label className="block text-xs font-medium text-torg-dark mb-1">Placa</label><input value={frete.placa || ""} onChange={(e) => setF("placa", e.target.value.toUpperCase())} className={finp} /></div>
                <div><label className="block text-xs font-medium text-torg-dark mb-1">UF</label><input value={frete.uf || ""} onChange={(e) => setF("uf", e.target.value.toUpperCase().slice(0, 2))} className={finp} /></div>
                <div><label className="block text-xs font-medium text-torg-dark mb-1">Qtd. volumes</label><input value={frete.qtdVol ?? ""} onChange={(e) => setF("qtdVol", e.target.value)} inputMode="numeric" className={finp} /></div>
                <div><label className="block text-xs font-medium text-torg-dark mb-1">Peso bruto (kg)</label><input value={frete.pesoBruto ?? ""} onChange={(e) => setFrete((s) => ({ ...s, pesoBruto: e.target.value, pesoLiq: e.target.value }))} inputMode="decimal" className={finp} /></div>
              </div>
            </>
          ) : (
            <>
              <p className="text-xs text-torg-gray">Remessa nº <strong>{romaneio.nfPedidoNumero || romaneio.nfPedidoOmie}</strong> no Omie.</p>
              <div className="border border-gray-100 rounded-lg p-3">
                <p className="text-[11px] font-semibold text-torg-gray uppercase mb-1.5">Conferência</p>
                {!conf || conf.estado === "conferindo" ? <p className="text-sm text-torg-gray inline-flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Conferindo…</p>
                  : conf.estado === "ok" ? <p className="text-sm text-emerald-700 inline-flex items-center gap-1.5"><Check size={14} /> {conf.mensagem || "Validada."}</p>
                  : <p className="text-sm text-red-600 inline-flex items-start gap-1.5"><AlertTriangle size={14} className="mt-0.5" /> {conf.mensagem}</p>}
              </div>
              <p className="text-xs text-torg-gray">Ao emitir, a NF-e vai ao <strong>SEFAZ</strong> — o portal confere a autorização real (DANFE) e só finaliza quando autoriza. Pode levar até ~1 min.</p>
            </>
          )}
        </div>
        <div className="px-5 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-end gap-2 rounded-b-xl">
          <button onClick={onClose} className="px-4 py-2 text-torg-gray border border-gray-300 rounded-lg hover:bg-gray-100 text-sm">Fechar</button>
          {!gerado ? (
            <button onClick={gerar} disabled={busy} className="px-5 py-2 bg-torg-blue text-white rounded-lg hover:bg-torg-dark text-sm font-medium inline-flex items-center gap-2 disabled:opacity-50">{busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Gerar remessa no Omie</button>
          ) : (<>
            <button onClick={atualizar} disabled={busy} className="px-3 py-2 text-torg-blue border border-torg-blue-200 rounded-lg hover:bg-torg-blue-50 text-sm inline-flex items-center gap-1.5 disabled:opacity-50"><RefreshCw size={14} /> Atualizar status</button>
            <button onClick={emitir} disabled={busy || conf?.estado !== "ok"} className="px-5 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm font-medium inline-flex items-center gap-2 disabled:opacity-50">{busy ? <Loader2 size={14} className="animate-spin" /> : <ReceiptText size={14} />} Emitir NF-e</button>
          </>)}
        </div>
      </div>
    </div>
  );
}

// Autocomplete de transportadora (reusa /api/fiscal/transportadoras).
function SeletorTransp({ onEscolher }) {
  const [q, setQ] = useState(""); const [lista, setLista] = useState([]); const [aberto, setAberto] = useState(false);
  useEffect(() => {
    if (!aberto || q.trim().length < 2) { setLista([]); return; }
    const t = setTimeout(() => { fetch(`/api/fiscal/transportadoras?q=${encodeURIComponent(q.trim())}`).then((r) => r.json()).then((j) => setLista(j.transportadoras || [])).catch(() => setLista([])); }, 300);
    return () => clearTimeout(t);
  }, [q, aberto]);
  return (
    <div className="relative">
      <input value={q} onChange={(e) => { setQ(e.target.value); setAberto(true); if (!e.target.value) onEscolher(null); }} onFocus={() => setAberto(true)} placeholder="Buscar…" className={finp} />
      {aberto && q.trim().length >= 2 && lista.length > 0 && (
        <div className="absolute z-30 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {lista.map((t) => (
            <button key={t.nCodTransp} type="button" onClick={() => { onEscolher(t); setQ(t.nome); setAberto(false); }} className="w-full text-left px-3 py-1.5 text-xs hover:bg-torg-blue-50 border-b border-gray-50 last:border-0">
              <span className="text-torg-dark font-medium">{t.nome}</span>{t.uf && <span className="text-torg-gray"> · {t.uf}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Modal — registra/edita a NF de um romaneio emitido.
function RegistrarNFModal({ romaneio, onClose, onSalvo }) {
  const [nfNumero, setNfNumero] = useState(romaneio.nfNumero || "");
  const [nfTipo, setNfTipo] = useState(romaneio.nfTipo || "");
  const [nfObservacao, setNfObservacao] = useState(romaneio.nfObservacao || "");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  async function salvar() {
    if (!nfNumero.trim() || !nfTipo) { setErro("Informe o número e o tipo da nota."); return; }
    setErro(""); setSalvando(true);
    try {
      const res = await fetch(`/api/fiscal/romaneios/${romaneio.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nfNumero: nfNumero.trim(), nfTipo, nfObservacao: nfObservacao.trim() || null }),
      });
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j.error || "Erro ao salvar a NF");
      onSalvo(`NF ${nfNumero.trim()} registrada — romaneio finalizado.`);
    } catch (e) { setErro(e.message); setSalvando(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-1">
          <p className="text-base font-bold text-torg-dark flex items-center gap-2">
            <ReceiptText size={18} className="text-violet-600" /> Registrar NF
          </p>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <p className="text-xs text-torg-gray mb-4">
          Romaneio <span className="font-mono font-semibold">{rotuloRomaneio(romaneio)}</span> · OP {fmtOP(romaneio.op?.numero)}
          {romaneio.op?.obra ? ` · ${romaneio.op.obra}` : ""}
        </p>

        <label className="block mb-3">
          <span className="text-[11px] font-medium text-torg-gray uppercase tracking-wide">Número da NF</span>
          <input value={nfNumero} onChange={(e) => setNfNumero(e.target.value)} autoFocus placeholder="Ex.: 12345"
            className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue focus:border-transparent" />
        </label>

        <div className="mb-3">
          <span className="text-[11px] font-medium text-torg-gray uppercase tracking-wide">Tipo da nota</span>
          <div className="mt-1 grid grid-cols-3 gap-2">
            {TIPO_NF.map((t) => (
              <button key={t.value} type="button" onClick={() => setNfTipo(t.value)}
                className={`py-2 rounded-lg text-sm font-medium border transition-colors ${nfTipo === t.value ? "bg-torg-blue text-white border-torg-blue" : "bg-white text-torg-dark border-gray-300 hover:border-torg-blue"}`}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <label className="block mb-4">
          <span className="text-[11px] font-medium text-torg-gray uppercase tracking-wide">Observação <span className="text-gray-400">(opcional)</span></span>
          <input value={nfObservacao} onChange={(e) => setNfObservacao(e.target.value)} placeholder="Série, CFOP, nota complementar…"
            className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue focus:border-transparent" />
        </label>

        {erro && <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg px-3 py-2 mb-3 flex items-center gap-1.5"><AlertTriangle size={13} /> {erro}</div>}

        <div className="flex items-center justify-end gap-2">
          <button onClick={onClose} className="text-sm text-torg-gray hover:text-torg-dark px-3 py-1.5">Cancelar</button>
          <button onClick={salvar} disabled={salvando || !nfNumero.trim() || !nfTipo}
            className="text-sm font-semibold text-white bg-torg-blue hover:bg-torg-dark px-4 py-1.5 rounded-lg inline-flex items-center gap-1.5 disabled:opacity-50">
            {salvando ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Finalizar
          </button>
        </div>
      </div>
    </div>
  );
}
