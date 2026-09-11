"use client";
import { Download, Loader2, Printer, Search } from "lucide-react";

// A BARRA DE AÇÕES DA LISTA — filtro, marcar, limpar, gerar e baixar.
//
// ⚠ Mora em arquivo próprio porque é um bloco de UI fechado, e era o que empurrava o
// `EtiquetasClient` para fora do teto de 350 linhas — exatamente o que o lint do projeto sugere
// ("repeated UI blocks -> reusable sub-component").

export default function BarraSelecao({ busca, setBusca, visiveis, sel, totalEtiquetas, marcarVisiveis, limpar, imprimir, gerando, filtrosAtivos, pdf }) {
  return (
    <div className="flex flex-wrap items-center gap-3 p-3 border-b border-gray-100 bg-gray-50/60">
      <div className="relative flex-1 min-w-[220px]">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-torg-gray" />
        <input value={busca} onChange={(e) => setBusca(e.target.value)}
          placeholder="Filtrar por marca ou descrição"
          className="w-full border border-gray-200 rounded-lg pl-9 pr-3 py-1.5 text-sm" />
      </div>
      <button onClick={marcarVisiveis} className="text-[13px] font-semibold text-torg-blue hover:underline">
        Marcar {busca ? "os filtrados" : "todas"} ({visiveis.length})
      </button>
      {/* ⚠ HABILITADO TAMBÉM COM FUNIL ATIVO E NADA MARCADO. Antes olhava só a seleção, e aí quem
          filtrasse uma coluna encontrava um "Limpar" apagado — morto justamente na hora em que ele
          é mais necessário, porque é o filtro que está escondendo marca da tela. */}
      <button onClick={limpar} disabled={!sel.size && !filtrosAtivos}
        className="text-[13px] text-torg-gray hover:underline disabled:opacity-40">Limpar</button>
      <div className="ml-auto flex items-center gap-3">
        {/* Quantas ETIQUETAS, não quantas marcas: é o número que decide se o rolo aguenta. */}
        <span className="text-[13px] text-torg-gray">
          <b className="text-torg-dark">{sel.size}</b> marca(s) ·{" "}
          <b className="text-torg-dark">{totalEtiquetas}</b> etiqueta(s)
        </span>
        {/* ⚠ BAIXAR É UM `<a download>`, NÃO UM BOTÃO. URL de blob não carrega nome de arquivo — o
            `Content-Disposition` da rota é ignorado, e o navegador salva com o UUID do blob. O nome
            só existe se o link disser qual é. Só aparece depois de gerar: antes não há o que baixar. */}
        {pdf && (
          <a href={pdf.url} download={pdf.nome}
            className="border border-torg-blue text-torg-blue text-sm font-semibold rounded-lg px-3 py-2 flex items-center gap-2">
            <Download size={15} /> Baixar PDF
          </a>
        )}
        <button onClick={imprimir} disabled={!sel.size || gerando}
          className="bg-torg-blue text-white text-sm font-semibold rounded-lg px-4 py-2 flex items-center gap-2 disabled:opacity-40">
          {gerando ? <Loader2 size={15} className="animate-spin" /> : <Printer size={15} />}
          {gerando ? "Gerando…" : "Gerar etiquetas"}
        </button>
      </div>
    </div>
  );
}
