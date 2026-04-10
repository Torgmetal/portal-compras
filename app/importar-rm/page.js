"use client";
import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { uid, today } from "A/lib/utils";
import { Upload, FileSpreadsheet, ArrowRight, Trash2, CheckCircle2, AlertCircle } from "lucide-react";

const UNIDADES = ["UN", "KG", "LT", "M", "M²", "CX", "PC", "GL", "TB", "RL", "PAR", "JG", "SC", "VB", "CJ", "PCT", "TON"];

export default function ImportarRmPage() {
  const { rms, setRms, showToast } = useStore();
  const router = useRouter();
  const fileRef = useRef(null);

  const [dragActive, setDragActive] = useState(false);
  const [nomeArquivo, setNomeArquivo] = useState("");
  const [itensImportados, setItensImportados] = useState([]);
  const [form, setForm] = useState({
    tipo: "Material",
    descricao: "",
    observacao: "",
    solicitante: "",
    centroCusto: "",
  });

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const processFile = (file) => {
    if (!file) return;
    setNomeArquivo(file.name);
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
          const wb = XLSX.read(data, { type: "array" });
          const ws = wb.Sheets[wb.SheetNames[0]];
          // Lê como array de arrays para detectar cabeçalho real do Tekla
          const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
          // Encontra a linha de cabeçalho (contém "Descrição" ou "Qtd.")
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
              const obj = {};
              headers.forEach((h, i) => { obj[h] = row[i] != null ? row[i] : ""; });
              dados.push(obj);
            }
          } else {
            // Fallback: usa sheet_to_json normal
            dados = XLSX.utils.sheet_to_json(ws);
          }
          // Extrai metadados do Tekla (Cliente, Obra, RM, OS)
          for (let r = 0; r < Math.min(12, rawRows.length); r++) {
            const row = rawRows[r];
            if (!row) continue;
            for (let c = 0; c < row.length - 1; c++) {
              const cell = String(row[c]).trim();
              if (cell === "Obra:" && row[c + 1]) set("descricao", String(row[c + 1]).trim());
              if (cell === "Cliente:" && row[c + 1] && !form.solicitante) set("solicitante", String(row[c + 1]).trim());
              if (cell === "C. de Custo:" && row[c + 1]) set("centroCusto", String(row[c + 1]).trim());
              if (cell === "RM:" && row[c + 1]) set("descricao", `Tekla ${String(row[c + 1]).trim()} — ${form.descricao || String(rawRows[r][3] || "").trim()}`);
            }
          }
        }

        const normalize = (row) => {
          const keys = Object.keys(row);
          const find = (terms) => keys.find((k) => terms.some((t) => k.toLowerCase().includes(t)));
          return {
            descricao: row[find(["descri", "nome", "produto", "peça", "peca"])] || row[keys[0]] || "",
            qtd: parseFloat(String(row[find(["qtd", "quant", "quantidade", "qty"])] || "1").replace(/[^\d.,]/g, "").replace(",", ".")) || 1,
            unidade: row[find(["unid", "und", "un", "uom"])] || "UN",
            codigo: row[find(["codigo", "código", "cod", "ref", "part", "mark"])] || "",
            peso: parseFloat(String(row[find(["peso total", "peso"])] || "0").replace(/[^\d.,]/g, "").replace(",", ".")) || 0,
            comprimento: row[find(["comp", "length", "tamanho"])] || "",
            perfil: row[find(["perfil", "profile", "section", "seção", "secao"])] || "",
            material: row[find(["mat", "grade", "aço", "aco"])] || "",
          };
        };

        const itens = dados.map(normalize).filter((d) => d.descricao.trim() !== "" && d.descricao.toLowerCase() !== "item");
        if (itens.length === 0) return showToast("Nenhum item encontrado na planilha do Tekla", "error");

        setItensImportados(itens);
        // Auto-preencher descrição se ainda estiver vazia
        if (!form.descricao) {
          const desc = file.name.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " ");
          set("descricao", `Importação Tekla — ${desc}`);
        }
        showToast(`${itens.length} itens lidos do arquivo Tekla!`);
      } catch (err) {
        showToast("Erro ao ler arquivo Tekla: " + err.message, "error");
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
      itens: itensImportados.map((it) => ({
        id: uid(),
        descricao: it.descricao + (it.perfil ? ` | ${it.perfil}` : "") + (it.material ? ` | ${it.material}` : ""),
        qtd: it.qtd,
        unidade: it.unidade,
        codigo: it.codigo,
        peso: it.peso,
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

  return (
    <div className="max-w-5xl mx-auto space-y-6">
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
          <p className="text-gray-400 text-sm mt-1">ou clique para selecionar (.xlsx, .csv)</p>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv,.tsv" className="hidden" onChange={handleFileUpload} />
        </div>
        {nomeArquivo && (
          <div className="mt-3 flex items-center gap-2 text-sm text-green-700 bg-green-50 px-4 py-2 rounded-lg">
            <CheckCircle2 size={16} />
            <span>Arquivo carregado: <strong>{nomeArquivo}</strong> — {itensImportados.length} itens</span>
          </div>
        )}
      </div>

      {/* Itens importados + formulário */}
      {itensImportados.length > 0 && (
        <>
          {/* Dados da RM */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
            <h3 className="text-lg font-semibold text-gray-800">Dados da RM</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Descrição da RM</label>
              <input
                type="text"
                value={form.descricao}
                onChange={(e) => set("descricao", e.target.value)}
                placeholder="Ex: Estrutura metálica — Galpço Industrial"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Centro de Custo</label>
                <input
                  type="teyt"
                  value={form.centroCusto}
                  onChange={(e) => set("centroCusto", e.target.value)}
                  placeholder="Ex: Obra Galpão Central"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Observação">
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
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
              <h3 className="text-lg font-semibold text-gray-800">Itens Importados ({itensImportados.length})</h3>
              <span className="text-xs text-gray-400">Origem: {nomeArquivo}</span>
            </div>
            <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-8">#</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Descrição</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Código</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Perfil</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Material</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Qtd</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Un</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Peso (kg)</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-10">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {itensImportados.slice(0, 200).map((it, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-4 py-2 text-gray-400">{i + 1}</td>
                      <td className="px-4 py-2 text-gray-800 font-medium">{it.descricao}</td>
                      <td className="px-4 py-2 text-gray-500 font-mono text-xs">{it.codigo || "—"}</td>
                      <td className="px-4 py-2 text-gray-600 text-xs">{it.perfil || "—"}</td>
                      <td className="px-4 py-2 text-gray-600 text-xs">{it.material || "—"}</td>
                      <td className="px-4 py-2 text-right">
                        <input
                          type="number"
                          value={it.qtd}
                          min={0.01}
                          step={0.01}
                          onChange={(e) => updateItem(i, "qtd", parseFloat(e.target.value) || 0)}
                          className="w-20 border border-gray-200 rounded px-2 py-1 text-sm text-right focus:ring-1 focus:ring-blue-500"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <select
                          value={it.unidade}
                          onChange={(e) => updateItem(i, "unidade", e.target.value)}
                          className="border border-gray-200 rounded px-2 py-1 text-sm focus:ring-1 focus:ring-blue-500"
                        >
                          {UNIDADES.map((u) => <option key={u}>{u}</option>)}
                        </select>
                      </td>
                      <td className="px-4 py-2 text-right text-gray-500">{it.peso > 0 ? it.peso.toFixed(2) : "—"}</td>
                      <td className="px-4 py-2">
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
              onClick={() => { setItensImportados([]); setNomeArquivo(""); }}
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
