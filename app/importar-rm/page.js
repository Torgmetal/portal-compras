"use client";
import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { uid, today } from "@/lib/utils";
import { Upload, FileSpreadsheet, ArrowRight, Trash2, CheckCircle2, AlertCircle, Edit3 } from "lucide-react";

const UNIDADES = ["UN", "KG", "LT", "M", "M²", "CX", "PC", "GL", "TB", "RL", "PAR", "JG", "SC", "VB", "CJ", "PCT", "TON", "barra(s)"];

export default function ImportarRmPage() {
  const { rms, setRms, showToast } = useStore();
  const router = useRouter();
  const fileRef = useRef(null);

  const [dragActive, setDragActive] = useState(false);
  const [nomeArquivo, setNomeArquivo] = useState("");
  const [itensImportados, setItensImportados] = useState([]);
  const [meta, setMeta] = useState(null); // metadados extraídos do Tekla
  const [form, setForm] = useState({
    tipo: "Material",
    descricao: "",
    observacao: "",
    solicitante: "",
    centroCusto: "",
    os: "",
    rmTekla: "",
    cliente: "",
    obra: "",
    finalidade: "",
    revisao: "",
  });

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setBatch = (updates) => setForm((f) => ({ ...f, ...updates }));

  // ─── Extrai metadados do cabeçalho Tekla (linhas 1-12 e rodapé) ───
  const extractMeta = (rawRows) => {
    const meta = {};
    const totalRows = rawRows.length;
    // Varre as primeiras 12 linhas E as últimas 10 linhas para pegar Requisitante
    const searchRanges = [
      [0, Math.min(15, totalRows)],
      [Math.max(0, totalRows - 10), totalRows],
    ];

    for (const [start, end] of searchRanges) {
      for (let r = start; r < end; r++) {
        const row = rawRows[r];
        if (!row) continue;
        for (let c = 0; c < row.length; c++) {
          const cell = String(row[c] ?? "").trim();
          const next = c + 1 < row.length ? String(row[c + 1] ?? "").trim() : "";

          // Campos com label:value em células adjacentes
          if (cell === "OS:" && next) meta.os = next;
          if (cell === "RM:" && next) meta.rmTekla = next;
          if (cell === "Cliente:" && next) meta.cliente = next;
          if (cell === "Obra:" && next) meta.obra = next;
          if (cell === "C. de Custo:" && next) meta.centroCusto = next;
          if (cell === "Finalidade:" && next) meta.finalidade = next;
          if ((cell === "Revisão:" || cell === "Revisao:") && next) meta.revisao = next;

          // Campos dentro de uma mesma célula "Requisitante: JOHN"
          if (cell.toLowerCase().startsWith("requisitante:")) {
            meta.solicitante = cell.replace(/requisitante:\s*/i, "").trim();
          }
          if (cell.toLowerCase().startsWith("comprador:") && next) {
            meta.comprador = next;
          }
        }
      }
    }

    // Observações
    for (let r = 0; r < totalRows; r++) {
      const row = rawRows[r];
      if (!row) continue;
      const first = String(row[0] ?? "").trim().toLowerCase();
      if (first.startsWith("observa")) {
        const obsText = String(row[0] ?? "")
          .replace(/observa[çc][oõ]es:\s*/i, "")
          .trim();
        if (obsText && obsText.toLowerCase() !== first) {
          meta.observacao = obsText;
        } else {
          // Tenta juntar o restante das colunas
          const rest = row.slice(1).map((c) => String(c ?? "").trim()).filter(Boolean).join(" ");
          if (rest) meta.observacao = rest;
        }
      }
    }

    return meta;
  };

  const processFile = (file) => {
    if (!file) return;
    setNomeArquivo(file.name);
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        let dados = [];
        const XLSX = await import("xlsx");
        const data = new Uint8Array(ev.target.result);
        const wb = XLSX.read(data, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];

        // Lê como array de arrays para detectar cabeçalho real do Tekla
        const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

        // ─── Extrai metadados do cabeçalho ───
        const teklaInfo = extractMeta(rawRows);
        setMeta(teklaInfo);

        // Auto-preenche o formulário de uma vez
        const updates = {};
        if (teklaInfo.os) updates.os = teklaInfo.os;
        if (teklaInfo.rmTekla) updates.rmTekla = teklaInfo.rmTekla;
        if (teklaInfo.cliente) updates.cliente = teklaInfo.cliente;
        if (teklaInfo.obra) updates.obra = teklaInfo.obra;
        if (teklaInfo.centroCusto) updates.centroCusto = teklaInfo.centroCusto;
        if (teklaInfo.finalidade) updates.finalidade = teklaInfo.finalidade;
        if (teklaInfo.revisao) updates.revisao = teklaInfo.revisao;
        if (teklaInfo.solicitante) updates.solicitante = teklaInfo.solicitante;
        if (teklaInfo.observacao) updates.observacao = teklaInfo.observacao;

        // Monta descrição automática
        const parts = [];
        if (teklaInfo.rmTekla) parts.push(teklaInfo.rmTekla);
        if (teklaInfo.obra) parts.push(teklaInfo.obra);
        if (teklaInfo.cliente) parts.push(teklaInfo.cliente);
        updates.descricao = parts.length > 0
          ? `Tekla ${parts.join(" — ")}`
          : `Importação Tekla — ${file.name.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " ")}`;

        setBatch(updates);

        // ─── Encontra a linha de cabeçalho dos itens ───
        let headerIdx = -1;
        for (let r = 0; r < Math.min(20, rawRows.length); r++) {
          const rowStr = rawRows[r].map((c) => String(c).toLowerCase()).join("|");
          if (rowStr.includes("descri") && (rowStr.includes("qtd") || rowStr.includes("item"))) {
            headerIdx = r;
            break;
          }
        }

        if (headerIdx >= 0) {
          const headers = rawRows[headerIdx].map((h) => String(h).trim());
          for (let r = headerIdx + 1; r < rawRows.length; r++) {
            const row = rawRows[r];
            if (!row || row.every((c) => c === "" || c == null)) continue;
            // Para quando encontrar "TOTAL" ou linhas de rodapé
            const firstCell = String(row[0] ?? "").trim().toUpperCase();
            if (firstCell.startsWith("TOTAL") || firstCell.startsWith("OBSERVA") || firstCell.startsWith("PEDIDO")) break;
            const obj = {};
            headers.forEach((h, i) => { obj[h] = row[i] != null ? row[i] : ""; });
            dados.push(obj);
          }
        } else {
          dados = XLSX.utils.sheet_to_json(ws);
        }

        // ─── Normaliza cada item ───
        const normalize = (row) => {
          const keys = Object.keys(row);
          const find = (terms) => keys.find((k) => terms.some((t) => k.toLowerCase().includes(t)));

          const descricao = String(row[find(["descri", "nome", "produto", "peça", "peca"])] || row[keys[0]] || "").trim();
          const codigo = String(row[find(["codigo", "código", "cod"])] || "").trim();
          const qtdRaw = String(row[find(["qtd", "quant", "quantidade", "qty"])] || "1");
          const qtd = parseFloat(qtdRaw.replace(/[^\d.,]/g, "").replace(",", ".")) || 1;
          const unidade = String(row[find(["unid", "und", "un", "uom"])] || "UN").trim();
          const pesoRaw = String(row[find(["peso total", "peso"])] || "0");
          const peso = parseFloat(pesoRaw.replace(/[^\d.,]/g, "").replace(",", ".")) || 0;
          const comprimento = String(row[find(["comp", "length", "tamanho"])] || "").trim();
          const material = String(row[find(["mat", "grade", "aço", "aco"])] || "").trim();
          const largura = String(row[find(["larg", "width"])] || "").trim();
          const tratamento = String(row[find(["tratamento", "treat", "acabamento"])] || "").trim();
          const pesoLinearRaw = String(row[find(["peso/m", "peso linear", "peso/m²"])] || "0");
          const pesoLinear = parseFloat(pesoLinearRaw.replace(/[^\d.,]/g, "").replace(",", ".")) || 0;

          return { descricao, codigo, qtd, unidade, peso, comprimento, material, largura, tratamento, pesoLinear };
        };

        const itens = dados
          .map(normalize)
          .filter((d) => d.descricao !== "" && d.descricao.toLowerCase() !== "item" && d.descricao.toLowerCase() !== "total ->");

        if (itens.length === 0) return showToast("Nenhum item encontrado na planilha do Tekla", "error");

        setItensImportados(itens);
        showToast(`${itens.length} itens lidos do arquivo Tekla!`);
      } catch (err) {
        showToast("Erro ao ler arquivo Tekla: " + err.message, "error");
      }
    };
    reader.readAsArrayBuffer(file);
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

  const removeItem = (i) => setItensImportados((prev) => prev.filter((_, idx) => idx !== i));

  const updateItem = (i, field, val) => {
    setItensImportados((prev) => {
      const copy = [...prev];
      copy[i] = { ...copy[i], [field]: val };
      return copy;
    });
  };

  const criarRm = () => {
    if (!form.descricao.trim()) return showToast("Preencha a descrição da RM", "error");
    if (itensImportados.length === 0) return showToast("Importe um arquivo primeiro", "error");

    const novaRm = {
      id: uid(),
      numero: String(rms.length + 1).padStart(4, "0"),
      tipo: form.tipo,
      descricao: form.descricao,
      observacao: form.observacao,
      solicitante: form.solicitante,
      centroCusto: form.centroCusto,
      os: form.os,
      rmTekla: form.rmTekla,
      cliente: form.cliente,
      obra: form.obra,
      finalidade: form.finalidade,
      revisao: form.revisao,
      itens: itensImportados.map((it) => ({
        id: uid(),
        descricao: it.descricao,
        qtd: it.qtd,
        unidade: it.unidade,
        codigo: it.codigo,
        peso: it.peso,
        comprimento: it.comprimento,
        material: it.material,
        largura: it.largura,
        tratamento: it.tratamento,
        pesoLinear: it.pesoLinear,
      })),
      data: today(),
      status: "Aberta",
      cotacoes: [],
      anexos: [],
      mapaGerado: false,
      origemTekla: true,
      arquivoOrigem: nomeArquivo,
    };

    setRms((prev) => [novaRm, ...prev]);
    showToast(`RM-${novaRm.numero} criada com ${itensImportados.length} itens do Tekla!`);
    router.push(`/rm/${novaRm.id}`);
  };

  const pesoTotal = itensImportados.reduce((s, it) => s + (it.peso || 0), 0);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <Upload className="text-orange-500" /> Importar RM do Tekla
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          Suba a planilha de requisição exportada do Tekla (.xlsx) para criar uma RM automaticamente com todos os itens.
        </p>
      </div>

      {/* Upload */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div
          className={`border-2 border-dashed rounded-lg p-10 text-center transition-colors cursor-pointer ${
            dragActive ? "border-orange-500 bg-orange-50" : "border-gray-300 hover:border-orange-400"
          }`}
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
          onDragLeave={() => setDragActive(false)}
          onDrop={handleDrop}
        >
          <FileSpreadsheet size={48} className="mx-auto text-orange-400 mb-3" />
          <p className="text-gray-600 font-medium text-lg">Arraste o arquivo do Tekla aqui</p>
          <p className="text-gray-400 text-sm mt-1">ou clique para selecionar (.xlsx, .xls, .csv)</p>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv,.tsv" className="hidden" onChange={handleFileUpload} />
        </div>
        {nomeArquivo && (
          <div className="mt-3 flex items-center gap-2 text-sm text-green-700 bg-green-50 px-4 py-2 rounded-lg">
            <CheckCircle2 size={16} />
            <span>Arquivo carregado: <strong>{nomeArquivo}</strong> — {itensImportados.length} itens</span>
          </div>
        )}
      </div>

      {/* Metadados detectados + formulário */}
      {itensImportados.length > 0 && (
        <>
          {/* Card de metadados detectados */}
          {meta && (meta.os || meta.rmTekla || meta.cliente) && (
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-orange-800 mb-3 flex items-center gap-2">
                <FileSpreadsheet size={16} /> Dados detectados do Tekla
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                {meta.os && (
                  <div>
                    <span className="text-orange-600 font-medium">OS (OP):</span>
                    <span className="ml-1 text-orange-900 font-bold">{meta.os}</span>
                  </div>
                )}
                {meta.rmTekla && (
                  <div>
                    <span className="text-orange-600 font-medium">RM:</span>
                    <span className="ml-1 text-orange-900 font-bold">{meta.rmTekla}</span>
                  </div>
                )}
                {meta.cliente && (
                  <div>
                    <span className="text-orange-600 font-medium">Cliente:</span>
                    <span className="ml-1 text-orange-900">{meta.cliente}</span>
                  </div>
                )}
                {meta.obra && (
                  <div>
                    <span className="text-orange-600 font-medium">Obra:</span>
                    <span className="ml-1 text-orange-900">{meta.obra}</span>
                  </div>
                )}
                {meta.finalidade && (
                  <div>
                    <span className="text-orange-600 font-medium">Finalidade:</span>
                    <span className="ml-1 text-orange-900">{meta.finalidade}</span>
                  </div>
                )}
                {meta.solicitante && (
                  <div>
                    <span className="text-orange-600 font-medium">Requisitante:</span>
                    <span className="ml-1 text-orange-900">{meta.solicitante}</span>
                  </div>
                )}
                {meta.revisao && (
                  <div>
                    <span className="text-orange-600 font-medium">Revisão:</span>
                    <span className="ml-1 text-orange-900">{meta.revisao}</span>
                  </div>
                )}
                {meta.centroCusto && (
                  <div>
                    <span className="text-orange-600 font-medium">C. Custo:</span>
                    <span className="ml-1 text-orange-900">{meta.centroCusto}</span>
                  </div>
                )}
              </div>
              {meta.observacao && (
                <p className="mt-2 text-xs text-orange-700 italic">Obs: {meta.observacao}</p>
              )}
            </div>
          )}

          {/* Dados da RM */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
            <h3 className="text-lg font-semibold text-gray-800">Dados da RM</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">OS / OP</label>
                <input
                  type="text"
                  value={form.os}
                  onChange={(e) => set("os", e.target.value)}
                  placeholder="Ex: T083"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent font-bold text-blue-700"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">RM Tekla</label>
                <input
                  type="text"
                  value={form.rmTekla}
                  onChange={(e) => set("rmTekla", e.target.value)}
                  placeholder="Ex: T83-000"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
                <select
                  value={form.tipo}
                  onChange={(e) => set("tipo", e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option>Material</option>
                  <option>Consumível</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cliente</label>
                <input
                  type="text"
                  value={form.cliente}
                  onChange={(e) => set("cliente", e.target.value)}
                  placeholder="Ex: JHSF"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Obra</label>
                <input
                  type="text"
                  value={form.obra}
                  onChange={(e) => set("obra", e.target.value)}
                  placeholder="Ex: MEZANINOS"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Descrição da RM</label>
              <input
                type="text"
                value={form.descricao}
                onChange={(e) => set("descricao", e.target.value)}
                placeholder="Ex: Estrutura metálica — Galpão Industrial"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Solicitante</label>
                <input
                  type="text"
                  value={form.solicitante}
                  onChange={(e) => set("solicitante", e.target.value)}
                  placeholder="Nome do solicitante"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Centro de Custo</label>
                <input
                  type="text"
                  value={form.centroCusto}
                  onChange={(e) => set("centroCusto", e.target.value)}
                  placeholder="Ex: Obra Galpão Central"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Observação</label>
                <input
                  type="text"
                  value={form.observacao}
                  onChange={(e) => set("observacao", e.target.value)}
                  placeholder="Observações..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
          </div>

          {/* Tabela de itens */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center flex-wrap gap-2">
              <h3 className="text-lg font-semibold text-gray-800">Itens Importados ({itensImportados.length})</h3>
              <div className="flex items-center gap-4 text-sm text-gray-500">
                <span>Peso total: <strong className="text-gray-800">{pesoTotal.toFixed(2)} kg</strong></span>
                <span className="text-xs text-gray-400">Origem: {nomeArquivo}</span>
              </div>
            </div>
            <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase w-8">#</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Descrição</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      <span className="flex items-center gap-1">Cód. Omie <Edit3 size={10} className="text-blue-400" /></span>
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Material</th>
                    <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">Qtd</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Unid.</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Comp.</th>
                    <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">Peso/m</th>
                    <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">Peso Total (kg)</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {itensImportados.slice(0, 200).map((it, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                      <td className="px-3 py-2 text-gray-800 font-medium">{it.descricao}</td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={it.codigo}
                          onChange={(e) => updateItem(i, "codigo", e.target.value)}
                          placeholder="—"
                          className="w-24 border border-gray-200 rounded px-2 py-1 text-xs font-mono focus:ring-1 focus:ring-blue-500 focus:border-blue-400"
                        />
                      </td>
                      <td className="px-3 py-2 text-gray-600 text-xs">{it.material || "—"}</td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          value={it.qtd}
                          min={0.01}
                          step={0.01}
                          onChange={(e) => updateItem(i, "qtd", parseFloat(e.target.value) || 0)}
                          className="w-20 border border-gray-200 rounded px-2 py-1 text-sm text-right focus:ring-1 focus:ring-blue-500"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={it.unidade}
                          onChange={(e) => updateItem(i, "unidade", e.target.value)}
                          className="border border-gray-200 rounded px-2 py-1 text-sm focus:ring-1 focus:ring-blue-500"
                        >
                          {UNIDADES.map((u) => <option key={u}>{u}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-2 text-gray-500 text-xs">{it.comprimento || "—"}</td>
                      <td className="px-3 py-2 text-right text-gray-500">{it.pesoLinear > 0 ? it.pesoLinear.toFixed(2) : "—"}</td>
                      <td className="px-3 py-2 text-right text-gray-700 font-medium">{it.peso > 0 ? it.peso.toFixed(2) : "—"}</td>
                      <td className="px-3 py-2">
                        <button onClick={() => removeItem(i)} className="text-red-400 hover:text-red-600">
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {itensImportados.length > 200 && (
                <div className="p-3 text-center text-sm text-gray-500 bg-gray-50">
                  Exibindo 200 de {itensImportados.length} itens
                </div>
              )}
            </div>
          </div>

          {/* Botão Criar RM */}
          <div className="flex justify-end gap-3">
            <button
              onClick={() => { setItensImportados([]); setNomeArquivo(""); setMeta(null); }}
              className="px-5 py-2.5 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              onClick={criarRm}
              className="px-6 py-2.5 bg-orange-600 text-white rounded-lg hover:bg-orange-700 font-medium flex items-center gap-2"
            >
              <ArrowRight size={18} /> Criar RM com {itensImportados.length} itens
            </button>
          </div>
        </>
      )}

      {itensImportados.length === 0 && !nomeArquivo && (
        <div className="text-center py-8 text-gray-400">
          <AlertCircle size={40} className="mx-auto mb-3" />
          <p>Suba o arquivo do Tekla para pré-visualizar os itens antes de criar a RM.</p>
        </div>
      )}
    </div>
  );
}
