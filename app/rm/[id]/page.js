"use client";
import { useState, useRef, Fragment, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { uid, today, fmt } from "@/lib/utils";
import Badge from "@/components/Badge";
import ExportOmieModal from "@/components/ExportOmieModal";
import { gerarPlanilhasOmie } from "@/lib/omie-export";
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

  const [cotFornecedor, setCotFornecedor] = useState("");
  const [sendingOmie, setSendingOmie] = useState(false);
  const [omieResult, setOmieResult] = useState(null);
  const [showMapa, setShowMapa] = useState(false);
  const [showPedidos, setShowPedidos] = useState(false);
  const [pedidosOmie, setPedidosOmie] = useState([]);
  const [dragActive, setDragActive] = useState(false);
  // Mapa: override do fornecedor vencedor por item (key = item lowercase, value = fornecedor name)
  const [overrides, setOverrides] = useState({});
  const [expandedPedido, setExpandedPedido] = useState(null);
  const [selectedFornecedores, setSelectedFornecedores] = useState([]);
  const [criandoPedido, setCriandoPedido] = useState(false);
  const [alertasEng, setAlertasEng] = useState([]);
  const [showExportOmie, setShowExportOmie] = useState(false);
  const [exportandoOmie, setExportandoOmie] = useState(false);

  const rmFound = rms.find((r) => r.id === id);
  const rm = rmFound || { itens: [], cotacoes: [], envios: [], anexos: [], status: "", numero: "", descricao: "", observacao: "", data: "", op: "", tipo: "", id: null };
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

  const removeAnexo = (anexoId) => { updateRm({ anexos: (rm.anexos || []).filter((a) => a.id !== anexoId) }); showToast("Anexo removido"); };
  const removeCotacao = (cotId) => { updateRm({ cotacoes: (rm.cotacoes || []).filter((c) => c.id !== cotId) }); showToast("Cotação removida"); };

  const cotacoes = rm.cotacoes || [];
  const anexos = rm.anexos || [];

  // Determina se algum fornecedor é Faturamento=Torg (muda a exibição do mapa)
  const temFaturamentoTorg = cotacoes.some((c) => c.faturamento === "Torg");

  const allItems = new Map();
  (rm.itens || []).forEach((ri) => {
    const k = (ri.descricao || ri.item || "").toLowerCase().trim();
    if (k) allItems.set(k, { item: ri.descricao || ri.item, codigoOmie: ri.codigo || "", cotacoes: [] });
  });
  cotacoes.forEach((cot) => {
    (cot.itens || []).forEach((it) => {
      const key = (it.item || it.descricao || "").toLowerCase().trim();
      const rmItem = (rm.itens || []).find((ri) => ri.descricao && ri.descricao.toLowerCase().trim() === key);
      if (!allItems.has(key)) allItems.set(key, { item: it.item || it.descricao, codigoOmie: rmItem?.codigo || "", cotacoes: [] });
      const precoUnit = Number(it.precoUnit) || 0;
      const ipiPct = Number(it.ipiPct) || 0;
      const qtd = Number(it.qtd) || 0;
      // IPI por fora: total da proposta = preço × qtd × (1 + IPI%)
      const totalComIpi = precoUnit * qtd * (1 + ipiPct / 100);
      // Cotações antigas podem não ter precoLiquido; fallback: líquido = bruto
      const precoLiquido = Number(it.precoLiquido) || precoUnit;
      allItems.get(key).cotacoes.push({
        fornecedor: cot.fornecedor,
        precoUnit,
        precoLiquido,
        ipiPct,
        qtd,
        total: totalComIpi,
        totalLiquido: precoLiquido * qtd,
        faturamento: cot.faturamento || "Cliente",
        prazoEntrega: it.prazoEntrega || "",
      });
    });
  });
  const mapaItems = Array.from(allItems.values());

  const getWinner = (mi) => {
    const key = mi.item.toLowerCase().trim();
    if (overrides[key]) return overrides[key];
    // Vencedor = menor preço líquido (que considera impostos quando Faturamento=Torg)
    // Fornecedor que não cotou um item simplesmente não aparece aqui.
    const elegiveis = mi.cotacoes.filter((c) => c.precoLiquido > 0);
    if (elegiveis.length === 0) return null;
    elegiveis.sort((a, b) => a.precoLiquido - b.precoLiquido);
    return elegiveis[0].fornecedor;
  };

  const setWinner = (itemKey, fornecedor) => {
    setOverrides((prev) => ({ ...prev, [itemKey]: fornecedor }));
  };

  // ─── MAPA DE COTAÇÃO ─────────────────────────────────────
  const gerarMapa = async () => {
    const cotacoesAtuais = rm.cotacoes || [];
    if (cotacoesAtuais.length === 0) {
      return showToast("Lance pelo menos uma cotação antes de gerar o mapa", "error");
    }

    // Alertas: itens da RM sem cobertura em alguma cotação
    const alertas = [];
    const rmDescs = (rm.itens || []).map((it) => (it.descricao || "").toUpperCase().trim().replace(/"/g, ""));
    cotacoesAtuais.forEach((cot) => {
      const cotDescs = (cot.itens || []).map((it) => (it.item || it.descricao || "").toUpperCase().trim());
      rmDescs.forEach((rd) => {
        if (!rd) return;
        const last = rd.split(" ").slice(-1)[0];
        const found = cotDescs.some((cd) => cd.includes(last) || (last && cd.includes(last)));
        if (!found) {
          alertas.push({
            tipo: "sem_cotacao",
            item: rd,
            msg: `${cot.fornecedor} não cotou: ${rd}`,
          });
        }
      });
    });

    updateRm({
      status: rm.status === "Aberta" || rm.status === "Em Cotação" ? "Cotada" : rm.status,
      mapaGerado: true,
    });
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
    const wsData = [["Item RM", "Cód. Omie", "Qtd Barras", "Peso RM (kg)", "Un RM", "Fornecedor", "Descri\u00e7\u00e3o Proposta", "Qtd (kg)", "Pre\u00e7o/kg", "Total R$", "Condi\u00e7\u00e3o", "Prazo", "Alerta Engenharia"]];
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

  const handleExportOmie = async ({ categoria, localEstoque }) => {
    setExportandoOmie(true);
    try {
      const arquivos = await gerarPlanilhasOmie({
        rm,
        pedidosPorFornecedor,
        fornecedores,
        categoriaCompra: categoria,
        localEstoque,
      });
      showToast(`${arquivos.length} planilha(s) Omie gerada(s)!`);
      setShowExportOmie(false);
    } catch (err) {
      showToast(err.message || "Erro ao gerar planilhas Omie", "error");
      throw err;
    } finally {
      setExportandoOmie(false);
    }
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

  // ─── GERAR PEDIDOS DE COMPRA (SPLIT POR FORNECEDOR) ─────
  

  // ─── CONTAGENS POR FORNECEDOR NO MAPA ───────────────────
  // winnerStats: total dos itens em que cada fornecedor é o vencedor
  // (= o que a Torg vai gastar com ele)
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

  // proposalStats: total de TODA a proposta de cada fornecedor (= o que ele
  // ofereceu no papel, independente de quem ganhou). Inclui IPI por fora
  // pra bater com o "Valor total" do PDF do fornecedor.
  const proposalStats = useMemo(() => {
    const stats = {};
    (rm.cotacoes || []).forEach((cot) => {
      if (!stats[cot.fornecedor]) stats[cot.fornecedor] = { count: 0, total: 0 };
      (cot.itens || []).forEach((it) => {
        const precoUnit = Number(it.precoUnit) || 0;
        const qtd = Number(it.qtd) || 0;
        const ipiPct = Number(it.ipiPct) || 0;
        const linha = precoUnit * qtd * (1 + ipiPct / 100);
        stats[cot.fornecedor].count++;
        stats[cot.fornecedor].total += linha;
      });
    });
    return stats;
  }, [rm.cotacoes]);

  if (!loaded) return <div className="p-12 text-center text-gray-400">Carregando...</div>;
  if (!rmFound) {
    return (
      <div className="p-12 text-center">
        <div className="text-gray-500 text-lg">RM não encontrada</div>
        <button onClick={() => router.push("/")} className="mt-4 text-blue-600 hover:underline">Voltar ao Painel</button>
      </div>
    );
  }

  // ─── ENVIO DE COTAÇÃO (SIMULADO) ──────────────────────
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
    const assunto = encodeURIComponent("Solicitação de Cotação - RM " + (rm.numero || rm.id));
    const itensTexto = (rm.itens || []).map((it, i) =>
      (i + 1) + ". " + (it.descricao || "Item " + (i + 1)) + " - Qtd: " + (it.qtd || "-") + " " + (it.unidade || "un") + (it.material ? " - Material: " + it.material : "") + (it.comprimento ? " - Comp: " + it.comprimento : "")
    ).join("\n");
    const corpo = encodeURIComponent(
      "Prezado(a) fornecedor(a),\n\n" +
      "Gostaríamos de solicitar cotação para os itens abaixo:\n\n" +
      "RM: " + (rm.numero || rm.id) + "\n" +
      (rm.descricao ? "Descrição: " + rm.descricao + "\n" : "") +
      (rm.solicitante ? "Solicitante: " + rm.solicitante + "\n" : "") +
      "Data: " + (rm.data || today()) + "\n\n" +
      "ITENS:\n" + itensTexto + "\n\n" +
      (rm.observacao ? "Observações: " + rm.observacao + "\n\n" : "") +
      "Por favor, enviar cotação com preços unitários, condições de pagamento e prazo de entrega.\n\n" +
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
      status: rm.status === "Aberta" ? "Em Cotação" : rm.status,
    });
    setSelectedFornecedores([]);
    showToast("E-mail aberto para " + novosEnvios.length + " fornecedor(es)");
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
        <button
          onClick={() => {
            if (window.confirm("Tem certeza que deseja excluir a RM-" + rm.numero + "? Esta ação não pode ser desfeita.")) {
              const rmNum = rm.numero;
              const rmId = rm.id;
              router.push("/");
              setTimeout(() => {
                setRms((prev) => prev.filter((r) => r.id !== rmId));
                showToast("RM-" + rmNum + " excluída com sucesso!");
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

      {/* ─── INCLUIR COTAÇÕES ─────────────────────────── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-2">Incluir Propostas / Cotações</h3>
        <p className="text-sm text-gray-500 mb-4">
          Use <strong>Lançar Cotação</strong> pra digitar os preços manualmente com impostos, disponibilidade e prazo.
          A planilha é um atalho quando o fornecedor mandou um .xlsx simples.
        </p>
        <div className="flex flex-wrap gap-3 items-stretch">
          <button
            onClick={() => router.push(`/rm/${rm.id}/cotar`)}
            className="flex-1 min-w-[240px] flex items-center justify-center gap-2 px-6 py-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
          >
            <ShoppingCart size={18} /> Lançar Cotação (manual)
          </button>
          <div className="flex-1 min-w-[240px]">
            <div className="mb-2">
              <input
                type="text"
                value={cotFornecedor}
                onChange={(e) => setCotFornecedor(e.target.value)}
                placeholder="Nome do fornecedor (p/ upload)"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div
              className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors cursor-pointer ${
                dragActive ? "border-blue-500 bg-blue-50" : "border-gray-300 hover:border-blue-400"
              }`}
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
              onDragLeave={() => setDragActive(false)}
              onDrop={handleDrop}
            >
              <FileSpreadsheet size={28} className="mx-auto text-green-500 mb-1" />
              <p className="text-gray-600 text-sm">Subir Planilha (.xlsx/.csv)</p>
              <p className="text-gray-400 text-xs mt-0.5">sem impostos nem disponibilidade</p>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv,.tsv" className="hidden" onChange={handleFileUpload} />
            </div>
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
      {(cotacoes.length > 0 || (rm.anexos && rm.anexos.length > 0)) && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center flex-wrap gap-3">
            <h3 className="text-lg font-semibold text-gray-800">
              <FileSpreadsheet size={18} className="inline text-green-600 mr-1" />
              Cotações em Planilha ({cotacoes.length})
            </h3>
            {(cotacoes.length >= 1 || (rm.anexos && rm.anexos.length > 0)) && (
              <button
                onClick={gerarMapa}
                className="px-4 py-2 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 font-medium flex items-center gap-2"
              >
                <BarChart3 size={16} /> Gerar Mapa de Cotação
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
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase">Cód. Omie</th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase">Barras</th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase">Peso (kg)</th>
                  {cotacoes.map((cot) => (
                    <th key={cot.id} className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase" colSpan={4}>
                      {cot.fornecedor}
                      {cot.faturamento && (
                        <span className={`ml-2 inline-block text-[10px] px-1.5 py-0.5 rounded-full font-normal ${cot.faturamento === "Torg" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-500"}`}>
                          {cot.faturamento}
                        </span>
                      )}
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
                      <th className="px-3 py-2 text-xs text-gray-400 text-center" title={cot.faturamento === "Torg" ? "Líquido: considera créditos de ICMS/PIS/Cofins/IPI" : "Bruto: sem dedução de impostos"}>
                        {cot.faturamento === "Torg" ? "Preço Líq." : "Preço Un."}
                      </th>
                      <th className="px-3 py-2 text-xs text-gray-400 text-center">Qtd</th>
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
                      <td className="px-3 py-3 text-center text-xs text-gray-500">{mi.codigoOmie}</td>
                      <td className="px-3 py-3 text-center text-xs text-gray-700">{mi.qtdRm}</td>
                      <td className="px-3 py-3 text-center text-xs text-gray-700">{mi.pesoRm ? mi.pesoRm.toLocaleString("pt-BR") : ""}</td>
                      {cotacoes.map((cot) => {
                        const match = mi.cotacoes.find((c) => c.fornecedor === cot.fornecedor);
                        const isLowest = match && match.precoUnit === menorPreco && match.precoUnit > 0;
                        const isWinner = match && cot.fornecedor === winner;
                        const precoMostrar = match && temFaturamentoTorg && cot.faturamento === "Torg"
                          ? match.precoLiquido
                          : match?.precoUnit;
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
                              title={
                                match
                                  ? `${cot.fornecedor}${temFaturamentoTorg && cot.faturamento === "Torg" ? ` (bruto ${fmt(match.precoUnit)})` : ""}`
                                  : ""
                              }
                            >
                              {match && precoMostrar ? fmt(precoMostrar) : "—"}
                              {isWinner && <CheckCircle2 size={12} className="inline ml-1 text-green-500" />}
                            </td>
                            <td className={`px-3 py-3 text-center text-xs ${match && match.qtd && mi.qtdRm && parseFloat(match.qtd) !== mi.qtdRm ? "bg-yellow-100 text-yellow-800 font-bold" : "text-gray-600"}`}>{match ? (match.qtd || "—") : "—"}{match && match.qtd && mi.qtdRm && parseFloat(match.qtd) !== mi.qtdRm && <AlertCircle size={12} className="inline ml-1 text-yellow-600" title={`Qtd RM: ${mi.qtdRm}`} />}</td>
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
                  <td className="px-4 py-3 text-gray-700 sticky left-0 bg-gray-50" title="Soma de todos os itens da proposta original do fornecedor">TOTAL DA PROPOSTA</td>
                  {cotacoes.map((cot) => {
                    const propTotal = proposalStats[cot.fornecedor]?.total || 0;
                    const propTotals = cotacoes.map((c) => proposalStats[c.fornecedor]?.total || 0).filter((t) => t > 0);
                    const minTotal = propTotals.length ? Math.min(...propTotals) : 0;
                    const isBest = propTotal > 0 && propTotal === minTotal;
                    return (
                      <Fragment key={cot.id + "-total"}>
                        <td className={`px-3 py-3 text-center ${isBest ? "bg-green-50 text-green-700" : "text-gray-700"}`} colSpan={4}>
                          {fmt(propTotal)}
                          {isBest && <CheckCircle2 size={12} className="inline ml-1 text-green-500" />}
                        </td>
                      </Fragment>
                    );
                  })}
                  <td className="px-3 py-3 text-center bg-purple-50/50 text-purple-700">—</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 text-gray-700 sticky left-0 bg-gray-50" title="Total dos itens em que este fornecedor é vencedor (= o que a Torg vai gastar com ele)">TOTAL VENCEDOR (Torg compra)</td>
                  {cotacoes.map((cot) => {
                    const winTotal = winnerStats[cot.fornecedor]?.total || 0;
                    return (
                      <Fragment key={cot.id + "-vencedor"}>
                        <td className={`px-3 py-3 text-center ${winTotal > 0 ? "bg-emerald-50 text-emerald-700 font-bold" : "text-gray-400"}`} colSpan={4}>
                          {winTotal > 0 ? fmt(winTotal) : "—"}
                        </td>
                      </Fragment>
                    );
                  })}
                  <td className="px-3 py-3 text-center bg-purple-100 text-purple-800 font-bold">
                    {fmt(Object.values(winnerStats).reduce((s, st) => s + st.total, 0))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Botão para gerar pedidos */}
          <div className="px-6 py-4 bg-purple-50/50 border-t border-purple-100 flex flex-wrap justify-end gap-3">
            <button
              onClick={() => {
                if (Object.keys(pedidosPorFornecedor).length === 0)
                  return showToast("Nenhum fornecedor vencedor no mapa", "error");
                setShowExportOmie(true);
              }}
              disabled={exportandoOmie}
              className="px-6 py-2.5 bg-white border-2 border-emerald-600 text-emerald-700 rounded-lg hover:bg-emerald-50 font-medium flex items-center gap-2 disabled:opacity-50"
              title="Gera planilhas no layout oficial Omie, 1 por fornecedor vencedor"
            >
              <FileSpreadsheet size={18} />
              {exportandoOmie
                ? "Gerando planilhas..."
                : `Gerar Planilhas Omie (${Object.keys(pedidosPorFornecedor).length})`}
            </button>
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
                        {pedido.itens.map((det, didx) => (
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

      <ExportOmieModal
        open={showExportOmie}
        onClose={() => (exportandoOmie ? null : setShowExportOmie(false))}
        pedidosPorFornecedor={pedidosPorFornecedor}
        loading={exportandoOmie}
        onConfirm={handleExportOmie}
      />
    </div>
  );
}
