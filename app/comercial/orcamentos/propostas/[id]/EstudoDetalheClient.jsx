"use client";
import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import {
  ArrowLeft, FileSpreadsheet, ExternalLink, Upload, Scale,
  DollarSign, Calculator, BarChart3, Loader2, AlertCircle,
  Save, CheckCircle2, Clock, Edit3, Link2, Paperclip, Trash2,
  Plus, X, Search, FileText, Download, ChevronDown, Sparkles,
  Check, Info, FolderDown, FolderOpen, RefreshCw,
  Wrench, Bolt, Paintbrush, Landmark, CalendarDays, Truck, HardHat,
  Send, Package, ChevronUp, XCircle,
} from "lucide-react";

// Lazy-load abas pesadas — reduz bundle inicial em ~60%
const TabLoader = () => (
  <div className="flex items-center justify-center py-20">
    <Loader2 size={24} className="animate-spin text-torg-blue" />
  </div>
);
const AbaProdutividade = dynamic(() => import("./AbaProdutividade"), { loading: TabLoader });
const AbaAcessorios = dynamic(() => import("./AbaAcessorios"), { loading: TabLoader });
const AbaParafusos = dynamic(() => import("./AbaParafusos"), { loading: TabLoader });
const AbaPintura = dynamic(() => import("./AbaPintura"), { loading: TabLoader });
const AbaCustos = dynamic(() => import("./AbaCustos"), { loading: TabLoader });
const AbaCronograma = dynamic(() => import("./AbaCronograma"), { loading: TabLoader });
const AbaImpostos = dynamic(() => import("./AbaImpostos"), { loading: TabLoader });
const AbaFretes = dynamic(() => import("./AbaFretes"), { loading: TabLoader });
const AbaResumo = dynamic(() => import("./AbaResumo"), { loading: TabLoader });
const AbaMontagem = dynamic(() => import("./AbaMontagem"), { loading: TabLoader });

const STATUS_LABELS = {
  RASCUNHO: { label: "Rascunho", cor: "bg-gray-100 text-gray-700", icon: Edit3 },
  EM_ANALISE: { label: "Em análise", cor: "bg-amber-100 text-amber-700", icon: Clock },
  APROVADO: { label: "Aprovado", cor: "bg-emerald-100 text-emerald-700", icon: CheckCircle2 },
  CONCLUIDO: { label: "Concluído", cor: "bg-torg-blue/10 text-torg-blue", icon: CheckCircle2 },
};

