"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, FileSpreadsheet, ExternalLink, Upload, Scale,
  DollarSign, Calculator, BarChart3, Loader2, AlertCircle,
  Save, CheckCircle2, Clock, Edit3, Link2, Paperclip, Trash2,
  Plus, X, Search, FileText, Download, ChevronDown, Sparkles,
  Check, Info,
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

const TIPO_MATERIAL_LABELS = {
  PERFIL_W: "Perfil W/HP",
  PERFIL_U: "Perfil U/UE",
  PERFIL_L: "Cantoneira L",
  TUBO_REDONDO: "Tubo Redondo",
  TUBO_QUADRADO: "Tubo Quadrado",
  TUBO_RETANGULAR: "Tubo Retangular",
  CHAPA: "Chapa",
  BARRA_REDONDA: "Barra Redonda",
  BARRA_CHATA: "Barra Chata",
  BARRA_QUADRADA: "Barra Quadrada",
  BARRA_ROSCADA: "Barra Roscada",
  TELA: "Tela",
  GRADE_PISO: "Grade de Piso",
  DEGRAU: "Degrau",
  OUTRO: "Outro",
};

const CATEGORIAS_DOC = [
  { value: "projeto", label: "Projeto / Desenho" },
  { value: "email", label: "E-mail" },
  { value: "cotacao", label: "Cotacao" },
  { value: "documento", label: "Documento" },
];

