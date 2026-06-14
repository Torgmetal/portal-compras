"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { fmtOP } from "@/lib/utils";
import {
  Loader2, AlertCircle, RefreshCw, Truck, MapPin, Package, ChevronRight,
  CheckCircle2, FileText, Plus, X, ArrowLeft, Weight, Clock, AlertTriangle, Printer,
} from "lucide-react";

const fmtKg = (v) => (!v ? "0 kg" : `${v.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} kg`);
const fmtData = (d) =>
  d ? new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";
const hojeISO = () => new Date().toISOString().slice(0, 10);

const SETOR_LABEL = {
  PENDENTE: "Estoque", CORTE: "Preparação", MONTAGEM: "Montagem", SOLDA: "Solda",
  ACABAMENTO: "Acabamento", JATO: "Jato", PINTURA: "Pintura", EXPEDIDO: "Expedido",
};
// pronto para expedir = pintura concluída ou já expedido
const prontoExpedir = (status) => status === "PINTURA" || status === "EXPEDIDO";

const NF_BADGE = {
  PENDENTE: "bg-gray-100 text-torg-gray",
  SOLICITADA: "bg-amber-100 text-amber-700",
  EMITIDA: "bg-emerald-100 text-emerald-700",
};
const NF_LABEL = { PENDENTE: "NF pendente", SOLICITADA: "NF solicitada", EMITIDA: "NF emitida" };

export default function PedidosExpedicaoClient() {
  const [pedidos, setPedidos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [carga, setCarga] = useState(null); // destino sendo romaneado

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro("");
    try {
      const res = await fetch("/api/expedicao/pedidos");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Erro ao carregar");
      setPedidos(json.pedidos || []);
    } catch (e) {
      setErro(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const totalDestinos = pedidos.reduce((s, p) => s + (p.destinos?.length || 0), 0);

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <Link href="/expedicao" className="text-[11px] text-torg-gray hover:text-torg-dark inline-flex items-center gap-1 mb-1">
            <ArrowLeft size={12} /> Portal de Expedição
          </Link>
          <h1 className="text-xl font-bold text-torg-dark flex items-center gap-2">
            <Truck size={20} className="text-torg-blue" /> A Expedir
          </h1>
          <p className="text-xs text-torg-gray mt-0.5">
            Obras que o Planejamento enviou — monte o romaneio por destino, registre a transportadora e a NF.
          </p>
        </div>
        <button
          onClick={carregar}
          disabled={loading}
          className="text-xs text-torg-blue hover:text-torg-dark inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Atualizar
        </button>
      </div>

      {/* Estados */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-torg-gray">
          <Loader2 size={28} className="animate-spin mb-3" />
          <p className="text-sm">Carregando fila de expedição…</p>
        </div>
      ) : erro ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <AlertCircle size={28} className="text-red-500 mb-3" />
          <p className="text-sm text-torg-dark mb-3">{erro}</p>
          <button onClick={carregar} className="text-xs text-torg-blue hover:underline">Tentar novamente</button>
        </div>
      ) : pedidos.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center text-torg-gray">
          <Package size={32} className="mb-3 opacity-40" />
          <p className="text-sm font-medium text-torg-dark">Nenhuma obra na fila de expedição</p>
          <p className="text-xs mt-1 max-w-sm">
            Quando o Planejamento definir as entregas (quantidade + local) e clicar em
            “Enviar à Expedição”, as obras aparecem aqui.
          </p>
        </div>
      ) : (
        <>
          <p className="text-[11px] text-torg-gray mb-3">
            {pedidos.length} obra(s) · {totalDestinos} destino(s) a romanear
          </p>
          <div className="space-y-4">
            {pedidos.map((p) => (
              <PedidoCard key={p.opNumero} pedido={p} onRomanear={(destino) => setCarga({ pedido: p, destino })} />
            ))}
          </div>
        </>
      )}

      {carga && (
        <ModalRomaneio
          pedido={carga.pedido}
          destino={carga.destino}
          onClose={() => setCarga(null)}
          onCreated={() => { setCarga(null); carregar(); }}
        />
      )}
    </div>
  );
}

