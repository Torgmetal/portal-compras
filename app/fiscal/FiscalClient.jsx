"use client";
import { useState, useEffect, useMemo } from "react";
import { fmtOP } from "@/lib/utils";
import {
  ReceiptText, FileSpreadsheet, Loader2, CheckCircle2, Clock, Truck, Weight,
  X, Pencil, ExternalLink, AlertTriangle, Search,
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
                  <td className="px-3 py-2.5 text-center whitespace-nowrap">
                    {r.finalizado ? (
                      <button onClick={() => setEditar(r)} className="text-gray-400 hover:text-torg-blue" title="Editar NF"><Pencil size={15} /></button>
                    ) : (
                      <button onClick={() => setEditar(r)} className="text-xs font-semibold text-white bg-torg-blue hover:bg-torg-dark px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5">
                        <ReceiptText size={13} /> Registrar NF
                      </button>
                    )}
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