function fmtMoeda(v) {
  if (!v && v !== 0) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtPeso(v) {
  if (!v && v !== 0) return "—";
  return v.toLocaleString("pt-BR", { maximumFractionDigits: 0 }) + " kg";
}

function fmtNum(v, dec = 2) {
  if (!v && v !== 0) return "—";
  return v.toLocaleString("pt-BR", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function fmtBytes(b) {
  if (!b) return "";
  if (b < 1024) return b + " B";
  if (b < 1024 * 1024) return (b / 1024).toFixed(0) + " KB";
  return (b / (1024 * 1024)).toFixed(1) + " MB";
}

// Detectar tipo de material a partir da descrição
function detectTipoMaterial(desc) {
  if (!desc) return "OUTRO";
  const d = desc.toUpperCase();
  if (/^W\d|^HP\d/.test(d)) return "PERFIL_W";
  if (/^U\d|^UE\d/.test(d)) return "PERFIL_U";
  if (/^L\d|^L\s?\d/.test(d)) return "PERFIL_L";
  if (/TUBO\s*RED/.test(d)) return "TUBO_REDONDO";
  if (/TUBO\s*QUAD/.test(d)) return "TUBO_QUADRADO";
  if (/TUBO\s*RET/.test(d)) return "TUBO_RETANGULAR";
  if (/^CHAPA/.test(d)) return "CHAPA";
  if (/BARRA\s*CHATA|^BC/.test(d)) return "BARRA_CHATA";
  if (/BARRA\s*RED|FERRO\s*RED/.test(d)) return "BARRA_REDONDA";
  if (/BARRA\s*QUAD/.test(d)) return "BARRA_QUADRADA";
  if (/BARRA\s*ROSC/.test(d)) return "BARRA_ROSCADA";
  if (/TELA/.test(d)) return "TELA";
  if (/^GS-|GRADE/.test(d)) return "GRADE_PISO";
  if (/DEGRAU|^SMD/.test(d)) return "DEGRAU";
  return "OUTRO";
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
      {/* Info do orcamento */}
      <div className="bg-torg-blue/5 border border-torg-blue/10 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-torg-blue mb-3">Orcamento vinculado</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-torg-gray text-xs">Numero</p>
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
            <p className="text-torg-gray text-xs">Responsavel</p>
            <p className="font-medium text-torg-dark">{estudo.orcamento?.responsavel || "—"}</p>
          </div>
          <div>
            <p className="text-torg-gray text-xs">Contato</p>
            <p className="font-medium text-torg-dark">{estudo.orcamento?.contato || "—"}</p>
          </div>
        </div>
      </div>

      {/* Campos editaveis */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div>
          <label className="block text-sm font-semibold text-torg-dark mb-1.5">
            Referencia do cliente
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
        <label className="block text-sm font-semibold text-torg-dark mb-1.5">Observacoes</label>
        <textarea
          value={observacoes}
          onChange={(e) => setObservacoes(e.target.value)}
          rows={3}
          placeholder="Notas sobre este estudo..."
          className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue outline-none resize-none"
        />
      </div>

      {/* Botao salvar */}
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

// ── Secao de Documentos (usada dentro da aba Peso) ─────────

function SecaoDocumentos({ estudoId, documentos: docsProp, onUpdate }) {
  const [docs, setDocs] = useState(docsProp || []);
  const [uploading, setUploading] = useState(false);
  const [erroUpload, setErroUpload] = useState("");
  const fileRef = useRef(null);

  const handleUpload = async (e) => {
    const files = e.target.files;
    if (!files?.length) return;

    setUploading(true);
    setErroUpload("");

    for (const file of files) {
      try {
        // 1. Upload do arquivo para o Vercel Blob
        const formData = new FormData();
        formData.append("file", file);
        const uploadRes = await fetch("/api/upload-blob", { method: "POST", body: formData });
        const uploadJson = await uploadRes.json();
        if (!uploadRes.ok) throw new Error(uploadJson.error || "Falha no upload");

        // 2. Registrar o documento no estudo
        const ext = file.name.split(".").pop()?.toLowerCase() || "bin";
        const regRes = await fetch(`/api/comercial/estudo/${estudoId}/documentos`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nome: file.name,
            tipo: ext,
            tamanho: file.size,
            blobUrl: uploadJson.url,
            categoria: categoriaFromExt(ext),
          }),
        });
        const regJson = await regRes.json();
        if (!regJson.success) throw new Error(regJson.error);

        setDocs((prev) => {
          const novos = [regJson.data, ...prev];
          onUpdate?.(novos);
          return novos;
        });
      } catch (err) {
        setErroUpload(err.message);
      }
    }

    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleExcluir = async (docId) => {
    try {
      const res = await fetch(`/api/comercial/estudo/${estudoId}/documentos?docId=${docId}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setDocs((prev) => {
        const novos = prev.filter((d) => d.id !== docId);
        onUpdate?.(novos);
        return novos;
      });
    } catch (err) {
      setErroUpload(err.message);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-torg-dark flex items-center gap-2">
          <Paperclip size={16} />
          Documentos ({docs.length})
        </h3>
        <label className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-xl text-sm font-medium text-torg-dark cursor-pointer transition-colors">
          {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
          {uploading ? "Enviando..." : "Upload"}
          <input
            ref={fileRef}
            type="file"
            multiple
            accept=".pdf,.xlsx,.xls,.csv,.dxf,.dwg,.docx,.doc,.eml,.msg,.png,.jpg,.jpeg"
            onChange={handleUpload}
            className="hidden"
            disabled={uploading}
          />
        </label>
      </div>

      {erroUpload && (
        <div className="flex items-center gap-2 p-3 bg-red-50 text-red-700 rounded-xl text-sm mb-3">
          <AlertCircle size={16} />
          {erroUpload}
          <button onClick={() => setErroUpload("")} className="ml-auto"><X size={14} /></button>
        </div>
      )}

      {docs.length === 0 ? (
        <div
          className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center cursor-pointer hover:border-torg-blue/30 transition-colors"
          onClick={() => fileRef.current?.click()}
        >
          <Upload size={28} className="text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-torg-gray">Arraste ou clique para enviar documentos</p>
          <p className="text-xs text-gray-400 mt-1">PDFs, planilhas Excel, desenhos, e-mails</p>
        </div>
      ) : (
        <div className="space-y-2">
          {docs.map((doc) => (
            <div
              key={doc.id}
              className="flex items-center gap-3 p-3 bg-gray-50/80 rounded-xl group hover:bg-gray-100/80 transition-colors"
            >
              <div className="w-9 h-9 bg-white border border-gray-200 rounded-lg flex items-center justify-center shrink-0">
                <FileText size={16} className="text-torg-blue" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-torg-dark truncate">{doc.nome}</p>
                <p className="text-xs text-torg-gray">
                  {doc.categoria && <span className="capitalize">{doc.categoria}</span>}
                  {doc.tamanho && <span> · {fmtBytes(doc.tamanho)}</span>}
                </p>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <a
                  href={doc.blobUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1.5 hover:bg-white rounded-lg transition-colors"
                  title="Abrir"
                >
                  <ExternalLink size={14} className="text-torg-gray" />
                </a>
                <button
                  onClick={() => handleExcluir(doc.id)}
                  className="p-1.5 hover:bg-red-50 rounded-lg transition-colors"
                  title="Excluir"
                >
                  <Trash2 size={14} className="text-red-400" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function categoriaFromExt(ext) {
  if (["pdf", "dxf", "dwg"].includes(ext)) return "projeto";
  if (["eml", "msg"].includes(ext)) return "email";
  if (["xlsx", "xls", "csv"].includes(ext)) return "cotacao";
  return "documento";
}

// ── Modal Novo Item ────────────────────────────────────────

function NovoItemModal({ onClose, onSalvar }) {
  const [descricao, setDescricao] = useState("");
  const [setor, setSetor] = useState("");
  const [tipoMaterial, setTipoMaterial] = useState("OUTRO");
  const [norma, setNorma] = useState("");
  const [comprimento, setComprimento] = useState("");
  const [pesoUnitario, setPesoUnitario] = useState("");
  const [quantidade, setQuantidade] = useState("1");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  // Auto-detect tipo de material pela descricao
  useEffect(() => {
    const tipo = detectTipoMaterial(descricao);
    if (tipo !== "OUTRO") setTipoMaterial(tipo);
  }, [descricao]);

  const pesoTotal = (() => {
    const pu = parseFloat(pesoUnitario) || 0;
    const comp = parseFloat(comprimento) || 0;
    const qtd = parseInt(quantidade) || 1;
    if (comp > 0) return pu * comp * qtd;
    return pu * qtd;
  })();

  const handleSalvar = async () => {
    if (!descricao.trim()) return setErro("Descricao e obrigatoria");
    if (!pesoUnitario || parseFloat(pesoUnitario) <= 0) return setErro("Peso unitario e obrigatorio");

    setSalvando(true);
    setErro("");
    try {
      await onSalvar({
        descricao: descricao.trim(),
        setor: setor.trim() || undefined,
        tipoMaterial,
        norma: norma.trim() || undefined,
        comprimento: comprimento ? parseFloat(comprimento) : undefined,
        pesoUnitario: parseFloat(pesoUnitario),
        quantidade: parseInt(quantidade) || 1,
        pesoTotal,
      });
      onClose();
    } catch (e) {
      setErro(e.message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-torg-dark">Novo Item</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg"><X size={20} className="text-gray-400" /></button>
        </div>

        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-semibold text-torg-dark mb-1">
                Descricao do perfil <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder="Ex: W200X15, CHAPA#9,50, TUBO QUAD100X100X3..."
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue outline-none"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-torg-dark mb-1">Setor</label>
              <input
                type="text"
                value={setor}
                onChange={(e) => setSetor(e.target.value)}
                placeholder="FRONTAL, TRASEIRA..."
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-torg-dark mb-1">Tipo de material</label>
              <select
                value={tipoMaterial}
                onChange={(e) => setTipoMaterial(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue outline-none"
              >
                {Object.entries(TIPO_MATERIAL_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-torg-dark mb-1">Norma</label>
              <input
                type="text"
                value={norma}
                onChange={(e) => setNorma(e.target.value)}
                placeholder="ASTM A572 Gr.50"
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-torg-dark mb-1">Comprimento (m)</label>
              <input
                type="number"
                value={comprimento}
                onChange={(e) => setComprimento(e.target.value)}
                placeholder="0.00"
                step="0.01"
                min="0"
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-torg-dark mb-1">
                Peso unitario (kg/m) <span className="text-red-400">*</span>
              </label>
              <input
                type="number"
                value={pesoUnitario}
                onChange={(e) => setPesoUnitario(e.target.value)}
                placeholder="0.00"
                step="0.01"
                min="0"
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-torg-dark mb-1">Quantidade</label>
              <input
                type="number"
                value={quantidade}
                onChange={(e) => setQuantidade(e.target.value)}
                min="1"
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue outline-none"
              />
            </div>
          </div>

          {/* Peso total calculado */}
          <div className="bg-torg-blue/5 border border-torg-blue/10 rounded-xl p-4 flex items-center justify-between">
            <span className="text-sm font-medium text-torg-dark">Peso total calculado</span>
            <span className="text-lg font-bold text-torg-blue">{fmtNum(pesoTotal)} kg</span>
          </div>

          {erro && (
            <div className="flex items-center gap-2 p-3 bg-red-50 text-red-700 rounded-xl text-sm">
              <AlertCircle size={16} />{erro}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50/50 rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2 text-sm text-torg-gray hover:text-torg-dark transition-colors">
            Cancelar
          </button>
          <button
            onClick={handleSalvar}
            disabled={!descricao.trim() || !pesoUnitario || salvando}
            className="flex items-center gap-2 px-5 py-2.5 bg-torg-blue text-white rounded-xl text-sm font-semibold hover:bg-torg-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {salvando ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            Adicionar
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Aba Peso de Projeto ────────────────────────────────────

// ── Modal de Revisao IA ────────────────────────────────────

function ModalRevisaoIA({ resultado, onClose, onConfirmar, salvando }) {
  const [selecionados, setSelecionados] = useState(
    () => new Set(resultado.itens.map((_, i) => i))
  );

  const toggleItem = (idx) => {
    setSelecionados((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const toggleTodos = () => {
    if (selecionados.size === resultado.itens.length) {
      setSelecionados(new Set());
    } else {
      setSelecionados(new Set(resultado.itens.map((_, i) => i)));
    }
  };

  const itensSelecionados = resultado.itens.filter((_, i) => selecionados.has(i));
  const pesoSelecionado = itensSelecionados.reduce((s, i) => s + (i.pesoTotal || 0), 0);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
              <Sparkles size={20} className="text-purple-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-torg-dark">Resultado da Analise</h2>
              <p className="text-sm text-torg-gray">
                {resultado.itens.length} itens encontrados
                {resultado.docsAnalisados?.length > 0 && ` em ${resultado.docsAnalisados.length} documento(s)`}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg">
            <X size={20} className="text-gray-400" />
          </button>
        </div>

        {/* Info do projeto */}
        {(resultado.composicao || resultado.observacoes || resultado.pesoTotalProjeto) && (
          <div className="px-6 py-3 bg-purple-50/50 border-b border-purple-100/50 shrink-0">
            <div className="flex items-start gap-2 text-sm">
              <Info size={16} className="text-purple-500 mt-0.5 shrink-0" />
              <div className="space-y-1 text-torg-gray">
                {resultado.pesoTotalProjeto && (
                  <p>Peso total do projeto estimado: <strong className="text-torg-dark">{fmtNum(resultado.pesoTotalProjeto, 0)} kg</strong></p>
                )}
                {resultado.composicao && <p>Composicao: {resultado.composicao}</p>}
                {resultado.observacoes && <p>{resultado.observacoes}</p>}
              </div>
            </div>
          </div>
        )}

        {/* Tabela de itens */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50/60 sticky top-0">
                <tr className="text-left text-xs font-semibold text-torg-gray uppercase tracking-wider">
                  <th className="px-3 py-2 w-10">
                    <input
                      type="checkbox"
                      checked={selecionados.size === resultado.itens.length}
                      onChange={toggleTodos}
                      className="rounded border-gray-300 text-torg-blue focus:ring-torg-blue/30"
                    />
                  </th>
                  <th className="px-3 py-2">Descricao</th>
                  <th className="px-3 py-2">Setor</th>
                  <th className="px-3 py-2">Tipo</th>
                  <th className="px-3 py-2">Norma</th>
                  <th className="px-3 py-2 text-right">Comp.</th>
                  <th className="px-3 py-2 text-right">Peso un.</th>
                  <th className="px-3 py-2 text-right">Qtd</th>
                  <th className="px-3 py-2 text-right">Peso total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {resultado.itens.map((item, idx) => (
                  <tr
                    key={idx}
                    className={`transition-colors cursor-pointer ${
                      selecionados.has(idx) ? "bg-torg-blue/5" : "hover:bg-gray-50/50 opacity-50"
                    }`}
                    onClick={() => toggleItem(idx)}
                  >
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={selecionados.has(idx)}
                        onChange={() => toggleItem(idx)}
                        className="rounded border-gray-300 text-torg-blue focus:ring-torg-blue/30"
                      />
                    </td>
                    <td className="px-3 py-2 font-medium text-torg-dark whitespace-nowrap">
                      {item.descricao}
                    </td>
                    <td className="px-3 py-2 text-torg-gray text-xs whitespace-nowrap">
                      {item.setor || "—"}
                    </td>
                    <td className="px-3 py-2 text-xs text-torg-gray whitespace-nowrap">
                      {TIPO_MATERIAL_LABELS[item.tipoMaterial] || item.tipoMaterial || "—"}
                    </td>
                    <td className="px-3 py-2 text-xs text-torg-gray whitespace-nowrap">
                      {item.norma || "—"}
                    </td>
                    <td className="px-3 py-2 text-right text-torg-dark whitespace-nowrap">
                      {item.comprimento ? fmtNum(item.comprimento) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right text-torg-dark whitespace-nowrap">
                      {fmtNum(item.pesoUnitario)}
                    </td>
                    <td className="px-3 py-2 text-right text-torg-dark whitespace-nowrap">
                      {item.quantidade}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-torg-dark whitespace-nowrap">
                      {fmtNum(item.pesoTotal, 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-gray-50/50 rounded-b-2xl shrink-0">
          <div className="text-sm text-torg-gray">
            <strong className="text-torg-dark">{selecionados.size}</strong> de {resultado.itens.length} selecionados
            {" · "}
            <strong className="text-torg-blue">{fmtNum(pesoSelecionado, 0)} kg</strong>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-torg-gray hover:text-torg-dark transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={() => onConfirmar(itensSelecionados)}
              disabled={selecionados.size === 0 || salvando}
              className="flex items-center gap-2 px-5 py-2.5 bg-torg-blue text-white rounded-xl text-sm font-semibold hover:bg-torg-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {salvando ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
              Adicionar {selecionados.size} {selecionados.size === 1 ? "item" : "itens"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Aba Peso de Projeto ────────────────────────────────────

function AbaPesoProjeto({ estudo, estudoId, onEstudoUpdate }) {
  const [itens, setItens] = useState(estudo.itensPerso || []);
  const [showModal, setShowModal] = useState(false);
  const [excluindoId, setExcluindoId] = useState(null);
  const [editandoId, setEditandoId] = useState(null);
  const [editValores, setEditValores] = useState({});
  const [filtroSetor, setFiltroSetor] = useState("");
  const [toast, setToast] = useState(null);
  const [analisandoIA, setAnalisandoIA] = useState(false);
  const [resultadoIA, setResultadoIA] = useState(null);
  const [salvandoIA, setSalvandoIA] = useState(false);
  const [textoExtra, setTextoExtra] = useState("");

  // Setores unicos para filtro
  const setores = [...new Set(itens.map((i) => i.setor).filter(Boolean))].sort();

  const itensFiltrados = filtroSetor
    ? itens.filter((i) => i.setor === filtroSetor)
    : itens;

  // Totais
  const pesoTotalItens = itensFiltrados.reduce((s, i) => s + (i.pesoTotal || 0), 0);
  const qtdItens = itensFiltrados.length;

  // Totais por tipo
  const totaisPorTipo = {};
  for (const item of itensFiltrados) {
    const tipo = item.tipoMaterial || "OUTRO";
    if (!totaisPorTipo[tipo]) totaisPorTipo[tipo] = { peso: 0, qtd: 0 };
    totaisPorTipo[tipo].peso += item.pesoTotal || 0;
    totaisPorTipo[tipo].qtd += 1;
  }

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  // ── IA: analisar documentos ──
  const handleAnalisarIA = async () => {
    setAnalisandoIA(true);
    try {
      const res = await fetch(`/api/comercial/estudo/${estudoId}/analisar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ textoExtra: textoExtra.trim() || undefined }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      if (!json.data.itens?.length) {
        showToast("Nenhum item encontrado nos documentos");
        return;
      }
      setResultadoIA(json.data);
    } catch (e) {
      showToast(`Erro: ${e.message}`);
    } finally {
      setAnalisandoIA(false);
    }
  };

  const handleConfirmarIA = async (itensSelecionados) => {
    setSalvandoIA(true);
    try {
      const res = await fetch(`/api/comercial/estudo/${estudoId}/itens`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(itensSelecionados),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setItens(json.data);
      onEstudoUpdate?.({ pesoTotal: json.data.reduce((s, i) => s + (i.pesoTotal || 0), 0) });
      setResultadoIA(null);
      showToast(`${itensSelecionados.length} itens adicionados via IA`);
    } catch (e) {
      showToast(`Erro: ${e.message}`);
    } finally {
      setSalvandoIA(false);
    }
  };

  const handleAdicionarItem = async (dados) => {
    const res = await fetch(`/api/comercial/estudo/${estudoId}/itens`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(dados),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error);
    setItens(json.data);
    onEstudoUpdate?.({ pesoTotal: json.data.reduce((s, i) => s + (i.pesoTotal || 0), 0) });
    showToast("Item adicionado");
  };

  const handleExcluirItem = async (itemId) => {
    setExcluindoId(itemId);
    try {
      const res = await fetch(`/api/comercial/estudo/${estudoId}/itens?itemId=${itemId}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setItens((prev) => {
        const novos = prev.filter((i) => i.id !== itemId);
        onEstudoUpdate?.({ pesoTotal: novos.reduce((s, i) => s + (i.pesoTotal || 0), 0) });
        return novos;
      });
      showToast("Item excluido");
    } catch (e) {
      showToast(`Erro: ${e.message}`);
    } finally {
      setExcluindoId(null);
    }
  };

  const iniciarEdicao = (item) => {
    setEditandoId(item.id);
    setEditValores({
      descricao: item.descricao,
      setor: item.setor || "",
      comprimento: item.comprimento || "",
      pesoUnitario: item.pesoUnitario,
      quantidade: item.quantidade,
    });
  };

  const salvarEdicao = async () => {
    try {
      const pu = parseFloat(editValores.pesoUnitario) || 0;
      const comp = parseFloat(editValores.comprimento) || 0;
      const qtd = parseInt(editValores.quantidade) || 1;
      const pesoTotal = comp > 0 ? pu * comp * qtd : pu * qtd;

      const res = await fetch(`/api/comercial/estudo/${estudoId}/itens`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId: editandoId,
          descricao: editValores.descricao,
          setor: editValores.setor || null,
          comprimento: comp || null,
          pesoUnitario: pu,
          quantidade: qtd,
          pesoTotal,
          tipoMaterial: detectTipoMaterial(editValores.descricao),
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);

      setItens((prev) => {
        const novos = prev.map((i) =>
          i.id === editandoId ? { ...i, ...json.data } : i
        );
        onEstudoUpdate?.({ pesoTotal: novos.reduce((s, i) => s + (i.pesoTotal || 0), 0) });
        return novos;
      });
      setEditandoId(null);
      showToast("Item atualizado");
    } catch (e) {
      showToast(`Erro: ${e.message}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header com totais e acoes */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-6">
          <div>
            <p className="text-xs text-torg-gray uppercase tracking-wider font-medium">Peso total</p>
            <p className="text-2xl font-bold text-torg-dark">{fmtNum(pesoTotalItens, 0)} kg</p>
          </div>
          <div className="w-px h-10 bg-gray-200" />
          <div>
            <p className="text-xs text-torg-gray uppercase tracking-wider font-medium">Itens</p>
            <p className="text-2xl font-bold text-torg-dark">{qtdItens}</p>
          </div>
          {estudo.percPerda > 0 && (
            <>
              <div className="w-px h-10 bg-gray-200" />
              <div>
                <p className="text-xs text-torg-gray uppercase tracking-wider font-medium">
                  Perda ({estudo.percPerda}%)
                </p>
                <p className="text-2xl font-bold text-amber-600">
                  + {fmtNum(pesoTotalItens * estudo.percPerda / 100, 0)} kg
                </p>
              </div>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          {setores.length > 0 && (
            <select
              value={filtroSetor}
              onChange={(e) => setFiltroSetor(e.target.value)}
              className="px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue outline-none"
            >
              <option value="">Todos os setores</option>
              {setores.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          )}
          <button
            onClick={handleAnalisarIA}
            disabled={analisandoIA || (estudo.documentos?.length || 0) === 0}
            className="flex items-center gap-2 px-4 py-2.5 bg-purple-600 text-white rounded-xl text-sm font-semibold hover:bg-purple-700 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            title={!estudo.documentos?.length ? "Envie documentos primeiro" : "Analisar documentos com IA"}
          >
            {analisandoIA ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            {analisandoIA ? "Analisando..." : "Analisar com IA"}
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-torg-blue text-white rounded-xl text-sm font-semibold hover:bg-torg-dark transition-colors shadow-sm"
          >
            <Plus size={16} />
            Novo Item
          </button>
        </div>
      </div>

      {/* Composicao por tipo */}
      {Object.keys(totaisPorTipo).length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {Object.entries(totaisPorTipo)
            .sort((a, b) => b[1].peso - a[1].peso)
            .map(([tipo, dados]) => (
              <div key={tipo} className="bg-gray-50/80 rounded-xl p-3">
                <p className="text-xs text-torg-gray font-medium truncate">
                  {TIPO_MATERIAL_LABELS[tipo] || tipo}
                </p>
                <p className="text-sm font-bold text-torg-dark mt-0.5">
                  {fmtNum(dados.peso, 0)} kg
                </p>
                <p className="text-xs text-torg-gray">
                  {pesoTotalItens > 0 ? ((dados.peso / pesoTotalItens) * 100).toFixed(1) : 0}%
                  · {dados.qtd} {dados.qtd === 1 ? "item" : "itens"}
                </p>
              </div>
            ))}
        </div>
      )}

      {/* Tabela de itens */}
      {itens.length === 0 ? (
        <div className="bg-gray-50/50 rounded-xl border border-dashed border-gray-200 flex flex-col items-center justify-center py-16">
          <Scale size={40} className="text-gray-300 mb-3" />
          <p className="text-torg-gray font-medium mb-1">Nenhum item de peso cadastrado</p>
          <p className="text-sm text-gray-400 mb-4 text-center max-w-sm">
            Envie documentos do projeto e use a IA para extrair automaticamente, ou adicione manualmente
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={handleAnalisarIA}
              disabled={analisandoIA || (estudo.documentos?.length || 0) === 0}
              className="flex items-center gap-2 px-4 py-2.5 bg-purple-600 text-white rounded-xl text-sm font-semibold hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {analisandoIA ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
              {analisandoIA ? "Analisando..." : "Analisar com IA"}
            </button>
            <button
              onClick={() => setShowModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-torg-blue text-white rounded-xl text-sm font-semibold hover:bg-torg-dark transition-colors"
            >
              <Plus size={16} />
              Adicionar manualmente
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50/60">
                <tr className="text-left text-xs font-semibold text-torg-gray uppercase tracking-wider">
                  <th className="px-4 py-3 w-8">#</th>
                  <th className="px-4 py-3">Setor</th>
                  <th className="px-4 py-3">Descricao</th>
                  <th className="px-4 py-3">Tipo</th>
                  <th className="px-4 py-3 text-right">Comp. (m)</th>
                  <th className="px-4 py-3 text-right">Peso un. (kg/m)</th>
                  <th className="px-4 py-3 text-right">Qtd</th>
                  <th className="px-4 py-3 text-right">Peso total (kg)</th>
                  <th className="px-4 py-3 w-20"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {itensFiltrados.map((item, idx) => {
                  const isEditando = editandoId === item.id;
                  return (
                    <tr
                      key={item.id}
                      className={`group transition-colors ${isEditando ? "bg-torg-blue/5" : "hover:bg-gray-50/50"}`}
                    >
                      <td className="px-4 py-2.5 text-torg-gray text-xs">{idx + 1}</td>

                      {isEditando ? (
                        <>
                          <td className="px-4 py-2">
                            <input
                              type="text"
                              value={editValores.setor}
                              onChange={(e) => setEditValores((p) => ({ ...p, setor: e.target.value }))}
                              className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm outline-none focus:border-torg-blue"
                              placeholder="Setor"
                            />
                          </td>
                          <td className="px-4 py-2">
                            <input
                              type="text"
                              value={editValores.descricao}
                              onChange={(e) => setEditValores((p) => ({ ...p, descricao: e.target.value }))}
                              className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm outline-none focus:border-torg-blue"
                            />
                          </td>
                          <td className="px-4 py-2.5 text-xs text-torg-gray">
                            {TIPO_MATERIAL_LABELS[detectTipoMaterial(editValores.descricao)] || "Outro"}
                          </td>
                          <td className="px-4 py-2 text-right">
                            <input
                              type="number"
                              value={editValores.comprimento}
                              onChange={(e) => setEditValores((p) => ({ ...p, comprimento: e.target.value }))}
                              className="w-20 px-2 py-1.5 border border-gray-200 rounded-lg text-sm text-right outline-none focus:border-torg-blue"
                              step="0.01"
                              min="0"
                            />
                          </td>
                          <td className="px-4 py-2 text-right">
                            <input
                              type="number"
                              value={editValores.pesoUnitario}
                              onChange={(e) => setEditValores((p) => ({ ...p, pesoUnitario: e.target.value }))}
                              className="w-20 px-2 py-1.5 border border-gray-200 rounded-lg text-sm text-right outline-none focus:border-torg-blue"
                              step="0.01"
                              min="0"
                            />
                          </td>
                          <td className="px-4 py-2 text-right">
                            <input
                              type="number"
                              value={editValores.quantidade}
                              onChange={(e) => setEditValores((p) => ({ ...p, quantidade: e.target.value }))}
                              className="w-16 px-2 py-1.5 border border-gray-200 rounded-lg text-sm text-right outline-none focus:border-torg-blue"
                              min="1"
                            />
                          </td>
                          <td className="px-4 py-2.5 text-right font-semibold text-torg-dark">
                            {(() => {
                              const pu = parseFloat(editValores.pesoUnitario) || 0;
                              const c = parseFloat(editValores.comprimento) || 0;
                              const q = parseInt(editValores.quantidade) || 1;
                              return fmtNum(c > 0 ? pu * c * q : pu * q, 2);
                            })()}
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-1">
                              <button
                                onClick={salvarEdicao}
                                className="p-1.5 bg-emerald-100 text-emerald-700 rounded-lg hover:bg-emerald-200 transition-colors"
                                title="Salvar"
                              >
                                <CheckCircle2 size={14} />
                              </button>
                              <button
                                onClick={() => setEditandoId(null)}
                                className="p-1.5 bg-gray-100 text-gray-500 rounded-lg hover:bg-gray-200 transition-colors"
                                title="Cancelar"
                              >
                                <X size={14} />
                              </button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-4 py-2.5 text-torg-gray text-xs whitespace-nowrap">
                            {item.setor || "—"}
                          </td>
                          <td className="px-4 py-2.5 font-medium text-torg-dark whitespace-nowrap">
                            {item.descricao}
                            {item.norma && (
                              <span className="ml-2 text-xs text-torg-gray font-normal">{item.norma}</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-xs text-torg-gray whitespace-nowrap">
                            {TIPO_MATERIAL_LABELS[item.tipoMaterial] || "Outro"}
                          </td>
                          <td className="px-4 py-2.5 text-right text-torg-dark whitespace-nowrap">
                            {item.comprimento ? fmtNum(item.comprimento) : "—"}
                          </td>
                          <td className="px-4 py-2.5 text-right text-torg-dark whitespace-nowrap">
                            {fmtNum(item.pesoUnitario)}
                          </td>
                          <td className="px-4 py-2.5 text-right text-torg-dark whitespace-nowrap">
                            {item.quantidade}
                          </td>
                          <td className="px-4 py-2.5 text-right font-semibold text-torg-dark whitespace-nowrap">
                            {fmtNum(item.pesoTotal, 2)}
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={() => iniciarEdicao(item)}
                                className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
                                title="Editar"
                              >
                                <Edit3 size={14} className="text-torg-gray" />
                              </button>
                              <button
                                onClick={() => handleExcluirItem(item.id)}
                                disabled={excluindoId === item.id}
                                className="p-1.5 hover:bg-red-50 rounded-lg transition-colors"
                                title="Excluir"
                              >
                                {excluindoId === item.id ? (
                                  <Loader2 size={14} className="animate-spin text-red-400" />
                                ) : (
                                  <Trash2 size={14} className="text-red-400" />
                                )}
                              </button>
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-gray-50/60 border-t border-gray-200">
                <tr className="font-semibold text-sm">
                  <td colSpan={7} className="px-4 py-3 text-right text-torg-dark uppercase text-xs tracking-wider">
                    Total {filtroSetor ? `(${filtroSetor})` : ""}
                  </td>
                  <td className="px-4 py-3 text-right text-torg-dark">
                    {fmtNum(pesoTotalItens, 0)} kg
                  </td>
                  <td></td>
                </tr>
                {estudo.percPerda > 0 && (
                  <tr className="text-sm text-amber-700">
                    <td colSpan={7} className="px-4 py-2 text-right text-xs uppercase tracking-wider">
                      + Perdas e ligacoes ({estudo.percPerda}%)
                    </td>
                    <td className="px-4 py-2 text-right font-semibold">
                      {fmtNum(pesoTotalItens * estudo.percPerda / 100, 0)} kg
                    </td>
                    <td></td>
                  </tr>
                )}
                {estudo.percPerda > 0 && (
                  <tr className="text-sm font-bold">
                    <td colSpan={7} className="px-4 py-3 text-right text-torg-blue text-xs uppercase tracking-wider">
                      Total geral
                    </td>
                    <td className="px-4 py-3 text-right text-torg-blue text-base">
                      {fmtNum(pesoTotalItens * (1 + estudo.percPerda / 100), 0)} kg
                    </td>
                    <td></td>
                  </tr>
                )}
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Documentos */}
      <SecaoDocumentos
        estudoId={estudoId}
        documentos={estudo.documentos}
        onUpdate={(docs) => {
          if (docs) onEstudoUpdate?.({ documentos: docs });
        }}
      />

      {/* Modal novo item */}
      {showModal && (
        <NovoItemModal
          onClose={() => setShowModal(false)}
          onSalvar={handleAdicionarItem}
        />
      )}

      {/* Modal revisao IA */}
      {resultadoIA && (
        <ModalRevisaoIA
          resultado={resultadoIA}
          onClose={() => setResultadoIA(null)}
          onConfirmar={handleConfirmarIA}
          salvando={salvandoIA}
        />
      )}

      {/* Toast inline */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 px-5 py-3 rounded-xl shadow-lg text-sm font-medium z-50 ${
            toast.startsWith("Erro") ? "bg-red-600 text-white" : "bg-emerald-600 text-white"
          }`}
        >
          {toast}
        </div>
      )}
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

// ── Pagina principal ───────────────────────────────────────

export default function EstudoDetalheClient({ estudoId }) {
  const router = useRouter();
  const [estudo, setEstudo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [abaAtiva, setAbaAtiva] = useState("geral");
  const [toast, setToast] = useState(null);
  const [confirmExcluir, setConfirmExcluir] = useState(false);
  const [excluindo, setExcluindo] = useState(false);

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

  const handleExcluir = async () => {
    setExcluindo(true);
    try {
      const res = await fetch(`/api/comercial/estudo/${estudoId}`, { method: "DELETE" });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      router.push("/comercial/orcamentos/propostas");
    } catch (e) {
      setToast(`Erro: ${e.message}`);
      setTimeout(() => setToast(null), 5000);
    } finally {
      setExcluindo(false);
      setConfirmExcluir(false);
    }
  };

  // Atualizar totais do estudo quando itens mudam
  const handleEstudoUpdate = (dados) => {
    setEstudo((prev) => ({ ...prev, ...dados }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={24} className="animate-spin text-torg-blue mr-3" />
        <span className="text-torg-gray">Carregando estudo...</span>
      </div>
    );
  }

  if (erro) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
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
    <div className="space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex items-start justify-between">
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
          <div className="w-px h-8 bg-gray-200" />
          <button
            onClick={() => setConfirmExcluir(true)}
            className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
            title="Excluir estudo"
          >
            <Trash2 size={18} />
          </button>
        </div>
      </div>

      {/* Abas */}
      <div className="flex items-center gap-1 bg-white rounded-xl border border-gray-100 p-1 shadow-sm">
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

      {/* Conteudo da aba */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        {abaAtiva === "geral" && <AbaGeral estudo={estudo} onSave={handleSave} />}
        {abaAtiva === "peso" && (
          <AbaPesoProjeto
            estudo={estudo}
            estudoId={estudoId}
            onEstudoUpdate={handleEstudoUpdate}
          />
        )}
        {abaAtiva === "custos" && (
          <AbaEmConstrucao
            titulo="Custos"
            descricao="Materia prima, parafusos, tintas, engenharia, qualidade, transporte, fabricacao e montagem. Sera habilitado na Fase 4."
            icon={DollarSign}
          />
        )}
        {abaAtiva === "bdi" && (
          <AbaEmConstrucao
            titulo="BDI / Impostos"
            descricao="Configuracao de CFOP, aliquotas de impostos, margem de lucro e composicao do BDI. Sera habilitado na Fase 5."
            icon={Calculator}
          />
        )}
        {abaAtiva === "resumo" && (
          <AbaEmConstrucao
            titulo="Resumo Comercial"
            descricao="Visao consolidada do estudo com exportacao para Excel e geracao da proposta tecnica comercial (PTC). Sera habilitado na Fase 6."
            icon={BarChart3}
          />
        )}
      </div>

      {/* Modal de confirmacao de exclusao */}
      {confirmExcluir && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setConfirmExcluir(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center">
                <Trash2 size={20} className="text-red-600" />
              </div>
              <div>
                <h3 className="font-bold text-torg-dark">Excluir estudo</h3>
                <p className="text-sm text-torg-gray">Esta acao nao pode ser desfeita</p>
              </div>
            </div>
            <p className="text-sm text-torg-gray mb-6">
              Tem certeza que deseja excluir o estudo <strong>EPC-{estudo.orcamento?.numero}-R{estudo.revisao}</strong> e seu orcamento vinculado?
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmExcluir(false)}
                className="px-4 py-2 text-sm text-torg-gray hover:text-torg-dark transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleExcluir}
                disabled={excluindo}
                className="flex items-center gap-2 px-5 py-2.5 bg-red-600 text-white rounded-xl text-sm font-semibold hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {excluindo ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}

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
