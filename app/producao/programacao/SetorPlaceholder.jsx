"use client";
import { useState, useRef } from "react";
import * as XLSX from "xlsx";
import {
  Upload, Download, FileSpreadsheet, Loader2,
  Construction, Filter, Search,
} from "lucide-react";

/**
 * Componente placeholder para setores em construção.
 * Já inclui botões de Importar Planilha e Exportar Relatório funcionais.
 * @param {{ setor: string, icon: import("lucide-react").LucideIcon, cor: string }} props
 */
export default function SetorPlaceholder({ setor, icon: Icon, cor = "torg-blue" }) {
  const [importando, setImportando] = useState(false);
  const [dadosImportados, setDadosImportados] = useState(null);
  const [exportando, setExportando] = useState(false);
  const fileRef = useRef(null);

  // Importar planilha genérica
  function handleImport(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportando(true);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(ws, { defval: "" });
        setDadosImportados({
          arquivo: file.name,
          linhas: json.length,
          colunas: json.length > 0 ? Object.keys(json[0]) : [],
          amostra: json.slice(0, 5),
        });
      } catch (err) {
        alert("Erro ao ler planilha: " + err.message);
      } finally {
        setImportando(false);
        if (fileRef.current) fileRef.current.value = "";
      }
    };
    reader.readAsArrayBuffer(file);
  }

  // Exportar relatório placeholder
  function exportarRelatorio() {
    setExportando(true);
    try {
      const wb = XLSX.utils.book_new();
      const agora = new Date().toLocaleDateString("pt-BR") + " " +
        new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

      const rows = [
        [`PROGRAMAÇÃO — ${setor.toUpperCase()}`],
        [`Gerado em ${agora}`],
        [],
        ["Este setor ainda está sendo configurado."],
        ["Os dados de programação serão preenchidos em breve."],
      ];

      if (dadosImportados) {
        rows.push([]);
        rows.push([`Dados importados de: ${dadosImportados.arquivo}`]);
        rows.push([`Total de linhas: ${dadosImportados.linhas}`]);
        rows.push([]);
        rows.push(dadosImportados.colunas);
        for (const row of dadosImportados.amostra) {
          rows.push(dadosImportados.colunas.map((c) => row[c] ?? ""));
        }
        if (dadosImportados.linhas > 5) {
          rows.push([`... e mais ${dadosImportados.linhas - 5} linhas`]);
        }
      }

      const ws = XLSX.utils.aoa_to_sheet(rows);
      ws["!cols"] = Array(10).fill({ wch: 18 });
      XLSX.utils.book_append_sheet(wb, ws, setor);

      const fileName = `Programacao_${setor}_${new Date().toISOString().slice(0, 10)}.xlsx`;
      XLSX.writeFile(wb, fileName);
    } catch (err) {
      alert("Erro ao exportar: " + err.message);
    } finally {
      setExportando(false);
    }
  }

  return (
    <div className="space-y-4 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-torg-dark tracking-tight flex items-center gap-2">
            <Icon size={24} className="text-torg-blue" /> Programação — {setor}
          </h2>
          <p className="text-xs text-torg-gray mt-0.5">
            Acompanhamento e programação do setor de {setor.toLowerCase()}.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleImport}
            className="hidden"
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={importando}
            className="px-3 py-1.5 bg-torg-dark text-white text-xs rounded-lg hover:bg-torg-dark/90 font-medium flex items-center gap-1.5 disabled:opacity-50"
          >
            {importando ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            Importar Planilha
          </button>
          <button
            onClick={exportarRelatorio}
            disabled={exportando}
            className="px-3 py-1.5 bg-torg-blue text-white text-xs rounded-lg hover:bg-torg-blue-700 font-medium flex items-center gap-1.5 disabled:opacity-50"
          >
            {exportando ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            Exportar Relatório
          </button>
        </div>
      </div>

      {/* Aviso de construção */}
      {!dadosImportados && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 text-center py-16">
          <Construction size={48} className="mx-auto text-gray-300 mb-4" />
          <h3 className="text-lg font-bold text-torg-dark mb-1">Setor em construção</h3>
          <p className="text-sm text-torg-gray max-w-md mx-auto">
            A programação de <strong>{setor.toLowerCase()}</strong> está sendo implementada.
            Você já pode importar uma planilha para visualização prévia ou exportar um relatório base.
          </p>
        </div>
      )}

      {/* Dados importados (preview) */}
      {dadosImportados && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-4 py-3 bg-emerald-50 border-b border-emerald-100 flex items-center gap-2">
            <FileSpreadsheet size={16} className="text-emerald-600" />
            <span className="text-sm font-semibold text-emerald-800">
              {dadosImportados.arquivo}
            </span>
            <span className="text-xs text-emerald-600 ml-2">
              {dadosImportados.linhas} linhas · {dadosImportados.colunas.length} colunas
            </span>
            <button
              onClick={() => setDadosImportados(null)}
              className="ml-auto text-xs text-emerald-700 hover:text-emerald-900"
            >
              Fechar preview
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50/60">
                <tr>
                  {dadosImportados.colunas.map((col) => (
                    <th key={col} className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase whitespace-nowrap">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {dadosImportados.amostra.map((row, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    {dadosImportados.colunas.map((col) => (
                      <td key={col} className="px-3 py-1.5 text-xs text-torg-gray whitespace-nowrap max-w-[200px] truncate">
                        {row[col] ?? "—"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {dadosImportados.linhas > 5 && (
            <div className="px-4 py-2 bg-gray-50/60 border-t border-gray-100 text-[11px] text-torg-gray">
              Mostrando 5 de {dadosImportados.linhas} linhas
            </div>
          )}
        </div>
      )}
    </div>
  );
}