const ABAS = [
  { id: "geral", label: "Geral", icon: FileSpreadsheet },
  { id: "produtividade", label: "Produtividade", icon: Calculator },
  { id: "materiais", label: "Materiais", icon: Scale },
  { id: "acessorios", label: "Acessorios", icon: Wrench },
  { id: "parafusos", label: "Parafusos", icon: Bolt },
  { id: "pintura", label: "Pintura", icon: Paintbrush },
  { id: "custos", label: "Custos", icon: DollarSign },
  { id: "montagem", label: "Montagem", icon: HardHat },
  { id: "fretes", label: "Fretes", icon: Truck },
  { id: "impostos", label: "Impostos", icon: Landmark },
  { id: "resumo", label: "Resumo", icon: BarChart3 },
  { id: "cronograma", label: "Cronograma", icon: CalendarDays },
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

function SecaoDocumentos({ estudoId, documentos: docsProp, onUpdate, sharepointUrl }) {
  const [docs, setDocs] = useState(docsProp || []);
  const [uploading, setUploading] = useState(false);
  const [erroUpload, setErroUpload] = useState("");
  const [showImportSP, setShowImportSP] = useState(false);
  const fileRef = useRef(null);
  const folderRef = useRef(null);
  const [uploadProgresso, setUploadProgresso] = useState(""); // "3 de 15..."
  const [convertendo, setConvertendo] = useState(new Set()); // IDs de docs sendo convertidos

  // Converter DWG/DXF para PDF via CloudConvert
  const converterDwg = async (docId, docNome) => {
    setConvertendo((prev) => new Set(prev).add(docId));
    try {
      const res = await fetch(`/api/comercial/estudo/${estudoId}/converter-dwg`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ docId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Falha na conversao");

      if (json.jaExistia) {
        // PDF ja existe, nao duplicar
        return json.data;
      }

      // Adicionar o PDF convertido a lista
      setDocs((prev) => {
        const novos = [json.data, ...prev];
        onUpdate?.(novos);
        return novos;
      });
      return json.data;
    } catch (err) {
      console.warn(`Conversao DWG falhou para ${docNome}:`, err);
      setErroUpload((prev) => {
        const msg = `Conversao ${docNome}: ${err.message}`;
        return prev ? `${prev} | ${msg}` : msg;
      });
      return null;
    } finally {
      setConvertendo((prev) => {
        const next = new Set(prev);
        next.delete(docId);
        return next;
      });
    }
  };

  // Converter todos os DWGs pendentes de uma vez
  const converterTodosDwg = async () => {
    const dwgs = docs.filter((d) => {
      const ext = d.tipo?.toLowerCase();
      if (ext !== "dwg" && ext !== "dxf") return false;
      // Verificar se ja tem PDF convertido
      const pdfName = d.nome.replace(/\.(dwg|dxf)$/i, ".pdf");
      return !docs.some((p) => p.nome === pdfName && p.observacao?.includes("Convertido de DWG"));
    });
    if (dwgs.length === 0) return;

    for (const dwg of dwgs) {
      await converterDwg(dwg.id, dwg.nome);
    }
  };

  const handleUpload = async (e) => {
    const fileList = e.target.files;
    if (!fileList?.length) return;

    // Filtrar tipos suportados (inclui CAD para armazenamento, exclui modelos 3D e binarios pesados)
    const tiposAceitos = ["pdf","xlsx","xls","csv","docx","doc","eml","msg","png","jpg","jpeg","dwg","dxf"];
    const files = Array.from(fileList).filter((f) => {
      if (f.name.startsWith(".") || f.size === 0) return false;
      const ext = f.name.split(".").pop()?.toLowerCase();
      return tiposAceitos.includes(ext);
    });

    const ignorados = fileList.length - files.length;
    if (files.length === 0) {
      setErroUpload(`Nenhum arquivo suportado encontrado (${fileList.length} arquivo(s) ignorado(s))`);
      return;
    }

    setUploading(true);
    setErroUpload("");
    let enviados = 0;
    const dwgsParaConverter = []; // { id, nome } dos DWGs que precisam conversao

    if (ignorados > 0) {
      setUploadProgresso(`${files.length} arquivo(s) suportado(s), ${ignorados} ignorado(s) (CAD/binario)`);
      await new Promise((r) => setTimeout(r, 1500));
    }

    for (const file of files) {
      enviados++;
      if (files.length > 1) {
        setUploadProgresso(`${enviados} de ${files.length}: ${file.name}`);
      }
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

        // Marcar DWG/DXF para conversao automatica
        if (ext === "dwg" || ext === "dxf") {
          dwgsParaConverter.push({ id: regJson.data.id, nome: file.name });
        }
      } catch (err) {
        console.warn(`Upload falhou para ${file.name}:`, err);
        setErroUpload((prev) => {
          const msg = `${file.name}: ${err.message}`;
          return prev ? `${prev} | ${msg}` : msg;
        });
      }
    }

    setUploading(false);
    setUploadProgresso("");
    if (fileRef.current) fileRef.current.value = "";
    if (folderRef.current) folderRef.current.value = "";

    // Auto-converter DWGs apos upload (em background, sem travar o upload)
    if (dwgsParaConverter.length > 0) {
      for (const dwg of dwgsParaConverter) {
        converterDwg(dwg.id, dwg.nome);
      }
    }
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

  // Contar DWGs pendentes de conversao
  const dwgsPendentes = docs.filter((d) => {
    const ext = d.tipo?.toLowerCase();
    if (ext !== "dwg" && ext !== "dxf") return false;
    const pdfName = d.nome.replace(/\.(dwg|dxf)$/i, ".pdf");
    return !docs.some((p) => p.nome === pdfName && p.observacao?.includes("Convertido de DWG"));
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-torg-dark flex items-center gap-2">
          <Paperclip size={16} />
          Documentos ({docs.length})
        </h3>
        <div className="flex items-center gap-2">
          {/* Botao converter todos DWGs pendentes */}
          {dwgsPendentes.length > 0 && convertendo.size === 0 && (
            <button
              onClick={converterTodosDwg}
              className="flex items-center gap-2 px-4 py-2 bg-amber-50 hover:bg-amber-100 rounded-xl text-sm font-medium text-amber-700 transition-colors"
              title={`Converter ${dwgsPendentes.length} DWG(s) para PDF`}
            >
              <RefreshCw size={14} />
              Converter {dwgsPendentes.length} DWG{dwgsPendentes.length > 1 ? "s" : ""}
            </button>
          )}
          {sharepointUrl && (
            <button
              onClick={() => setShowImportSP(true)}
              className="flex items-center gap-2 px-4 py-2 bg-torg-blue/10 hover:bg-torg-blue/20 rounded-xl text-sm font-medium text-torg-blue transition-colors"
            >
              <FolderDown size={14} />
              Importar SharePoint
            </button>
          )}
          <label className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-xl text-sm font-medium text-torg-dark cursor-pointer transition-colors">
            {uploading ? <Loader2 size={14} className="animate-spin" /> : <FolderOpen size={14} />}
            {uploading ? "Enviando..." : "Upload Pasta"}
            <input
              ref={folderRef}
              type="file"
              // @ts-ignore - webkitdirectory e nao-padrao mas funciona em todos os browsers modernos
              webkitdirectory=""
              directory=""
              onChange={handleUpload}
              className="hidden"
              disabled={uploading}
            />
          </label>
          <label className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-xl text-sm font-medium text-torg-dark cursor-pointer transition-colors">
            <Upload size={14} />
            Arquivos
            <input
              ref={fileRef}
              type="file"
              multiple
              accept=".pdf,.xlsx,.xls,.csv,.dxf,.dwg,.docx,.doc,.eml,.msg,.png,.jpg,.jpeg,.DWG,.DXF"
              onChange={handleUpload}
              className="hidden"
              disabled={uploading}
            />
          </label>
        </div>
      </div>

      {/* Barra de conversao DWG em andamento */}
      {convertendo.size > 0 && (
        <div className="flex items-center gap-2 p-3 bg-amber-50 text-amber-700 rounded-xl text-sm mb-3">
          <Loader2 size={16} className="animate-spin shrink-0" />
          <span>Convertendo {convertendo.size} DWG{convertendo.size > 1 ? "s" : ""} para PDF...</span>
        </div>
      )}

      {uploading && uploadProgresso && (
        <div className="flex items-center gap-2 p-3 bg-torg-blue/5 text-torg-blue rounded-xl text-sm mb-3">
          <Loader2 size={16} className="animate-spin shrink-0" />
          <span className="truncate">{uploadProgresso}</span>
        </div>
      )}

      {erroUpload && (
        <div className="flex items-center gap-2 p-3 bg-red-50 text-red-700 rounded-xl text-sm mb-3">
          <AlertCircle size={16} className="shrink-0" />
          <span className="truncate">{erroUpload}</span>
          <button onClick={() => setErroUpload("")} className="ml-auto shrink-0"><X size={14} /></button>
        </div>
      )}

      {docs.length === 0 ? (
        <div className="space-y-3">
          {sharepointUrl && (
            <button
              onClick={() => setShowImportSP(true)}
              className="w-full border-2 border-dashed border-torg-blue/20 rounded-xl p-5 text-center cursor-pointer hover:border-torg-blue/40 hover:bg-torg-blue/5 transition-colors"
            >
              <FolderDown size={28} className="text-torg-blue/50 mx-auto mb-2" />
              <p className="text-sm font-medium text-torg-blue">Importar documentos do SharePoint</p>
              <p className="text-xs text-torg-gray mt-1">Puxar PDFs e imagens da pasta do projeto</p>
            </button>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div
              className="border-2 border-dashed border-gray-200 rounded-xl p-5 text-center cursor-pointer hover:border-torg-blue/30 transition-colors"
              onClick={() => folderRef.current?.click()}
            >
              <FolderOpen size={24} className="text-gray-300 mx-auto mb-2" />
              <p className="text-sm font-medium text-torg-gray">Upload de pasta</p>
              <p className="text-xs text-gray-400 mt-1">Selecione uma pasta inteira</p>
            </div>
            <div
              className="border-2 border-dashed border-gray-200 rounded-xl p-5 text-center cursor-pointer hover:border-torg-blue/30 transition-colors"
              onClick={() => fileRef.current?.click()}
            >
              <Upload size={24} className="text-gray-300 mx-auto mb-2" />
              <p className="text-sm font-medium text-torg-gray">Upload de arquivos</p>
              <p className="text-xs text-gray-400 mt-1">PDFs, planilhas, desenhos</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {docs.map((doc) => {
            const ext = doc.tipo?.toLowerCase();
            const isDwg = ext === "dwg" || ext === "dxf";
            const isConverting = convertendo.has(doc.id);
            const pdfName = isDwg ? doc.nome.replace(/\.(dwg|dxf)$/i, ".pdf") : null;
            const temPdf = isDwg && docs.some((p) => p.nome === pdfName && p.observacao?.includes("Convertido de DWG"));
            const isConvertedPdf = doc.observacao?.includes("Convertido de DWG");

            return (
              <div
                key={doc.id}
                className="flex items-center gap-3 p-3 bg-gray-50/80 rounded-xl group hover:bg-gray-100/80 transition-colors"
              >
                <div className={`w-9 h-9 border rounded-lg flex items-center justify-center shrink-0 ${
                  isDwg ? "bg-amber-50 border-amber-200" : isConvertedPdf ? "bg-emerald-50 border-emerald-200" : "bg-white border-gray-200"
                }`}>
                  {isConverting ? (
                    <Loader2 size={16} className="text-amber-500 animate-spin" />
                  ) : (
                    <FileText size={16} className={isDwg ? "text-amber-600" : isConvertedPdf ? "text-emerald-600" : "text-torg-blue"} />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-torg-dark truncate">{doc.nome}</p>
                    {isDwg && temPdf && (
                      <span className="shrink-0 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-medium">
                        PDF gerado
                      </span>
                    )}
                    {isDwg && !temPdf && !isConverting && (
                      <span className="shrink-0 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-medium">
                        DWG
                      </span>
                    )}
                    {isConverting && (
                      <span className="shrink-0 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-medium animate-pulse">
                        Convertendo...
                      </span>
                    )}
                    {isConvertedPdf && (
                      <span className="shrink-0 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-medium">
                        Convertido
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-torg-gray">
                    {doc.categoria && <span className="capitalize">{doc.categoria}</span>}
                    {doc.tamanho && <span> · {fmtBytes(doc.tamanho)}</span>}
                  </p>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {/* Botao converter individual pra DWGs sem PDF */}
                  {isDwg && !temPdf && !isConverting && (
                    <button
                      onClick={() => converterDwg(doc.id, doc.nome)}
                      className="p-1.5 hover:bg-amber-50 rounded-lg transition-colors"
                      title="Converter para PDF"
                    >
                      <RefreshCw size={14} className="text-amber-600" />
                    </button>
                  )}
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
            );
          })}
        </div>
      )}

      {/* Modal importar SharePoint */}
      {showImportSP && (
        <ModalImportarSharePoint
          estudoId={estudoId}
          onClose={() => setShowImportSP(false)}
          onImportados={async () => {
            // Recarregar documentos do backend
            try {
              const res = await fetch(`/api/comercial/estudo/${estudoId}/documentos`);
              const json = await res.json();
              if (json.success) {
                setDocs(json.data);
                onUpdate?.(json.data);
              }
            } catch { /* silencioso */ }
          }}
        />
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

// ── Modal Importar do SharePoint ──────────────────────────

function ModalImportarSharePoint({ estudoId, onClose, onImportados }) {
  const [carregando, setCarregando] = useState(true);
  const [importando, setImportando] = useState(false);
  const [erro, setErro] = useState("");
  const [dados, setDados] = useState(null); // { pastas, totalArquivos, jaImportados }
  const [selecionados, setSelecionados] = useState(new Set());
  const [progresso, setProgresso] = useState(""); // mensagem de progresso

  useEffect(() => {
    listarArquivos();
  }, []);

  const listarArquivos = async () => {
    setCarregando(true);
    setErro("");
    try {
      const res = await fetch(`/api/comercial/estudo/${estudoId}/importar-sharepoint`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setDados(json.data);

      // Pre-selecionar arquivos que ainda nao foram importados
      const novos = new Set();
      for (const [, arquivos] of Object.entries(json.data.pastas)) {
        for (const arq of arquivos) {
          if (!arq.jaImportado) novos.add(arq.id);
        }
      }
      setSelecionados(novos);
    } catch (e) {
      setErro(e.message);
    } finally {
      setCarregando(false);
    }
  };

  const toggleArquivo = (id) => {
    setSelecionados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const togglePasta = (nomePasta) => {
    const arqsDaPasta = (dados?.pastas[nomePasta] || []).filter((a) => !a.jaImportado);
    const todosSelect = arqsDaPasta.every((a) => selecionados.has(a.id));
    setSelecionados((prev) => {
      const next = new Set(prev);
      for (const a of arqsDaPasta) {
        if (todosSelect) next.delete(a.id);
        else next.add(a.id);
      }
      return next;
    });
  };

  const handleImportar = async () => {
    if (selecionados.size === 0) return;
    setImportando(true);
    setErro("");
    setProgresso(`Importando ${selecionados.size} arquivo(s)...`);

    try {
      // Montar lista de arquivos selecionados
      const arquivosParaImportar = [];
      for (const [pasta, arquivos] of Object.entries(dados.pastas)) {
        for (const arq of arquivos) {
          if (selecionados.has(arq.id) && !arq.jaImportado) {
            arquivosParaImportar.push({ id: arq.id, name: arq.name, folder: pasta });
          }
        }
      }

      if (arquivosParaImportar.length === 0) {
        setErro("Todos os arquivos selecionados ja foram importados");
        return;
      }

      const res = await fetch(`/api/comercial/estudo/${estudoId}/importar-sharepoint`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ arquivos: arquivosParaImportar }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);

      const qtdImportados = json.data.importados.filter((i) => i.status === "importado").length;
      const qtdJaExistiam = json.data.importados.filter((i) => i.status === "ja_existe").length;
      const qtdFalhas = json.data.falhas.length;

      setProgresso(
        [
          qtdImportados > 0 && `${qtdImportados} importado(s)`,
          qtdJaExistiam > 0 && `${qtdJaExistiam} ja existia(m)`,
          qtdFalhas > 0 && `${qtdFalhas} falha(s)`,
        ]
          .filter(Boolean)
          .join(" · ")
      );

      // Atualizar lista de documentos no parent
      onImportados?.();

      // Recarregar a lista pra atualizar status jaImportado
      await listarArquivos();
    } catch (e) {
      setErro(e.message);
    } finally {
      setImportando(false);
    }
  };

  const totalPastas = dados ? Object.keys(dados.pastas).length : 0;
  const totalNovos = dados
    ? Object.values(dados.pastas).flat().filter((a) => !a.jaImportado).length
    : 0;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-torg-blue/10 rounded-xl flex items-center justify-center">
              <FolderDown size={20} className="text-torg-blue" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-torg-dark">Importar do SharePoint</h2>
              <p className="text-sm text-torg-gray">
                {carregando
                  ? "Listando arquivos..."
                  : dados
                  ? `${dados.totalArquivos} arquivo(s) em ${totalPastas} pasta(s)`
                  : "Erro ao listar"}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg" disabled={importando}>
            <X size={20} className="text-gray-400" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {carregando && (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 size={32} className="animate-spin text-torg-blue mb-3" />
              <p className="text-sm text-torg-gray">Lendo pasta do SharePoint...</p>
            </div>
          )}

          {erro && !carregando && (
            <div className="flex items-center gap-2 p-4 bg-red-50 text-red-700 rounded-xl text-sm mb-3">
              <AlertCircle size={16} className="shrink-0" />
              <p>{erro}</p>
              <button onClick={listarArquivos} className="ml-auto text-red-600 hover:text-red-800 font-medium underline">
                Tentar novamente
              </button>
            </div>
          )}

          {dados && !carregando && (
            <div className="space-y-3">
              {Object.entries(dados.pastas)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([pasta, arquivos]) => {
                  const novos = arquivos.filter((a) => !a.jaImportado);
                  const todosSelecionados = novos.length > 0 && novos.every((a) => selecionados.has(a.id));
                  const algunsSelecionados = novos.some((a) => selecionados.has(a.id));

                  return (
                    <div key={pasta} className="border border-gray-100 rounded-xl overflow-hidden">
                      {/* Pasta header */}
                      <div
                        className="flex items-center gap-3 px-4 py-3 bg-gray-50/80 cursor-pointer hover:bg-gray-100/80 transition-colors"
                        onClick={() => togglePasta(pasta)}
                      >
                        <input
                          type="checkbox"
                          checked={todosSelecionados}
                          ref={(el) => {
                            if (el) el.indeterminate = algunsSelecionados && !todosSelecionados;
                          }}
                          onChange={() => togglePasta(pasta)}
                          className="rounded border-gray-300 text-torg-blue focus:ring-torg-blue/30"
                          disabled={novos.length === 0}
                        />
                        <FolderOpen size={16} className="text-torg-blue shrink-0" />
                        <span className="text-sm font-semibold text-torg-dark flex-1 truncate">
                          {pasta}
                        </span>
                        <span className="text-xs text-torg-gray">
                          {arquivos.length} arquivo(s)
                          {novos.length < arquivos.length && (
                            <span className="text-emerald-600 ml-1">
                              · {arquivos.length - novos.length} ja importado(s)
                            </span>
                          )}
                        </span>
                      </div>

                      {/* Lista de arquivos */}
                      <div className="divide-y divide-gray-50">
                        {arquivos.map((arq) => (
                          <label
                            key={arq.id}
                            className={`flex items-center gap-3 px-4 py-2 text-sm cursor-pointer transition-colors ${
                              arq.jaImportado
                                ? "bg-emerald-50/30 text-torg-gray"
                                : selecionados.has(arq.id)
                                ? "bg-torg-blue/5"
                                : "hover:bg-gray-50/50"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={arq.jaImportado || selecionados.has(arq.id)}
                              disabled={arq.jaImportado}
                              onChange={() => toggleArquivo(arq.id)}
                              className="rounded border-gray-300 text-torg-blue focus:ring-torg-blue/30 disabled:opacity-50"
                            />
                            <FileText size={14} className={arq.jaImportado ? "text-emerald-500" : "text-gray-400"} />
                            <span className="flex-1 truncate">{arq.name}</span>
                            <span className="text-xs text-gray-400">{fmtBytes(arq.size)}</span>
                            {arq.jaImportado && (
                              <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
                                importado
                              </span>
                            )}
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-gray-50/50 rounded-b-2xl shrink-0">
          <div className="text-sm text-torg-gray">
            {progresso || (
              <>
                <strong className="text-torg-dark">{selecionados.size}</strong> selecionado(s)
                {totalNovos > 0 && <span> de {totalNovos} novo(s)</span>}
              </>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              disabled={importando}
              className="px-4 py-2 text-sm text-torg-gray hover:text-torg-dark transition-colors"
            >
              {importando ? "Aguarde..." : "Fechar"}
            </button>
            <button
              onClick={handleImportar}
              disabled={selecionados.size === 0 || importando || carregando}
              className="flex items-center gap-2 px-5 py-2.5 bg-torg-blue text-white rounded-xl text-sm font-semibold hover:bg-torg-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {importando ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <FolderDown size={16} />
              )}
              {importando ? "Importando..." : `Importar ${selecionados.size} arquivo(s)`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
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
          <div>
            <h2 className="text-base font-semibold text-torg-dark">Itens extraidos</h2>
            <p className="text-sm text-torg-gray">
              {resultado.itens.length} itens
              {resultado.docsAnalisados?.length > 0 && ` · ${resultado.docsAnalisados.length} doc${resultado.docsAnalisados.length > 1 ? "s" : ""}`}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg">
            <X size={18} className="text-gray-400" />
          </button>
        </div>

        {/* Info do projeto */}
        {(resultado.composicao || resultado.observacoes || resultado.pesoTotalProjeto) && (
          <div className="px-6 py-3 bg-gray-50 border-b border-gray-100 shrink-0">
            <div className="flex items-start gap-2 text-sm text-torg-gray">
              <Info size={14} className="text-torg-gray mt-0.5 shrink-0" />
              <div className="space-y-0.5">
                {resultado.pesoTotalProjeto && (
                  <p>Peso estimado: <strong className="text-torg-dark">{fmtNum(resultado.pesoTotalProjeto, 0)} kg</strong></p>
                )}
                {resultado.composicao && <p className="text-xs">{resultado.composicao}</p>}
                {resultado.observacoes && <p className="text-xs">{resultado.observacoes}</p>}
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
                  <th className="px-3 py-2 text-right">Qtd</th>
                  <th className="px-3 py-2 text-right">Peso (kg)</th>
                  <th className="px-3 py-2 text-right">R$/kg</th>
                  <th className="px-3 py-2 text-right">Custo</th>
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
                      {!item.codigoOmie && item.custoUnitario > 0 && (
                        <span className="text-amber-500 ml-1 text-[10px]" title="Sem cadastro Omie — custo estimado">*</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-torg-gray text-xs whitespace-nowrap">
                      {item.setor || "—"}
                    </td>
                    <td className="px-3 py-2 text-xs text-torg-gray whitespace-nowrap">
                      {TIPO_MATERIAL_LABELS[item.tipoMaterial] || item.tipoMaterial || "—"}
                    </td>
                    <td className="px-3 py-2 text-right text-torg-dark whitespace-nowrap">
                      {item.quantidade}
                    </td>
                    <td className="px-3 py-2 text-right font-medium text-torg-dark whitespace-nowrap">
                      {fmtNum(item.pesoTotal, 0)}
                    </td>
                    <td className="px-3 py-2 text-right text-torg-gray whitespace-nowrap">
                      {item.custoUnitario ? fmtNum(item.custoUnitario, 2) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right text-torg-dark whitespace-nowrap">
                      {item.custoUnitario ? fmtMoeda(item.custoUnitario * item.pesoTotal) : "—"}
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
            <span><strong className="text-torg-dark">{selecionados.size}</strong> selecionados</span>
            <span className="mx-2 text-gray-300">·</span>
            <span><strong className="text-torg-dark">{fmtNum(pesoSelecionado, 0)} kg</strong></span>
            {(() => {
              const custoEstimado = itensSelecionados.reduce((s, i) => s + (i.custoUnitario ? i.custoUnitario * i.pesoTotal : 0), 0);
              const semOmie = itensSelecionados.filter(i => !i.codigoOmie).length;
              return custoEstimado > 0 ? (
                <>
                  <span className="mx-2 text-gray-300">·</span>
                  <span>Custo: <strong className="text-torg-dark">{fmtMoeda(custoEstimado)}</strong></span>
                  {semOmie > 0 && <span className="text-xs text-amber-600 ml-1">({semOmie} sem cadastro*)</span>}
                </>
              ) : null;
            })()}
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
              className="flex items-center gap-2 px-5 py-2.5 bg-torg-blue text-white rounded-xl text-sm font-medium hover:bg-torg-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {salvando ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
              Confirmar {selecionados.size} {selecionados.size === 1 ? "item" : "itens"}
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
  const [cotacoes, setCotacoes] = useState(
    (estudo.cotacoesEstudo || []).filter((c) => c.tipo === "MATERIAIS")
  );
  const [showModal, setShowModal] = useState(false);
  const [showCotacaoModal, setShowCotacaoModal] = useState(false);
  const [excluindoId, setExcluindoId] = useState(null);
  const [editandoId, setEditandoId] = useState(null);
  const [editValores, setEditValores] = useState({});
  const [editandoCustoId, setEditandoCustoId] = useState(null);
  const [editCustoValor, setEditCustoValor] = useState("");
  const [editandoPerda, setEditandoPerda] = useState(false);
  const [editPerdaValor, setEditPerdaValor] = useState("");
  const [filtroSetor, setFiltroSetor] = useState("");
  const [toast, setToast] = useState(null);
  const [analisandoIA, setAnalisandoIA] = useState(false);
  const [progressoIA, setProgressoIA] = useState(null); // { loteAtual, totalLotes, itensAcumulados }
  const [resultadoIA, setResultadoIA] = useState(null);
  const [salvandoIA, setSalvandoIA] = useState(false);
  // Filtro de docs padrao: analisar apenas docs de estrutura metalica (-MET-)
  const filtroDocsIA = "MET";

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

  // ── Calcular docs filtrados para IA ──
  const docsParaIA = (estudo.documentos || []).filter((d) => {
    if (filtroDocsIA === "todos") return true;
    return d.nome?.toUpperCase().includes(`-${filtroDocsIA}-`);
  });

  // ── IA: analisar documentos (em lotes) ──
  const handleAnalisarIA = async () => {
    setAnalisandoIA(true);
    setProgressoIA(null);
    const todosItens = [];
    let pesoTotal = null;
    let composicao = null;
    let observacoes = [];
    let docsAnalisados = [];

    // Filtrar docIds com base no filtro selecionado
    const docIdsFiltrados = docsParaIA.map((d) => d.id);

    try {
      // Primeira chamada para descobrir quantos lotes existem
      let loteAtual = 0;
      let totalLotes = 1;
      let concluido = false;

      while (!concluido) {
        setProgressoIA({ loteAtual: loteAtual + 1, totalLotes, itensAcumulados: todosItens.length });

        const res = await fetch(`/api/comercial/estudo/${estudoId}/analisar`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            docIds: docIdsFiltrados.length < (estudo.documentos?.length || 0) ? docIdsFiltrados : undefined,
            textoExtra: undefined,
            lote: loteAtual,
          }),
        });
        const json = await res.json();
        if (!json.success) throw new Error(json.error);

        const { data } = json;
        // Atualizar paginacao
        if (data.paginacao) {
          totalLotes = data.paginacao.totalLotes;
          concluido = data.paginacao.concluido;
        } else {
          concluido = true;
        }

        // Acumular resultados
        if (data.itens?.length) todosItens.push(...data.itens);
        if (data.pesoTotalProjeto) pesoTotal = (pesoTotal || 0) + data.pesoTotalProjeto;
        if (data.composicao) composicao = data.composicao;
        if (data.observacoes) observacoes.push(data.observacoes);
        if (data.docsAnalisados?.length) docsAnalisados.push(...data.docsAnalisados);

        loteAtual++;
        setProgressoIA({ loteAtual, totalLotes, itensAcumulados: todosItens.length });
      }

      if (!todosItens.length) {
        showToast("Nenhum item de peso encontrado nos documentos");
        return;
      }

      setResultadoIA({
        itens: todosItens,
        pesoTotalProjeto: pesoTotal,
        composicao,
        observacoes: observacoes.join(" | "),
        docsAnalisados,
      });
    } catch (e) {
      showToast(`Erro: ${e.message}`);
      // Se ja acumulou itens, mostrar parcial
      if (todosItens.length > 0) {
        setResultadoIA({
          itens: todosItens,
          pesoTotalProjeto: pesoTotal,
          composicao,
          observacoes: observacoes.join(" | ") + " (analise parcial - erro no lote seguinte)",
          docsAnalisados,
        });
      }
    } finally {
      setAnalisandoIA(false);
      setProgressoIA(null);
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
      custoUnitario: item.custoUnitario ?? "",
    });
  };

  const salvarEdicao = async () => {
    try {
      const pu = parseFloat(editValores.pesoUnitario) || 0;
      const comp = parseFloat(editValores.comprimento) || 0;
      const qtd = parseInt(editValores.quantidade) || 1;
      const pesoTotal = comp > 0 ? pu * comp * qtd : pu * qtd;

      const custoUnit = parseFloat(editValores.custoUnitario) || null;
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
          custoUnitario: custoUnit,
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

  const salvandoCustoRef = useRef(false);
  const salvarCustoRapido = async (itemId) => {
    if (salvandoCustoRef.current) return;
    salvandoCustoRef.current = true;
    const custo = parseFloat(editCustoValor) || null;
    try {
      const res = await fetch(`/api/comercial/estudo/${estudoId}/itens`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId, custoUnitario: custo }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setItens((prev) => prev.map((i) => i.id === itemId ? { ...i, custoUnitario: custo } : i));
      showToast("Custo atualizado");
    } catch (e) {
      showToast(`Erro: ${e.message}`);
    } finally {
      setEditandoCustoId(null);
      setEditCustoValor("");
      salvandoCustoRef.current = false;
    }
  };

  const salvarPerda = async () => {
    const valor = parseFloat(editPerdaValor);
    const perda = isNaN(valor) ? 0 : Math.max(0, Math.min(100, valor));
    try {
      const res = await fetch(`/api/comercial/estudo/${estudoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ percPerda: perda }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      onEstudoUpdate?.({ percPerda: perda });
      showToast("Perda atualizada");
    } catch (e) {
      showToast(`Erro: ${e.message}`);
    } finally {
      setEditandoPerda(false);
    }
  };

  // ── Enviar cotacao para fornecedores ──
  const handleEnviarCotacao = async (dados) => {
    const res = await fetch(`/api/comercial/estudo/${estudoId}/cotacao-materiais`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tipo: "MATERIAIS", ...dados }),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error);
    setCotacoes(json.data);
    const enviados = (json.resultados || []).filter((r) => r.emailOk).length;
    showToast(`Cotacao enviada para ${enviados} fornecedor${enviados !== 1 ? "es" : ""}`);
  };

  const handleExcluirCotacao = async (cotacaoId) => {
    try {
      const res = await fetch(`/api/comercial/estudo/${estudoId}/cotacao-materiais?cotacaoId=${cotacaoId}`, { method: "DELETE" });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setCotacoes((prev) => prev.filter((c) => c.id !== cotacaoId));
      showToast("Cotacao removida");
    } catch (e) {
      showToast(`Erro: ${e.message}`);
    }
  };

  const handleStatusCotacao = async (cotacaoId, status) => {
    try {
      const res = await fetch(`/api/comercial/estudo/${estudoId}/cotacao-materiais`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cotacaoId, status }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setCotacoes((prev) => prev.map((c) => (c.id === cotacaoId ? json.data : c)));
      showToast(`Status alterado`);
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
          <div className="w-px h-10 bg-gray-200" />
          <div>
            <p className="text-xs text-torg-gray uppercase tracking-wider font-medium">
              Perda
            </p>
            {editandoPerda ? (
              <div className="flex items-center gap-1 mt-0.5">
                <input
                  type="number"
                  autoFocus
                  value={editPerdaValor}
                  onChange={(e) => setEditPerdaValor(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") salvarPerda();
                    if (e.key === "Escape") setEditandoPerda(false);
                  }}
                  onBlur={salvarPerda}
                  className="w-16 px-2 py-1 border border-torg-blue rounded-lg text-lg font-bold text-right outline-none focus:ring-1 focus:ring-torg-blue/30"
                  step="0.1"
                  min="0"
                  max="100"
                />
                <span className="text-lg font-bold text-amber-600">%</span>
              </div>
            ) : (
              <p
                onClick={() => { setEditandoPerda(true); setEditPerdaValor(estudo.percPerda ?? 12); }}
                className="text-2xl font-bold text-amber-600 cursor-pointer hover:text-amber-700 hover:underline transition-colors"
                title="Clique para editar % de perda"
              >
                {estudo.percPerda > 0
                  ? <>{estudo.percPerda}% <span className="text-base font-normal text-torg-gray">(+ {fmtNum(pesoTotalItens * estudo.percPerda / 100, 0)} kg)</span></>
                  : <span className="text-gray-300 text-lg">editar</span>
                }
              </p>
            )}
          </div>
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
          {itens.length > 0 && (
            <button
              onClick={() => setShowCotacaoModal(true)}
              className="flex items-center gap-2 px-4 py-2 border border-torg-blue text-torg-blue rounded-xl text-sm font-medium hover:bg-torg-blue/5 transition-colors"
            >
              <Send size={15} />
              Enviar para Cotacao
            </button>
          )}
          {(estudo.documentos?.length || 0) > 0 && (
            <button
              onClick={handleAnalisarIA}
              disabled={analisandoIA}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-torg-dark rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {analisandoIA ? <Loader2 size={15} className="animate-spin text-torg-gray" /> : <Sparkles size={15} className="text-torg-gray" />}
              {analisandoIA
                ? progressoIA
                  ? `Analisando... (${progressoIA.itensAcumulados} itens)`
                  : "Analisando..."
                : "Analisar com IA"}
            </button>
          )}
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-torg-blue text-white rounded-xl text-sm font-medium hover:bg-torg-dark transition-colors"
          >
            <Plus size={15} />
            Novo Item
          </button>
        </div>
      </div>

      {/* Progresso da analise IA */}
      {analisandoIA && progressoIA && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-torg-dark flex items-center gap-2">
              <Loader2 size={14} className="animate-spin text-torg-gray" />
              Analisando documentos...
            </span>
            <span className="text-xs text-torg-gray">
              Lote {progressoIA.loteAtual}/{progressoIA.totalLotes} · {progressoIA.itensAcumulados} itens
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-1.5">
            <div
              className="bg-torg-blue h-1.5 rounded-full transition-all duration-500"
              style={{ width: `${Math.max(5, (progressoIA.loteAtual / progressoIA.totalLotes) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Aviso de itens sem cadastro Omie */}
      {itens.length > 0 && (() => {
        const semOmie = itens.filter(i => !i.codigoOmie);
        if (semOmie.length === 0) return null;
        return (
          <div className="flex items-start gap-2.5 px-3.5 py-2.5 bg-amber-50/70 border border-amber-100 rounded-xl text-xs text-amber-700">
            <AlertCircle size={14} className="mt-0.5 shrink-0" />
            <span>
              <strong>{semOmie.length} {semOmie.length === 1 ? "item" : "itens"}</strong> sem vinculo no cadastro Omie — custo estimado pela media da familia.
              Cadastre no Omie para valores exatos.
            </span>
          </div>
        );
      })()}

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
            {(estudo.documentos?.length || 0) > 0 && (
              <button
                onClick={handleAnalisarIA}
                disabled={analisandoIA}
                className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 text-torg-dark rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {analisandoIA ? <Loader2 size={15} className="animate-spin text-torg-gray" /> : <Sparkles size={15} className="text-torg-gray" />}
                {analisandoIA ? "Analisando..." : "Analisar com IA"}
              </button>
            )}
            <button
              onClick={() => setShowModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-torg-blue text-white rounded-xl text-sm font-medium hover:bg-torg-dark transition-colors"
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
                <tr className="text-left text-xs font-semibold text-torg-gray uppercase tracking-wider whitespace-nowrap">
                  <th className="pl-4 pr-2 py-3 w-8">#</th>
                  <th className="px-2 py-3">Setor</th>
                  <th className="px-2 py-3">Descricao</th>
                  <th className="px-2 py-3">Tipo</th>
                  <th className="px-2 py-3 text-right">Comp.</th>
                  <th className="px-2 py-3 text-right">Peso un.</th>
                  <th className="px-2 py-3 text-right">Qtd</th>
                  <th className="px-2 py-3 text-right">Peso total</th>
                  <th className="px-2 py-3 text-right">R$/kg</th>
                  <th className="px-2 py-3 text-right">Custo</th>
                  <th className="px-2 py-3 w-14"></th>
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
                      <td className="pl-4 pr-2 py-2.5 text-torg-gray text-xs">{idx + 1}</td>

                      {isEditando ? (
                        <>
                          <td className="px-2 py-2">
                            <input
                              type="text"
                              value={editValores.setor}
                              onChange={(e) => setEditValores((p) => ({ ...p, setor: e.target.value }))}
                              className="w-full px-2 py-1 border border-gray-200 rounded-lg text-sm outline-none focus:border-torg-blue"
                              placeholder="Setor"
                            />
                          </td>
                          <td className="px-2 py-2">
                            <input
                              type="text"
                              value={editValores.descricao}
                              onChange={(e) => setEditValores((p) => ({ ...p, descricao: e.target.value }))}
                              className="w-full px-2 py-1 border border-gray-200 rounded-lg text-sm outline-none focus:border-torg-blue"
                            />
                          </td>
                          <td className="px-2 py-2.5 text-xs text-torg-gray">
                            {TIPO_MATERIAL_LABELS[detectTipoMaterial(editValores.descricao)] || "Outro"}
                          </td>
                          <td className="px-2 py-2 text-right">
                            <input
                              type="number"
                              value={editValores.comprimento}
                              onChange={(e) => setEditValores((p) => ({ ...p, comprimento: e.target.value }))}
                              className="w-16 px-1.5 py-1 border border-gray-200 rounded-lg text-sm text-right outline-none focus:border-torg-blue"
                              step="0.01"
                              min="0"
                            />
                          </td>
                          <td className="px-2 py-2 text-right">
                            <input
                              type="number"
                              value={editValores.pesoUnitario}
                              onChange={(e) => setEditValores((p) => ({ ...p, pesoUnitario: e.target.value }))}
                              className="w-16 px-1.5 py-1 border border-gray-200 rounded-lg text-sm text-right outline-none focus:border-torg-blue"
                              step="0.01"
                              min="0"
                            />
                          </td>
                          <td className="px-2 py-2 text-right">
                            <input
                              type="number"
                              value={editValores.quantidade}
                              onChange={(e) => setEditValores((p) => ({ ...p, quantidade: e.target.value }))}
                              className="w-12 px-1.5 py-1 border border-gray-200 rounded-lg text-sm text-right outline-none focus:border-torg-blue"
                              min="1"
                            />
                          </td>
                          <td className="px-2 py-2.5 text-right font-semibold text-torg-dark text-xs">
                            {(() => {
                              const pu = parseFloat(editValores.pesoUnitario) || 0;
                              const c = parseFloat(editValores.comprimento) || 0;
                              const q = parseInt(editValores.quantidade) || 1;
                              return fmtNum(c > 0 ? pu * c * q : pu * q, 1);
                            })()}
                          </td>
                          <td className="px-2 py-2 text-right">
                            <input
                              type="number"
                              value={editValores.custoUnitario}
                              onChange={(e) => setEditValores((p) => ({ ...p, custoUnitario: e.target.value }))}
                              className="w-20 px-1.5 py-1 border border-gray-200 rounded-lg text-sm text-right outline-none focus:border-torg-blue"
                              step="0.01"
                              min="0"
                              placeholder="R$/kg"
                            />
                          </td>
                          <td className="px-2 py-2.5 text-right text-xs text-torg-dark whitespace-nowrap">
                            {(() => {
                              const pu = parseFloat(editValores.pesoUnitario) || 0;
                              const c = parseFloat(editValores.comprimento) || 0;
                              const q = parseInt(editValores.quantidade) || 1;
                              const peso = c > 0 ? pu * c * q : pu * q;
                              const custo = parseFloat(editValores.custoUnitario) || 0;
                              return custo > 0 ? fmtMoeda(custo * peso) : "—";
                            })()}
                          </td>
                          <td className="px-2 py-2.5">
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
                          <td className="px-2 py-2 text-torg-gray text-xs whitespace-nowrap">
                            {item.setor || "—"}
                          </td>
                          <td className="px-2 py-2 font-medium text-torg-dark text-xs">
                            {item.descricao}
                            {item.norma && (
                              <span className="ml-1.5 text-[10px] text-torg-gray font-normal">{item.norma}</span>
                            )}
                          </td>
                          <td className="px-2 py-2 text-xs text-torg-gray whitespace-nowrap">
                            {TIPO_MATERIAL_LABELS[item.tipoMaterial] || "Outro"}
                          </td>
                          <td className="px-2 py-2 text-right text-xs text-torg-dark whitespace-nowrap">
                            {item.comprimento ? fmtNum(item.comprimento) : "—"}
                          </td>
                          <td className="px-2 py-2 text-right text-xs text-torg-dark whitespace-nowrap">
                            {fmtNum(item.pesoUnitario)}
                          </td>
                          <td className="px-2 py-2 text-right text-xs text-torg-dark whitespace-nowrap">
                            {item.quantidade}
                          </td>
                          <td className="px-2 py-2 text-right text-xs font-semibold text-torg-dark whitespace-nowrap">
                            {fmtNum(item.pesoTotal, 1)}
                          </td>
                          <td className="px-2 py-2 text-right text-xs whitespace-nowrap">
                            {item.codigoOmie ? (
                              // Omie: valor fixo, não editável
                              <span className="text-torg-gray">
                                {item.custoUnitario > 0 ? fmtNum(item.custoUnitario, 2) : "—"}
                              </span>
                            ) : editandoCustoId === item.id ? (
                              <div className="flex items-center justify-end gap-1">
                                <input
                                  type="number"
                                  autoFocus
                                  value={editCustoValor}
                                  onChange={(e) => setEditCustoValor(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") salvarCustoRapido(item.id);
                                    if (e.key === "Escape") { setEditandoCustoId(null); setEditCustoValor(""); }
                                  }}
                                  onBlur={() => salvarCustoRapido(item.id)}
                                  className="w-20 px-1.5 py-0.5 border border-torg-blue rounded-lg text-sm text-right outline-none focus:ring-1 focus:ring-torg-blue/30"
                                  step="0.01"
                                  min="0"
                                  placeholder="0.00"
                                />
                              </div>
                            ) : (
                              <span
                                onClick={() => { setEditandoCustoId(item.id); setEditCustoValor(item.custoUnitario || ""); }}
                                className="cursor-pointer hover:text-torg-blue hover:underline transition-colors text-torg-gray"
                                title="Clique para editar R$/kg"
                              >
                                {item.custoUnitario > 0
                                  ? <>{fmtNum(item.custoUnitario, 2)}<span className="text-amber-500 ml-0.5" title="Manual (sem cadastro Omie)">*</span></>
                                  : <span className="text-gray-300">editar</span>
                                }
                              </span>
                            )}
                          </td>
                          <td className="px-2 py-2 text-right text-xs text-torg-dark whitespace-nowrap">
                            {item.custoUnitario > 0
                              ? fmtMoeda(item.custoUnitario * item.pesoTotal)
                              : "—"
                            }
                          </td>
                          <td className="px-2 py-2">
                            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={() => iniciarEdicao(item)}
                                className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
                                title="Editar"
                              >
                                <Edit3 size={14} className="text-torg-gray" />
                              </button>
                              <button
                                onClick={() => handleExcluirItem(item.id)}
                                disabled={excluindoId === item.id}
                                className="p-1 hover:bg-red-50 rounded-lg transition-colors"
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
                {(() => {
                  const custoTotal = itensFiltrados.reduce((s, i) => s + ((i.custoUnitario || 0) * (i.pesoTotal || 0)), 0);
                  const pesoComCusto = itensFiltrados.filter(i => i.custoUnitario > 0).reduce((s, i) => s + i.pesoTotal, 0);
                  const cmcMedio = pesoComCusto > 0 ? custoTotal / pesoComCusto : 0;
                  const temPerda = estudo.percPerda > 0;
                  const pesoComPerda = pesoTotalItens * (1 + (estudo.percPerda || 0) / 100);
                  const custoComPerda = custoTotal * (1 + (estudo.percPerda || 0) / 100);

                  return (
                    <>
                      <tr className="text-xs">
                        <td colSpan={7} className="px-2 py-2.5 text-right text-torg-dark font-semibold uppercase tracking-wider">
                          Subtotal {filtroSetor ? `(${filtroSetor})` : ""}
                        </td>
                        <td className="px-2 py-2.5 text-right text-torg-dark font-semibold whitespace-nowrap">
                          {fmtNum(pesoTotalItens, 0)} kg
                        </td>
                        <td className="px-2 py-2.5 text-right text-torg-gray whitespace-nowrap">
                          {cmcMedio > 0 ? fmtNum(cmcMedio, 2) : ""}
                        </td>
                        <td className="px-2 py-2.5 text-right text-torg-dark font-semibold whitespace-nowrap">
                          {custoTotal > 0 ? fmtMoeda(custoTotal) : ""}
                        </td>
                        <td></td>
                      </tr>
                      {temPerda && (
                        <tr className="text-xs text-amber-700">
                          <td colSpan={7} className="px-2 py-2 text-right uppercase tracking-wider">
                            + Perdas e ligacoes ({estudo.percPerda}%)
                          </td>
                          <td className="px-2 py-2 text-right font-medium whitespace-nowrap">
                            {fmtNum(pesoTotalItens * estudo.percPerda / 100, 0)} kg
                          </td>
                          <td></td>
                          <td className="px-2 py-2 text-right font-medium whitespace-nowrap">
                            {custoTotal > 0 ? fmtMoeda(custoTotal * estudo.percPerda / 100) : ""}
                          </td>
                          <td></td>
                        </tr>
                      )}
                      {temPerda && (
                        <tr className="text-xs border-t border-gray-200">
                          <td colSpan={7} className="px-2 py-2.5 text-right text-torg-blue font-bold uppercase tracking-wider">
                            Total geral
                          </td>
                          <td className="px-2 py-2.5 text-right text-torg-blue font-bold whitespace-nowrap">
                            {fmtNum(pesoComPerda, 0)} kg
                          </td>
                          <td></td>
                          <td className="px-2 py-2.5 text-right text-torg-blue font-bold whitespace-nowrap">
                            {custoComPerda > 0 ? fmtMoeda(custoComPerda) : ""}
                          </td>
                          <td></td>
                        </tr>
                      )}
                    </>
                  );
                })()}
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Documentos */}
      <SecaoDocumentos
        estudoId={estudoId}
        documentos={estudo.documentos}
        sharepointUrl={estudo.sharepointUrl}
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

      {/* Modal cotacao materiais */}
      {showCotacaoModal && (
        <SolicitarCotacaoMateriaisModal
          onClose={() => setShowCotacaoModal(false)}
          onEnviar={handleEnviarCotacao}
        />
      )}

      {/* Cotacoes enviadas */}
      {cotacoes.length > 0 && (
        <CotacoesMateriaisSection
          cotacoes={cotacoes}
          onExcluir={handleExcluirCotacao}
          onStatus={handleStatusCotacao}
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

// ── Modal Cotacao Materiais ─────────────────────────────────

function SolicitarCotacaoMateriaisModal({ onClose, onEnviar }) {
  const [busca, setBusca] = useState("");
  const [fornecedores, setFornecedores] = useState([]);
  const [carregando, setCarregando] = useState(false);
  const [selecionados, setSelecionados] = useState([]);
  const [observacao, setObservacao] = useState("");
  const [prazoResposta, setPrazoResposta] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const timeoutRef = useRef(null);

  const buscarFornecedores = async (termo) => {
    setCarregando(true);
    try {
      const params = new URLSearchParams({ busca: termo });
      const res = await fetch(`/api/fornecedores?${params}`);
      const json = await res.json();
      setFornecedores(json.fornecedores || []);
    } catch {} finally {
      setCarregando(false);
    }
  };

  useEffect(() => { buscarFornecedores(""); }, []);

  const handleBusca = (valor) => {
    setBusca(valor);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => buscarFornecedores(valor), 300);
  };

  const toggleFornecedor = (f) => {
    setSelecionados((prev) => {
      const existe = prev.find((s) => s.id === f.id);
      if (existe) return prev.filter((s) => s.id !== f.id);
      return [...prev, { id: f.id, nome: f.nomeFantasia || f.razaoSocial, email: f.email }];
    });
  };

  const handleEnviar = async () => {
    if (selecionados.length === 0) return setErro("Selecione ao menos um fornecedor");
    setEnviando(true);
    setErro("");
    try {
      await onEnviar({ fornecedores: selecionados, observacao: observacao.trim() || undefined, prazoResposta: prazoResposta.trim() || undefined });
      onClose();
    } catch (e) {
      setErro(e.message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-torg-dark">Solicitar Cotacao de Materiais</h2>
            <p className="text-sm text-torg-gray mt-0.5">Selecione fornecedores para enviar</p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg"><X size={20} className="text-gray-400" /></button>
        </div>

        <div className="px-6 py-3 border-b border-gray-100 shrink-0">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="text" value={busca} onChange={(e) => handleBusca(e.target.value)} placeholder="Buscar fornecedor por nome, CNPJ, cidade..." className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue outline-none" autoFocus />
          </div>
          {selecionados.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {selecionados.map((s) => (
                <span key={s.id} className="inline-flex items-center gap-1 px-2 py-1 bg-torg-blue/10 text-torg-blue rounded-lg text-xs font-medium">
                  {s.nome}
                  <button onClick={() => toggleFornecedor(s)} className="hover:text-red-500"><X size={12} /></button>
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-2">
          {carregando ? (
            <div className="flex items-center justify-center py-8"><Loader2 size={20} className="animate-spin text-torg-blue" /></div>
          ) : fornecedores.length === 0 ? (
            <p className="text-sm text-torg-gray text-center py-8">Nenhum fornecedor encontrado</p>
          ) : (
            <div className="space-y-1">
              {fornecedores.map((f) => {
                const marcado = selecionados.some((s) => s.id === f.id);
                return (
                  <button key={f.id} onClick={() => f.email ? toggleFornecedor(f) : null} disabled={!f.email}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors ${marcado ? "bg-torg-blue/10 border border-torg-blue/30" : "hover:bg-gray-50 border border-transparent"} ${!f.email ? "opacity-50 cursor-not-allowed" : ""}`}
                  >
                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 ${marcado ? "bg-torg-blue border-torg-blue" : "border-gray-300"}`}>
                      {marcado && <Check size={12} className="text-white" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-torg-dark truncate block">{f.nomeFantasia || f.razaoSocial}</span>
                      <span className="text-xs text-torg-gray">{f.email || "sem email"}{f.cidade ? ` — ${f.cidade}/${f.uf}` : ""}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 shrink-0 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-torg-dark mb-1">Prazo para resposta</label>
              <input type="text" value={prazoResposta} onChange={(e) => setPrazoResposta(e.target.value)} placeholder="Ex: 3 dias uteis" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-1 focus:ring-torg-blue/30 outline-none" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-torg-dark mb-1">Observacao</label>
              <input type="text" value={observacao} onChange={(e) => setObservacao(e.target.value)} placeholder="Opcional..." className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-1 focus:ring-torg-blue/30 outline-none" />
            </div>
          </div>
          {erro && <p className="text-sm text-red-600">{erro}</p>}
          <div className="flex items-center justify-between">
            <span className="text-sm text-torg-gray"><strong className="text-torg-dark">{selecionados.length}</strong> fornecedor{selecionados.length !== 1 ? "es" : ""} selecionado{selecionados.length !== 1 ? "s" : ""}</span>
            <div className="flex items-center gap-3">
              <button onClick={onClose} className="px-4 py-2 text-sm text-torg-gray hover:text-torg-dark transition-colors">Cancelar</button>
              <button onClick={handleEnviar} disabled={enviando || selecionados.length === 0}
                className="flex items-center gap-2 px-5 py-2.5 bg-torg-blue text-white rounded-xl text-sm font-semibold hover:bg-torg-dark transition-colors disabled:opacity-50"
              >
                {enviando ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                {enviando ? "Enviando..." : "Enviar Cotacao"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Secao Cotacoes Materiais (inline em AbaPesoProjeto) ────

const STATUS_COTACAO = {
  PENDENTE:    { label: "Pendente",    icon: Clock,         color: "text-amber-600 bg-amber-50 border-amber-200" },
  RECEBIDA:    { label: "Recebida",    icon: CheckCircle2,  color: "text-emerald-600 bg-emerald-50 border-emerald-200" },
  SELECIONADA: { label: "Selecionada", icon: CheckCircle2,  color: "text-torg-blue bg-torg-blue/10 border-torg-blue/30" },
  RECUSADA:    { label: "Recusada",    icon: XCircle,       color: "text-red-600 bg-red-50 border-red-200" },
};

function CotacoesMateriaisSection({ cotacoes, onExcluir, onStatus }) {
  const [expandido, setExpandido] = useState(null);
  const [excluindoId, setExcluindoId] = useState(null);

  const handleExcluir = async (id) => {
    setExcluindoId(id);
    await onExcluir(id);
    setExcluindoId(null);
  };

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-torg-dark flex items-center gap-2">
        <Package size={16} className="text-torg-blue" />
        Cotacoes de Materiais ({cotacoes.length})
      </h3>
      <div className="space-y-2">
        {cotacoes.map((cot) => {
          const cfg = STATUS_COTACAO[cot.status] || STATUS_COTACAO.PENDENTE;
          const Icon = cfg.icon;
          const aberto = expandido === cot.id;
          const totalCotado = (cot.itens || []).reduce((s, i) => s + (i.precoUnitario || 0) * (i.quantidade || 0), 0);
          const itensCotados = (cot.itens || []).filter((i) => i.precoUnitario != null).length;

          return (
            <div key={cot.id} className="border border-gray-100 rounded-xl overflow-hidden">
              <button onClick={() => setExpandido(aberto ? null : cot.id)} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50/50 transition-colors text-left">
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border ${cfg.color}`}>
                  <Icon size={12} /> {cfg.label}
                </span>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-torg-dark">{cot.fornecedorNome}</span>
                  <span className="text-xs text-torg-gray ml-2">{cot.fornecedorEmail}</span>
                </div>
                {cot.status === "RECEBIDA" && totalCotado > 0 && (
                  <span className="text-sm font-bold text-emerald-700 whitespace-nowrap">{fmtMoeda(totalCotado)}</span>
                )}
                {cot.prazoEntrega && <span className="text-xs text-torg-gray whitespace-nowrap">Prazo: {cot.prazoEntrega}</span>}
                {aberto ? <ChevronUp size={16} className="text-gray-400 shrink-0" /> : <ChevronDown size={16} className="text-gray-400 shrink-0" />}
              </button>

              {aberto && (
                <div className="px-4 pb-4 border-t border-gray-100">
                  {cot.itens?.length > 0 && (
                    <div className="overflow-x-auto mt-3">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-xs text-torg-gray border-b border-gray-100">
                            <th className="pb-2 pr-2">#</th>
                            <th className="pb-2 px-2">Descricao</th>
                            <th className="pb-2 px-2 text-center">Unid.</th>
                            <th className="pb-2 px-2 text-right">Qtd</th>
                            <th className="pb-2 px-2 text-right">Preco Unit.</th>
                            <th className="pb-2 px-2 text-right">Subtotal</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {cot.itens.map((item, idx) => {
                            const sub = (item.precoUnitario || 0) * (item.quantidade || 0);
                            return (
                              <tr key={item.id}>
                                <td className="py-2 pr-2 text-xs text-gray-400">{idx + 1}</td>
                                <td className="py-2 px-2 text-torg-dark">{item.descricao}</td>
                                <td className="py-2 px-2 text-center text-torg-gray">{item.unidade}</td>
                                <td className="py-2 px-2 text-right">{fmtNum(item.quantidade, item.quantidade % 1 === 0 ? 0 : 2)}</td>
                                <td className="py-2 px-2 text-right font-medium">
                                  {item.precoUnitario != null ? fmtMoeda(item.precoUnitario) : <span className="text-gray-300">—</span>}
                                </td>
                                <td className="py-2 px-2 text-right font-medium whitespace-nowrap">
                                  {item.precoUnitario != null ? fmtMoeda(sub) : <span className="text-gray-300">—</span>}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                        {totalCotado > 0 && (
                          <tfoot>
                            <tr className="border-t border-gray-200">
                              <td colSpan={4}></td>
                              <td className="py-2 px-2 text-right text-xs font-bold text-torg-dark uppercase">Total</td>
                              <td className="py-2 px-2 text-right font-bold text-torg-dark whitespace-nowrap">{fmtMoeda(totalCotado)}</td>
                            </tr>
                          </tfoot>
                        )}
                      </table>
                    </div>
                  )}

                  <div className="flex items-center gap-4 mt-3 text-xs text-torg-gray">
                    {cot.condicaoPgto && <span>Pgto: <strong className="text-torg-dark">{cot.condicaoPgto}</strong></span>}
                    {cot.observacao && <span>Obs: {cot.observacao}</span>}
                    {cot.enviadoEm && <span>Enviado: {new Date(cot.enviadoEm).toLocaleDateString("pt-BR")}</span>}
                    {cot.respondidoEm && <span>Respondido: {new Date(cot.respondidoEm).toLocaleDateString("pt-BR")}</span>}
                    <span>{itensCotados}/{(cot.itens || []).length} itens cotados</span>
                  </div>

                  <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
                    {cot.status === "RECEBIDA" && (
                      <>
                        <button onClick={() => onStatus(cot.id, "SELECIONADA")} className="flex items-center gap-1.5 px-3 py-1.5 bg-torg-blue text-white rounded-lg text-xs font-medium hover:bg-torg-dark transition-colors">
                          <CheckCircle2 size={12} /> Selecionar
                        </button>
                        <button onClick={() => onStatus(cot.id, "RECUSADA")} className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 text-torg-gray rounded-lg text-xs font-medium hover:bg-gray-50 transition-colors">
                          <XCircle size={12} /> Recusar
                        </button>
                      </>
                    )}
                    {cot.status === "PENDENTE" && (
                      <span className="text-xs text-amber-600 flex items-center gap-1"><Clock size={12} /> Aguardando resposta do fornecedor</span>
                    )}
                    <div className="flex-1" />
                    <button onClick={() => handleExcluir(cot.id)} disabled={excluindoId === cot.id}
                      className="flex items-center gap-1 px-2 py-1 text-xs text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {excluindoId === cot.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                      Excluir
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
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
      <div className="overflow-x-auto bg-white rounded-xl border border-gray-100 p-1 shadow-sm">
        <div className="flex items-center gap-1 min-w-max">
          {ABAS.map((aba) => {
            const ativo = abaAtiva === aba.id;
            return (
              <button
                key={aba.id}
                onClick={() => setAbaAtiva(aba.id)}
                className={`px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                  ativo
                    ? "bg-torg-blue text-white shadow-sm"
                    : "text-torg-gray hover:bg-gray-50 hover:text-torg-dark"
                }`}
              >
                {aba.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Conteudo da aba */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        {abaAtiva === "geral" && <AbaGeral estudo={estudo} onSave={handleSave} />}
        {abaAtiva === "produtividade" && (
          <AbaProdutividade
            estudo={estudo}
            estudoId={estudoId}
            onEstudoUpdate={handleEstudoUpdate}
          />
        )}
        {abaAtiva === "materiais" && (
          <AbaPesoProjeto
            estudo={estudo}
            estudoId={estudoId}
            onEstudoUpdate={handleEstudoUpdate}
          />
        )}
        {abaAtiva === "acessorios" && (
          <AbaAcessorios
            estudo={estudo}
            estudoId={estudoId}
          />
        )}
        {abaAtiva === "parafusos" && (
          <AbaParafusos
            estudo={estudo}
            estudoId={estudoId}
            onEstudoUpdate={handleEstudoUpdate}
          />
        )}
        {abaAtiva === "pintura" && (
          <AbaPintura
            estudo={estudo}
            estudoId={estudoId}
            onEstudoUpdate={handleEstudoUpdate}
          />
        )}
        {abaAtiva === "custos" && (
          <AbaCustos
            estudo={estudo}
            estudoId={estudoId}
            onEstudoUpdate={handleEstudoUpdate}
          />
        )}
        {abaAtiva === "montagem" && (
          <AbaMontagem
            estudo={estudo}
            estudoId={estudoId}
          />
        )}
        {abaAtiva === "fretes" && (
          <AbaFretes
            estudo={estudo}
            estudoId={estudoId}
          />
        )}
        {abaAtiva === "cronograma" && (
          <AbaCronograma
            estudo={estudo}
            estudoId={estudoId}
          />
        )}
        {abaAtiva === "impostos" && (
          <AbaImpostos
            estudo={estudo}
            estudoId={estudoId}
            onEstudoUpdate={handleEstudoUpdate}
          />
        )}
        {abaAtiva === "resumo" && (
          <AbaResumo estudo={estudo} />
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
