"use client";
import { useState, useRef, Fragment, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { uid, today, fmt } from "@/lib/utils";
import Badge from "@/components/Badge";
import {
  ArrowLeft, Upload, FileSpreadsheet, FileText, BarChart3, Truck, Trash2,
  CheckCircle2, AlertCircle, Paperclip, Download, Eye, ShoppingCart, Award,
  ArrowRightLeft, ChevronDown, ChevronUp, Mail, Send, Clock,
} from "lucide-react";

export default function RmDetail({ params }) {
  const { id } = params;
  const { rms, setRms, fornecedores, showToast, loaded } = useStore();
  const router = useRouter();
  const fileRef = useRef(null);
  const pdfRef = useRef(null);

  const [cotFornecedor, setCotFornecedor] = useState("");
  const [showMapa, setShowMapa] = useState(false);
  const [showPedidos, setShowPedidos] = useState(false);
  const [pedidosOmie, setPedidosOmie] = useState([]);
  const [dragActive, setDragActive] = useState(false);
  const [dragActivePdf, setDragActivePdf] = useState(false);
  // Mapa: override do fornecedor vencedor por item (key = item lowercase, value = fornecedor name)
  const [overrides, setOverrides] = useState({});
  const [expandedPedido, setExpandedPedido] = useState(null);
  const [selectedFornecedores, setSelectedFornecedores] = useState([]);

  if (!loaded) return <div className="p-12 text-center text-gray-400">Carregando...</div>;

  const rm = rms.find((r) => r.id === id);
  if (!rm) {
    return (
      <div className="p-12 text-center">
        <AlertCircle size={48} className="mx-auto text-gray-300 mb-4" />
        <p className="text-gray-500 text-lg">RM não encontrada</p>
        <button onClick={() => router.push("/")} className="mt-4 text-blue-600 hover:underline">Voltar ao Painel</button>
      </div>
    );
  }

  const updateRm = (updates) => {
    setRms((prev) => prev.map((r) => (r.id === rm.id ? { ...r, ...updates } : r)));
  };

  // ─── FILE UPLOAD & PARSING (EXCEL/CSV) ───────────────────
  const processFile = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        let dados = [];
        if (file.name.endsWith(".csv") || file.name.endsWith(".tsv")) {
          const Papa = (await import("papaparse")).default;
          const parsed = Papa.parse(ev.target.result, { header: true, skipEmptyLines: true });
          dados = parsed.data;
        } else {
          const XLSX = await import("xlsx");
          const data = new Uint8Array(ev.target.result);
          const wb = XLSX.read(data, { type: "array", cellFormula: false });
          const ws = wb.Sheets[wb.SheetNames[0]];
          dados = XLSX.utils.sheet_to_json(ws);
        }

        const normalize = (row) => {
          const keys = Object.keys(row);
          const find = (terms) => keys.find((k) => terms.some((t) => k.toLowerCase().includes(t)));
          return {
            item: String(row[find(["item", "descri", "material", "produto", "nome"])] || row[keys[0]] || "—").trim(),
            precoUnit:
              parseFloat(
                String(row[find(["pre", "unit", "valor unit", "vl unit", "vl. unit", "preco", "preço"])] || row[keys[1]] || "0")
                  .replace(/[^\d.,]/g, "")
                  .replace(",", ".")
              ) || 0,
            qtd:
              parseFloat(
                String(row[find(["qtd", "quant"])] || row[keys[2]] || "1")
                  .replace(/[^\d.,]/g, "")
                  .replace(",", ".")
              ) || 1,
            prazoEntrega: String(row[find(["prazo", "entrega", "dias", "lead"])] || "—").trim(),
            condicao: String(row[find(["cond", "pagamento", "pag", "forma"])] || "—").trim(),
            estoque: String(row[find(["estoque", "disp", "disponib"])] || "—").trim(),
          };
        };

        const itens = dados.map(normalize).filter((d) => d.item !== "—" || d.precoUnit > 0);
        if (itens.length === 0) return showToast("Não foi possível ler itens da planilha. Verifique o formato.", "error");

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
          status: rm.status === "Aberta" ? "Em Cotação" : rm.status,
        });

        setCotFornecedor("");
        showToast(`Cotação "${file.name}" importada com ${itens.length} itens!`);
      } catch (err) {
        showToast("Erro ao ler arquivo: " + err.message, "error");
      }
    };
    if (file.name.endsWith(".csv") || file.name.endsWith(".tsv")) reader.readAsText(file);
    else reader.readAsArrayBuffer(file);
  };

  const handleFileUpload = (e) => { processFile(e.target.files[0]); e.target.value = ""; };
  const handleDrop = (e) => { e.preventDefault(); setDragActive(false); processFile(e.dataTransfer.files[0]); };

  // ─── PDF/ANEXO UPLOAD ────────────────────────────────────
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
        status: rm.status === "Aberta" ? "Em Cotação" : rm.status,
      });
      setCotFornecedor("");
      showToast(`Proposta "${file.name}" anexada!`);
    };
    reader.readAsDataURL(file);
  };

  const handlePdfUpload = (e) => { processPdf(e.target.files[0]); e.target.value = ""; };
  const handleDropPdf = (e) => { e.preventDefault(); setDragActivePdf(false); processPdf(e.dataTransfer.files[0]); };
  const removeAnexo = (anexoId) => { updateRm({ anexos: (rm.anexos || []).filter((a) => a.id !== anexoId) }); showToast("Anexo removido"); };
  const removeCotacao = (cotId) => { updateRm({ cotacoes: (rm.cotacoes || []).filter((c) => c.id !== cotId) }); showToast("Cotação removida"); };

  // ─── MAPA DE COTAÇÃO ─────────────────────────────────────
  const gerarMapa = () => {
    if ((rm.cotacoes || []).length < 2) return showToast("Suba pelo menos 2 cotações para gerar o mapa", "error");
    updateRm({ status: "Cotada", mapaGerado: true });
    setShowMapa(true);
  };

  const cotacoes = rm.cotacoes || [];
  const anexos = rm.anexos || [];

  // Build mapa items: consolidate all items across all quotations
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

  // Determine the winner for each item (lowest price, with manual override)
  const getWinner = (mi) => {
    const key = mi.item.toLowerCase().trim();
    if (overrides[key]) return overrides[key];
    const precos = mi.cotacoes.filter((c) => c.precoUnit > 0);
    if (precos.length === 0) return null;
    precos.sort((a, b) => a.precoUnit - b.precoUnit);
    return precos[0].fornecedor;
  };

  const setWinner = (itemKey, fornecedor) => {
    setOverrides((prev) => ({ ...prev, [itemKey]: fornecedor }));
  };

  // Group winning items by supplier for purchase orders
  const pedidosPorFornecedor = useMemo(() => {
    if (mapaItems.length === 0) return {};
    const groups = {};
    mapaItems.forEach((mi) => {
      const winner = getWinner(mi);
      if (!winner) return;
      const match = mi.cotacoes.find((c) => c.fornecedor === winner);
      if (!match) return;
      if (!groups[winner]) groups[winner] = { fornecedor: winner, itens: [], total: 0 };
      groups[winner].itens.push({
        item: mi.item,
        precoUnit: match.precoUnit,
        qtd: match.qtd,
        total: match.total,
        prazoEntrega: match.prazoEntrega,
        condicao: match.condicao,
      });
      groups[winner].total += match.total;
    });
    return groups;
  }, [mapaItems, overrides]);

  // ─── GERAR PEDIDOS DE COMPRA (SPLIT POR FORNECEDOR) ─────
  const gerarPedidosOmie = () => {
    const groups = Object.values(pedidosPorFornecedor);
    if (groups.length === 0) return showToast("Nenhum item selecionado no mapa", "error");

    const pedidos = groups.map((g) => ({
      fornecedor: g.fornecedor,
      total: g.total,
      itensCount: g.itens.length,
      payload: {
        call: "IncluirPedidoCompra",
        app_key: "SUA_APP_KEY",
        app_secret: "SEU_APP_SECRET",
        param: [
          {
            cabecalho: {
              numero_pedido: `RM-${rm.numero}-${g.fornecedor.replace(/\s+/g, "").substring(0, 10)}`,
              codigo_cliente_fornecedor: 0,
              data_previsao: today(),
              observacao: `${rm.descricao} — Fornecedor: ${g.fornecedor}`,
            },
            det: g.itens.map((it, idx) => ({
              ide: { sequencia: idx + 1 },
              produto: {
                descricao: it.item,
                quantidade: it.qtd,
                valor_unitario: it.precoUnit,
                valor_total: it.total,
              },
              observacao: `Prazo: ${it.prazoEntrega} | Cond: ${it.condicao}`,
            })),
            observacoes: { obs_venda: rm.observacao || "" },
            total_pedido: { valor_total_pedido: g.total },
          },
        ],
      },
    }));

    setPedidosOmie(pedidos);
    updateRm({ status: "Pedido Gerado" });
    setShowPedidos(true);
    showToast(`${pedidos.length} pedido(s) de compra gerado(s)!`);
  };

  // ─── CONTAGENS POR FORNECEDOR NO MAPA ───────────────────
  const winnerStats = useMemo(() => {
    const stats = {};
    mapaItems.forEach((mi) => {
      const winner = getWinner(mi);
      if (!winner) return;
      if (!stats[winner]) stats[winner] = { count: 0, total: 0 };
      const match = mi.cotacoes.find((c) => c.fornecedor === winner);
      if (match) {
        stats[winner].count++;
        stats[winner].total += match.total;
      }
    });
    return stats;
  }, [mapaItems, overrides]);

  // ─── ENVIO DE COTAÇÃO (SIMULADO) ──────────────────────
  const toggleFornecedor = (fornId) => {
    setSelectedFornecedores((prev) =>
      prev.includes(fornId) ? prev.filter((id) => id !== fornId) : [...prev, fornId]
    );
  };

  const enviarCotacao = () => {
    if (selectedFornecedores.length === 0) return showToast("Selecione pelo menos um fornecedor", "error");
    const novosEnvios = selectedFornecedores.map((fornId) => {
      const forn = fornecedores.find((f) => f.id === fornId);
      return {
        id: uid(),
        fornecedorId: fornId,
        fornecedorNome: forn?.nome || "—",
        fornecedorEmail: forn?.email || "—",
        data: today(),
        hora: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
        status: "Enviado (simulado)",
      };
    });
    updateRm({
      envios: [...(rm.envios || []), ...novosEnvios],
      status: rm.status === "Aberta" ? "Em Cotação" : rm.status,
    });
    setSelectedFornecedores([]);
    showToast(`Cotação enviada para ${novosEnvios.length} fornecedor(es)! (simulado)`);
  };

  const gerarXlsxItens = async () => {
    const XLSX = await import("xlsx");
    const wsData = [
      ["#", "Descrição", "Qtd", "Unidade", "Código", "Material", "Comprimento", "Peso (kg)"],
      ...(rm.itens || []).map((it, i) => [
        i + 1,
        it.descricao,
        it.qtd,
        it.unidade,
        it.codigo || "",
        it.material || "",
        it.comprimento || "",
        it.peso || "",
      ]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws["!cols"] = [{ wch: 4 }, { wch: 40 }, { wch: 8 }, { wch: 8 }, { wch: 12 }, { wch: 15 }, { wch: 12 }, { wch: 10 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Itens RM");
    XLSX.writeFile(wb, `RM-${rm.numero}-itens.xlsx`);
    showToast("Planilha de itens baixada!");
  };

  const envios = rm.envios || [];
  const fornecedoresComEmail = fornecedores.filter((f) => f.email);

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={() => router.push("/")} className="text-gray-500 hover:text-gray-700 flex items-center gap-1 text-sm">
          <ArrowLeft size={16} /> Voltar
        </button>
        <h2 className="text-2xl font-bold text-gray-800">RM-{rm.numero}</h2>
        <Badge status={rm.status} />
        {rm.origemTekla && (
          <span className="text-xs bg-orange-50 text-orange-600 px-2 py-1 rounded-full font-medium">Importado</span>
        )}
      </div>

      {/* RM Info */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 text-sm">
          <div><span className="text-gray-500">Tipo:</span> <span className="font-medium ml-1">{rm.tipo}</span></div>
          <div><span className="text-gray-500">Data:</span> <span className="font-medium ml-1">{rm.data}</span></div>
          <div><span className="text-gray-500">Solicitante:</span> <span className="font-medium ml-1">{rm.solicitante || "—"}</span></div>
          <div><span className="text-gray-500">Cotações:</span> <span className="font-medium ml-1">{cotacoes.length} planilhas + {anexos.length} anexos</span></div>
        </div>
        <p className="mt-3 text-gray-700 font-medium">{rm.descricao}</p>
        {rm.observacao && <p className="mt-1 text-gray-500 text-sm">{rm.observacao}</p>}
        {rm.arquivoOrigem && <p className="mt-1 text-xs text-gray-400">Arquivo origem: {rm.arquivoOrigem}</p>}
      </div>

      {/* Itens da RM */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-gray-800">Itens da Requisição ({(rm.itens || []).length})</h3>
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

      {/* ═══════════ ENVIAR COTAÇÃO AOS FORNECEDORES ═══════════ */}
      <div className="bg-white rounded-xl shadow-sm border-2 border-blue-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-blue-100 bg-blue-50 flex justify-between items-center flex-wrap gap-3">
          <div>
            <h3 className="text-lg font-semibold text-blue-800 flex items-center gap-2">
              <Mail size={20} /> Enviar Cotação aos Fornecedores
            </h3>
            <p className="text-sm text-blue-600 mt-1">
              Selecione os fornecedores e envie a requisição para cotação. A planilha de itens será anexada.
            </p>
          </div>
          <button
            onClick={gerarXlsxItens}
            className="px-4 py-2 bg-white text-blue-700 border border-blue-300 text-sm rounded-lg hover:bg-blue-50 font-medium flex items-center gap-2"
          >
            <Download size={16} /> Baixar Planilha de Itens
          </button>
        </div>

        <div className="px-6 py-4">
          {fornecedoresComEmail.length === 0 ? (
            <div className="text-center py-6 text-gray-400">
              <AlertCircle size={32} className="mx-auto mb-2" />
              <p className="text-sm">Nenhum fornecedor cadastrado com e-mail.</p>
              <button onClick={() => router.push("/fornecedores")} className="mt-2 text-sm text-blue-600 hover:underline">
                Cadastrar fornecedores
              </button>
            </div>
          ) : (
            <>
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Selecione os fornecedores ({selectedFornecedores.length} selecionado{selectedFornecedores.length !== 1 ? "s" : ""})
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 mb-4">
                {fornecedoresComEmail.map((f) => {
                  const checked = selectedFornecedores.includes(f.id);
                  const jaEnviado = envios.some((e) => e.fornecedorId === f.id);
                  return (
                    <label
                      key={f.id}
                      className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        checked
                          ? "border-blue-500 bg-blue-50"
                          : "border-gray-200 hover:border-blue-300 hover:bg-gray-50"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleFornecedor(f.id)}
                        className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{f.nome}</p>
                        <p className="text-xs text-gray-500 truncate">{f.email}</p>
                      </div>
                      {jaEnviado && (
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full whitespace-nowrap">Enviado</span>
                      )}
                    </label>
                  );
                })}
              </div>
              <div className="flex justify-end">
                <button
                  onClick={enviarCotacao}
                  disabled={selectedFornecedores.length === 0}
                  className={`px-6 py-2.5 rounded-lg font-medium flex items-center gap-2 transition-colors ${
                    selectedFornecedores.length > 0
                      ? "bg-blue-600 text-white hover:bg-blue-700"
                      : "bg-gray-200 text-gray-400 cursor-not-allowed"
                  }`}
                >
                  <Send size={18} /> Enviar Cotação ({selectedFornecedores.length})
                </button>
              </div>
            </>
          )}
        </div>

        {/* Histórico de envios */}
        {envios.length > 0 && (
          <div className="border-t border-blue-100">
            <div className="px-6 py-3 bg-blue-50/50">
              <h4 className="text-sm font-semibold text-blue-700 flex items-center gap-2">
                <Clock size={14} /> Histórico de Envios ({envios.length})
              </h4>
            </div>
            <div className="divide-y divide-gray-100">
              {envios.map((envio) => (
                <div key={envio.id} className="px-6 py-3 flex items-center justify-between hover:bg-gray-50">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
                      <CheckCircle2 size={16} className="text-green-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-800">{envio.fornecedorNome}</p>
                      <p className="text-xs text-gray-500">{envio.fornecedorEmail}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-500">{envio.data} às {envio.hora}</p>
                    <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">{envio.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ─── UPLOAD DE PROPOSTAS ─────────────────────────── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-2">Incluir Propostas / Cotações</h3>
        <p className="text-sm text-gray-500 mb-4">
          Suba planilhas (.xlsx/.csv) para leitura automática de preços, ou PDFs de propostas recebidas como anexo.
        </p>
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
            <p className="text-gray-600 font-medium text-sm">Planilha de Cotação</p>
            <p className="text-gray-400 text-xs mt-1">.xlsx, .xls ou .csv — leitura automática</p>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv,.tsv" className="hidden" onChange={handleFileUpload} />
          </div>
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
            <p className="text-gray-400 text-xs mt-1">.pdf — salvo como anexo</p>
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
                    <p className="text-xs text-gray-400">{anexo.fornecedor} — {anexo.tamanho} — {anexo.data}</p>
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

      {/* Lista de cotações (planilhas) */}
      {cotacoes.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center flex-wrap gap-3">
            <h3 className="text-lg font-semibold text-gray-800">
              <FileSpreadsheet size={18} className="inline text-green-600 mr-1" />
              Cotações em Planilha ({cotacoes.length})
            </h3>
            {cotacoes.length >= 2 && (
              <button
                onClick={gerarMapa}
                className="px-4 py-2 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 font-medium flex items-center gap-2"
              >
                <BarChart3 size={16} /> Gerar Mapa de Cotação
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
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ações</th>
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

      {/* ═══════════ MAPA DE COTAÇÃO ═══════════ */}
      {showMapa && mapaItems.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border-2 border-purple-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-purple-100 bg-purple-50 flex justify-between items-start flex-wrap gap-3">
            <div>
              <h3 className="text-lg font-semibold text-purple-800 flex items-center gap-2">
                <BarChart3 size={20} /> Mapa de Cotação
              </h3>
              <p className="text-sm text-purple-600 mt-1">
                O menor preço por item está destacado em verde. Clique em outro fornecedor para alterar a seleção.
              </p>
            </div>
          </div>

          {/* Resumo por fornecedor vencedor */}
          <div className="px-6 py-4 bg-purple-50/50 border-b border-purple-100">
            <h4 className="text-sm font-semibold text-purple-700 mb-3 flex items-center gap-2">
              <Award size={16} /> Resumo — Itens por Fornecedor Vencedor
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {Object.entries(winnerStats).map(([forn, stats]) => (
                <div key={forn} className="bg-white rounded-lg border border-purple-200 px-4 py-3 flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-gray-800 text-sm">{forn}</p>
                    <p className="text-xs text-gray-500">{stats.count} ite{stats.count === 1 ? "m" : "ns"}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-green-700 text-sm">{fmt(stats.total)}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 pt-3 border-t border-purple-200 flex items-center justify-between text-sm">
              <span className="text-purple-700 font-medium">
                Total geral (menores preços): {fmt(Object.values(winnerStats).reduce((s, st) => s + st.total, 0))}
              </span>
              <span className="text-xs text-purple-500">
                {Object.keys(winnerStats).length} fornecedor{Object.keys(winnerStats).length !== 1 ? "es" : ""}
              </span>
            </div>
          </div>

          {/* Tabela do mapa */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase sticky left-0 bg-gray-50 min-w-[200px]">Item</th>
                  {cotacoes.map((cot) => (
                    <th key={cot.id} className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase" colSpan={3}>
                      {cot.fornecedor}
                    </th>
                  ))}
                  <th className="px-4 py-3 text-center text-xs font-medium text-purple-600 uppercase bg-purple-50">Vencedor</th>
                </tr>
                <tr className="bg-gray-50">
                  <th className="px-4 py-2 sticky left-0 bg-gray-50"></th>
                  {cotacoes.map((cot) => (
                    <Fragment key={cot.id + "-sub"}>
                      <th className="px-3 py-2 text-xs text-gray-400 text-center">Preço Un.</th>
                      <th className="px-3 py-2 text-xs text-gray-400 text-center">Cond. Pag.</th>
                      <th className="px-3 py-2 text-xs text-gray-400 text-center">Prazo</th>
                    </Fragment>
                  ))}
                  <th className="px-3 py-2 text-xs text-purple-400 text-center bg-purple-50">Seleção</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {mapaItems.map((mi, idx) => {
                  const precos = mi.cotacoes.map((c) => c.precoUnit).filter((p) => p > 0);
                  const menorPreco = precos.length > 0 ? Math.min(...precos) : 0;
                  const winner = getWinner(mi);
                  const itemKey = mi.item.toLowerCase().trim();
                  return (
                    <tr key={idx} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-800 sticky left-0 bg-white min-w-[200px]">{mi.item}</td>
                      {cotacoes.map((cot) => {
                        const match = mi.cotacoes.find((c) => c.fornecedor === cot.fornecedor);
                        const isLowest = match && match.precoUnit === menorPreco && match.precoUnit > 0;
                        const isWinner = match && cot.fornecedor === winner;
                        return (
                          <Fragment key={cot.id + "-" + idx}>
                            <td
                              className={`px-3 py-3 text-center font-semibold cursor-pointer transition-colors ${
                                isWinner
                                  ? "bg-green-50 text-green-700 ring-2 ring-inset ring-green-300"
                                  : isLowest
                                  ? "bg-green-50/50 text-green-600"
                                  : "text-gray-700 hover:bg-blue-50"
                              }`}
                              onClick={() => match && match.precoUnit > 0 && setWinner(itemKey, cot.fornecedor)}
                              title={`Clique para selecionar ${cot.fornecedor} como vencedor`}
                            >
                              {match ? fmt(match.precoUnit) : "—"}
                              {isWinner && <CheckCircle2 size={12} className="inline ml-1 text-green-500" />}
                            </td>
                            <td className="px-3 py-3 text-center text-gray-600 text-xs">{match?.condicao || "—"}</td>
                            <td className="px-3 py-3 text-center text-gray-600 text-xs">{match?.prazoEntrega || "—"}</td>
                          </Fragment>
                        );
                      })}
                      <td className="px-3 py-3 text-center bg-purple-50 text-xs font-semibold text-purple-700">
                        {winner || "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-gray-50 font-semibold">
                <tr>
                  <td className="px-4 py-3 text-gray-700 sticky left-0 bg-gray-50">TOTAL POR FORNECEDOR</td>
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
                  <td className="px-3 py-3 text-center bg-purple-50 text-purple-700 font-bold">
                    {fmt(Object.values(winnerStats).reduce((s, st) => s + st.total, 0))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Botão para gerar pedidos */}
          <div className="px-6 py-4 bg-purple-50/50 border-t border-purple-100 flex justify-end gap-3">
            <button
              onClick={gerarPedidosOmie}
              className="px-6 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium flex items-center gap-2"
            >
              <ShoppingCart size={18} /> Gerar Pedidos de Compra ({Object.keys(pedidosPorFornecedor).length} fornecedor{Object.keys(pedidosPorFornecedor).length !== 1 ? "es" : ""})
            </button>
          </div>
        </div>
      )}

      {/* ═══════════ PEDIDOS GERADOS (SPLIT POR FORNECEDOR) ═══════════ */}
      {showPedidos && pedidosOmie.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-semibold text-emerald-800 flex items-center gap-2">
              <Truck size={20} /> Pedidos de Compra Gerados ({pedidosOmie.length})
            </h3>
          </div>

          {pedidosOmie.map((pedido, pidx) => (
            <div key={pidx} className="bg-white rounded-xl shadow-sm border-2 border-emerald-200 overflow-hidden">
              {/* Header do pedido */}
              <div
                className="px-6 py-4 bg-emerald-50 flex justify-between items-center cursor-pointer"
                onClick={() => setExpandedPedido(expandedPedido === pidx ? null : pidx)}
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
                    <Truck size={20} className="text-emerald-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-emerald-800">{pedido.fornecedor}</p>
                    <p className="text-sm text-emerald-600">{pedido.itensCount} ite{pedido.itensCount === 1 ? "m" : "ns"} — Total: {fmt(pedido.total)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full font-medium">
                    RM-{rm.numero}
                  </span>
                  {expandedPedido === pidx ? <ChevronUp size={20} className="text-emerald-600" /> : <ChevronDown size={20} className="text-emerald-600" />}
                </div>
              </div>

              {/* Itens do pedido */}
              {expandedPedido === pidx && (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">#</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Item</th>
                          <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Qtd</th>
                          <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Preço Unit.</th>
                          <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Prazo</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Cond. Pag.</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {pedido.payload.param[0].det.map((det, didx) => (
                          <tr key={didx} className="hover:bg-gray-50">
                            <td className="px-4 py-2 text-gray-400">{det.ide.sequencia}</td>
                            <td className="px-4 py-2 text-gray-800 font-medium">{det.produto.descricao}</td>
                            <td className="px-4 py-2 text-right text-gray-700">{det.produto.quantidade}</td>
                            <td className="px-4 py-2 text-right text-gray-700">{fmt(det.produto.valor_unitario)}</td>
                            <td className="px-4 py-2 text-right font-semibold text-gray-800">{fmt(det.produto.valor_total)}</td>
                            <td className="px-4 py-2 text-gray-600 text-xs">{det.observacao.split("|")[0].replace("Prazo:", "").trim()}</td>
                            <td className="px-4 py-2 text-gray-600 text-xs">{det.observacao.split("|")[1]?.replace("Cond:", "").trim() || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-gray-50">
                        <tr>
                          <td colSpan={4} className="px-4 py-2 text-right font-semibold text-gray-700">Total do Pedido:</td>
                          <td className="px-4 py-2 text-right font-bold text-emerald-700">{fmt(pedido.total)}</td>
                          <td colSpan={2}></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>

                  {/* JSON Omie */}
                  <div className="px-6 py-4 border-t border-gray-100">
                    <details className="text-sm">
                      <summary className="cursor-pointer text-emerald-600 hover:text-emerald-800 font-medium">
                        Ver JSON para API Omie
                      </summary>
                      <pre className="mt-2 bg-gray-900 text-green-400 rounded-lg p-4 text-xs overflow-x-auto max-h-60">
                        {JSON.stringify(pedido.payload, null, 2)}
                      </pre>
                      <div className="mt-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-xs text-yellow-800">
                        <strong>Endpoint:</strong>{" "}
                        <code className="bg-yellow-100 px-1 rounded">POST https://app.omie.com.br/api/v1/produtos/pedidocompra/</code>
                      </div>
                    </details>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
"use client";
import { useState, useRef, Fragment, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { uid, today, fmt } from "@/lib/utils";
import Badge from "@/components/Badge";
import {
  ArrowLeft, Upload, FileSpreadsheet, FileText, BarChart3, Truck, Trash2,
  CheckCircle2, AlertCircle, Paperclip, Download, Eye, ShoppingCart, Award,
  ArrowRightLeft, ChevronDown, ChevronUp,
} from "lucide-react";

export default function RmDetail({ params }) {
  const { id } = params;
  const { rms, setRms, showToast, loaded } = useStore();
  const router = useRouter();
  const fileRef = useRef(null);
  const pdfRef = useRef(null);

  const [cotFornecedor, setCotFornecedor] = useState("");
  const [showMapa, setShowMapa] = useState(false);
  const [showPedidos, setShowPedidos] = useState(false);
  const [pedidosOmie, setPedidosOmie] = useState([]);
  const [dragActive, setDragActive] = useState(false);
  const [dragActivePdf, setDragActivePdf] = useState(false);
  // Mapa: override do fornecedor vencedor por item (key = item lowercase, value = fornecedor name)
  const [overrides, setOverrides] = useState({});
  const [expandedPedido, setExpandedPedido] = useState(null);

  if (!loaded) return <div className="p-12 text-center text-gray-400">Carregando...</div>;

  const rm = rms.find((r) => r.id === id);
  if (!rm) {
    return (
      <div className="p-12 text-center">
        <AlertCircle size={48} className="mx-auto text-gray-300 mb-4" />
        <p className="text-gray-500 text-lg">RM não encontrada</p>
        <button onClick={() => router.push("/")} className="mt-4 text-blue-600 hover:underline">Voltar ao Painel</button>
      </div>
    );
  }

  const updateRm = (updates) => {
    setRms((prev) => prev.map((r) => (r.id === rm.id ? { ...r, ...updates } : r)));
  };

  // ─── FILE UPLOAD & PARSING (EXCEL/CSV) ───────────────────
  const processFile = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        let dados = [];
        if (file.name.endsWith(".csv") || file.name.endsWith(".tsv")) {
          const Papa = (await import("papaparse")).default;
          const parsed = Papa.parse(ev.target.result, { header: true, skipEmptyLines: true });
          dados = parsed.data;
        } else {
          const XLSX = await import("xlsx");
          const data = new Uint8Array(ev.target.result);
          const wb = XLSX.read(data, { type: "array", cellFormula: false });
          const ws = wb.Sheets[wb.SheetNames[0]];
          dados = XLSX.utils.sheet_to_json(ws);
        }

        const normalize = (row) => {
          const keys = Object.keys(row);
          const find = (terms) => keys.find((k) => terms.some((t) => k.toLowerCase().includes(t)));
          return {
            item: String(row[find(["item", "descri", "material", "produto", "nome"])] || row[keys[0]] || "—").trim(),
            precoUnit:
              parseFloat(
                String(row[find(["pre", "unit", "valor unit", "vl unit", "vl. unit", "preco", "preço"])] || row[keys[1]] || "0")
                  .replace(/[^\d.,]/g, "")
                  .replace(",", ".")
              ) || 0,
            qtd:
              parseFloat(
                String(row[find(["qtd", "quant"])] || row[keys[2]] || "1")
                  .replace(/[^\d.,]/g, "")
                  .replace(",", ".")
              ) || 1,
            prazoEntrega: String(row[find(["prazo", "entrega", "dias", "lead"])] || "—").trim(),
            condicao: String(row[find(["cond", "pagamento", "pag", "forma"])] || "—").trim(),
            estoque: String(row[find(["estoque", "disp", "disponib"])] || "—").trim(),
          };
        };

        const itens = dados.map(normalize).filter((d) => d.item !== "—" || d.precoUnit > 0);
        if (itens.length === 0) return showToast("Não foi possível ler itens da planilha. Verifique o formato.", "error");

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
          status: rm.status === "Aberta" ? "Em Cotação" : rm.status,
        });

        setCotFornecedor("");
        showToast(`Cotação "${file.name}" importada com ${itens.length} itens!`);
      } catch (err) {
        showToast("Erro ao ler arquivo: " + err.message, "error");
      }
    };
    if (file.name.endsWith(".csv") || file.name.endsWith(".tsv")) reader.readAsText(file);
    else reader.readAsArrayBuffer(file);
  };

  const handleFileUpload = (e) => { processFile(e.target.files[0]); e.target.value = ""; };
  const handleDrop = (e) => { e.preventDefault(); setDragActive(false); processFile(e.dataTransfer.files[0]); };

  // ─── PDF/ANEXO UPLOAD ────────────────────────────────────
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
        status: rm.status === "Aberta" ? "Em Cotação" : rm.status,
      });
      setCotFornecedor("");
      showToast(`Proposta "${file.name}" anexada!`);
    };
    reader.readAsDataURL(file);
  };

  const handlePdfUpload = (e) => { processPdf(e.target.files[0]); e.target.value = ""; };
  const handleDropPdf = (e) => { e.preventDefault(); setDragActivePdf(false); processPdf(e.dataTransfer.files[0]); };
  const removeAnexo = (anexoId) => { updateRm({ anexos: (rm.anexos || []).filter((a) => a.id !== anexoId) }); showToast("Anexo removido"); };
  const removeCotacao = (cotId) => { updateRm({ cotacoes: (rm.cotacoes || []).filter((c) => c.id !== cotId) }); showToast("Cotação removida"); };

  // ─── MAPA DE COTAÇÃO ─────────────────────────────────────
  const gerarMapa = () => {
    if ((rm.cotacoes || []).length < 2) return showToast("Suba pelo menos 2 cotações para gerar o mapa", "error");
    updateRm({ status: "Cotada", mapaGerado: true });
    setShowMapa(true);
  };

  const cotacoes = rm.cotacoes || [];
  const anexos = rm.anexos || [];

  // Build mapa items: consolidate all items across all quotations
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

  // Determine the winner for each item (lowest price, with manual override)
  const getWinner = (mi) => {
    const key = mi.item.toLowerCase().trim();
    if (overrides[key]) return overrides[key];
    const precos = mi.cotacoes.filter((c) => c.precoUnit > 0);
    if (precos.length === 0) return null;
    precos.sort((a, b) => a.precoUnit - b.precoUnit);
    return precos[0].fornecedor;
  };

  const setWinner = (itemKey, fornecedor) => {
    setOverrides((prev) => ({ ...prev, [itemKey]: fornecedor }));
  };

  // Group winning items by supplier for purchase orders
  const pedidosPorFornecedor = useMemo(() => {
    if (mapaItems.length === 0) return {};
    const groups = {};
    mapaItems.forEach((mi) => {
      const winner = getWinner(mi);
      if (!winner) return;
      const match = mi.cotacoes.find((c) => c.fornecedor === winner);
      if (!match) return;
      if (!groups[winner]) groups[winner] = { fornecedor: winner, itens: [], total: 0 };
      groups[winner].itens.push({
        item: mi.item,
        precoUnit: match.precoUnit,
        qtd: match.qtd,
        total: match.total,
        prazoEntrega: match.prazoEntrega,
        condicao: match.condicao,
      });
      groups[winner].total += match.total;
    });
    return groups;
  }, [mapaItems, overrides]);

  // ─── GERAR PEDIDOS DE COMPRA (SPLIT POR FORNECEDOR) ─────
  const gerarPedidosOmie = () => {
    const groups = Object.values(pedidosPorFornecedor);
    if (groups.length === 0) return showToast("Nenhum item selecionado no mapa", "error");

    const pedidos = groups.map((g) => ({
      fornecedor: g.fornecedor,
      total: g.total,
      itensCount: g.itens.length,
      payload: {
        call: "IncluirPedidoCompra",
        app_key: "SUA_APP_KEY",
        app_secret: "SEU_APP_SECRET",
        param: [
          {
            cabecalho: {
              numero_pedido: `RM-${rm.numero}-${g.fornecedor.replace(/\s+/g, "").substring(0, 10)}`,
              codigo_cliente_fornecedor: 0,
              data_previsao: today(),
              observacao: `${rm.descricao} — Fornecedor: ${g.fornecedor}`,
            },
            det: g.itens.map((it, idx) => ({
              ide: { sequencia: idx + 1 },
              produto: {
                descricao: it.item,
                quantidade: it.qtd,
                valor_unitario: it.precoUnit,
                valor_total: it.total,
              },
              observacao: `Prazo: ${it.prazoEntrega} | Cond: ${it.condicao}`,
            })),
            observacoes: { obs_venda: rm.observacao || "" },
            total_pedido: { valor_total_pedido: g.total },
          },
        ],
      },
    }));

    setPedidosOmie(pedidos);
    updateRm({ status: "Pedido Gerado" });
    setShowPedidos(true);
    showToast(`${pedidos.length} pedido(s) de compra gerado(s)!`);
  };

  // ─── CONTAGENS POR FORNECEDOR NO MAPA ───────────────────
  const winnerStats = useMemo(() => {
    const stats = {};
    mapaItems.forEach((mi) => {
      const winner = getWinner(mi);
      if (!winner) return;
      if (!stats[winner]) stats[winner] = { count: 0, total: 0 };
      const match = mi.cotacoes.find((c) => c.fornecedor === winner);
      if (match) {
        stats[winner].count++;
        stats[winner].total += match.total;
      }
    });
    return stats;
  }, [mapaItems, overrides]);

  return (
    <div className="space-y-6 max-w-7xl">
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
          <div><span className="text-gray-500">Solicitante:</span> <span className="font-medium ml-1">{rm.solicitante || "—"}</span></div>
          <div><span className="text-gray-500">Cotações:</span> <span className="font-medium ml-1">{cotacoes.length} planilhas + {anexos.length} anexos</span></div>
        </div>
        <p className="mt-3 text-gray-700 font-medium">{rm.descricao}</p>
        {rm.observacao && <p className="mt-1 text-gray-500 text-sm">{rm.observacao}</p>}
        {rm.arquivoOrigem && <p className="mt-1 text-xs text-gray-400">Arquivo origem: {rm.arquivoOrigem}</p>}
      </div>

      {/* Itens da RM */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-gray-800">Itens da Requisição ({(rm.itens || []).length})</h3>
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

      {/* ─── UPLOAD DE PROPOSTAS ─────────────────────────── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-2">Incluir Propostas / Cotações</h3>
        <p className="text-sm text-gray-500 mb-4">
          Suba planilhas (.xlsx/.csv) para leitura automática de preços, ou PDFs de propostas recebidas como anexo.
        </p>
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
            <p className="text-gray-600 font-medium text-sm">Planilha de Cotação</p>
            <p className="text-gray-400 text-xs mt-1">.xlsx, .xls ou .csv — leitura automática</p>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv,.tsv" className="hidden" onChange={handleFileUpload} />
          </div>
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
            <p className="text-gray-400 text-xs mt-1">.pdf — salvo como anexo</p>
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
                    <p className="text-xs text-gray-400">{anexo.fornecedor} — {anexo.tamanho} — {anexo.data}</p>
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

      {/* Lista de cotações (planilhas) */}
      {cotacoes.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center flex-wrap gap-3">
            <h3 className="text-lg font-semibold text-gray-800">
              <FileSpreadsheet size={18} className="inline text-green-600 mr-1" />
              Cotações em Planilha ({cotacoes.length})
            </h3>
            {cotacoes.length >= 2 && (
              <button
                onClick={gerarMapa}
                className="px-4 py-2 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 font-medium flex items-center gap-2"
              >
                <BarChart3 size={16} /> Gerar Mapa de Cotação
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
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ações</th>
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

      {/* ═══════════ MAPA DE COTAÇÃO ═══════════ */}
      {showMapa && mapaItems.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border-2 border-purple-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-purple-100 bg-purple-50 flex justify-between items-start flex-wrap gap-3">
            <div>
              <h3 className="text-lg font-semibold text-purple-800 flex items-center gap-2">
                <BarChart3 size={20} /> Mapa de Cotação
              </h3>
              <p className="text-sm text-purple-600 mt-1">
                O menor preço por item está destacado em verde. Clique em outro fornecedor para alterar a seleção.
              </p>
            </div>
          </div>

          {/* Resumo por fornecedor vencedor */}
          <div className="px-6 py-4 bg-purple-50/50 border-b border-purple-100">
            <h4 className="text-sm font-semibold text-purple-700 mb-3 flex items-center gap-2">
              <Award size={16} /> Resumo — Itens por Fornecedor Vencedor
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {Object.entries(winnerStats).map(([forn, stats]) => (
                <div key={forn} className="bg-white rounded-lg border border-purple-200 px-4 py-3 flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-gray-800 text-sm">{forn}</p>
                    <p className="text-xs text-gray-500">{stats.count} ite{stats.count === 1 ? "m" : "ns"}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-green-700 text-sm">{fmt(stats.total)}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 pt-3 border-t border-purple-200 flex items-center justify-between text-sm">
              <span className="text-purple-700 font-medium">
                Total geral (menores preços): {fmt(Object.values(winnerStats).reduce((s, st) => s + st.total, 0))}
              </span>
              <span className="text-xs text-purple-500">
                {Object.keys(winnerStats).length} fornecedor{Object.keys(winnerStats).length !== 1 ? "es" : ""}
              </span>
            </div>
          </div>

          {/* Tabela do mapa */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase sticky left-0 bg-gray-50 min-w-[200px]">Item</th>
                  {cotacoes.map((cot) => (
                    <th key={cot.id} className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase" colSpan={3}>
                      {cot.fornecedor}
                    </th>
                  ))}
                  <th className="px-4 py-3 text-center text-xs font-medium text-purple-600 uppercase bg-purple-50">Vencedor</th>
                </tr>
                <tr className="bg-gray-50">
                  <th className="px-4 py-2 sticky left-0 bg-gray-50"></th>
                  {cotacoes.map((cot) => (
                    <Fragment key={cot.id + "-sub"}>
                      <th className="px-3 py-2 text-xs text-gray-400 text-center">Preço Un.</th>
                      <th className="px-3 py-2 text-xs text-gray-400 text-center">Cond. Pag.</th>
                      <th className="px-3 py-2 text-xs text-gray-400 text-center">Prazo</th>
                    </Fragment>
                  ))}
                  <th className="px-3 py-2 text-xs text-purple-400 text-center bg-purple-50">Seleção</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {mapaItems.map((mi, idx) => {
                  const precos = mi.cotacoes.map((c) => c.precoUnit).filter((p) => p > 0);
                  const menorPreco = precos.length > 0 ? Math.min(...precos) : 0;
                  const winner = getWinner(mi);
                  const itemKey = mi.item.toLowerCase().trim();
                  return (
                    <tr key={idx} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-800 sticky left-0 bg-white min-w-[200px]">{mi.item}</td>
                      {cotacoes.map((cot) => {
                        const match = mi.cotacoes.find((c) => c.fornecedor === cot.fornecedor);
                        const isLowest = match && match.precoUnit === menorPreco && match.precoUnit > 0;
                        const isWinner = match && cot.fornecedor === winner;
                        return (
                          <Fragment key={cot.id + "-" + idx}>
                            <td
                              className={`px-3 py-3 text-center font-semibold cursor-pointer transition-colors ${
                                isWinner
                                  ? "bg-green-50 text-green-700 ring-2 ring-inset ring-green-300"
                                  : isLowest
                                  ? "bg-green-50/50 text-green-600"
                                  : "text-gray-700 hover:bg-blue-50"
                              }`}
                              onClick={() => match && match.precoUnit > 0 && setWinner(itemKey, cot.fornecedor)}
                              title={`Clique para selecionar ${cot.fornecedor} como vencedor`}
                            >
                              {match ? fmt(match.precoUnit) : "—"}
                              {isWinner && <CheckCircle2 size={12} className="inline ml-1 text-green-500" />}
                            </td>
                            <td className="px-3 py-3 text-center text-gray-600 text-xs">{match?.condicao || "—"}</td>
                            <td className="px-3 py-3 text-center text-gray-600 text-xs">{match?.prazoEntrega || "—"}</td>
                          </Fragment>
                        );
                      })}
                      <td className="px-3 py-3 text-center bg-purple-50 text-xs font-semibold text-purple-700">
                        {winner || "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-gray-50 font-semibold">
                <tr>
                  <td className="px-4 py-3 text-gray-700 sticky left-0 bg-gray-50">TOTAL POR FORNECEDOR</td>
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
                  <td className="px-3 py-3 text-center bg-purple-50 text-purple-700 font-bold">
                    {fmt(Object.values(winnerStats).reduce((s, st) => s + st.total, 0))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Botão para gerar pedidos */}
          <div className="px-6 py-4 bg-purple-50/50 border-t border-purple-100 flex justify-end gap-3">
            <button
              onClick={gerarPedidosOmie}
              className="px-6 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium flex items-center gap-2"
            >
              <ShoppingCart size={18} /> Gerar Pedidos de Compra ({Object.keys(pedidosPorFornecedor).length} fornecedor{Object.keys(pedidosPorFornecedor).length !== 1 ? "es" : ""})
            </button>
          </div>
        </div>
      )}

      {/* ═══════════ PEDIDOS GERADOS (SPLIT POR FORNECEDOR) ═══════════ */}
      {showPedidos && pedidosOmie.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-semibold text-emerald-800 flex items-center gap-2">
              <Truck size={20} /> Pedidos de Compra Gerados ({pedidosOmie.length})
            </h3>
          </div>

          {pedidosOmie.map((pedido, pidx) => (
            <div key={pidx} className="bg-white rounded-xl shadow-sm border-2 border-emerald-200 overflow-hidden">
              {/* Header do pedido */}
              <div
                className="px-6 py-4 bg-emerald-50 flex justify-between items-center cursor-pointer"
                onClick={() => setExpandedPedido(expandedPedido === pidx ? null : pidx)}
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
                    <Truck size={20} className="text-emerald-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-emerald-800">{pedido.fornecedor}</p>
                    <p className="text-sm text-emerald-600">{pedido.itensCount} ite{pedido.itensCount === 1 ? "m" : "ns"} — Total: {fmt(pedido.total)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full font-medium">
                    RM-{rm.numero}
                  </span>
                  {expandedPedido === pidx ? <ChevronUp size={20} className="text-emerald-600" /> : <ChevronDown size={20} className="text-emerald-600" />}
                </div>
              </div>

              {/* Itens do pedido */}
              {expandedPedido === pidx && (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">#</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Item</th>
                          <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Qtd</th>
                          <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Preço Unit.</th>
                          <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Prazo</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Cond. Pag.</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {pedido.payload.param[0].det.map((det, didx) => (
                          <tr key={didx} className="hover:bg-gray-50">
                            <td className="px-4 py-2 text-gray-400">{det.ide.sequencia}</td>
                            <td className="px-4 py-2 text-gray-800 font-medium">{det.produto.descricao}</td>
                            <td className="px-4 py-2 text-right text-gray-700">{det.produto.quantidade}</td>
                            <td className="px-4 py-2 text-right text-gray-700">{fmt(det.produto.valor_unitario)}</td>
                            <td className="px-4 py-2 text-right font-semibold text-gray-800">{fmt(det.produto.valor_total)}</td>
                            <td className="px-4 py-2 text-gray-600 text-xs">{det.observacao.split("|")[0].replace("Prazo:", "").trim()}</td>
                            <td className="px-4 py-2 text-gray-600 text-xs">{det.observacao.split("|")[1]?.replace("Cond:", "").trim() || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-gray-50">
                        <tr>
                          <td colSpan={4} className="px-4 py-2 text-right font-semibold text-gray-700">Total do Pedido:</td>
                          <td className="px-4 py-2 text-right font-bold text-emerald-700">{fmt(pedido.total)}</td>
                          <td colSpan={2}></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>

                  {/* JSON Omie */}
                  <div className="px-6 py-4 border-t border-gray-100">
                    <details className="text-sm">
                      <summary className="cursor-pointer text-emerald-600 hover:text-emerald-800 font-medium">
                        Ver JSON para API Omie
                      </summary>
                      <pre className="mt-2 bg-gray-900 text-green-400 rounded-lg p-4 text-xs overflow-x-auto max-h-60">
                        {JSON.stringify(pedido.payload, null, 2)}
                      </pre>
                      <div className="mt-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-xs text-yellow-800">
                        <strong>Endpoint:</strong>{" "}
                        <code className="bg-yellow-100 px-1 rounded">POST https://app.omie.com.br/api/v1/produtos/pedidocompra/</code>
                      </div>
                    </details>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
