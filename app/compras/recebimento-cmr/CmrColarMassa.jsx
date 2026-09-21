"use client";
import { Loader2, Check, Trash2 } from "lucide-react";
import CampoData from "@/components/CampoData";

// VÁRIAS LINHAS DE UMA VEZ — o painel inteiro, em arquivo próprio.
//
// ⚠ Extraído junto com a edição (11/09/2026): é um bloco fechado de JSX que só conversa com o
// estado `massa`, e era parte do que mantinha o cliente do lançamento abaixo do teto de 350 linhas.
//
// ⚠⚠ A PRÉVIA VIROU EDITÁVEL (17/09/2026). Matheus: "quando selecionar um pedido ser possível
// flegar vários itens do pedido, exemplo item 1, 4, 6, 8, e lançar todos de uma vez nas linhas
// abaixo, e depois o operador vem alterando o que for necessário nas linhas". Antes daqui só dava
// para APAGAR uma linha: qualquer correção obrigava a voltar ao Excel, colar de novo e conferir
// tudo outra vez. Certificado, corrida e peso são justamente o que vem na nota e não no pedido —
// ou seja, o que SEMPRE precisa ser digitado depois.

/** Os campos que o operador corrige na linha, na ordem em que ele lê a nota fiscal. */
const CELULAS = [
  { k: "descricao",       w: "min-w-[240px]" },
  { k: "especificacao",   w: "w-28" },
  { k: "certificado",     w: "w-28" },
  { k: "loteCorrida",     w: "w-24" },
  { k: "pedidoCompra",    w: "w-20" },
  { k: "dataRecebimento", w: "w-32", data: true },
  { k: "nf",              w: "w-20" },
  { k: "fornecedor",      w: "w-36" },
  { k: "obra",            w: "w-24" },
  { k: "qtd",             w: "w-20", num: true },
  { k: "pesoLitro",       w: "w-20", num: true },
];

export default function CmrColarMassa({ massa, setMassa, colar, salvarMassa, salvando, origem }) {
  const editar = (i, k, v) => setMassa((a) => a.map((m, j) => (j === i ? { ...m, [k]: v } : m)));
  // ⚠ Vindo do pedido não faz sentido oferecer a caixa de colar: as linhas já estão montadas, e
  // colar por cima apagaria a seleção sem avisar.
  const doPedido = origem === "pedido";

  return (
    <div className="bg-white border border-gray-100 rounded-xl shadow-sm p-4 space-y-3">
      {doPedido ? (
        <p className="text-[12px] text-torg-gray">
          {massa.length} item(ns) do pedido prontos para lançar. <strong>Ajuste o que a nota trouxer</strong> —
          certificado, corrida, peso — e grave. O <strong>índice R é automático</strong>.
        </p>
      ) : (
        <>
          <p className="text-[12px] text-torg-gray">Copie as linhas do Excel (na ordem da planilha) e cole abaixo. O <strong>índice R é automático</strong>. Confira, corrija o que precisar na própria tabela e grave.</p>
          <textarea rows={4} onPaste={(e) => { e.preventDefault(); colar(e.clipboardData.getData("text")); }} onChange={(e) => colar(e.target.value)}
            placeholder="Cole aqui (Ctrl+V) as linhas copiadas do Excel…" className="w-full text-xs border border-gray-300 rounded-lg px-3 py-2 font-mono focus:ring-2 focus:ring-torg-blue outline-none" />
        </>
      )}

      {massa.length > 0 && (
        <>
          <div className="overflow-x-auto border border-gray-100 rounded-lg max-h-72 overflow-y-auto">
            <table className="w-full text-xs whitespace-nowrap">
              <thead className="bg-gray-50/60 sticky top-0 z-10"><tr className="text-[10px] text-gray-500 uppercase">
                <th className="px-2 py-1.5 text-left">R/RC</th><th className="px-2 py-1.5 text-left">Descrição</th><th className="px-2 py-1.5 text-left">Espec.</th><th className="px-2 py-1.5 text-left">Certif.</th><th className="px-2 py-1.5 text-left">Corrida</th><th className="px-2 py-1.5 text-left">Pedido</th><th className="px-2 py-1.5 text-left">Data</th><th className="px-2 py-1.5 text-left">NF</th><th className="px-2 py-1.5 text-left">Forn.</th><th className="px-2 py-1.5 text-left">Obra</th><th className="px-2 py-1.5 text-right">Qtd</th><th className="px-2 py-1.5 text-right">Peso</th><th className="px-2 py-1.5"></th>
              </tr></thead>
              <tbody className="divide-y divide-gray-50">
                {massa.map((m, i) => (
                  <tr key={i} className="hover:bg-gray-50/50">
                    {/* ⚠ R/RC é escolha entre dois, não texto livre — o resto da tela deriva o
                        tipo do lançamento dele. */}
                    <td className="px-1 py-1">
                      <select value={m.rc || "R"} onChange={(e) => editar(i, "rc", e.target.value)}
                        className="w-14 text-xs font-mono border border-transparent hover:border-gray-300 focus:border-torg-blue rounded px-1 py-0.5 bg-transparent outline-none">
                        <option value="R">R</option><option value="RC">RC</option>
                      </select>
                    </td>
                    {CELULAS.map((c) => {
                      const cls = `${c.w} ${c.num ? "text-right tabular-nums" : ""} text-xs border border-transparent hover:border-gray-300 focus:border-torg-blue rounded px-1.5 py-0.5 bg-transparent outline-none focus:bg-white`;
                      return (
                        <td key={c.k} className="px-1 py-1">
                          {/* ⚠⚠ DATA VAI DE `CampoData`, NUNCA DE `<input type="date">` CRU. O campo
                              nativo mostra o formato do IDIOMA DA INTERFACE do navegador — em
                              inglês ele pede `mm/dd/yyyy`, e o almoxarife digita 09/17 achando que
                              é 17/09. Foi o que saiu na primeira versão desta tabela. */}
                          {c.data ? (
                            <CampoData value={m[c.k] ?? ""} onChange={(iso) => editar(i, c.k, iso)} className={cls} />
                          ) : (
                            <input
                              value={m[c.k] ?? ""}
                              onChange={(e) => editar(i, c.k, e.target.value)}
                              title={c.k === "descricao" ? m.descricao : undefined}
                              className={cls}
                            />
                          )}
                        </td>
                      );
                    })}
                    <td className="px-2 py-1 text-right">
                      <button onClick={() => setMassa((a) => a.filter((_, j) => j !== i))} title="Tirar esta linha"
                        className="text-gray-300 hover:text-red-600"><Trash2 size={13} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between flex-wrap gap-2">
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
