"use client";
import { X, List, LayoutGrid } from "lucide-react";
import { fmtOP } from "@/lib/utils";

// ─── A BARRA ACIMA DA TABELA DE RMs ────────────────────────────────────────────
//
// Extraída do `RMsTabelaSeletor.jsx` em 16/09/2026, que já passava de 1.200 linhas. Mora aqui
// porque é onde a tela conta o que está mostrando — e era exatamente isso que ela não contava.

/**
 * @param {object[]} obras          [{ numero, cliente, quantidade }] — do SERVIDOR, não das linhas
 * @param {string|null} opSelecionada  obra escolhida (vem da URL)
 * @param {(op:string)=>void} irPara   troca a obra navegando
 * @param {boolean} truncada        a consulta parou no teto
 */
export default function BarraFiltrosRM({
  obras, opSelecionada, irPara, exibidas, naLista, truncada, totalNoEscopo, limite,
  filtroCat, setFiltroCat, filtrosColuna, limparColunas, rotulosAtivos,
  viewMode, setViewMode,
}) {
  const temFiltro = filtroCat || opSelecionada || filtrosColuna > 0;
  const limpar = () => { setFiltroCat(null); limparColunas(); if (opSelecionada) irPara(""); };

  return (
    <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
      <div className="flex items-center gap-2 text-xs flex-wrap">
        {/* ⚠⚠ AS OPÇÕES VÊM DO SERVIDOR, de consulta própria por `groupBy` — não das linhas
            carregadas. Era o pior sintoma do bug de 16/09/2026: 11 obras não tinham NENHUMA RM
            dentro da janela das 100 mais recentes, então não existiam nem como opção. A obra sumia
            do filtro inteiro, e não havia como pedir para vê-la.

            ⚠ Cada opção diz quantas RMs a obra tem NO ESCOPO da aba. É o número que denuncia
            qualquer divergência futura: se a tabela mostrar menos do que a opção promete, o defeito
            fica à vista em vez de silencioso. */}
        {obras.length > 0 && (
          <select
            value={opSelecionada || ""}
            onChange={(e) => irPara(e.target.value)}
            className="px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs bg-white text-torg-dark font-medium"
            title="Filtrar RMs por OP"
          >
            <option value="">Todas as OPs</option>
            {obras.map((o) => (
              <option key={o.numero} value={o.numero}>
                {fmtOP(o.numero)}{o.cliente ? ` — ${o.cliente}` : ""} ({o.quantidade})
              </option>
            ))}
          </select>
        )}
        {temFiltro && (
          <button onClick={limpar} className="text-torg-blue font-medium hover:underline inline-flex items-center gap-1">
            <X size={12} /> Limpar filtros
          </button>
        )}
        <span className="text-torg-gray">
          Mostrando {exibidas} de {naLista} RM{naLista !== 1 ? "s" : ""}
        </span>
        {/* ⚠⚠ O CORTE APARECE. Sem obra escolhida a consulta ainda para nas mais recentes — o Neon
            é pequeno e carregar o histórico inteiro é o caminho do OOM 53200 documentado no
            CLAUDE.md. O que mudou é que a tela DIZ isso: o truncamento silencioso foi o que deixou
            111 RMs sumirem sem ninguém notar. Com obra escolhida não há corte, e isto não aparece. */}
        {truncada && !opSelecionada && (
          <span className="text-torg-orange font-medium">
            mostrando as {limite} mais recentes de {totalNoEscopo} — escolha uma OP para ver a obra inteira
          </span>
        )}
        {/* ⚠ O funil ativo vive DENTRO do cabeçalho, que no kanban nem existe. Sem dizer aqui quais
            colunas estão filtrando, a lista curta vira mistério. */}
        {filtrosColuna > 0 && (
          <span className="text-torg-orange font-medium" title={rotulosAtivos.join(", ")}>
            filtrando por {rotulosAtivos.join(", ")}
          </span>
        )}
      </div>

      <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden">
        {[["tabela", List, "Tabela"], ["kanban", LayoutGrid, "Kanban"]].map(([modo, Icone, rotulo], i) => (
          <button
            key={modo}
            onClick={() => setViewMode(modo)}
            className={`px-3 py-1.5 text-xs font-medium inline-flex items-center gap-1 ${i ? "border-l border-gray-200" : ""} ${
              viewMode === modo ? "bg-torg-blue text-white" : "bg-white text-torg-gray hover:bg-gray-50"
            }`}
          >
            <Icone size={14} /> {rotulo}
          </button>
        ))}
      </div>
    </div>
  );
}
