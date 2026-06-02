"use client";
import { useState, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import {
  Upload, Loader2, AlertCircle, X, CheckCircle2, Search,
  Package, FileSpreadsheet, ChevronDown, ChevronUp, Filter, Plus, Trash2,
} from "lucide-react";
import ConfirmModal from "@/components/admin/ConfirmModal";
import { fmtOP } from "@/lib/utils";

const STATUS_PIPELINE = ["PENDENTE", "CORTE", "MONTAGEM", "SOLDA", "ACABAMENTO", "JATO", "PINTURA", "EXPEDIDO"];
const STATUS_LABEL = {
  PENDENTE: "Pendente",
  CORTE: "Corte",
  MONTAGEM: "Montagem",
  SOLDA: "Solda",
  ACABAMENTO: "Acabamento",
  JATO: "Jato",
  PINTURA: "Pintura",
  EXPEDIDO: "Expedido",
};
const STATUS_COR = {
  PENDENTE:   { bg: "bg-gray-100",      text: "text-torg-gray",      dot: "bg-gray-400" },
  CORTE:      { bg: "bg-orange-50",     text: "text-orange-700",     dot: "bg-orange-400" },
  MONTAGEM:   { bg: "bg-yellow-50",     text: "text-yellow-700",     dot: "bg-yellow-400" },
  SOLDA:      { bg: "bg-amber-50",      text: "text-amber-700",      dot: "bg-amber-400" },
  ACABAMENTO: { bg: "bg-lime-50",       text: "text-lime-700",       dot: "bg-lime-400" },
  JATO:       { bg: "bg-cyan-50",       text: "text-cyan-700",       dot: "bg-cyan-400" },
  PINTURA:    { bg: "bg-indigo-50",     text: "text-indigo-700",     dot: "bg-indigo-400" },
  EXPEDIDO:   { bg: "bg-emerald-50",    text: "text-emerald-700",    dot: "bg-emerald-500" },
};

const fmtKg = (v) => {
  if (v == null) return "—";
  const kg = Number(v);
  if (kg === 0) return "0 kg";
  if (kg >= 1000) return `${(kg / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} t`;
  return `${kg.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} kg`;
};

export default function PecasClient({ ops, pecasIniciais, userRole }) {
  const router = useRouter();
  const [pecas, setPecas] = useState(pecasIniciais);
  const [modalImport, setModalImport] = useState(false);
  const [filtroOp, setFiltroOp] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("");
  const [busca, setBusca] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [modalImportLPC, setModalImportLPC] = useState(false);
  const [filtroTipo, setFiltroTipo] = useState("");

  // Lista de OPs que tem pecas (pra mostrar so as relevantes no filtro)
  const opsComPecas = useMemo(() => {
    const set = new Set(pecas.map((p) => p.opNumero));
    return [...set].sort();
  }, [pecas]);

  const pecasFiltradas = useMemo(() => {
    return pecas.filter((p) => {
      if (filtroOp && p.opNumero !== filtroOp) return false;
      if (filtroTipo === "CONJUNTO" && p.tipoPeca !== "CONJUNTO") return false;
      if (filtroTipo === "CROQUI" && p.tipoPeca !== "CROQUI") return false;
      if (filtroTipo === "PECA" && p.tipoPeca != null) return false;
      if (filtroStatus && p.status !== filtroStatus) return false;
      if (busca) {
        const q = busca.toLowerCase();
        if (!p.marca.toLowerCase().includes(q) && !(p.descricao || "").toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [pecas, filtroOp, filtroTipo, filtroStatus, busca]);

  // Resumo
  const resumo = useMemo(() => {
    const r = { total: 0, pesoTotal: 0, expedidas: 0, pesoExpedido: 0, emProducao: 0, pendentes: 0 };
    for (const p of pecasFiltradas) {
      r.total += p.qte;
      r.pesoTotal += p.pesoTotalKg;
      if (p.status === "EXPEDIDO") {
        r.expedidas += p.qte;
        r.pesoExpedido += p.pesoTotalKg;
      } else if (p.status === "PENDENTE") {
        r.pendentes += p.qte;
      } else {
        r.emProducao += p.qte;
      }
    }
    return r;
  }, [pecasFiltradas]);

  async function atualizarStatus(id, novoStatus) {
    try {
      const res = await fetch(`/api/producao/pecas/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: novoStatus }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro");
      setPecas((prev) => prev.map((p) => (p.id === id ? { ...p, ...data.peca } : p)));
    } catch (e) {
      alert("Erro ao atualizar: " + e.message);
    }
  }

  async function deletarPeca(id) {
    setDeleting(true);
    try {
      const res = await fetch(`/api/producao/pecas/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro");
      setPecas((prev) => prev.filter((p) => p.id !== id));
    } catch (e) {
      alert("Erro ao excluir: " + e.message);
    } finally {
      setDeleting(false);
      setConfirmDelete(null);
    }
  }

  async function deletarLoteOp(opNumero) {
    setDeleting(true);
    try {
      const res = await fetch(`/api/producao/pecas?op=${encodeURIComponent(opNumero)}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro");
      setPecas((prev) => prev.filter((p) => p.opNumero !== opNumero));
    } catch (e) {
      alert("Erro ao excluir lote: " + e.message);
    } finally {
      setDeleting(false);
      setConfirmDelete(null);
    }
  }

  const isAdmin = userRole === "ADMIN";

  return (
    <div className="space-y-4 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-torg-dark tracking-tight">
            Controle de Peças
          </h2>
          <p className="text-xs text-torg-gray mt-0.5">
            Controle de peças e conjuntos por OP — importe LE ou LPC.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setModalImport(true)}
            className="px-3 py-1.5 bg-torg-blue text-white text-xs rounded-lg hover:bg-torg-blue-700 font-medium flex items-center gap-1.5"
          >
            <Upload size={14} /> Importar LE
          </button>
          <button
            onClick={() => setModalImportLPC(true)}
            className="px-3 py-1.5 bg-torg-dark text-white text-xs rounded-lg hover:bg-torg-dark/90 font-medium flex items-center gap-1.5"
          >
            <Upload size={14} /> Importar LPC
          </button>
        </div>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiPequeno label="Total" value={resumo.total.toLocaleString("pt-BR")} subtitle={`${pecasFiltradas.length} marcas · ${fmtKg(resumo.pesoTotal)}`} color="bg-torg-blue-50 text-torg-blue" />
        <KpiPequeno label="Pendentes" value={resumo.pendentes.toLocaleString("pt-BR")} color="bg-gray-100 text-torg-gray" />
        <KpiPequeno label="Em produção" value={resumo.emProducao.toLocaleString("pt-BR")} color="bg-orange-50 text-orange-700" />
        <KpiPequeno label="Expedidas" value={resumo.expedidas.toLocaleString("pt-BR")} subtitle={`${fmtKg(resumo.pesoExpedido)} · ${resumo.total > 0 ? ((resumo.expedidas / resumo.total) * 100).toFixed(0) : 0}%`} color="bg-emerald-50 text-emerald-700" />
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3 flex items-center gap-2 flex-wrap">
        <Filter size={14} className="text-torg-gray" />
        <select
          value={filtroOp}
          onChange={(e) => setFiltroOp(e.target.value)}
          className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs bg-white"
        >
          <option value="">Todas as OPs</option>
          {opsComPecas.map((op) => <option key={op} value={op}>OP {op}</option>)}
        </select>
        <select
          value={filtroStatus}
          onChange={(e) => setFiltroStatus(e.target.value)}
          className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs bg-white"
        >
          <option value="">Todos status</option>
          {STATUS_PIPELINE.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
        <select
          value={filtroTipo}
          onChange={(e) => setFiltroTipo(e.target.value)}
          className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs bg-white"
        >
          <option value="">Todos tipos</option>
          <option value="CONJUNTO">Conjuntos</option>
          <option value="CROQUI">Croquis</option>
          <option value="PECA">Peças / LE</option>
        </select>
        <div className="flex items-center gap-1 flex-1 min-w-[200px]">
          <Search size={12} className="text-torg-gray ml-2" />
          <input
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar marca ou descrição..."
            className="flex-1 px-2 py-1.5 text-xs border-0 focus:ring-0 focus:outline-none"
          />
        </div>
        {(filtroOp || filtroStatus || filtroTipo || busca) && (
          <button
            onClick={() => { setFiltroOp(""); setFiltroStatus(""); setFiltroTipo(""); setBusca(""); }}
            className="text-xs text-torg-gray hover:text-torg-dark"
          >
            limpar
          </button>
        )}
        {isAdmin && filtroOp && (
          <button
            onClick={() => setConfirmDelete({ tipo: "lote", opNumero: filtroOp })}
            className="ml-auto px-3 py-1.5 bg-red-50 text-red-600 text-xs rounded-lg hover:bg-red-100 font-medium flex items-center gap-1.5 border border-red-200"
          >
            <Trash2 size={13} /> Excluir OP {filtroOp}
          </button>
        )}
      </div>

      {/* Tabela */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {pecasFiltradas.length === 0 ? (
          <div className="text-center py-10">
            <Package size={32} className="mx-auto text-gray-300 mb-2" />
            <p className="text-sm text-torg-gray">
              {pecas.length === 0
                ? "Nenhuma peça cadastrada. Clique em 'Importar LE' pra começar."
                : "Nenhuma peça no filtro selecionado."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">OP</th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">#</th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Marca</th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Descrição</th>
                  <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Qte</th>
                  <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Peso unit.</th>
                  <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Peso total</th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Status</th>
                  {isAdmin && <th className="px-3 py-2 w-8"></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {pecasFiltradas.map((p) => {
                  const cor = STATUS_COR[p.status] || STATUS_COR.PENDENTE;
                  return (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-3 py-1.5 text-xs font-mono text-torg-blue">{fmtOP(p.opNumero)}</td>
                      <td className="px-3 py-1.5 text-[10px] text-gray-400 tabular-nums">{p.item || ""}</td>
                      <td className="px-3 py-1.5">
                        <span className="text-xs font-semibold text-torg-dark font-mono">{p.marca}</span>
                        {p.tipoPeca === "CONJUNTO" && <span className="ml-1.5 text-[9px] font-semibold px-1.5 py-0.5 rounded bg-torg-blue/10 text-torg-blue">CJ</span>}
                        {p.tipoPeca === "CROQUI" && <span className="ml-1.5 text-[9px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">CR</span>}
                      </td>
                      <td className="px-3 py-1.5">
                        <span className="text-xs text-torg-gray">{p.descricao || "—"}</span>
                        {p.material && <span className="block text-[10px] text-torg-gray/60">{p.material}</span>}
                      </td>
                      <td className="px-3 py-1.5 text-right text-xs tabular-nums text-torg-dark">{p.qte}</td>
                      <td className="px-3 py-1.5 text-right text-xs tabular-nums text-torg-gray">{fmtKg(p.pesoUnitKg)}</td>
                      <td className="px-3 py-1.5 text-right text-xs tabular-nums text-torg-dark font-medium">{fmtKg(p.pesoTotalKg)}</td>
                      <td className="px-3 py-1.5">
                        <select
                          value={p.status}
                          onChange={(e) => atualizarStatus(p.id, e.target.value)}
                          className={`text-[11px] font-medium rounded-md border-0 px-2 py-1 focus:ring-1 focus:ring-torg-blue ${cor.bg} ${cor.text}`}
                        >
                          {STATUS_PIPELINE.map((s) => (
                            <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                          ))}
                        </select>
                      </td>
                      {isAdmin && (
                        <td className="px-2 py-1.5">
                          <button
                            onClick={() => setConfirmDelete({ tipo: "peca", id: p.id, marca: p.marca, opNumero: p.opNumero })}
                            className="p-1 text-gray-300 hover:text-red-500 rounded transition-colors"
                            title="Excluir peça"
                          >
                            <Trash2 size={13} />
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalImport && (
        <ModalImportarLE
          ops={ops}
          onClose={() => setModalImport(false)}
          onImportado={() => { setModalImport(false); router.refresh(); }}
        />
      )}

      {modalImportLPC && (
        <ModalImportarLPC
          ops={ops}
          onClose={() => setModalImportLPC(false)}
          onImportado={() => { setModalImportLPC(false); router.refresh(); }}
        />
      )}

      <ConfirmModal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => {
          if (confirmDelete?.tipo === "lote") deletarLoteOp(confirmDelete.opNumero);
          else if (confirmDelete?.tipo === "peca") deletarPeca(confirmDelete.id);
        }}
        titulo={confirmDelete?.tipo === "lote" ? "Excluir todas as peças da OP?" : "Excluir peça?"}
        mensagem={
          confirmDelete?.tipo === "lote"
            ? `Todas as peças da ${fmtOP(confirmDelete?.opNumero)} serão removidas permanentemente. Esta ação não pode ser desfeita.`
            : `A peça "${confirmDelete?.marca}" da ${fmtOP(confirmDelete?.opNumero)} será removida permanentemente.`
        }
        labelConfirmar="Excluir"
        variant="destrutivo"
        loading={deleting}
      />
    </div>
  );
}

function KpiPequeno({ label, value, subtitle, color }) {
  return (
    <div className={`rounded-xl p-3 ${color}`}>
      <p className="text-[10px] uppercase tracking-wider font-semibold opacity-80">{label}</p>
      <p className="text-2xl font-extrabold tabular-nums leading-tight mt-0.5">{value}</p>
      {subtitle && <p className="text-[10px] opacity-70 mt-0.5">{subtitle}</p>}
    </div>
  );
}

function ModalImportarLE({ ops, onClose, onImportado }) {
  const fileRef = useRef(null);
  const [arquivoNome, setArquivoNome] = useState("");
  const [parsing, setParsing] = useState(false);
  const [erro, setErro] = useState("");
  const [opForcada, setOpForcada] = useState("");
  const [sobrescrever, setSobrescrever] = useState(false);
  const [resultado, setResultado] = useState(null);

  async function processar(file) {
    if (!file) return;
    setErro("");
    setParsing(true);
    setArquivoNome(file.name);
    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array", cellDates: true });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, blankrows: false });

      const res = await fetch("/api/producao/pecas/importar-le", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows, opNumero: opForcada || null, sobrescrever }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao importar");
      setResultado(data);
    } catch (e) {
      setErro(e.message);
    } finally {
      setParsing(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-torg-dark flex items-center gap-2">
            <Upload size={18} className="text-torg-blue" /> Importar Lista de Estrutura
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="px-6 py-5 space-y-3">
          {erro && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded px-3 py-2 flex items-start gap-2">
              <AlertCircle size={14} className="mt-0.5" /> <span>{erro}</span>
            </div>
          )}
          {resultado ? (
            <div className="bg-emerald-50 border border-emerald-200 rounded p-4 text-sm">
              <p className="text-emerald-800 font-semibold flex items-center gap-2 mb-2">
                <CheckCircle2 size={16} /> {fmtOP(resultado.opNumero)} importada com sucesso
              </p>
              <ul className="text-xs text-emerald-700 space-y-1">
                <li>• {resultado.criados} {resultado.criados === 1 ? "peça nova" : "peças novas"}</li>
                <li>• {resultado.atualizados} {resultado.atualizados === 1 ? "atualizada" : "atualizadas"}</li>
                {resultado.ignorados > 0 && <li>• {resultado.ignorados} ignoradas (erro)</li>}
                <li>• Total: {resultado.qteTotal} unidades · {fmtKg(resultado.pesoTotal)}</li>
                {!resultado.opEncontrada && <li className="text-yellow-700">⚠️ {fmtOP(resultado.opNumero)} não cadastrada no portal — peças ficaram sem vínculo</li>}
              </ul>
              <button
                onClick={onImportado}
                className="mt-3 px-3 py-1.5 bg-emerald-600 text-white text-xs rounded hover:bg-emerald-700"
              >
                Ver na lista
              </button>
            </div>
          ) : (
            <>
              <div className="bg-torg-blue-50/30 border border-torg-blue-100 rounded p-4 text-center">
                <FileSpreadsheet size={28} className="mx-auto text-torg-blue mb-2" />
                <p className="text-sm text-torg-dark font-medium mb-1">
                  Suba o arquivo de LE (xlsx FORM 21)
                </p>
                <p className="text-xs text-torg-gray mb-3">
                  O parser identifica OP, marca, qte, descrição e peso automaticamente.
                </p>
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={parsing}
                  className="px-4 py-1.5 bg-torg-blue text-white text-xs rounded-lg hover:bg-torg-blue-700 font-medium inline-flex items-center gap-2 disabled:opacity-50"
                >
                  {parsing ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                  {parsing ? "Processando..." : "Selecionar arquivo"}
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={(e) => { processar(e.target.files?.[0]); e.target.value = ""; }}
                />
                {arquivoNome && (
                  <p className="text-[11px] text-torg-gray mt-2 truncate">{arquivoNome}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-torg-dark mb-1">
                  Forçar OP (opcional — se a planilha não tiver "OP:" no cabeçalho)
                </label>
                <input
                  type="text"
                  value={opForcada}
                  onChange={(e) => setOpForcada(e.target.value.toUpperCase())}
                  placeholder="Ex: T64K"
                  className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
                />
              </div>

              <label className="flex items-start gap-2 text-xs text-torg-gray">
                <input
                  type="checkbox"
                  checked={sobrescrever}
                  onChange={(e) => setSobrescrever(e.target.checked)}
                  className="mt-0.5"
                />
                <span>Sobrescrever — apaga peças anteriores dessa OP que foram importadas via LE antes de importar de novo. Útil se a LE foi revisada.</span>
              </label>
            </>
          )}
        </div>
        <div className="px-6 py-3 bg-gray-50 border-t border-gray-100 flex justify-end">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-torg-gray border border-gray-300 rounded-lg hover:bg-gray-100">
            {resultado ? "Fechar" : "Cancelar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ModalImportarLPC({ ops, onClose, onImportado }) {
  const fileRef = useRef(null);
  const [arquivoNome, setArquivoNome] = useState("");
  const [parsing, setParsing] = useState(false);
  const [erro, setErro] = useState("");
  const [opForcada, setOpForcada] = useState("");
  const [sobrescrever, setSobrescrever] = useState(false);
  const [resultado, setResultado] = useState(null);

  async function processar(file) {
    if (!file) return;
    setErro("");
    setParsing(true);
    setArquivoNome(file.name);
    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array", cellDates: true });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, blankrows: false });

      const res = await fetch("/api/producao/pecas/importar-lpc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows, opNumero: opForcada || null, sobrescrever }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao importar");
      setResultado(data);
    } catch (e) {
      setErro(e.message);
    } finally {
      setParsing(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-torg-dark flex items-center gap-2">
            <Upload size={18} className="text-torg-dark" /> Importar LPC
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="px-6 py-5 space-y-3">
          {erro && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded px-3 py-2 flex items-start gap-2">
              <AlertCircle size={14} className="mt-0.5" /> <span>{erro}</span>
            </div>
          )}
          {resultado ? (
            <div className="bg-emerald-50 border border-emerald-200 rounded p-4 text-sm">
              <p className="text-emerald-800 font-semibold flex items-center gap-2 mb-2">
                <CheckCircle2 size={16} /> {fmtOP(resultado.opNumero)} — LPC importada
              </p>
              {resultado.obra && (
                <p className="text-xs text-emerald-700 mb-2">
                  {resultado.obra}{resultado.cliente ? ` — ${resultado.cliente}` : ""}
                </p>
              )}
              <ul className="text-xs text-emerald-700 space-y-1">
                <li>• {resultado.conjuntos} {resultado.conjuntos === 1 ? "conjunto" : "conjuntos"}</li>
                <li>• {resultado.croquis} {resultado.croquis === 1 ? "croqui" : "croquis"}</li>
                {resultado.avulsas > 0 && <li>• {resultado.avulsas} {resultado.avulsas === 1 ? "peça avulsa" : "peças avulsas"}</li>}
                <li>• {resultado.relacoes} {resultado.relacoes === 1 ? "relação" : "relações"} conjunto↔croqui</li>
                <li className="pt-1 border-t border-emerald-200 mt-1">
                  {resultado.criados} {resultado.criados === 1 ? "nova" : "novas"} · {resultado.atualizados} {resultado.atualizados === 1 ? "atualizada" : "atualizadas"}
                  {resultado.ignorados > 0 && ` · ${resultado.ignorados} ignorada(s)`}
                </li>
                <li>• Peso: {Number(resultado.pesoTotal).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} kg · Pintura: {Number(resultado.areaTotal).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} m²</li>
                {!resultado.opEncontrada && <li className="text-yellow-700">⚠️ {fmtOP(resultado.opNumero)} não cadastrada — peças ficaram sem vínculo</li>}
              </ul>
              <button
                onClick={onImportado}
                className="mt-3 px-3 py-1.5 bg-emerald-600 text-white text-xs rounded hover:bg-emerald-700"
              >
                Ver na lista
              </button>
            </div>
          ) : (
            <>
              <div className="bg-torg-dark/5 border border-torg-dark/10 rounded p-4 text-center">
                <FileSpreadsheet size={28} className="mx-auto text-torg-dark mb-2" />
                <p className="text-sm text-torg-dark font-medium mb-1">
                  Suba o arquivo LPC (Lista de Peças por Conjunto)
                </p>
                <p className="text-xs text-torg-gray mb-3">
                  Identifica conjuntos, croquis e peças avulsas automaticamente.
                  Croquis com "-P" recebem status de preparação.
                </p>
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={parsing}
                  className="px-4 py-1.5 bg-torg-dark text-white text-xs rounded-lg hover:bg-torg-dark/90 font-medium inline-flex items-center gap-2 disabled:opacity-50"
                >
                  {parsing ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                  {parsing ? "Processando..." : "Selecionar arquivo"}
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={(e) => { processar(e.target.files?.[0]); e.target.value = ""; }}
                />
                {arquivoNome && (
                  <p className="text-[11px] text-torg-gray mt-2 truncate">{arquivoNome}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-torg-dark mb-1">
                  Forçar OP (opcional — o parser detecta automaticamente pela marca)
                </label>
                <input
                  type="text"
                  value={opForcada}
                  onChange={(e) => setOpForcada(e.target.value.toUpperCase())}
                  placeholder="Ex: T82A"
                  className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
                />
              </div>

              <label className="flex items-start gap-2 text-xs text-torg-gray">
                <input
                  type="checkbox"
                  checked={sobrescrever}
                  onChange={(e) => setSobrescrever(e.target.checked)}
                  className="mt-0.5"
                />
                <span>Sobrescrever — apaga peças anteriores dessa OP que foram importadas via LPC antes de importar de novo.</span>
              </label>
            </>
          )}
        </div>
        <div className="px-6 py-3 bg-gray-50 border-t border-gray-100 flex justify-end">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-torg-gray border border-gray-300 rounded-lg hover:bg-gray-100">
            {resultado ? "Fechar" : "Cancelar"}
          </button>
        </div>
      </div>
    </div>
  );
}
