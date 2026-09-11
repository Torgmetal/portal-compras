"use client";
import { Loader2, Check, Trash2 } from "lucide-react";

// COLAR VÁRIAS LINHAS DO EXCEL — o painel inteiro, em arquivo próprio.
//
// ⚠ Extraído junto com a edição (11/09/2026): é um bloco fechado de JSX que só conversa com o
// estado `massa`, e era parte do que mantinha o cliente do lançamento acima do teto de 350 linhas.
export default function CmrColarMassa({ massa, setMassa, colar, salvarMassa, salvando }) {
  return (
    <div className="bg-white border border-gray-100 rounded-xl shadow-sm p-4 space-y-3">
      <p className="text-[12px] text-torg-gray">Copie as linhas do Excel (na ordem da planilha) e cole abaixo. O <strong>índice R é automático</strong>. Confira na prévia e grave.</p>
      <textarea rows={4} onPaste={(e) => { e.preventDefault(); colar(e.clipboardData.getData("text")); }} onChange={(e) => colar(e.target.value)}
        placeholder="Cole aqui (Ctrl+V) as linhas copiadas do Excel…" className="w-full text-xs border border-gray-300 rounded-lg px-3 py-2 font-mono focus:ring-2 focus:ring-torg-blue outline-none" />
      {massa.length > 0 && (
        <>
          <div className="overflow-x-auto border border-gray-100 rounded-lg max-h-72 overflow-y-auto">
            <table className="w-full text-xs whitespace-nowrap">
              <thead className="bg-gray-50/60 sticky top-0"><tr className="text-[10px] text-gray-500 uppercase">
                <th className="px-2 py-1.5 text-left">R/RC</th><th className="px-2 py-1.5 text-left">Descrição</th><th className="px-2 py-1.5 text-left">Espec.</th><th className="px-2 py-1.5 text-left">Certif.</th><th className="px-2 py-1.5 text-left">Corrida</th><th className="px-2 py-1.5 text-left">Pedido</th><th className="px-2 py-1.5 text-left">Data</th><th className="px-2 py-1.5 text-left">NF</th><th className="px-2 py-1.5 text-left">Forn.</th><th className="px-2 py-1.5 text-left">Obra</th><th className="px-2 py-1.5 text-right">Qtd</th><th className="px-2 py-1.5 text-right">Peso</th><th className="px-2 py-1.5"></th>
              </tr></thead>
              <tbody className="divide-y divide-gray-50">
                {massa.map((m, i) => (
                  <tr key={i} className="hover:bg-gray-50/50">
                    <td className="px-2 py-1 font-mono">{m.rc}</td>
                    <td className="px-2 py-1 max-w-[260px] truncate" title={m.descricao}>{m.descricao}</td>
                    <td className="px-2 py-1">{m.especificacao}</td><td className="px-2 py-1">{m.certificado}</td><td className="px-2 py-1">{m.loteCorrida}</td><td className="px-2 py-1">{m.pedidoCompra}</td><td className="px-2 py-1">{m.dataRecebimento}</td><td className="px-2 py-1">{m.nf}</td><td className="px-2 py-1">{m.fornecedor}</td><td className="px-2 py-1">{m.obra}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{m.qtd}</td><td className="px-2 py-1 text-right tabular-nums">{m.pesoLitro}</td>
                    <td className="px-2 py-1 text-right"><button onClick={() => setMassa((a) => a.filter((_, j) => j !== i))} className="text-gray-300 hover:text-red-600"><Trash2 size={13} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[12px] text-torg-gray">{massa.length} linha(s) prontas.</span>
            <div className="flex gap-2">
              <button onClick={() => setMassa([])} className="px-4 py-2 text-sm text-torg-gray border border-gray-300 rounded-lg hover:bg-gray-50">Limpar</button>
              <button onClick={salvarMassa} disabled={salvando} className="px-5 py-2 bg-torg-blue text-white rounded-lg text-sm font-medium inline-flex items-center gap-2 hover:bg-torg-dark disabled:opacity-50">
                {salvando ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Gravar {massa.length}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
