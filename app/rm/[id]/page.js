app/rm/[id]/page.js
"use client";
import { useState, useRef, Fragment, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { uid, today, fmt } from "@/lib/utils";
import Badge from "@/components/Badge";
import {
  ArrowLeft, Upload, FileSpreadsheet, FileText, BarChart3, Truck, Trash2,
  CheckCircle2, AlertCircle, Paperclip, Download, Eye, ShoppingCart, Award,
  ArrowRightLeft, ChevronDown, ChevronUp, Mail, Send, Clock, ExternalLink,
} from "lucide-react";

export default function RmDetail({ params }) {
  const { id } = params;
  const { rms, setRms, fornecedores, showToast, loaded } = useStore();
  const router = useRouter();
  const fileRef = useRef(null);
  const pdfRef = useRef(null);

  const [cotFornecedor, setCotFornecedor] = useState("");
  const [sendingOmie, setSendingOmie] = useState(false);
  const [omieResult, setOmieResult] = useState(null);
  const [showMapa, setShowMapa] = useState(false);
  const [showPedidos, setShowPedidos] = useState(false);
  const [pedidosOmie, setPedidosOmie] = useState([]);
  const [dragActive, setDragActive] = useState(false);
  const [dragActivePdf, setDragActivePdf] = useState(false);
  // Mapa: override do fornecedor vencedor por item (key = item lowercase, value = fornecedor name)
  const [overrides, setOverrides] = useState({});
  const [expandedPedido, setExpandedPedido] = useState(null);
  const [selectedFornecedores, setSelectedFornecedores] = useState([]);
  const [criandoPedido, setCriandoPedido] = useState(false);
  const [alertasEng, setAlertasEng] = useState([]);

  const rmFound = rms.find((r) => r.id === id);
  const rm = rmFound || { itens: [], cotacoes: [], envios: [], anexos: [], status: "", numero: "", descricao: "", observacao: "", data: "", op: "", tipo: "", id: null };
  const updateRm = (updates) => {
    setRms((prev) => prev.map((r) => (r.id === rm.id ? { ...r, ...updates } : r)));
  };

  // âââ FILE UPLOAD & PARSING (EXCEL/CSV) âââââââââââââââââââ
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
            item: String(row[find(["item", "descri", "material", "produto", "nome"])] || row[keys[0]] || "â").trim(),
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
            prazoEntrega: String(row[find(["prazo", "entrega", "dias", "lead"])] || "â").trim(),
            condicao: String(row[find(["cond", "pagamento", "pag", "forma"])] || "â").trim(),
            estoque: String(row[find(["estoque", "disp", "disponib"])] || "â").trim(),
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

  const handleFileUpload = (e) => { processFile(e.target.files[0]); e.target.value = ""; };
  const handleDrop = (e) => { e.preventDefault(); setDragActive(false); processFile(e.dataTransfer.files[0]); };

  // âââ PDF/ANEXO UPLOAD ââââââââââââââââââââââââââââââââââââ
  const processPdf = async (file) => {
    if (!file) return;
    const fornecedorNome = cotFornecedor.trim() || "Fornecedor " + ((rm.cotacoes || []).length + 1);

    // Read file as both dataURL (for anexo) and ArrayBuffer (for extraction)
    const readAsDataURL = (f) => new Promise((res) => { const r = new FileReader(); r.onload = (e) => res(e.target.result); r.readAsDataURL(f); });
    const readAsArrayBuffer = (f) => new Promise((res) => { const r = new FileReader(); r.onload = (e) => res(e.target.result); r.readAsArrayBuffer(f); });

    const dataUrl = await readAsDataURL(file);
    
    // Always save as anexo
    const novoAnexo = { id: uid(), nome: file.name, tipo: "application/pdf", tamanho: file.size, data: today(), fornecedor: fornecedorNome, url: dataUrl };
    
    // Try to extract prices from PDF
    let extractedItens = [];
    try {
      const arrayBuf = await readAsArrayBuffer(file);
      if (!window.pdfjsLib) {
        await new Promise((resolve, reject) => {
          const s = document.createElement("script");
          s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
          s.onload = resolve;
          s.onerror = reject;
          document.head.appendChild(s);
        });
      }
      const pdfjsLib = window.pdfjsLib;
      pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuf) }).promise;
      let fullText = "";
      for (let p = 1; p <= pdf.numPages; p++) {
        const page = await pdf.getPage(p);
        const tc = await page.getTextContent();
        fullText += tc.items.map(i => i.str).join(" ") + "\n";
      }
      // Try to match RM items and extract prices
      const rmItens = rm.itens || [];
      extractedItens = matchPdfPrices(fullText, rmItens);
    } catch (err) {
      console.warn("PDF extraction failed:", err);
    }

    if (extractedItens.length > 0) {
      const total = extractedItens.reduce((s, it) => s + (it.precoUnit * (it.qtd || 1)), 0);
      const novaCotacao = {
        id: uid(),
        fornecedor: fornecedorNome,
        nomeArquivo: file.name,
        tipo: "pdf-extraido",
        data: today(),
        itens: extractedItens,
        total,
      };
      updateRm({
        cotacoes: [...(rm.cotacoes || []), novaCotacao],
        anexos: [...(rm.anexos || []), novoAnexo],
        status: rm.status === "Aberta" ? "Em Cota\u00e7\u00e3o" : rm.status,
      });
      showToast("Cota\u00e7\u00e3o extra\u00edda do PDF com " + extractedItens.length + " itens!");
    } else {
      updateRm({ anexos: [...(rm.anexos || []), novoAnexo] });
      showToast("PDF salvo como anexo. N\u00e3o foi poss\u00edvel extrair pre\u00e7os automaticamente.");
    }
    setCotFornecedor("");
  };

  const matchPdfPrices = (text, rmItens) => {
    const result = [];
    const lines = text.split("\n");
    const allText = text.toUpperCase();
    
    rmItens.forEach((rmItem) => {
      const desc = (rmItem.descricao || rmItem.item || "").toUpperCase().trim();
      if (!desc) return;
      
      // Try to find this item in the PDF text
      const words = desc.split(/\s+/).filter(w => w.length > 2);
      let bestLine = "";
      let bestScore = 0;
      
      lines.forEach((line) => {
        const upper = line.toUpperCase();
        let score = 0;
        words.forEach(w => { if (upper.includes(w)) score++; });
        if (score > bestScore && score >= Math.max(1, words.length * 0.5)) {
          bestScore = score;
          bestLine = line;
        }
      });
      
      if (bestLine) {
        // Extract price from the matched line - look for currency patterns
        const pricePatterns = [
          /R\$\s*([\d.,]+)/g,
          /([\d.]+,[\d]{2})(?!\d)/g,
          /\b(\d{1,3}(?:\.\d{3})*,\d{2})\b/g,
        ];
        let price = 0;
        let qtdCot = rmItem.qtd || 1;
        
        // Try to find quantity in the line
        const qtyMatch = bestLine.match(new RegExp(desc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s+(\\d+(?:[.,]\\d+)?)'));
        if (qtyMatch) qtdCot = parseFloat(qtyMatch[1].replace(',', '.'));
        
        for (const pattern of pricePatterns) {
          const matches = [...bestLine.matchAll(pattern)];
          if (matches.length > 0) {
            // Take the last number as price (usually unit price is last)
            const lastMatch = matches[matches.length - 1][1];
            price = parseFloat(lastMatch.replace(/\./g, '').replace(',', '.'));
            break;
          }
        }
        
        if (price > 0) {
          result.push({
            item: rmItem.descricao || rmItem.item,
            precoUnit: price,
            qtd: qtdCot,
            prazoEntrega: "\u2014",
            condicao: "\u2014",
            estoque: "\u2014",
          });
        }
      }
    });
    return result;
  };

  const handlePdfUpload = (e) => { processPdf(e.target.files[0]); e.target.value = ""; };
  const handleDropPdf = (e) => { e.preventDefault(); setDragActivePdf(false); processPdf(e.dataTransfer.files[0]); };
  const removeAnexo = (anexoId) => { updateRm({ anexos: (rm.anexos || []).filter((a) => a.id !== anexoId) }); showToast("Anexo removido"); };
  const removeCotacao = (cotId) => { updateRm({ cotacoes: (rm.cotacoes || []).filter((c) => c.id !== cotId) }); showToast("CotaÃ§Ã£o removida"); };

  // âââ MAPA DE COTAÃÃO âââââââââââââââââââââââââââââââââââââ
  // --- Parse PDF proposal into cotacao format ---
  const parsePdfCotacao = async (anexo) => {
    if (!window.pdfjsLib) {
      await new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
        s.onload = resolve; s.onerror = reject;
        document.head.appendChild(s);
      });
    }
    const pdfjsLib = window.pdfjsLib;
    pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    const base64 = anexo.dataUrl.split(",")[1];
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const doc = await pdfjsLib.getDocument({ data: bytes }).promise;
    let fullText = "";
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      fullText += content.items.map(x => x.str).join(" ") + "\n";
    }
    // Parse items from PDF text (Gerdau format and generic)
    const items = [];
    const regex = /(\d+)\s+(PF [IH] [\w,.]+|CANT [\d/X\.]+)\s+([A-Z0-9]+)\s+(\d+M)\s+FX[\d,]+T\s+([\d.,]+)\s+KG\s+[\d.,]+\s+KG\s+\d+\/\d+\/\d+\s+([\d.,]+)\s+BRL\/KG[\s\S]*?([\d.,]+)\s+BRL/g;
    let m;
    while ((m = regex.exec(fullText)) !== null) {
      const qtdKg = parseFloat(m[5].replace(/\./g,"").replace(",","."));
      const precoKg = parseFloat(m[6].replace(/\./g,"").replace(",","."));
      const totalBrl = parseFloat(m[7].replace(/\./g,"").replace(",","."));
      // Normalize description to match RM format
      let desc = m[2].replace("PF I ", "PERFIL ").replace("PF H ", "PERFIL ").replace(",",".");
      desc = desc.replace("CANT ", "CANTONEIRA ");
      items.push({
        item: desc,
        precoUnit: precoKg,
        qtd: qtdKg,
        total: totalBrl,
        prazoEntrega: "30/45/60 dias",
        condicao: "CIF",
        estoque: "",
        _pdfOrigDesc: m[2],
        _pdfMaterial: m[3],
        _pdfComprimento: m[4],
        _pdfQtdKg: qtdKg,
        _pdfPrecoKg: precoKg,
        _unidade: "KG",
      });
    }
    return { fornecedor: anexo.fornecedor || "Fornecedor PDF", itens: items };
  };

  const gerarMapa = async () => {
    const hasCotacoes = rm.cotacoes && rm.cotacoes.length > 0;
    const hasAnexosPdf = rm.anexos && rm.anexos.some(a => a.tipo === "pdf" && a.dataUrl);
    if (!hasCotacoes && !hasAnexosPdf) return showToast("Suba pelo menos uma cota\u00e7\u00e3o (planilha ou PDF)", "error");
    // Parse PDF annexos into cotacao format
    const pdfCotacoes = [];
    const alertas = [];
    if (hasAnexosPdf) {
      for (const anexo of rm.anexos.filter(a => a.tipo === "pdf" && a.dataUrl)) {
        try {
          const parsed = await parsePdfCotacao(anexo);
          pdfCotacoes.push(parsed);
          // Check for alerts
          const rmDescs = (rm.itens || []).map(it => (it.descricao || "").toUpperCase().trim().replace(/"/g, ""));
          // Items in RM but not in PDF
          rmDescs.forEach(rd => {
            const found = parsed.itens.some(pi => rd.includes(pi.item.split(" ").slice(-1)[0]) || pi.item.toUpperCase().includes(rd.split(" ").slice(-1)[0]));
            if (!found && rd) alertas.push({ tipo: "sem_cotacao", item: rd, msg: "Item sem cota\u00e7\u00e3o no PDF: " + rd });
          });
// Check length differences
          parsed.itens.forEach(pi => {
            if (pi._pdfComprimento) {
              const rmItem = (rm.itens || []).find(it => {
                const rd = (it.descricao || "").toUpperCase().replace(/"/g, "");
                const pd = pi.item.toUpperCase();
                return rd.includes(pd.split(" ").slice(-1)[0]) || pd.includes(rd.split(" ").slice(-1)[0]);
              });
              if (rmItem && rmItem.comprimento && rmItem.comprimento !== pi._pdfComprimento) {
                alertas.push({ tipo: "comprimento", item: pi.item, msg: pi.item + " - comprimento RM: " + rmItem.comprimento + " vs Proposta: " + pi._pdfComprimento });
              }
            }
          });
        } catch (e) { showToast("Erro ao ler PDF: " + e.message, "error"); }
      }
    }
    // Store PDF cotacoes merged with existing cotacoes
    if (pdfCotacoes.length) {
      updateRm({ cotacoes: [...(rm.cotacoes || []).filter(c => !pdfCotacoes.some(p => p.fornecedor === c.fornecedor)), ...pdfCotacoes], status: rm.status === "Aberta" || rm.status === "Em Cota\u00e7\u00e3o" ? "Cotada" : rm.status, mapaGerado: true });
    } else {
      updateRm({ status: "Cotada", mapaGerado: true });
    }
    setAlertasEng(alertas);
    setShowMapa(true);
  };

  const gerarXlsxMapa = async () => {
    const XLSX = await import("xlsx");
    const cotacoes = rm.cotacoes || [];
    const allItems = new Map();
    cotacoes.forEach(cot => {
      (cot.itens || []).forEach(it => {
        const key = (it.item || "").toLowerCase().trim();
        if (!allItems.has(key)) allItems.set(key, { item: it.item, cotacoes: [] });
        allItems.get(key).cotacoes.push({ fornecedor: cot.fornecedor, precoUnit: it.precoUnit, qtd: it.qtd, total: it.total || (it.precoUnit * it.qtd), condicao: it.condicao, prazo: it.prazoEntrega, unidade: it._unidade || "" });
      });
    });
    const mapaItems = Array.from(allItems.values());
    const wsData = [["Item RM", "CÃ³d. Omie", "Qtd Barras", "Peso RM (kg)", "Un RM", "Fornecedor", "Descri\u00e7\u00e3o Proposta", "Qtd (kg)", "Pre\u00e7o/kg", "Total R$", "Condi\u00e7\u00e3o", "Prazo", "Alerta Engenharia"]];
    mapaItems.forEach(mi => {
      const rmItem = (rm.itens || []).find(it => (it.descricao || "").toLowerCase().trim() === mi.item.toLowerCase().trim());
      mi.cotacoes.forEach(c => {
        const alerta = alertasEng.filter(a => a.item.toLowerCase().includes(mi.item.toLowerCase().split(" ").slice(-1)[0])).map(a => a.msg).join("; ");
        wsData.push([mi.item, rmItem ? rmItem.codigo || "" : "", rmItem ? rmItem.qtd : "", rmItem ? rmItem.peso : "", rmItem ? rmItem.unidade : "", c.fornecedor, c.unidade === "KG" ? "Pre\u00e7o por KG" : "", c.qtd, c.precoUnit, c.total, c.condicao, c.prazo, alerta]);
      });
    });
    // Add items without quotation
    (rm.itens || []).forEach(it => {
      const key = (it.descricao || "").toLowerCase().trim();
      if (!allItems.has(key)) {
        wsData.push([it.descricao, it.codigo || "", it.qtd, it.peso || "", it.unidade, "", "", "", "", "", "", "", "SEM COTA\u00c7\u00c3O"]);
      }
    });
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws["!cols"] = [{wch:25},{wch:8},{wch:8},{wch:20},{wch:18},{wch:12},{wch:12},{wch:14},{wch:10},{wch:18},{wch:35}];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Mapa Cota\u00e7\u00e3o");
    XLSX.writeFile(wb, "Mapa_Cotacao_RM-" + (rm.numero || rm.id) + ".xlsx");
    showToast("Planilha do mapa exportada!");
  };

  const criarPedidoOmie = async (fornecedorNome) => {
    const group = pedidosPorFornecedor[fornecedorNome];
    if (!group || group.itens.length === 0) return showToast("Nenhum item para este fornecedor", "error");
    setCriandoPedido(true);
    try {
      const fornCadastrado = fornecedores.find(
        (f) => f.nome && f.nome.toLowerCase().trim() === fornecedorNome.toLowerCase().trim()
      );
      const nCodFor = fornCadastrado?.nCodOmie || 0;
      const nQtdeParc = fornCadastrado?.parcelas || 1;
      const opInfo = rm.op ? `OP: ${rm.op}` : "";
      const cotacaoNumero = `RM-${rm.numero}`;
      const observacaoInterna = `Pedido via Portal de Compras - ${cotacaoNumero} - Fornecedor: ${fornecedorNome}${rm.observacao ? " | " + rm.observacao : ""}`;
      const resp = await fetch("/api/omie/pedido-compra", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itens: group.itens.map((it) => ({ codigo: it.codigo, descricao: it.descricao || it.item, unidade: it.unidade || "KG", qtd: it.qtd, precoUnit: it.precoUnit })),
          nCodFor, cNumPedido: cotacaoNumero, nQtdeParc, cInfAdic: opInfo, observacao: observacaoInterna,
        }),
      });
      const data = await resp.json();
      if (!resp.ok || data.error) { showToast(`Erro Omie: ${data.error || "Erro desconhecido"}`, "error"); return; }
      const novoPedido = { fornecedor: fornecedorNome, total: group.total, itensCount: group.itens.length, codigoPedido: data.codigo_pedido, numeroPedido: data.numero_pedido, codigoIntegracao: data.codigo_pedido_integracao, itens: group.itens };
      setPedidosOmie((prev) => [...prev, novoPedido]);
      updateRm({ status: "Pedido Gerado" });
      setShowPedidos(true);
      showToast(`Pedido criado no Omie! N: ${data.numero_pedido || data.codigo_pedido}`);
    } catch (err) { showToast("Erro ao criar pedido: " + err.message, "error"); }
    finally { setCriandoPedido(false); }
  };

  const criarTodosPedidosOmie = async () => {
    const groups = Object.keys(pedidosPorFornecedor);
    if (groups.length === 0) return showToast("Nenhum item selecionado no mapa", "error");
    for (const fornecedorNome of groups) { await criarPedidoOmie(fornecedorNome); }
  };

    // Group winning items by supplier for purchase orders
  const pedidosPorFornecedor = useMemo(() => {
    if (mapaItems.length === 0) return {};
    const groups = {};
    const rmItens = rm.itens || [];
    mapaItems.forEach((mi) => {
      const winner = getWinner(mi);
      if (!winner) return;
      const match = mi.cotacoes.find((c) => c.fornecedor === winner);
      if (!match) return;
      // Match back to RM item to get codigo and unidade
      const rmItem = rmItens.find(
        (ri) => ri.descricao && ri.descricao.toLowerCase().trim() === mi.item.toLowerCase().trim()
      );
      if (!groups[winner]) groups[winner] = { fornecedor: winner, itens: [], total: 0 };
      groups[winner].itens.push({
        item: mi.item,
        descricao: mi.item,
        codigo: rmItem?.codigo || "",
        unidade: rmItem?.unidade || "KG",
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

  // âââ GERAR PEDIDOS DE COMPRA (SPLIT POR FORNECEDOR) âââââ
  

  // âââ CONTAGENS POR FORNECEDOR NO MAPA âââââââââââââââââââ
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

  if (!loaded) return <div className="p-12 text-center text-gray-400">Carregando...</div>;
  if (!rmFound) {
    return (
      <div className="p-12 text-center">
        <div className="text-gray-500 text-lg">RM nÃ£o encontrada</div>
        <button onClick={() => router.push("/")} className="mt-4 text-blue-600 hover:underline">Voltar ao Painel</button>
      </div>
    );
  }

  // âââ ENVIO DE COTAÃÃO (SIMULADO) ââââââââââââââââââââââ
  const toggleFornecedor = (fornId) => {
    setSelectedFornecedores((prev) =>
      prev.includes(fornId) ? prev.filter((id) => id !== fornId) : [...prev, fornId]
    );
  };

  const enviarCotacao = () => {
    if (!selectedFornecedores.length) return showToast("Selecione pelo menos um fornecedor", "error");
    const destinatarios = selectedFornecedores.map(fornId => {
      const forn = fornecedores.find(f => f.id === fornId);
      return forn;
    }).filter(f => f && f.email);
    if (!destinatarios.length) return showToast("Nenhum fornecedor selecionado possui e-mail cadastrado", "error");
    const emails = destinatarios.map(f => f.email).join(";");
    const assunto = encodeURIComponent("SolicitaÃ§Ã£o de CotaÃ§Ã£o - RM " + (rm.numero || rm.id));
    const itensTexto = (rm.itens || []).map((it, i) =>
      (i + 1) + ". " + (it.descricao || "Item " + (i + 1)) + " - Qtd: " + (it.qtd || "-") + " " + (it.unidade || "un") + (it.material ? " - Material: " + it.material : "") + (it.comprimento ? " - Comp: " + it.comprimento : "")
    ).join("\n");
    const corpo = encodeURIComponent(
      "Prezado(a) fornecedor(a),\n\n" +
      "GostarÃ­amos de solicitar cotaÃ§Ã£o para os itens abaixo:\n\n" +
      "RM: " + (rm.numero || rm.id) + "\n" +
      (rm.descricao ? "DescriÃ§Ã£o: " + rm.descricao + "\n" : "") +
      (rm.solicitante ? "Solicitante: " + rm.solicitante + "\n" : "") +
      "Data: " + (rm.data || today()) + "\n\n" +
      "ITENS:\n" + itensTexto + "\n\n" +
      (rm.observacao ? "ObservaÃ§Ãµes: " + rm.observacao + "\n\n" : "") +
      "Por favor, enviar cotaÃ§Ã£o com preÃ§os unitÃ¡rios, condiÃ§Ãµes de pagamento e prazo de entrega.\n\n" +
      "Atenciosamente,\nTorg Metal"
    );
    const mailUrl = "mailto:" + emails + "?subject=" + assunto + "&body=" + corpo;
    const a = document.createElement("a");
    a.href = mailUrl;
    a.click();
    const novosEnvios = selectedFornecedores.map(fornId => {
      const forn = fornecedores.find(f => f.id === fornId);
      return {
        id: uid(),
        fornecedorId: fornId,
        fornecedorNome: forn.nome,
        fornecedorEmail: forn.email,
        data: today(),
        hora: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
        status: "Enviado",
      };
    });
    updateRm({
      envios: [...(rm.envios || []), ...novosEnvios],
      status: rm.status === "Aberta" ? "Em CotaÃ§Ã£o" : rm.status,
    });
    setSelectedFornecedores([]);
    showToast("E-mail aberto para " + novosEnvios.length + " fornecedor(es)");
  };

  const gerarXlsxItens = async () => {
    const XLSX = await import("xlsx");
    const wsData = [
      ["#", "DescriÃ§Ã£o", "Qtd", "Unidade", "CÃ³digo", "Material", "Comprimento", "Peso (kg)"],
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
        <button
          onClick={() => {
            if (window.confirm("Tem certeza que deseja excluir a RM-" + rm.numero + "? Esta aÃ§Ã£o nÃ£o pode ser desfeita.")) {
              const rmNum = rm.numero;
              const rmId = rm.id;
              router.push("/");
              setTimeout(() => {
                setRms((prev) => prev.filter((r) => r.id !== rmId));
                showToast("RM-" + rmNum + " excluÃ­da com sucesso!");
              }, 100);
            }
          }}
          className="ml-auto px-3 py-1.5 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg text-sm font-medium inline-flex items-center gap-1.5 transition-colors"
        >
          <Trash2 size={14} /> Excluir RM
        </button>
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

      {/* âââââââââââ ENVIAR COTAÃÃO AOS FORNECEDORES âââââââââââ */}
      <div className="bg-white rounded-xl shadow-sm border-2 border-blue-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-blue-100 bg-blue-50 flex justify-between items-center flex-wrap gap-3">
          <div>
            <h3 className="text-lg font-semibold text-blue-800 flex items-center gap-2">
              <Mail size={20} /> Enviar CotaÃ§Ã£o aos Fornecedores
            </h3>
            <p className="text-sm text-blue-600 mt-1">
              Selecione os fornecedores e envie a requisiÃ§Ã£o para cotaÃ§Ã£o. A planilha de itens serÃ¡ anexada.
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
                  <Send size={18} /> Enviar CotaÃ§Ã£o ({selectedFornecedores.length})
                </button>
              </div>
            </>
          )}
        </div>

        {/* HistÃ³rico de envios */}
        {envios.length > 0 && (
          <div className="border-t border-blue-100">
            <div className="px-6 py-3 bg-blue-50/50">
              <h4 className="text-sm font-semibold text-blue-700 flex items-center gap-2">
                <Clock size={14} /> HistÃ³rico de Envios ({envios.length})
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
                    <p className="text-xs text-gray-500">{envio.data} Ã s {envio.hora}</p>
                    <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">{envio.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* âââ UPLOAD DE PROPOSTAS âââââââââââââââââââââââââââ */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-2">Incluir Propostas / CotaÃ§Ãµes</h3>
        <p className="text-sm text-gray-500 mb-4">
          Suba planilhas (.xlsx/.csv) para leitura automÃ¡tica de preÃ§os, ou PDFs de propostas recebidas como anexo.
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
            <p className="text-gray-600 font-medium text-sm">Planilha de CotaÃ§Ã£o</p>
            <p className="text-gray-400 text-xs mt-1">.xlsx, .xls ou .csv â leitura automÃ¡tica</p>
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
      {(cotacoes.length > 0 || (rm.anexos && rm.anexos.length > 0)) && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center flex-wrap gap-3">
            <h3 className="text-lg font-semibold text-gray-800">
              <FileSpreadsheet size={18} className="inline text-green-600 mr-1" />
              CotaÃ§Ãµes em Planilha ({cotacoes.length})
            </h3>
            {(cotacoes.length >= 1 || (rm.anexos && rm.anexos.length > 0)) && (
              <button
                onClick={gerarMapa}
                className="px-4 py-2 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 font-medium flex items-center gap-2"
              >
                <BarChart3 size={16} /> Gerar Mapa de CotaÃ§Ã£o
              </button>
            )}
              {showMapa && (
                <button onClick={gerarXlsxMapa} className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium">
                  <Download size={16} /> Exportar Mapa (.xlsx)
                </button>
              )}
              {showMapa && mapaItems.length > 0 && (
                <button onClick={criarPedidoOmie} disabled={sendingOmie} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium disabled:opacity-50">
                  <ExternalLink size={16} /> {sendingOmie ? "Enviando..." : "Criar Pedido no Omie"}
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

      {/* âââââââââââ MAPA DE COTAÃÃO âââââââââââ */}
      {showMapa && mapaItems.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border-2 border-purple-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-purple-100 bg-purple-50 flex justify-between items-start flex-wrap gap-3">
            <div>
              <h3 className="text-lg font-semibold text-purple-800 flex items-center gap-2">
                <BarChart3 size={20} /> Mapa de CotaÃ§Ã£o
              </h3>
              <p className="text-sm text-purple-600 mt-1">
                O menor preÃ§o por item estÃ¡ destacado em verde. Clique em outro fornecedor para alterar a seleÃ§Ã£o.
              </p>
            </div>
          </div>
              {alertasEng.length > 0 && (
                <div className="mx-6 mb-4 p-4 bg-yellow-50 border border-yellow-300 rounded-lg">
                  <h4 className="text-sm font-semibold text-yellow-800 flex items-center gap-2 mb-2">
                    <AlertCircle size={16} /> Alertas para Engenharia ({alertasEng.length})
                  </h4>
                  <ul className="space-y-1">
                    {alertasEng.map((a, i) => (
                      <li key={i} className="text-xs text-yellow-700 flex items-start gap-2">
                        <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${a.tipo === "sem_cotacao" ? "bg-red-100 text-red-700" : a.tipo === "tipo_diferente" ? "bg-orange-100 text-orange-700" : "bg-blue-100 text-blue-700"}`}>
                          {a.tipo === "sem_cotacao" ? "SEM COT." : a.tipo === "tipo_diferente" ? "TIPO DIF." : "COMPRIM."}
                        </span>
                        <span>{a.msg}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

          {/* Resumo por fornecedor vencedor */}
          <div className="px-6 py-4 bg-purple-50/50 border-b border-purple-100">
            <h4 className="text-sm font-semibold text-purple-700 mb-3 flex items-center gap-2">
              <Award size={16} /> Resumo â Itens por Fornecedor Vencedor
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
                Total geral (menores preÃ§os): {fmt(Object.values(winnerStats).reduce((s, st) => s + st.total, 0))}
              </span>
              <span className="text-xs text-purple-500">
                {Object.keys(winnerStats).length} fornecedor{Object.keys(winnerStats).length !== 1 ? "es" : ""}
              </span>
            </div>
          </div>

          {omieResult && (
            <div className={`p-3 rounded-lg text-sm ${omieResult.success ? "bg-green-50 text-green-800 border border-green-200" : "bg-red-50 text-red-800 border border-red-200"}`}>
              {omieResult.success
                ? `Pedido criado com sucesso no Omie! C\u00f3digo: ${omieResult.numero_pedido || omieResult.codigo_pedido_integracao}`
                : `Erro: ${omieResult.error}`}
            </div>
          )}

          {/* Tabela do mapa */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase sticky left-0 bg-gray-50 min-w-[200px]">Item</th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase">CÃ³d. Omie</th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase">Barras</th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase">Peso (kg)</th>
                  {cotacoes.map((cot) => (
                    <th key={cot.id} className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase" colSpan={4}>
                      {cot.fornecedor}
                    </th>
                  ))}
                  <th className="px-4 py-3 text-center text-xs font-medium text-purple-600 uppercase bg-purple-50">Vencedor</th>
                </tr>
                <tr className="bg-gray-50">
                  <th className="px-4 py-2 sticky left-0 bg-gray-50"></th>
                  <th className="px-3 py-2 text-xs text-gray-400 text-center"></th>
                  <th className="px-3 py-2 text-xs text-gray-400 text-center"></th>
                  <th className="px-3 py-2 text-xs text-gray-400 text-center"></th>
                  {cotacoes.map((cot) => (
                    <Fragment key={cot.id + "-sub"}>
                      <th className="px-3 py-2 text-xs text-gray-400 text-center">PreÃ§o Un.</th>
                      <th className="px-3 py-2 text-xs text-gray-400 text-center">Qtd</th>
                      <th className="px-3 py-2 text-xs text-gray-400 text-center">Cond. Pag.</th>
                      <th className="px-3 py-2 text-xs text-gray-400 text-center">Prazo</th>
                    </Fragment>
                  ))}
                  <th className="px-3 py-2 text-xs text-purple-400 text-center bg-purple-50">SeleÃ§Ã£o</th>
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
                      <td className="px-3 py-3 text-center text-xs text-gray-500">{mi.codigoOmie}</td>
                      <td className="px-3 py-3 text-center text-xs text-gray-700">{mi.qtdRm}</td>
                      <td className="px-3 py-3 text-center text-xs text-gray-700">{mi.pesoRm ? mi.pesoRm.toLocaleString("pt-BR") : ""}</td>
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
                              {match ? fmt(match.precoUnit) : "â"}
                              {isWinner && <CheckCircle2 size={12} className="inline ml-1 text-green-500" />}
                            </td>
                            <td className={`px-3 py-3 text-center text-xs ${match && match.qtd && mi.qtdRm && parseFloat(match.qtd) !== mi.qtdRm ? "bg-yellow-100 text-yellow-800 font-bold" : "text-gray-600"}`}>{match ? (match.qtd || "â") : "â"}{match && match.qtd && mi.qtdRm && parseFloat(match.qtd) !== mi.qtdRm && <AlertCircle size={12} className="inline ml-1 text-yellow-600" title={`Qtd RM: ${mi.qtdRm}`} />}</td>
                      <td className="px-3 py-3 text-center text-gray-600 text-xs">{match?.condicao || "â"}</td>
                            <td className="px-3 py-3 text-center text-gray-600 text-xs">{match?.prazoEntrega || "â"}</td>
                          </Fragment>
                        );
                      })}
                      <td className="px-3 py-3 text-center bg-purple-50 text-xs font-semibold text-purple-700">
                        {winner || "â"}
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

          {/* BotÃ£o para gerar pedidos */}
          <div className="px-6 py-4 bg-purple-50/50 border-t border-purple-100 flex justify-end gap-3">
            <button
              onClick={criarTodosPedidosOmie}
              disabled={criandoPedido}
              className="px-6 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium flex items-center gap-2"
            >
              <ShoppingCart size={18} />
              {criandoPedido
                ? "Criando no Omie..."
                : `Criar Pedido no Omie (${Object.keys(pedidosPorFornecedor).length} fornecedor${Object.keys(pedidosPorFornecedor).length !== 1 ? "es" : ""})`}
            </button>
          </div>
        </div>
      )}

      {/* âââââââââââ PEDIDOS GERADOS (SPLIT POR FORNECEDOR) âââââââââââ */}
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
                    <p className="text-sm text-emerald-600">{pedido.itensCount} ite{pedido.itensCount === 1 ? "m" : "ns"} â Total: {fmt(pedido.total)}</p>
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
                          <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">PreÃ§o Unit.</th>
                          <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Prazo</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Cond. Pag.</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {pedido.itens.map((det, didx) => (
                          <tr key={didx} className="hover:bg-gray-50">
                            <td className="px-4 py-2 text-gray-400">{det.ide.sequencia}</td>
                            <td className="px-4 py-2 text-gray-800 font-medium">{det.produto.descricao}</td>
                            <td className="px-4 py-2 text-right text-gray-700">{det.produto.quantidade}</td>
                            <td className="px-4 py-2 text-right text-gray-700">{fmt(det.produto.valor_unitario)}</td>
                            <td className="px-4 py-2 text-right font-semibold text-gray-800">{fmt(det.produto.valor_total)}</td>
                            <td className="px-4 py-2 text-gray-600 text-xs">{det.observacao.split("|")[0].replace("Prazo:", "").trim()}</td>
                            <td className="px-4 py-2 text-gray-600 text-xs">{det.observacao.split("|")[1]?.replace("Cond:", "").trim() || "â"}</td>
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
                        {JSON.stringify(pedido, null, 2)}
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
