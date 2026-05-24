"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, FileSpreadsheet, ExternalLink, Upload, Scale,
  DollarSign, Calculator, BarChart3, Loader2, AlertCircle,
  Save, CheckCircle2, Clock, Edit3, Link2, Paperclip,
} from "lucide-react";

const STATUS_LABELS = {
  RASCUNHO: { label: "Rascunho", cor: "bg-gray-100 text-gray-700", icon: Edit3 },
  EM_ANALISE: { label: "Em análise", cor: "bg-amber-100 text-amber-700", icon: Clock },
  APROVADO: { label: "Aprovado", cor: "bg-emerald-100 text-emerald-700", icon: CheckCircle2 },
  CONCLUIDO: { label: "Concluído", cor: "bg-torg-blue/10 text-torg-blue", icon: CheckCircle2 },
};

const ABAS = [
  { id: "geral", label: "Geral", icon: FileSpreadsheet },
  { id: "peso", label: "Peso Projeto", icon: Scale },
  { id: "custos", label: "Custos", icon: DollarSign },
  { id: "bdi", label: "BDI / Impostos", icon: Calculator },
  { id: "resumo", label: "Resumo", icon: BarChart3 },
];

function fmtMoeda(v) {
  if (!v && v !== 0) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtPeso(v) {
  if (!v && v !== 0) return "—";
  return v.toLocaleString("pt-BR", { maximumFractionDigits: 0 }) + " kg";
}

// ── Aba Geral ──────────────────────────────────────────────

function AbaGeral({ estudo, onSave }) {
  const [referencia, setReferencia] = useState(estudo.referencia || "");
  const [sharepointUrl, setSharepointUrl] = useState(estudo.sharepointUrl || "");
  const [observacoes, setObservacoes] = useState(estudo.observacoes || "");
  const [salvando, setSalvando] = useState(false);

  const handleSalvar = async () => {
    setSalvando(true);
    await onSave({ referencia, sharepointUrl, observacoes });
    setSalvando(false);
  };

  return (
    <div className="space-y-6">
      {/* Info do orçamento */}
      <div className="bg-torg-blue/5 border border-torg-blue/10 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-torg-blue mb-3">Orçamento vinculado</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-torg-gray text-xs">Número</p>
            <p className="font-semibold text-torg-dark">{estudo.orcamento?.numero}</p>
          </div>
          <div>
            <p className="text-torg-gray text-xs">Cliente</p>
            <p className="font-medium text-torg-dark">{estudo.orcamento?.cliente}</p>
          </div>
          <div>
            <p className="text-torg-gray text-xs">Obra</p>
            <p className="font-medium text-torg-dark">{estudo.orcamento?.obra || "—"}</p>
          </div>
          <div>
            <p className="text-torg-gray text-xs">Vendedor</p>
            <p className="font-medium text-torg-dark">{estudo.orcamento?.vendedor || "—"}</p>
          </div>
          <div>
            <p className="text-torg-gray text-xs">Tipo de venda</p>
            <p className="font-medium text-torg-dark">
              {(estudo.orcamento?.tipoVenda || "—").replace(/_/g, " ")}
            </p>
          </div>
          <div>
            <p className="text-torg-gray text-xs">Porte</p>
            <p className="font-medium text-torg-dark">
              {(estudo.orcamento?.porte || "—").replace(/_/g, " ")}
            </p>
          </div>
          <div>
            <p className="text-torg-gray text-xs">Responsável</p>
            <p className="font-medium text-torg-dark">{estudo.orcamento?.responsavel || "—"}</p>
          </div>
          <div>
            <p className="text-torg-gray text-xs">Contato</p>
            <p className="font-medium text-torg-dark">{estudo.orcamento?.contato || "—"}</p>
          </div>
        </div>
      </div>

      {/* Campos editáveis */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div>
          <label className="block text-sm font-semibold text-torg-dark mb-1.5">
            Referência do cliente
          </label>
          <input
            type="text"
            value={referencia}
            onChange={(e) => setReferencia(e.target.value)}
            placeholder="Ex: ENC-0333, Pedido 123..."
            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue outline-none"
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-torg-dark mb-1.5">
            Pasta SharePoint
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Link2 size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="url"
                value={sharepointUrl}
                onChange={(e) => setSharepointUrl(e.target.value)}
                placeholder="Cole o link da pasta..."
                className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue outline-none"
              />
            </div>
            {sharepointUrl && (
              <a
                href={sharepointUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-2.5 bg-gray-100 hover:bg-gray-200 rounded-xl text-sm text-torg-dark transition-colors"
              >
                <ExternalLink size={14} />
                Abrir
              </a>
            )}
          </div>
        </div>
      </div>

      <div>
        <label className="block text-sm font-semibold text-torg-dark mb-1.5">Observações</label>
        <textarea
          value={observacoes}
          onChange={(e) => setObservacoes(e.target.value)}
          rows={3}
          placeholder="Notas sobre este estudo..."
          className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue outline-none resize-none"
        />
      </div>

      {/* Documentos */}
      <div>
        <h3 className="text-sm font-semibold text-torg-dark mb-3 flex items-center gap-2">
          <Paperclip size={16} />
          Documentos ({estudo.documentos?.length || 0})
        </h3>
        <div className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center">
          <Upload size={32} className="text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-torg-gray">Upload de documentos será habilitado na próxima fase</p>
          <p className="text-xs text-gray-400 mt-1">PDFs, planilhas Excel, imagens</p>
        </div>
      </div>

      {/* Botão salvar */}
      <div className="flex justify-end">
        <button
          onClick={handleSalvar}
          disabled={salvando}
          className="flex items-center gap-2 px-5 py-2.5 bg-torg-blue text-white rounded-xl text-sm font-semibold hover:bg-torg-dark transition-colors disabled:opacity-50"
        >
          {salvando ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          Salvar
        </button>
      </div>
    </div>
  );
}

// ── Aba Placeholder ────────────────────────────────────────

function AbaEmConstrucao({ titulo, descricao, icon: Icon }) {
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <div className="w-16 h-16 bg-torg-blue/5 rounded-2xl flex items-center justify-center mb-4">
        <Icon size={28} className="text-torg-blue" />
      </div>
      <h3 className="text-lg font-bold text-torg-dark mb-1">{titulo}</h3>
      <p className="text-sm text-torg-gray max-w-md text-center">{descricao}</p>
    </div>
  );
}

// ── Página principal ───────────────────────────────────────

export default function EstudoDetalheClient({ estudoId }) {
  const router = useRouter();
  const [estudo, setEstudo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [abaAtiva, setAbaAtiva] = useState("geral");
  const [toast, setToast] = useState(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/comercial/estudo/${estudoId}`);
      const json = await res.json();
      if (json.success) {
        setEstudo(json.data);
        setErro("");
      } else {
        setErro(json.error);
      }
    } catch {
      setErro("Erro ao carregar estudo");
    } finally {
      setLoading(false);
    }
  }, [estudoId]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const handleSave = async (dados) => {
    try {
      const res = await fetch(`/api/comercial/estudo/${estudoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(dados),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setEstudo((prev) => ({ ...prev, ...dados }));
      setToast("Salvo com sucesso!");
      setTimeout(() => setToast(null), 3000);
    } catch (e) {
      setToast(`Erro: ${e.message}`);
      setTimeout(() => setToast(null), 5000);
    }
  };

  if (loading) {
    return (
      <div className="ml-64 p-8 min-h-screen bg-gray-50/30 flex items-center justify-center">
        <Loader2 size={24} className="animate-spin text-torg-blue mr-3" />
        <span className="text-torg-gray">Carregando estudo...</span>
      </div>
    );
  }

  if (erro) {
    return (
      <div className="ml-64 p-8 min-h-screen bg-gray-50/30 flex flex-col items-center justify-center">
        <AlertCircle size={32} className="text-red-400 mb-3" />
        <p className="text-red-600 mb-3">{erro}</p>
        <button onClick={carregar} className="text-sm text-torg-blue hover:underline">
          Tentar novamente
        </button>
      </div>
    );
  }

  if (!estudo) return null;

  const st = STATUS_LABELS[estudo.status] || STATUS_LABELS.RASCUNHO;
  const StIcon = st.icon;

  return (
    <div className="ml-64 p-8 min-h-screen bg-gray-50/30">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-start gap-4">
          <button
            onClick={() => router.push("/comercial/orcamentos/propostas")}
            className="mt-1 p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft size={20} className="text-torg-gray" />
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-torg-dark">
                EPC-{estudo.orcamento?.numero}-R{estudo.revisao}
              </h1>
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold ${st.cor}`}>
                <StIcon size={13} />
                {st.label}
              </span>
            </div>
            <p className="text-sm text-torg-gray mt-0.5">
              {estudo.orcamento?.cliente}
              {estudo.orcamento?.obra && ` — ${estudo.orcamento.obra}`}
            </p>
          </div>
        </div>

        {/* KPIs resumo */}
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-xs text-torg-gray">Peso total</p>
            <p className="text-sm font-bold text-torg-dark">{fmtPeso(estudo.pesoTotal)}</p>
          </div>
          <div className="w-px h-8 bg-gray-200" />
          <div className="text-right">
            <p className="text-xs text-torg-gray">Valor total</p>
            <p className="text-sm font-bold text-torg-dark">{fmtMoeda(estudo.valorTotal)}</p>
          </div>
          {estudo.pesoTotal > 0 && estudo.valorTotal > 0 && (
            <>
              <div className="w-px h-8 bg-gray-200" />
              <div className="text-right">
                <p className="text-xs text-torg-gray">R$/kg</p>
                <p className="text-sm font-bold text-torg-blue">
                  {(estudo.valorTotal / estudo.pesoTotal).toFixed(2)}
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Abas */}
      <div className="flex items-center gap-1 mb-6 bg-white rounded-xl border border-gray-100 p-1 shadow-sm">
        {ABAS.map((aba) => {
          const Icon = aba.icon;
          const ativo = abaAtiva === aba.id;
          return (
            <button
              key={aba.id}
              onClick={() => setAbaAtiva(aba.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                ativo
                  ? "bg-torg-blue text-white shadow-sm"
                  : "text-torg-gray hover:bg-gray-50 hover:text-torg-dark"
              }`}
            >
              <Icon size={16} />
              {aba.label}
            </button>
          );
        })}
      </div>

      {/* Conteúdo da aba */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        {abaAtiva === "geral" && <AbaGeral estudo={estudo} onSave={handleSave} />}
        {abaAtiva === "peso" && (
          <AbaEmConstrucao
            titulo="Peso de Projeto"
            descricao="Levantamento de materiais perfil por perfil. Adicione itens manualmente ou importe de uma planilha Excel. Será habilitado na Fase 3."
            icon={Scale}
          />
        )}
        {abaAtiva === "custos" && (
          <AbaEmConstrucao
            titulo="Custos"
            descricao="Matéria prima, parafusos, tintas, engenharia, qualidade, transporte, fabricação e montagem. Será habilitado na Fase 4."
            icon={DollarSign}
          />
        )}
        {abaAtiva === "bdi" && (
          <AbaEmConstrucao
            titulo="BDI / Impostos"
            descricao="Configuração de CFOP, alíquotas de impostos, margem de lucro e composição do BDI. Será habilitado na Fase 5."
            icon={Calculator}
          />
        )}
        {abaAtiva === "resumo" && (
          <AbaEmConstrucao
            titulo="Resumo Comercial"
            descricao="Visão consolidada do estudo com exportação para Excel e geração da proposta técnica comercial (PTC). Será habilitado na Fase 6."
            icon={BarChart3}
          />
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 px-5 py-3 rounded-xl shadow-lg text-sm font-medium z-50 transition-all ${
            toast.startsWith("Erro") ? "bg-red-600 text-white" : "bg-emerald-600 text-white"
          }`}
        >
          {toast}
        </div>
      )}
    </div>
  );
}
