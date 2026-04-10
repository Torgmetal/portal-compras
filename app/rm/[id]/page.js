"use client";
import { useState, useRef, use, Fragment } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { uid, today, fmt } from "@/lib/utils";
import Badge from "@/components/Badge";
import {
  ArrowLeft, Upload, FileSpreadsheet, FileText, BarChart3, Truck, Trash2,
  CheckCircle2, AlertCircle, Paperclip, Download, Eye,
} from "lucide-react";
import * as XLSX from "xlsx";
import Papa from "papaparse";

export default function RmDetail({ params }) {
  const { id } = use(params);
  const { rms, setRms, showToast, loaded } = useStore();
  const router = useRouter();
  const fileRef = useRef(null);
  const pdfRef = useRef(null);

  const [cotFornecedor, setCotFornecedor] = useState("");
  const [showMapa, setShowMapa] = useState(false);
  const [showPedido, setShowPedido] = useState(false);
  const [pedidoOmie, setPedidoOmie] = useState(null);
  const [selectedFornecedorPedido, setSelectedFornecedorPedido] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [dragActivePdf, setDragActivePdf] = useState(false);

  if (!loaded) return <div className="p-12 text-center text-gray-400">Carregando...</div>;

  const rm = rms.find((r) => r.id === id);
  if (!rm) {
    return (
      <div className="p-12 text-center">
        <AlertCircle size={48} className="mx-auto text-gray-300 mb-4" />
        <p className="text-gray-500 text-lg">RM nÃ£o encontrada</p>
        <button onClick={() => router.push("/")} className="mt-4 text-blue-600 hover:underline">Voltar ao Painel</button>
      </div>
    );
  }

  const updateRm = (updates) => {
    setRms((prev) => prev.map((r) => (r.id === rm.id ? { ...r, ...updates } : r)));
  };

  // âââ FILE UPLOAD & PARSING (EXCEL/CSV) âââââââââââââââââââ
  const processFile = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        let dados = [];
        if (file.name.endsWith(".csv") || file.name.endsWith(".tsv")) {
          const parsed = Papa.parse(ev.target.result, { header: true, skipEmptyLines: true });
          dados = parsed.data;
        } else {
          const data = new Uint8Array(ev.target.result);
          const wb = XLSX.read(data, { type: "array" });
          const ws = wb.Sheets[wb.SheetNames[0]];
          dados = XLSX.utils.sheet_to_json(ws);
        }

        const normalize = (row) => {
          const keys = Object.keys(row);
          const find = (terms) => keys.find((k) => terms.some((t) => k.toLowerCase().includes(t)));
          return {
            item: row[find(["item", "descri", "material", "produto", "nome"])] || row[keys[0]] || "â",
            precoUnit:
              parseFloat(
                String(row[find(["pre", "unit", "valor unit", "vl unit", "vl. unit", "preco", "preÃ§o"])] || row[keys[1]] || "0")
                  .replace(/[^\d.,]/g, "")
                  .replace(",", ".")
              ) || 0,
            qtd:
              parseFloat(
                String(row[find(["qtd", "quant"])] || row[keys[2]] || "1")
                  .replace(/[^\d.,]/g, "")
                  .replace(",", ".")
              ) || 1,
            prazoEntrega: row[find(["prazo", "entrega", "dias", "lead"])] || "â",
            condicao: row[find(["cond", "pagamento", "pag", "forma"])] || "â",
            estoque: row[find(["estoque", "disp", "disponib"])] || "â",
          };
        };

        const itens = dados.map(normalize).filter((d) => d.item !== "â" || d.precoUnit > 0);
        if (itens.length === 0) return showToast("NÃ£o foi possÃ­vel ler itens da planilha. Verifique o formato.", "error");

        const total = itens.reduce((s, it) => s + it.precoUnit * it.qtd, 0);

        const novaCotacao = {
          id: uid(),
          fornecedor: cotFornecedor.trim() || "Fornecedor " + ((rm.cotacoes?.length || 0) + 1),
          nomeArquivo: file.name,
          tipo: "planilha",
          data: today(),
          itens,
          total,
        };

        updateRm({
          cotacoes: [...(rm.cotacoes || []), novaCotacao],
          status: rm.status === "Aberta" ? "Em CotaÃ§Ã£o" : rm.status,
        });

        setCotFornecedor("");
        showToast(`CotaÃ§Ã£o "${file.name}" importada com ${itens.length} itens!`);
      } catch (err) {
        showToast("Erro ao ler arquivo: " + err.message, "error");
      }
    };
    if (file.name.endsWith(".csv") || file.name.endsWith(".tsv")) reader.readAsText(file);
    else reader.readAsArrayBuffer(file);
  };

  const handleFileUpload = (e) => {
    processFile(e.target.files[0]);
    e.target.value = "";
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragActive(false);
    processFile(e.dataTransfer.files[0]);
  };

  // âââ PDF/ANEXO UPLOAD ââââââââââââââââââââââââââââââââââââ
  const processPdf = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const novoAnexo = {
        id: uid(),
        fornecedor: cotFornecedor.trim() || "Fornecedor " + ((rm.anexos?.length || 0) + (rm.cotacoes?.length || 0) + 1),
        nomeArquivo: file.name,
        tipo: file.name.endsWith(".pdf") ? "pdf" : "outro",
        tamanho: (file.size / 1024).toFixed(0) + " KB",
        data: today(),
        dataUrl: ev.target.result,
      };

      updateRm({
        anexos: [...(rm.anexos || []), novoAnexo],
        status: rm.status === "Aberta" ? "Em CotaÃ§Ã£o" : rm.status,
      });

      setCotFornecedor("");
      showToast(`Proposta "${file.name}" anexada!`);
    };
    reader.readAsDataURL(file);
  };

  const handlePdfUpload = (e) => {
    processPdf(e.target.files[0]);
    e.target.value = "";
  };

  const handleDropPdf = (e) => {
    e.preventDefault();
    setDragActivePdf(false);
    processPdf(e.dataTransfer.files[0]);
  };

  const removeAnexo = (anexoId) => {
    updateRm({ anexos: (rm.anexos || []).filter((a) => a.id !== anexoId) });
    showToast("Anexo removido");
  };

  const removeCotacao = (cotId) => {
    updateRm({ cotacoes: (rm.cotacoes || []).filter((c) => c.id !== cotId) });
    showToast("CotaÃ§Ã£o removida");
  };

  // âââ MAPA DE COMPRAS âââââââââââââââââââââââââââââââââââââ
  const gerarMapa = () => {
    if ((rm.cotacoes || []).length < 2) return showToast("Suba pelo menos 2 cotaÃ§Ãµes para gerar o mapa", "error");
    updateRm({ status: "Cotada", mapaGerado: true });
    setShowMapa(true);
  };

  const cotacoes = rm.cotacoes || [];
  const anexos = rm.anexos || [];

  const allItems = new Map();
  cotacoes.forEach((cot) => {
    (cot.itens || []).forEach((it) => {
      const key = it.item.toLowerCase().trim();
      if (!allItems.has(key)) allItems.set(key, { item: it.item, cotacoes: [] });
      allItems.get(key).cotacoes.push({
        fornecedor: cot.fornecedor,
        precoUnit: it.precoUnit,
        qtd: it.qtd,
        total: it.precoUnit * it.qtd,
        prazoEntrega: it.prazoEntrega,
        condicao: it.condicao,
        estoque: it.estoque,
      });
    });
  });
  const mapaItems = Array.from(allItems.values());

  // âââ GERAR PEDIDO OMIE âââââââââââââââââââââââââââââââââââ
  const gerarPedidoOmie = () => {
    if (!selectedFornecedorPedido) return showToast("Selecione o fornecedor para o pedido", "error");
    const cot = cotacoes.find((c) => c.fornecedor === selectedFornecedorPedido);
    if (!cot) return;

    const payload = {
      call: "IncluirPedidoCompra",
      app_key: "SUA_APP_KEY",
      app_secret: "SEU_APP_SECRET",
      param: [
        {
          cabecalho: {
            numero_pedido: `RM-${rm.numero}`,
            codigo_cliente_fornecedor: 0,
            data_previsao: today(),
            observacao: rm.descricao,
          },
          det: cot.itens.map((it, idx) => ({
            ide: { sequencia: idx + 1 },
            produto: {
              descricao: it.item,
              quantidade: it.qtd,
              valor_unitario: it.precoUnit,
              valor_total: it.precoUnit * it.qtd,
            },
            observacao: `Prazo: ${it.prazoEntrega} | Cond: ${it.condicao}`,
          })),
          observacoes: { obs_venda: rm.observacao || "" },
          total_pedido: { valor_total_pedido: cot.total },
        },
      ],
    };

    setPedidoOmie(payload);
    updateRm({ status: "Pedido Gerado" });
    setShowPedido(true);
    showToast("Pedido de compra gerado!");
  };

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={() => router.push("/")} className="text-gray-500 hover:text-gray-700 flex items-center gap-1 text-sm">
          <ArrowLeft size={16} /> Voltar
        </button>
        <h2 className="text-2xl font-bold text-gray-800">RM-{rm.numero}</h2>
        <Badge status={rm.status} />
        {rm.origemTekla && (
          <span className="text-xs bg-orange-50 text-orange-600 px-2 py-1 rounded-full font-medium">Tekla</span>
        )}
      </div>

      {/* RM Info */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 text-sm">
          <div><span className="text-gray-500">Tipo:</span> <span className="font-medium ml-1">{rm.tipo}</span></div>
          <div><span className="text-gray-500">Data:</span> <span className="font-medium ml-1">{rm.data}</span></div>
          <div><span className="text-gray-500">Solicitante:</span> <span className="font-medium ml-1">{rm.solicitante || "â"}</span></div>
          <div><span className="text-gray-500">CotaÃ§Ãµes:</span> <span className="font-medium ml-1">{cotacoes.length} planilhas + {anexos.length} anexos</span></div>
        </div>
        <p className="mt-3 text-gray-700 font-medium">{rm.descricao}</p>
        {rm.observacao && <p className="mt-1 text-gray-500 text-sm">{rm.observacao}</p>}
        {rm.arquivoOrigem && <p className="mt-1 text-xs text-gray-400">Arquivo origem: {rm.arquivoOrigem}</p>}
      </div>

      {/* Itens da RM */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-gray-800">Itens da RequisiÃ§Ã£o ({(rm.itens || []).length})</h3>
        </div>
        <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">#</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Item</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Qtd</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Unidade</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(rm.itens || []).map((it, i) => (
                <tr key={it.id}>
                  <td className="px-6 py-3 text-gray-400">{i + 1}</td>
                  <td className="px-6 py-3 text-gray-700">{it.descricao}</td>
                  <td className="px-6 py-3 text-gray-700">{it.qtd}</td>
                  <td className="px-6 py-3 text-gray-500">{it.unidade}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* âââ UPLOAD DE PROPOSTAS âââââââââââââââââââââââââââ */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-2">Incluir Propostas / CotaÃ§Ãµes</h3>
        <p className="text-sm text-gray-500 mb-4">
          Suba planilhas (.xlsx/.csv) para leitura automÃ¡tica de preÃ§os, ou PDFs de propostas recebidas como anexo.
        </p>

        {/* Nome do fornecedor */}
        <div className="mb-4 max-w-md">
          <label className="block text-sm font-medium text-gray-700 mb-1">Nome do Fornecedor</label>
          <input
            type="text"
            value={cotFornecedor}
            onChange={(e) => setCotFornecedor(e.target.value)}
            placeholder="Ex: Tintas Coral Ltda"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Upload Excel/CSV */}
          <div
            className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer ${
              dragActive ? "border-blue-500 bg-blue-50" : "border-gray-300 hover:border-blue-400"
            }`}
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
          >
            <FileSpreadsheet size={36} className="mx-auto text-green-500 mb-2" />
            <p className="text-gray-600 font-medium text-sm">Planilha de CotaÃ§Ã£o</p>
            <p className="text-gray-400 text-xs mt-1">.xlsx, .xls ou .csv â leitura automÃ¡tica</p>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv,.tsv" className="hidden" onChange={handleFileUpload} />
          </div>

          {/* Upload PDF */}
          <div
            className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer ${
              dragActivePdf ? "border-red-500 bg-red-50" : "border-gray-300 hover:border-red-400"
            }`}
            onClick={() => pdfRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragActivePdf(true); }}
            onDragLeave={() => setDragActivePdf(false)}
            onDrop={handleDropPdf}
          >
            <FileText size={36} className="mx-auto text-red-500 mb-2" />
            <p className="text-gray-600 font-medium text-sm">Proposta em PDF</p>
            <p className="text-gray-400 text-xs mt-1">.pdf â salvo como anexo</p>
            <input ref={pdfRef} type="file" accept=".pdf,.doc,.docx,.jpg,.png" className="hidden" onChange={handlePdfUpload} />
          </div>
        </div>
      </div>

      {/* Anexos (PDFs) */}
      {anexos.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
              <Paperclip size={18} className="text-red-500" /> Propostas Anexadas ({anexos.length})
            </h3>
          </div>
          <div className="divide-y divide-gray-100">
            {anexos.map((anexo) => (
              <div key={anexo.id} className="px-6 py-3 flex items-center justify-between hover:bg-gray-50">
                <div className="flex items-center gap-3">
                  <FileText size={20} className="text-red-500" />
                  <div>
                    <p className="text-sm font-medium text-gray-800">{anexo.nomeArquivo}</p>
                    <p className="text-xs text-gray-400">{anexo.fornecedor} â {anexo.tamanho} â {anexo.data}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {anexo.dataUrl && (
                    <a href={anexo.dataUrl} download={anexo.nomeArquivo} className="text-blue-500 hover:text-blue-700">
                      <Download size={16} />
                    </a>
                  )}
                  <button onClick={() => removeAnexo(anexo.id)} className="text-red-400 hover:text-red-600">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Lista de cotaÃ§Ãµes (planilhas) */}
      {cotacoes.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center flex-wrap gap-3">
            <h3 className="text-lg font-semibold text-gray-800">
              <FileSpreadsheet size={18} className="inline text-green-600 mr-1" />
              CotaÃ§Ãµes em Planilha ({cotacoes.length})
            </h3>
            {cotacoes.length >= 2 && (
              <button
                onClick={gerarMapa}
                className="px-4 py-2 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 font-medium flex items-center gap-2"
              >
                <BarChart3 size={16} /> Gerar Mapa de Compras
              </button>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fornecedor</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Arquivo</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Itens</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Data</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">AÃ§Ãµes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {cotacoes.map((cot) => (
                  <tr key={cot.id} className="hover:bg-gray-50">
                    <td className="px-6 py-3 font-medium text-gray-800">{cot.fornecedor}</td>
                    <td className="px-6 py-3 text-gray-600 flex items-center gap-1">
                      <FileSpreadsheet size={14} className="text-green-600" /> {cot.nomeArquivo}
                    </td>
                    <td className="px-6 py-3 text-gray-600">{(cot.itens || []).length}</td>
                    <td className="px-6 py-3 font-semibold text-gray-800">{fmt(cot.total)}</td>
                    <td className="px-6 py-3 text-gray-500">{cot.data}</td>
                    <td className="px-6 py-3">
                      <button onClick={() => removeCotacao(cot.id)} className="text-red-400 hover:text-red-600">
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MAPA DE COMPRAS */}
      {showMapa && mapaItems.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border-2 border-purple-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-purple-100 bg-purple-50">
            <h3 className="text-lg font-semibold text-purple-800">Mapa de Compras</h3>
            <p className="text-sm text-purple-600">O menor valor por item estÃ¡ destacado em verde</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase sticky left-0 bg-gray-50">Item</th>
                  {cotacoes.map((cot) => (
                    <th key={cot.id} className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase" colSpan={3}>
                      {cot.fornecedor}
                    </th>
                  ))}
                </tr>
                <tr className="bg-gray-50">
                  <th className="px-4 py-2 sticky left-0 bg-gray-50"></th>
                  {cotacoes.map((cot) => (
                    <Fragment key={cot.id + "-sub"}>
                      <th className="px-3 py-2 text-xs text-gray-400 text-center">PreÃ§o Un.</th>
                      <th className="px-3 py-2 text-xs text-gray-400 text-center">Cond. Pag.</th>
                      <th className="px-3 py-2 text-xs text-gray-400 text-center">Prazo</th>
                    </Fragment>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {mapaItems.map((mi, idx) => {
                  const precos = mi.cotacoes.map((c) => c.precoUnit).filter((p) => p > 0);
                  const menorPreco = precos.length > 0 ? Math.min(...precos) : 0;
                  return (
                    <tr key={idx} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-800 sticky left-0 bg-white">{mi.item}</td>
                      {cotacoes.map((cot) => {
                        const match = mi.cotacoes.find((c) => c.fornecedor === cot.fornecedor);
                        const isBest = match && match.precoUnit === menorPreco && match.precoUnit > 0;
                        return (
                          <Fragment key={cot.id + "-" + idx}>
                            <td className={`px-3 py-3 text-center font-semibold ${isBest ? "bg-green-50 text-green-700" : "text-gray-700"}`}>
                              {match ? fmt(match.precoUnit) : "â"}
                              {isBest && <CheckCircle2 size={12} className="inline ml-1 text-green-500" />}
                            </td>
                            <td className="px-3 py-3 text-center text-gray-600 text-xs">{match?.condicao || "â"}</td>
                            <td className="px-3 py-3 text-center text-gray-600 text-xs">{match?.prazoEntrega || "â"}</td>
                          </Fragment>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-gray-50 font-semibold">
                <tr>
                  <td className="px-4 py-3 text-gray-700 sticky left-0 bg-gray-50">TOTAL GERAL</td>
                  {cotacoes.map((cot) => {
                    const minTotal = Math.min(...cotacoes.map((c) => c.total));
                    const isBest = cot.total === minTotal;
                    return (
                      <Fragment key={cot.id + "-total"}>
                        <td className={`px-3 py-3 text-center ${isBest ? "bg-green-50 text-green-700" : "text-gray-700"}`}>
                          {fmt(cot.total)}
                          {isBest && <CheckCircle2 size={12} className="inline ml-1 text-green-500" />}
                        </td>
                        <td></td>
                        <td></td>
                      </Fragment>
                    );
                  })}
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* GERAR PEDIDO OMIE */}
      {cotacoes.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Gerar Pedido de Compra â Omie</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Fornecedor Selecionado</label>
              <select
                value={selectedFornecedorPedido}
                onChange={(e) => setSelectedFornecedorPedido(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">Selecione o fornecedor vencedor...</option>
                {cotacoes.map((c) => (
                  <option key={c.id} value={c.fornecedor}>
                    {c.fornecedor} â {fmt(c.total)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <button
            onClick={gerarPedidoOmie}
            className="px-5 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium flex items-center gap-2"
          >
            <Truck size={18} /> Gerar Pedido no Omie
          </button>
        </div>
      )}

      {/* Pedido Gerado */}
      {showPedido && pedidoOmie && (
        <div className="bg-white rounded-xl shadow-sm border-2 border-emerald-200 p-6">
          <h3 className="text-lg font-semibold text-emerald-800 mb-2">Pedido de Compra â Pronto para Envio</h3>
          <p className="text-sm text-emerald-600 mb-4">
            O JSON abaixo serÃ¡ enviado para a API do Omie. Configure suas credenciais (App Key e App Secret) para envio automÃ¡tico.
          </p>
          <pre className="bg-gray-900 text-green-400 rounded-lg p-4 text-xs overflow-x-auto max-h-96">
            {JSON.stringify(pedidoOmie, null, 2)}
          </pre>
          <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
            <strong>Endpoint:</strong>{" "}
            <code className="bg-yellow-100 px-1 rounded">
              POST https://app.omie.com.br/api/v1/produtos/pedidocompra/
            </code>
            <br />
            <span className="text-xs mt-1 block">
              Substitua SUA_APP_KEY e SEU_APP_SECRET pelas suas credenciais do Omie. Na prÃ³xima fase, integramos o envio direto.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
