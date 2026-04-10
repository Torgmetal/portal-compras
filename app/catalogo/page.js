"use client";
import { useState, useRef } from "react";
import { useStore } from "@/lib/store";
import { Package, Upload, Search, Trash2, FileSpreadsheet, AlertCircle } from "lucide-react";

export default function CatalogoPage() {
  const { catalogo, setCatalogo, showToast, loaded } = useStore();
  const fileRef = useRef(null);
  const [dragActive, setDragActive] = useState(false);
  const [busca, setBusca] = useState("");
  const [familiaFiltro, setFamiliaFiltro] = useState("");

  if (!loaded) return <div className="p-12 text-center text-gray-400">Carregando...</div>;

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
          const wb = XLSX.read(data, { type: "array" });
          const ws = wb.Sheets[wb.SheetNames[0]];
          dados = XLSX.utils.sheet_to_json(ws);
        }

        const normalize = (row) => {
          const keys = Object.keys(row);
          const find = (terms) => keys.find((k) => terms.some((t) => k.toLowerCase().includes(t)));
          return {
            situacao: row[find(["situa"])] || "Ativo",
            descricao: row[find(["descri", "nome", "produto", "item"])] || row[keys[0]] || "—",
            codigo: row[find(["código", "codigo", "cod", "ref"])] || "",
            familia: row[find(["famíl", "famil", "categ", "grupo"])] || "",
            ncm: row[find(["ncm"])] || "",
            unidade: row[find(["unidade", "und", "un"])] || "UN",
            estoque: parseFloat(String(row[find(["estoque", "disp", "saldo"])] || "0").replace(",", ".")) || 0,
            precoVenda: parseFloat(String(row[find(["preço", "preco", "valor", "venda"])] || "0").replace(/[^\d.,]/g, "").replace(",", ".")) || 0,
            marca: row[find(["marca"])] || "",
            modelo: row[find(["modelo"])] || "",
          };
        };

        const itens = dados.map(normalize).filter((d) => d.descricao !== "—" && d.descricao !== "");
        if (itens.length === 0) return showToast("Nenhum item encontrado na planilha", "error");

        setCatalogo(itens);
        showToast(`Catálogo importado com ${itens.length} itens!`);
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

  // Famílias únicas para filtro
  const familias = [...new Set(catalogo.map((it) => it.familia).filter(Boolean))].sort();

  // Filtro
  const filtrados = catalogo.filter((it) => {
    const matchBusca = !busca ||
      it.descricao.toLowerCase().includes(busca.toLowerCase()) ||
      it.codigo.toLowerCase().includes(busca.toLowerCase()) ||
      it.marca.toLowerCase().includes(busca.toLowerCase());
    const matchFamilia = !familiaFiltro || it.familia === familiaFiltro;
    return matchBusca && matchFamilia;
  });

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <Package className="text-blue-600" /> Catálogo de Itens
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Importe a planilha de produtos do Omie para consultar itens ao criar RMs
          </p>
        </div>
        {catalogo.length > 0 && (
          <span className="text-sm bg-blue-50 text-blue-700 px-3 py-1 rounded-full font-medium">
            {catalogo.length} itens cadastrados
          </span>
        )}
      </div>

      {/* Upload */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-2">Importar Planilha de Itens</h3>
        <p className="text-sm text-gray-500 mb-4">
          Suba a planilha exportada do Omie (.xlsx ou .csv). O sistema vai ler automaticamente as colunas como Descrição, Código, Família, Unidade, Estoque etc.
        </p>
        <div
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
            dragActive ? "border-blue-500 bg-blue-50" : "border-gray-300 hover:border-blue-400"
          }`}
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
          onDragLeave={() => setDragActive(false)}
          onDrop={handleDrop}
        >
          <Upload size={40} className="mx-auto text-gray-400 mb-3" />
          <p className="text-gray-600 font-medium">Arraste a planilha do Omie aqui ou clique para selecionar</p>
          <p className="text-gray-400 text-sm mt-1">.xlsx, .xls ou .csv</p>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv,.tsv" className="hidden" onChange={handleFileUpload} />
        </div>
        {catalogo.length > 0 && (
          <div className="mt-3 flex justify-end">
            <button
              onClick={() => { setCatalogo([]); showToast("Catálogo limpo"); }}
              className="text-sm text-red-500 hover:text-red-700 flex items-center gap-1"
            >
              <Trash2 size={14} /> Limpar catálogo
            </button>
          </div>
        )}
      </div>

      {/* Tabela */}
      {catalogo.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <div className="flex flex-wrap gap-3 items-center">
              <div className="relative flex-1 min-w-[200px]">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar por descrição, código ou marca..."
                  className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <select
                value={familiaFiltro}
                onChange={(e) => setFamiliaFiltro(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">Todas as Famílias</option>
                {familias.map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
              <span className="text-sm text-gray-500">{filtrados.length} resultados</span>
            </div>
          </div>
          <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Código</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Descrição</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Família</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Unidade</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Estoque</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Situação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtrados.slice(0, 200).map((it, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-4 py-2 text-gray-500 font-mono text-xs">{it.codigo || "—"}</td>
                    <td className="px-4 py-2 text-gray-800">{it.descricao}</td>
                    <td className="px-4 py-2 text-gray-600">{it.familia || "—"}</td>
                    <td className="px-4 py-2 text-gray-500">{it.unidade}</td>
                    <td className="px-4 py-2 text-right font-medium">{it.estoque}</td>
                    <td className="px-4 py-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        it.situacao === "Ativo" ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"
                      }`}>
                        {it.situacao}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtrados.length > 200 && (
              <div className="p-4 text-center text-sm text-gray-500 bg-gray-50">
                Exibindo 200 de {filtrados.length} itens. Use a busca para refinar.
              </div>
            )}
          </div>
        </div>
      )}

      {catalogo.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          <AlertCircle size={48} className="mx-auto mb-4" />
          <p>Nenhum item no catálogo. Importe a planilha do Omie acima.</p>
        </div>
      )}
    </div>
  );
}
