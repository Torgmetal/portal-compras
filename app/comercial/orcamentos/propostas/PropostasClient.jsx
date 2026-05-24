"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  FilePlus2, Search, FileSpreadsheet, ExternalLink, Clock,
  CheckCircle2, AlertCircle, Loader2, ChevronRight, Plus,
  FolderOpen, X, Link2,
} from "lucide-react";

const STATUS_LABELS = {
  RASCUNHO: { label: "Rascunho", cor: "bg-gray-100 text-gray-700" },
  EM_ANALISE: { label: "Em análise", cor: "bg-amber-100 text-amber-700" },
  APROVADO: { label: "Aprovado", cor: "bg-emerald-100 text-emerald-700" },
  CONCLUIDO: { label: "Concluído", cor: "bg-torg-blue/10 text-torg-blue" },
};

function fmtMoeda(v) {
  if (!v) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtPeso(v) {
  if (!v) return "—";
  return v.toLocaleString("pt-BR", { maximumFractionDigits: 0 }) + " kg";
}

function fmtData(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-BR");
}

// ── Modal Nova Proposta ────────────────────────────────────

function NovaPropostaModal({ onClose, onCriado }) {
  const [busca, setBusca] = useState("");
  const [orcamentos, setOrcamentos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selecionado, setSelecionado] = useState(null);
  const [referencia, setReferencia] = useState("");
  const [sharepointUrl, setSharepointUrl] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  // Buscar orçamentos
  const buscarOrcamentos = useCallback(async () => {
    if (!busca.trim() && !selecionado) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (busca.trim()) params.set("busca", busca.trim());
      const res = await fetch(`/api/comercial/orcamento?${params}`);
      const json = await res.json();
      if (json.success) setOrcamentos(json.orcamentos || json.data || []);
    } catch {
      /* silenciar */
    } finally {
      setLoading(false);
    }
  }, [busca]);

  useEffect(() => {
    const timer = setTimeout(buscarOrcamentos, 300);
    return () => clearTimeout(timer);
  }, [busca, buscarOrcamentos]);

  // Carregar últimos orçamentos ao abrir
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/comercial/orcamento?status=ORCAMENTO");
        const json = await res.json();
        if (json.success) setOrcamentos(json.orcamentos || json.data || []);
      } catch {
        /* silenciar */
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleCriar = async () => {
    if (!selecionado) return setErro("Selecione um orçamento");
    setSalvando(true);
    setErro("");
    try {
      const res = await fetch("/api/comercial/estudo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orcamentoId: selecionado.id,
          referencia: referencia.trim() || undefined,
          sharepointUrl: sharepointUrl.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      onCriado(json.data);
    } catch (e) {
      setErro(e.message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-torg-dark">Nova Proposta (EPC)</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg">
            <X size={20} className="text-gray-400" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Step 1: Selecionar orçamento */}
          <div>
            <label className="block text-sm font-semibold text-torg-dark mb-2">
              1. Vincular a um orçamento
            </label>
            {selecionado ? (
              <div className="flex items-center gap-3 p-3 bg-torg-blue/5 border border-torg-blue/20 rounded-xl">
                <FileSpreadsheet size={20} className="text-torg-blue" />
                <div className="flex-1">
                  <p className="font-semibold text-torg-dark">{selecionado.numero} — {selecionado.cliente}</p>
                  {selecionado.obra && <p className="text-sm text-torg-gray">{selecionado.obra}</p>}
                </div>
                <button
                  onClick={() => setSelecionado(null)}
                  className="text-sm text-torg-blue hover:underline"
                >
                  Trocar
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="relative">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    placeholder="Buscar por número, cliente ou obra..."
                    className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue outline-none"
                  />
                </div>
                <div className="max-h-48 overflow-y-auto border border-gray-100 rounded-xl divide-y divide-gray-50">
                  {loading && (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 size={18} className="animate-spin text-torg-blue" />
                    </div>
                  )}
                  {!loading && orcamentos.length === 0 && (
                    <p className="text-sm text-gray-400 text-center py-4">Nenhum orçamento encontrado</p>
                  )}
                  {!loading &&
                    orcamentos.map((o) => (
                      <button
                        key={o.id}
                        onClick={() => setSelecionado(o)}
                        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 text-left transition-colors"
                      >
                        <FileSpreadsheet size={16} className="text-torg-gray shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-torg-dark truncate">
                            {o.numero} — {o.cliente}
                          </p>
                          {o.obra && <p className="text-xs text-torg-gray truncate">{o.obra}</p>}
                        </div>
                        <span className="text-xs text-torg-gray whitespace-nowrap">{o.vendedor || "—"}</span>
                        <ChevronRight size={14} className="text-gray-300" />
                      </button>
                    ))}
                </div>
              </div>
            )}
          </div>

          {/* Step 2: Referência */}
          <div>
            <label className="block text-sm font-semibold text-torg-dark mb-1.5">
              2. Referência do cliente <span className="font-normal text-torg-gray">(opcional)</span>
            </label>
            <input
              type="text"
              value={referencia}
              onChange={(e) => setReferencia(e.target.value)}
              placeholder="Ex: ENC-0333, Pedido 123..."
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue outline-none"
            />
          </div>

          {/* Step 3: Link SharePoint */}
          <div>
            <label className="block text-sm font-semibold text-torg-dark mb-1.5">
              3. Pasta SharePoint <span className="font-normal text-torg-gray">(opcional)</span>
            </label>
            <div className="relative">
              <Link2 size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="url"
                value={sharepointUrl}
                onChange={(e) => setSharepointUrl(e.target.value)}
                placeholder="Cole o link da pasta no SharePoint..."
                className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue outline-none"
              />
            </div>
            <p className="text-xs text-torg-gray mt-1">
              Desenhos pesados (DWG, DXF) ficam no SharePoint. PDFs e docs leves podem ser enviados diretamente.
            </p>
          </div>

          {/* Erro */}
          {erro && (
            <div className="flex items-center gap-2 p-3 bg-red-50 text-red-700 rounded-xl text-sm">
              <AlertCircle size={16} />
              {erro}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50/50 rounded-b-2xl">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-torg-gray hover:text-torg-dark transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleCriar}
            disabled={!selecionado || salvando}
            className="flex items-center gap-2 px-5 py-2.5 bg-torg-blue text-white rounded-xl text-sm font-semibold hover:bg-torg-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {salvando ? <Loader2 size={16} className="animate-spin" /> : <FilePlus2 size={16} />}
            Criar Estudo
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Página principal ───────────────────────────────────────

export default function PropostasClient() {
  const router = useRouter();
  const [estudos, setEstudos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("");
  const [showModal, setShowModal] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (busca.trim()) params.set("busca", busca.trim());
      if (filtroStatus) params.set("status", filtroStatus);
      const res = await fetch(`/api/comercial/estudo?${params}`);
      const json = await res.json();
      if (json.success) {
        setEstudos(json.data || []);
        setErro("");
      } else {
        setErro(json.error);
      }
    } catch (e) {
      setErro("Erro ao carregar estudos");
    } finally {
      setLoading(false);
    }
  }, [busca, filtroStatus]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const handleCriado = (estudo) => {
    setShowModal(false);
    router.push(`/comercial/orcamentos/propostas/${estudo.id}`);
  };

  return (
    <div className="ml-64 p-8 min-h-screen bg-gray-50/30">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-torg-dark">Propostas (EPC)</h1>
          <p className="text-sm text-torg-gray mt-0.5">Estudos de precificação comercial</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-5 py-2.5 bg-torg-blue text-white rounded-xl text-sm font-semibold hover:bg-torg-dark transition-colors shadow-sm"
        >
          <Plus size={18} />
          Nova Proposta
        </button>
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-3 mb-5">
        <div className="relative flex-1 max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por número, cliente ou obra..."
            className="w-full pl-9 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue outline-none"
          />
        </div>
        <select
          value={filtroStatus}
          onChange={(e) => setFiltroStatus(e.target.value)}
          className="px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue outline-none"
        >
          <option value="">Todos os status</option>
          <option value="RASCUNHO">Rascunho</option>
          <option value="EM_ANALISE">Em análise</option>
          <option value="APROVADO">Aprovado</option>
          <option value="CONCLUIDO">Concluído</option>
        </select>
      </div>

      {/* Estados */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin text-torg-blue mr-3" />
          <span className="text-torg-gray">Carregando propostas...</span>
        </div>
      )}

      {erro && !loading && (
        <div className="flex flex-col items-center justify-center py-20">
          <AlertCircle size={32} className="text-red-400 mb-3" />
          <p className="text-red-600 mb-3">{erro}</p>
          <button onClick={carregar} className="text-sm text-torg-blue hover:underline">
            Tentar novamente
          </button>
        </div>
      )}

      {!loading && !erro && estudos.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20">
          <FolderOpen size={48} className="text-gray-300 mb-4" />
          <p className="text-torg-gray font-medium mb-1">Nenhuma proposta encontrada</p>
          <p className="text-sm text-gray-400 mb-4">Crie o primeiro estudo de precificação</p>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-5 py-2.5 bg-torg-blue text-white rounded-xl text-sm font-semibold hover:bg-torg-dark transition-colors"
          >
            <Plus size={16} />
            Nova Proposta
          </button>
        </div>
      )}

      {/* Tabela */}
      {!loading && !erro && estudos.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50/60">
                <tr className="text-left text-xs font-semibold text-torg-gray uppercase tracking-wider">
                  <th className="px-4 py-3">Orçamento</th>
                  <th className="px-4 py-3">Cliente / Obra</th>
                  <th className="px-4 py-3">Referência</th>
                  <th className="px-4 py-3">Revisão</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Peso</th>
                  <th className="px-4 py-3 text-right">Valor Total</th>
                  <th className="px-4 py-3">Atualizado</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {estudos.map((e) => {
                  const st = STATUS_LABELS[e.status] || STATUS_LABELS.RASCUNHO;
                  return (
                    <tr
                      key={e.id}
                      onClick={() => router.push(`/comercial/orcamentos/propostas/${e.id}`)}
                      className="hover:bg-gray-50/50 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3 font-semibold text-torg-dark whitespace-nowrap">
                        {e.orcamento?.numero || "—"}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-torg-dark">{e.orcamento?.cliente || "—"}</p>
                        {e.orcamento?.obra && (
                          <p className="text-xs text-torg-gray truncate max-w-[200px]">{e.orcamento.obra}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-torg-gray whitespace-nowrap">{e.referencia || "—"}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-gray-100 text-xs font-medium text-torg-dark">
                          R{e.revisao}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold ${st.cor}`}>
                          {st.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-torg-dark whitespace-nowrap">
                        {fmtPeso(e.pesoTotal)}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-torg-dark whitespace-nowrap">
                        {fmtMoeda(e.valorTotal)}
                      </td>
                      <td className="px-4 py-3 text-torg-gray whitespace-nowrap text-xs">
                        {fmtData(e.updatedAt)}
                      </td>
                      <td className="px-4 py-3">
                        <ChevronRight size={16} className="text-gray-300" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal */}
      {showModal && <NovaPropostaModal onClose={() => setShowModal(false)} onCriado={handleCriado} />}
    </div>
  );
}