function PedidoCard({ pedido, onRomanear }) {
  const [aberto, setAberto] = useState(true);
  const totalUn = (pedido.destinos || []).reduce((s, d) => s + d.totalUn, 0);
  const totalKg = (pedido.destinos || []).reduce((s, d) => s + d.totalKg, 0);

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <button onClick={() => setAberto(!aberto)} className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-gray-50/50">
        <div className="flex items-center gap-3 min-w-0">
          <ChevronRight size={14} className={`text-torg-gray transition-transform shrink-0 ${aberto ? "rotate-90" : ""}`} />
          <span className="text-sm font-bold text-torg-blue font-mono whitespace-nowrap">{fmtOP(pedido.opNumero)}</span>
          <span className="text-sm text-torg-dark font-medium truncate">{pedido.cliente || "—"}</span>
          {pedido.obra && <span className="text-xs text-torg-gray whitespace-nowrap shrink-0">({pedido.obra})</span>}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-[11px] text-torg-gray inline-flex items-center gap-1">
            <Clock size={11} /> {fmtData(pedido.enviadoEm)}
          </span>
          <span className="text-xs text-torg-dark font-semibold whitespace-nowrap">{totalUn} un · {fmtKg(totalKg)}</span>
        </div>
      </button>

      {aberto && (
        <div className="px-4 pb-4 border-t border-gray-100 pt-3 space-y-3">
          {pedido.observacao && (
            <p className="text-[11px] text-torg-gray italic bg-gray-50 rounded px-2 py-1">{pedido.observacao}</p>
          )}

          {(pedido.destinos || []).length === 0 ? (
            <p className="text-[11px] text-amber-700 bg-amber-50 rounded px-2 py-1.5 flex items-center gap-1">
              <AlertTriangle size={12} /> Sem entregas definidas — o Planejamento precisa informar quantidade + local.
            </p>
          ) : (
            (pedido.destinos || []).map((d) => {
              const algunsNaoProntos = d.itens.some((it) => !prontoExpedir(it.status));
              return (
                <div key={d.destino} className="rounded-lg border border-gray-100">
                  <div className="flex items-center justify-between px-3 py-2 bg-torg-blue-50/40 rounded-t-lg">
                    <p className="text-[12px] font-semibold text-torg-dark inline-flex items-center gap-1.5">
                      <MapPin size={13} className="text-torg-blue" /> {d.destino}
                      <span className="text-[10px] text-torg-gray font-normal">· {d.totalUn} un · {fmtKg(d.totalKg)}</span>
                    </p>
                    <button
                      onClick={() => onRomanear(d)}
                      className="text-[11px] px-2.5 py-1 rounded-lg bg-torg-blue text-white hover:bg-torg-dark font-semibold inline-flex items-center gap-1 whitespace-nowrap"
                    >
                      <FileText size={12} /> Criar romaneio
                    </button>
                  </div>
                  {algunsNaoProntos && (
                    <p className="text-[10px] text-amber-700 bg-amber-50/70 px-3 py-1 flex items-center gap-1">
                      <AlertTriangle size={11} /> Alguns itens ainda não chegaram na Pintura — confira a prontidão física antes de emitir NF.
                    </p>
                  )}
                  <div className="px-3 py-2 space-y-1">
                    {d.itens.map((it) => (
                      <div key={it.pecaConjuntoId} className="flex items-center justify-between text-[11px] gap-2">
                        <span className="font-mono font-semibold text-torg-dark whitespace-nowrap">{it.marca}</span>
                        <span className="text-torg-gray truncate flex-1">{it.descricao || ""}</span>
                        <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-medium whitespace-nowrap ${
                          prontoExpedir(it.status) ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-torg-gray"
                        }`}>{SETOR_LABEL[it.status] || it.status}</span>
                        <span className="tabular-nums whitespace-nowrap font-medium">{it.quantidade} un</span>
                        <span className="tabular-nums whitespace-nowrap text-torg-gray w-20 text-right">{fmtKg(it.pesoKg)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          )}

          {/* Romaneios já criados desta OP */}
          {(pedido.romaneios || []).length > 0 && (
            <div className="pt-1">
              <p className="text-[10px] font-semibold text-torg-dark mb-1">Romaneios desta obra</p>
              <div className="flex flex-wrap gap-1.5">
                {pedido.romaneios.map((r) => (
                  <Link
                    key={r.id}
                    href={`/expedicao/romaneio/${r.id}/imprimir`}
                    target="_blank"
                    title="Abrir documento do romaneio"
                    className="text-[10px] px-2 py-1 rounded-lg border border-gray-200 inline-flex items-center gap-1.5 hover:border-torg-blue hover:bg-torg-blue-50/40 transition-colors"
                  >
                    <FileText size={10} className="text-torg-blue" />
                    <strong className="text-torg-dark">{r.numero}</strong>
                    {r.destino && <span className="text-torg-gray">→ {r.destino}</span>}
                    <span className="text-torg-gray">· {fmtKg(r.pesoRealKg)}</span>
                    <span className={`px-1.5 py-0.5 rounded-full font-medium ${NF_BADGE[r.nfStatus] || NF_BADGE.PENDENTE}`}>
                      {r.nfNumero ? `NF ${r.nfNumero}` : NF_LABEL[r.nfStatus] || "NF pendente"}
                    </span>
                    <Printer size={10} className="text-torg-gray" />
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ModalRomaneio({ pedido, destino, onClose, onCreated }) {
  const [numero, setNumero] = useState("");
  const [data, setData] = useState(hojeISO());
  const [transportadora, setTransportadora] = useState("");
  const [motorista, setMotorista] = useState("");
  const [placa, setPlaca] = useState("");
  const [contato, setContato] = useState("");
  const [nfStatus, setNfStatus] = useState("PENDENTE");
  const [nfNumero, setNfNumero] = useState("");
  const [linhas, setLinhas] = useState(
    destino.itens.map((it) => ({
      pecaConjuntoId: it.pecaConjuntoId,
      marca: it.marca,
      descricao: it.descricao,
      pesoUnit: it.pesoUnit,
      qtd: String(it.quantidade),
    }))
  );
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const setQtd = (i, v) => setLinhas((prev) => prev.map((l, idx) => (idx === i ? { ...l, qtd: v } : l)));
  const pesoTotal = linhas.reduce((s, l) => s + (parseFloat(l.qtd) || 0) * (l.pesoUnit || 0), 0);
  const totalUn = linhas.reduce((s, l) => s + (parseInt(l.qtd, 10) || 0), 0);

  async function salvar() {
    setErro("");
    if (!numero.trim()) { setErro("Informe o número do romaneio."); return; }
    const itens = linhas
      .filter((l) => (parseFloat(l.qtd) || 0) > 0)
      .map((l) => ({
        tipo: "PECA",
        descricao: `${l.marca}${l.descricao ? " — " + l.descricao : ""}`,
        pecaConjuntoId: l.pecaConjuntoId,
        qtd: parseFloat(l.qtd) || 0,
        pesoKg: (parseFloat(l.qtd) || 0) * (l.pesoUnit || 0),
      }));
    if (itens.length === 0) { setErro("Inclua ao menos um item com quantidade."); return; }

    setSalvando(true);
    try {
      const res = await fetch("/api/producao/romaneio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          numero: numero.trim(),
          opId: pedido.opId,
          data,
          pesoRealKg: Math.round(pesoTotal * 100) / 100,
          destino: destino.destino,
          transportadora: transportadora.trim() || null,
          motorista: motorista.trim() || null,
          placaVeiculo: placa.trim() || null,
          contatoTransporte: contato.trim() || null,
          nfStatus,
          nfNumero: nfNumero.trim() || null,
          itens,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Erro ao criar romaneio");
      onCreated();
    } catch (e) {
      setErro(e.message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[88vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between px-4 py-3 border-b border-gray-100">
          <div className="min-w-0">
            <p className="text-sm font-bold text-torg-dark flex items-center gap-1.5">
              <FileText size={15} className="text-torg-blue" /> Novo romaneio
            </p>
            <p className="text-[11px] text-torg-gray mt-0.5 truncate">
              {fmtOP(pedido.opNumero)} · {pedido.cliente || "—"} · <MapPin size={10} className="inline" /> {destino.destino}
            </p>
          </div>
          <button onClick={onClose} className="p-1 text-torg-gray hover:text-torg-dark rounded hover:bg-gray-100 shrink-0"><X size={16} /></button>
        </div>

        <div className="px-4 py-3 overflow-y-auto space-y-4">
          {/* Dados do romaneio */}
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[10px] font-medium text-torg-gray uppercase">Nº do romaneio *</span>
              <input value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="ex.: ROM-001"
                className="mt-1 w-full px-2 py-1.5 text-[12px] border border-gray-200 rounded-lg focus:border-torg-blue focus:ring-1 focus:ring-torg-blue/30" />
            </label>
            <label className="block">
              <span className="text-[10px] font-medium text-torg-gray uppercase">Data</span>
              <input type="date" value={data} onChange={(e) => setData(e.target.value)}
                className="mt-1 w-full px-2 py-1.5 text-[12px] border border-gray-200 rounded-lg focus:border-torg-blue focus:ring-1 focus:ring-torg-blue/30" />
            </label>
          </div>

          {/* Transportadora */}
          <div>
            <p className="text-[10px] font-semibold text-torg-dark uppercase mb-1.5 flex items-center gap-1"><Truck size={12} /> Transportadora</p>
            <div className="grid grid-cols-2 gap-3">
              <input value={transportadora} onChange={(e) => setTransportadora(e.target.value)} placeholder="Transportadora"
                className="px-2 py-1.5 text-[12px] border border-gray-200 rounded-lg focus:border-torg-blue focus:ring-1 focus:ring-torg-blue/30" />
              <input value={motorista} onChange={(e) => setMotorista(e.target.value)} placeholder="Motorista"
                className="px-2 py-1.5 text-[12px] border border-gray-200 rounded-lg focus:border-torg-blue focus:ring-1 focus:ring-torg-blue/30" />
              <input value={placa} onChange={(e) => setPlaca(e.target.value)} placeholder="Placa do veículo"
                className="px-2 py-1.5 text-[12px] border border-gray-200 rounded-lg focus:border-torg-blue focus:ring-1 focus:ring-torg-blue/30" />
              <input value={contato} onChange={(e) => setContato(e.target.value)} placeholder="Contato (telefone)"
                className="px-2 py-1.5 text-[12px] border border-gray-200 rounded-lg focus:border-torg-blue focus:ring-1 focus:ring-torg-blue/30" />
            </div>
          </div>

          {/* NF */}
          <div>
            <p className="text-[10px] font-semibold text-torg-dark uppercase mb-1.5 flex items-center gap-1"><FileText size={12} /> Nota fiscal</p>
            <div className="flex items-center gap-2 flex-wrap">
              {["PENDENTE", "SOLICITADA", "EMITIDA"].map((s) => (
                <button key={s} type="button" onClick={() => setNfStatus(s)}
                  className={`text-[11px] px-2.5 py-1 rounded-lg border font-medium ${
                    nfStatus === s ? "border-torg-blue bg-torg-blue text-white" : "border-gray-200 text-torg-gray hover:bg-gray-50"
                  }`}>{NF_LABEL[s]}</button>
              ))}
              {nfStatus === "EMITIDA" && (
                <input value={nfNumero} onChange={(e) => setNfNumero(e.target.value)} placeholder="Nº da NF"
                  className="px-2 py-1.5 text-[12px] border border-gray-200 rounded-lg focus:border-torg-blue focus:ring-1 focus:ring-torg-blue/30 w-32" />
              )}
            </div>
          </div>

          {/* Itens */}
          <div>
            <p className="text-[10px] font-semibold text-torg-dark uppercase mb-1.5 flex items-center gap-1"><Package size={12} /> Itens da carga</p>
            <div className="rounded-lg border border-gray-100 overflow-hidden">
              <table className="w-full text-[11px]">
                <thead className="bg-gray-50/60">
                  <tr>
                    <th className="text-left px-2 py-1.5 font-medium text-gray-500">Marca</th>
                    <th className="text-left px-2 py-1.5 font-medium text-gray-500">Descrição</th>
                    <th className="text-right px-2 py-1.5 font-medium text-gray-500 w-20">Qtd</th>
                    <th className="text-right px-2 py-1.5 font-medium text-gray-500 w-24">Peso</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {linhas.map((l, i) => (
                    <tr key={l.pecaConjuntoId}>
                      <td className="px-2 py-1 font-mono font-semibold text-torg-dark whitespace-nowrap">{l.marca}</td>
                      <td className="px-2 py-1 text-torg-gray max-w-[240px] truncate" title={l.descricao || ""}>{l.descricao || "—"}</td>
                      <td className="px-2 py-1 text-right">
                        <input type="number" min="0" value={l.qtd} onChange={(e) => setQtd(i, e.target.value)}
                          className="w-16 px-1.5 py-0.5 text-right text-[11px] tabular-nums border border-gray-200 rounded focus:border-torg-blue focus:ring-1 focus:ring-torg-blue/30" />
                      </td>
                      <td className="px-2 py-1 text-right tabular-nums whitespace-nowrap text-torg-gray">
                        {fmtKg((parseFloat(l.qtd) || 0) * (l.pesoUnit || 0))}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50/60">
                  <tr className="text-[11px] font-semibold text-torg-dark">
                    <td className="px-2 py-1.5" colSpan={2}>Total</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{totalUn} un</td>
                    <td className="px-2 py-1.5 text-right tabular-nums flex items-center justify-end gap-1"><Weight size={11} /> {fmtKg(pesoTotal)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {erro && <p className="text-[11px] text-red-600 flex items-center gap-1"><AlertCircle size={12} /> {erro}</p>}
        </div>

        <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-end gap-2">
          <button onClick={onClose} disabled={salvando} className="px-3 py-1.5 text-[12px] text-torg-gray hover:text-torg-dark rounded-lg hover:bg-gray-100 disabled:opacity-50">Cancelar</button>
          <button onClick={salvar} disabled={salvando}
            className="px-3 py-1.5 text-[12px] font-semibold text-white bg-torg-blue rounded-lg hover:bg-torg-dark disabled:opacity-50 inline-flex items-center gap-1.5">
            {salvando ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />} Criar romaneio
          </button>
        </div>
      </div>
    </div>
  );
}
