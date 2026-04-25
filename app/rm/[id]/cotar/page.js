"use client";

import { useState, useMemo, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { uid, today, fmt } from "@/lib/utils";
import { findRmIndexSmart } from "@/lib/product-matcher";
import {
  ArrowLeft, Save, Trash2, Paperclip, AlertCircle, Info, FileText, Loader2,
} from "lucide-react";

// ─── Constantes ──────────────────────────────────────────────
const DISPONIBILIDADES = [
  { key: "Suficiente", cor: "green", elegivel: true, descr: "Tem estoque para atender a qtd solicitada" },
  { key: "Sob encomenda", cor: "amber", elegivel: true, descr: "Produz/entrega num prazo informado" },
  { key: "Parcial", cor: "orange", elegivel: false, descr: "Só tem parte da qtd solicitada" },
  { key: "Não tem", cor: "red", elegivel: false, descr: "Fornecedor não consegue atender" },
  { key: "Não cotou", cor: "gray", elegivel: false, descr: "Item não incluído na proposta" },
];
const TIPOS_FRETE = ["CIF", "FOB", "Retira"];

// ─── Helpers ─────────────────────────────────────────────────
function calcPrecoLiquido(precoBruto, { icmsPct, pisPct, cofinsPct, ipiPct, creditaIpi, faturamento }) {
  if (faturamento !== "Torg") return Number(precoBruto) || 0;
  const creditTotal =
    (Number(icmsPct) || 0) +
    (Number(pisPct) || 0) +
    (Number(cofinsPct) || 0) +
    (creditaIpi ? Number(ipiPct) || 0 : 0);
  return (Number(precoBruto) || 0) * (1 - creditTotal / 100);
}


function readAsDataURL(file) {
  return new Promise((res) => {
    const r = new FileReader();
    r.onload = (e) => res(e.target.result);
    r.readAsDataURL(file);
  });
}

// ─── Componente ──────────────────────────────────────────────
export default function LancarCotacaoPage({ params }) {
  const { id } = params;
  const router = useRouter();
  const { rms, setRms, fornecedores, showToast, loaded } = useStore();
  const fileRef = useRef(null);

  const rm = rms.find((r) => r.id === id);

  // Cabeçalho
  const [fornecedorId, setFornecedorId] = useState("");
  const [fornecedorNome, setFornecedorNome] = useState("");
  const [dataCotacao, setDataCotacao] = useState(today());
  const [validade, setValidade] = useState("");
  const [prazoPagamento, setPrazoPagamento] = useState("");
  const [tipoFrete, setTipoFrete] = useState("CIF");
  const [faturamento, setFaturamento] = useState("Torg");
  const [icmsPctDefault, setIcmsPctDefault] = useState("");
  const [pisPct, setPisPct] = useState("1.65");
  const [cofinsPct, setCofinsPct] = useState("7.6");
  const [creditaIpi, setCreditaIpi] = useState(true);
  const [anexo, setAnexo] = useState(null);

  // Importação de PDF
  const [importingPdf, setImportingPdf] = useState(false);
  const [importInfo, setImportInfo] = useState(null);
  const pdfRef = useRef(null);

  // Itens (inicia com uma linha por item da RM)
  const [itens, setItens] = useState(() =>
    (rm?.itens || []).map((ri) => ({
      rmItemId: ri.id,
      descricao: ri.descricao || ri.item || "",
      qtdSolicitada: Number(ri.qtd) || 0,
      unidade: ri.unidade || "",
      codigoOmie: ri.codigo || "",
      precoUnit: "",
      qtdCotada: Number(ri.qtd) || 0,
      disponibilidade: "Suficiente",
      icmsPct: "",
      ipiPct: "",
      prazoEntrega: "",
      observacao: "",
    }))
  );

  // Ao escolher um fornecedor do dropdown, preenche os campos que ele tem
  const onSelectFornecedor = (fid) => {
    setFornecedorId(fid);
    const f = fornecedores.find((x) => x.id === fid);
    if (f) {
      setFornecedorNome(f.nome || "");
      setPrazoPagamento(f.parcelas ? `${f.parcelas}x` : "");
      if (f.icmsPadrao) setIcmsPctDefault(String(f.icmsPadrao));
    }
  };

  // ─── Importar PDF ─────────────────────────────────────────
  const importarPdf = async (file) => {
    if (!file) return;
    setImportingPdf(true);
    setImportInfo(null);
    try {
      const dataUrl = await readAsDataURL(file);
      const resp = await fetch("/api/parse-pdf-cotacao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ base64: dataUrl }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || "Falha na API");

      // Pré-preenche cabeçalho
      if (data.fornecedor && !fornecedorNome) setFornecedorNome(data.fornecedor);
      if (data.prazoPagamento && !prazoPagamento) setPrazoPagamento(data.prazoPagamento);

      // Mapeia itens do PDF de volta pros itens da RM
      const rmItens = rm.itens || [];
      let casados = 0;
      let semMatch = [];
      setItens((prev) => {
        const copy = [...prev];
        for (const pdfIt of data.itens || []) {
          const idx = findRmIndexSmart(pdfIt, rmItens);
          if (idx >= 0) {
            copy[idx] = {
              ...copy[idx],
              precoUnit: String(pdfIt.precoUnit || ""),
              qtdCotada: Number(pdfIt.qtdCotada ?? pdfIt.qtd ?? copy[idx].qtdSolicitada),
              icmsPct: String(pdfIt.icmsPct || ""),
              ipiPct: String(pdfIt.ipiPct || ""),
              disponibilidade: pdfIt.disponibilidade || "Suficiente",
            };
            casados++;
          } else {
            semMatch.push(pdfIt.descricao || pdfIt.item);
          }
        }
        return copy;
      });

      setAnexo({ nome: file.name, tipo: "pdf", tamanho: file.size, dataUrl });
      setImportInfo({
        formato: data.formato,
        totalItens: (data.itens || []).length,
        casados,
        semMatch,
        avisos: data.avisos || [],
        meta: data._meta || {},
      });
      const totalIt = (data.itens || []).length;
      if (totalIt === 0) {
        showToast(`PDF lido mas nenhum item reconhecido (formato: ${data.formato || "?"}). Veja o banner pra detalhes.`, "error");
      } else {
        showToast(`PDF lido (${data.formato}): ${casados}/${totalIt} itens casados com a RM`);
      }
    } catch (err) {
      showToast("Erro ao importar PDF: " + err.message, "error");
    } finally {
      setImportingPdf(false);
    }
  };

  const setItem = (i, k, v) => {
    setItens((prev) => {
      const copy = [...prev];
      copy[i] = { ...copy[i], [k]: v };
      return copy;
    });
  };

  // Totais derivados
  const totais = useMemo(() => {
    let totalBruto = 0;
    let totalLiquido = 0;
    let creditoTotal = 0;
    let itensComPreco = 0;

    for (const it of itens) {
      const precoUnit = Number(it.precoUnit) || 0;
      const qtd = Number(it.qtdCotada) || 0;
      const linha = precoUnit * qtd;
      if (precoUnit > 0 && qtd > 0) itensComPreco++;
      totalBruto += linha;

      // ICMS por item (com fallback pro default)
      const icmsItem = it.icmsPct !== "" && it.icmsPct != null ? it.icmsPct : icmsPctDefault;
      const precoLiq = calcPrecoLiquido(precoUnit, {
        icmsPct: icmsItem, pisPct, cofinsPct, ipiPct: it.ipiPct, creditaIpi, faturamento,
      });
      totalLiquido += precoLiq * qtd;
    }
    creditoTotal = totalBruto - totalLiquido;
    return { totalBruto, totalLiquido, creditoTotal, itensComPreco };
  }, [itens, icmsPctDefault, pisPct, cofinsPct, creditaIpi, faturamento]);

  const handleAnexo = async (file) => {
    if (!file) return;
    const dataUrl = await readAsDataURL(file);
    setAnexo({ nome: file.name, tipo: "pdf", tamanho: file.size, dataUrl });
  };

  const salvar = () => {
    if (!fornecedorNome.trim()) return showToast("Informe o fornecedor", "error");
    if (totais.itensComPreco === 0) return showToast("Preencha pelo menos um item com preço e quantidade", "error");

    // Monta itens da cotação — só os realmente cotados
    const itensCotacao = itens
      .filter((it) => it.disponibilidade !== "Não cotou" && (Number(it.precoUnit) > 0 || Number(it.qtdCotada) > 0))
      .map((it) => {
        const precoUnit = Number(it.precoUnit) || 0;
        const qtdCotada = Number(it.qtdCotada) || 0;
        const ipiPct = Number(it.ipiPct) || 0;
        const icmsItem = it.icmsPct !== "" && it.icmsPct != null ? Number(it.icmsPct) : Number(icmsPctDefault) || 0;
        const precoLiquido = calcPrecoLiquido(precoUnit, {
          icmsPct: icmsItem, pisPct, cofinsPct, ipiPct: it.ipiPct, creditaIpi, faturamento,
        });
        return {
          id: uid(),
          rmItemId: it.rmItemId,
          // Campos "clássicos" mantidos p/ compat com código existente do mapa
          item: it.descricao,
          descricao: it.descricao,
          codigo: it.codigoOmie || "",
          precoUnit,
          qtd: qtdCotada,
          unidade: it.unidade,
          total: precoUnit * qtdCotada,
          // Campos novos (estruturados)
          qtdSolicitada: it.qtdSolicitada,
          qtdCotada,
          disponibilidade: it.disponibilidade,
          icmsPct: icmsItem,
          ipiPct,
          prazoEntrega: it.prazoEntrega,
          observacao: it.observacao,
          precoLiquido,
          totalLiquido: precoLiquido * qtdCotada,
        };
      });

    const novaCotacao = {
      id: uid(),
      fornecedor: fornecedorNome.trim(),
      fornecedorId: fornecedorId || null,
      data: dataCotacao || today(),
      validade: validade || null,
      prazoPagamento: prazoPagamento || "",
      tipoFrete,
      faturamento,
      icmsPct: Number(icmsPctDefault) || 0,
      pisPct: Number(pisPct) || 0,
      cofinsPct: Number(cofinsPct) || 0,
      creditaIpi,
      total: totais.totalBruto,
      totalLiquido: totais.totalLiquido,
      creditoTotal: totais.creditoTotal,
      tipo: "manual",
      itens: itensCotacao,
    };

    const novosAnexos = anexo
      ? [{ id: uid(), nome: anexo.nome, nomeArquivo: anexo.nome, tipo: "pdf", tamanho: anexo.tamanho, data: today(), fornecedor: fornecedorNome, dataUrl: anexo.dataUrl }]
      : [];

    setRms((prev) =>
      prev.map((r) =>
        r.id !== id
          ? r
          : {
              ...r,
              cotacoes: [...(r.cotacoes || []), novaCotacao],
              anexos: [...(r.anexos || []), ...novosAnexos],
              status: r.status === "Aberta" ? "Em Cotação" : r.status,
            }
      )
    );
    showToast(`Cotação de ${fornecedorNome} salva com ${itensCotacao.length} item${itensCotacao.length === 1 ? "" : "s"}`);
    router.push(`/rm/${id}`);
  };

  if (!loaded) return <div className="p-12 text-center text-gray-400">Carregando...</div>;
  if (!rm) {
    return (
      <div className="p-12 text-center">
        <p className="text-gray-500 text-lg">RM não encontrada</p>
        <Link href="/" className="text-blue-600 hover:underline text-sm mt-2 inline-block">Voltar</Link>
      </div>
    );
  }

  const mostrarImpostos = faturamento === "Torg";

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href={`/rm/${id}`} className="text-gray-500 hover:text-gray-800 flex items-center gap-1 text-sm">
          <ArrowLeft size={16} /> Voltar pra RM
        </Link>
      </div>
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Lançar Cotação</h2>
          <p className="text-sm text-gray-500">
            RM-{rm.numero} — {rm.descricao} · {(rm.itens || []).length} itens
          </p>
        </div>
        <div>
          <button
            onClick={() => pdfRef.current?.click()}
            disabled={importingPdf}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium flex items-center gap-2 disabled:opacity-50"
          >
            {importingPdf ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
            {importingPdf ? "Lendo PDF..." : "Importar PDF da cotação"}
          </button>
          <input
            ref={pdfRef}
            type="file"
            accept=".pdf"
            className="hidden"
            onChange={(e) => { importarPdf(e.target.files[0]); e.target.value = ""; }}
          />
          <p className="text-xs text-gray-400 mt-1 text-right">
            Pré-preenche os campos a partir do PDF do fornecedor.
          </p>
        </div>
      </div>

      {importInfo && (
        <div className={`border rounded-lg p-3 text-sm ${importInfo.totalItens === 0 ? "bg-yellow-50 border-yellow-200" : "bg-blue-50 border-blue-200"}`}>
          <p className={importInfo.totalItens === 0 ? "text-yellow-800" : "text-blue-800"}>
            {importInfo.totalItens === 0 ? "⚠️" : "✓"} PDF <strong>{importInfo.formato}</strong> lido — {importInfo.casados} de {importInfo.totalItens} itens casados com itens da RM
            {importInfo.meta?.pages ? ` · ${importInfo.meta.pages} página(s) · ${importInfo.meta.textLength} chars` : ""}.
          </p>
          {(importInfo.avisos || []).length > 0 && (
            <ul className="mt-2 text-xs text-gray-700 list-disc list-inside">
              {importInfo.avisos.map((a, i) => (<li key={i}>{a}</li>))}
            </ul>
          )}
          {importInfo.semMatch.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-blue-700 hover:underline text-xs">
                {importInfo.semMatch.length} item(s) do PDF não casaram (ver)
              </summary>
              <ul className="mt-2 text-xs text-gray-700 list-disc list-inside">
                {importInfo.semMatch.map((d, i) => (<li key={i}>{d}</li>))}
              </ul>
            </details>
          )}
          {importInfo.meta?.textPreview && (
            <details className="mt-2">
              <summary className="cursor-pointer text-yellow-700 hover:underline text-xs">
                Ver preview do texto extraído (debug)
              </summary>
              <pre className="mt-2 text-xs bg-white border border-gray-200 p-2 rounded overflow-x-auto whitespace-pre-wrap">
                {importInfo.meta.textPreview}
              </pre>
            </details>
          )}
        </div>
      )}

      {/* Cabeçalho da cotação */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
        <h3 className="text-lg font-semibold text-gray-800">Dados do fornecedor e da operação</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Fornecedor *</label>
            <select
              value={fornecedorId}
              onChange={(e) => onSelectFornecedor(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">— Selecionar cadastrado —</option>
              {fornecedores.map((f) => (
                <option key={f.id} value={f.id}>{f.nome}{f.uf ? ` (${f.uf})` : ""}</option>
              ))}
            </select>
            <input
              type="text"
              value={fornecedorNome}
              onChange={(e) => setFornecedorNome(e.target.value)}
              placeholder="ou digite o nome avulso"
              className="w-full mt-2 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Data da cotação</label>
            <input
              type="date"
              value={dataCotacao}
              onChange={(e) => setDataCotacao(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Validade</label>
            <input
              type="date"
              value={validade}
              onChange={(e) => setValidade(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Prazo de pagamento</label>
            <input
              type="text"
              value={prazoPagamento}
              onChange={(e) => setPrazoPagamento(e.target.value)}
              placeholder="Ex: 28 DDL, 3x 30/60/90, à vista"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de frete</label>
            <select
              value={tipoFrete}
              onChange={(e) => setTipoFrete(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              {TIPOS_FRETE.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Faturamento *</label>
            <div className="flex gap-4 pt-1">
              <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  checked={faturamento === "Torg"}
                  onChange={() => setFaturamento("Torg")}
                  className="text-blue-600"
                />
                Torg
              </label>
              <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  checked={faturamento === "Cliente"}
                  onChange={() => setFaturamento("Cliente")}
                  className="text-blue-600"
                />
                Cliente
              </label>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              {faturamento === "Torg" ? "Torg credita impostos → comparação usa preço líquido" : "Faturado direto ao cliente → comparação usa preço bruto"}
            </p>
          </div>
        </div>

        {/* Impostos — só se faturamento = Torg */}
        {mostrarImpostos && (
          <div className="mt-4 border-t border-gray-100 pt-4">
            <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <Info size={14} className="text-blue-500" /> Alíquotas creditáveis (pra cálculo do preço líquido)
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">ICMS % (default)</label>
                <input
                  type="number" min="0" max="100" step="0.01"
                  value={icmsPctDefault}
                  onChange={(e) => setIcmsPctDefault(e.target.value)}
                  placeholder="ex: 12"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <p className="text-xs text-gray-400 mt-1">Usado se a linha não tiver ICMS próprio</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">PIS %</label>
                <input
                  type="number" min="0" max="100" step="0.01"
                  value={pisPct}
                  onChange={(e) => setPisPct(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">COFINS %</label>
                <input
                  type="number" min="0" max="100" step="0.01"
                  value={cofinsPct}
                  onChange={(e) => setCofinsPct(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">IPI creditável?</label>
                <label className="inline-flex items-center gap-2 mt-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={creditaIpi}
                    onChange={(e) => setCreditaIpi(e.target.checked)}
                    className="text-blue-600"
                  />
                  Torg credita IPI
                </label>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Itens */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-gray-800">Itens da RM</h3>
          <p className="text-xs text-gray-500 mt-1">
            Preencha preço, qtd cotada e disponibilidade para cada item. Se o fornecedor não cotou, selecione "Não cotou".
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Descrição</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Qtd solic.</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Un.</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Preço unit. (R$) *</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Qtd cotada</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Disponibilidade</th>
                {mostrarImpostos && <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">ICMS %</th>}
                {mostrarImpostos && <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">IPI %</th>}
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Prazo</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Obs</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Total bruto</th>
                {mostrarImpostos && <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Total líquido</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {itens.map((it, i) => {
                const precoUnit = Number(it.precoUnit) || 0;
                const qtd = Number(it.qtdCotada) || 0;
                const totalBruto = precoUnit * qtd;
                const icmsItem = it.icmsPct !== "" && it.icmsPct != null ? it.icmsPct : icmsPctDefault;
                const precoLiq = calcPrecoLiquido(precoUnit, {
                  icmsPct: icmsItem, pisPct, cofinsPct, ipiPct: it.ipiPct, creditaIpi, faturamento,
                });
                const totalLiq = precoLiq * qtd;
                const dispMeta = DISPONIBILIDADES.find((d) => d.key === it.disponibilidade);
                const isSobEnc = it.disponibilidade === "Sob encomenda";
                return (
                  <tr key={it.rmItemId || i} className="hover:bg-gray-50">
                    <td className="px-3 py-2 text-gray-800 font-medium">{it.descricao}</td>
                    <td className="px-3 py-2 text-right text-gray-500">{it.qtdSolicitada}</td>
                    <td className="px-3 py-2 text-gray-500">{it.unidade}</td>
                    <td className="px-3 py-2">
                      <input
                        type="number" min="0" step="0.0001"
                        value={it.precoUnit}
                        onChange={(e) => setItem(i, "precoUnit", e.target.value)}
                        className="w-24 border border-gray-200 rounded px-2 py-1 text-right focus:ring-1 focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number" min="0" step="0.01"
                        value={it.qtdCotada}
                        onChange={(e) => setItem(i, "qtdCotada", e.target.value)}
                        className="w-20 border border-gray-200 rounded px-2 py-1 text-right focus:ring-1 focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={it.disponibilidade}
                        onChange={(e) => setItem(i, "disponibilidade", e.target.value)}
                        className={`border rounded px-2 py-1 text-xs focus:ring-1 focus:ring-blue-500 bg-${dispMeta?.cor || "gray"}-50 border-${dispMeta?.cor || "gray"}-200 text-${dispMeta?.cor || "gray"}-800`}
                      >
                        {DISPONIBILIDADES.map((d) => <option key={d.key} value={d.key}>{d.key}</option>)}
                      </select>
                    </td>
                    {mostrarImpostos && (
                      <td className="px-3 py-2">
                        <input
                          type="number" min="0" max="100" step="0.01"
                          value={it.icmsPct}
                          onChange={(e) => setItem(i, "icmsPct", e.target.value)}
                          placeholder={icmsPctDefault || "—"}
                          className="w-14 border border-gray-200 rounded px-2 py-1 text-right focus:ring-1 focus:ring-blue-500"
                        />
                      </td>
                    )}
                    {mostrarImpostos && (
                      <td className="px-3 py-2">
                        <input
                          type="number" min="0" max="100" step="0.01"
                          value={it.ipiPct}
                          onChange={(e) => setItem(i, "ipiPct", e.target.value)}
                          placeholder="0"
                          className="w-14 border border-gray-200 rounded px-2 py-1 text-right focus:ring-1 focus:ring-blue-500"
                        />
                      </td>
                    )}
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={it.prazoEntrega}
                        onChange={(e) => setItem(i, "prazoEntrega", e.target.value)}
                        placeholder={isSobEnc ? "ex: 15 dias" : "—"}
                        className="w-24 border border-gray-200 rounded px-2 py-1 text-xs focus:ring-1 focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={it.observacao}
                        onChange={(e) => setItem(i, "observacao", e.target.value)}
                        placeholder="—"
                        className="w-28 border border-gray-200 rounded px-2 py-1 text-xs focus:ring-1 focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-3 py-2 text-right text-gray-700 tabular-nums">{totalBruto > 0 ? fmt(totalBruto) : "—"}</td>
                    {mostrarImpostos && (
                      <td className="px-3 py-2 text-right text-green-700 font-medium tabular-nums">{totalLiq > 0 ? fmt(totalLiq) : "—"}</td>
                    )}
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-gray-50 font-semibold">
              <tr>
                <td colSpan={mostrarImpostos ? 10 : 8} className="px-3 py-3 text-right text-gray-700">Totais:</td>
                <td className="px-3 py-3 text-right text-gray-900 tabular-nums">{fmt(totais.totalBruto)}</td>
                {mostrarImpostos && (
                  <td className="px-3 py-3 text-right text-green-700 tabular-nums">{fmt(totais.totalLiquido)}</td>
                )}
              </tr>
              {mostrarImpostos && totais.creditoTotal > 0 && (
                <tr>
                  <td colSpan={10} className="px-3 py-1 text-right text-xs text-gray-500">Crédito tributário estimado:</td>
                  <td colSpan={2} className="px-3 py-1 text-right text-xs text-gray-500 tabular-nums">{fmt(totais.creditoTotal)}</td>
                </tr>
              )}
            </tfoot>
          </table>
        </div>
      </div>

      {/* Anexo opcional */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <h3 className="text-sm font-semibold text-gray-800 mb-2 flex items-center gap-2">
          <Paperclip size={16} className="text-gray-500" /> Anexar PDF/arquivo da cotação (opcional — só comprovante)
        </h3>
        {anexo ? (
          <div className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
            <span className="text-sm text-gray-700">{anexo.nome}</span>
            <button onClick={() => setAnexo(null)} className="text-red-400 hover:text-red-600">
              <Trash2 size={16} />
            </button>
          </div>
        ) : (
          <>
            <button
              onClick={() => fileRef.current?.click()}
              className="text-sm text-blue-600 hover:underline"
            >
              Selecionar arquivo
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.doc,.docx,.jpg,.png,.xlsx"
              className="hidden"
              onChange={(e) => { handleAnexo(e.target.files[0]); e.target.value = ""; }}
            />
          </>
        )}
      </div>

      {/* Ações */}
      <div className="flex flex-wrap justify-end gap-3 pb-8">
        <Link
          href={`/rm/${id}`}
          className="px-5 py-2.5 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm"
        >
          Cancelar
        </Link>
        <button
          onClick={salvar}
          className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium flex items-center gap-2"
        >
          <Save size={18} /> Salvar Cotação
        </button>
      </div>
    </div>
  );
}
