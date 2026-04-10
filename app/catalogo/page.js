"use client";
import { useState, useRef } from "react";
import { useStore } from "@/lib/store";
import { Package, Upload, Search, Trash2, FileSpreadsheet, AlertCircle } from "lucide-react";
import * as XLSX from "xlsx";
import Papa from "papaparse";

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

  const familias = [...new Set(catalogo.map((it) => it.familia).filter(Boolean))].sort();

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
    </div>
    </div>
    </div>
    );
}
