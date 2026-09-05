"use client";

// Lista de itens que entram na cotacao, com os atalhos de marcar/limpar.
export function SelecaoItensCotacao({
  itensSelecionados,
  limparTodos,
  marcarSemProposta,
  marcarTodos,
  qtdSemProposta,
  todosItensCotaveis,
  toggleItem,
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-sm font-medium text-torg-dark">
          Itens pra cotar ({itensSelecionados.size} de {todosItensCotaveis.length})
        </label>
        <div className="flex gap-2 text-xs items-center">
          <button onClick={marcarTodos} className="text-torg-blue hover:text-torg-dark font-medium">Todos</button>
          <span className="text-gray-300">·</span>
          <button onClick={limparTodos} className="text-torg-gray hover:text-torg-dark font-medium">Nenhum</button>
          {qtdSemProposta > 0 && (
            <>
              <span className="text-gray-300">·</span>
              <button
                onClick={marcarSemProposta}
                className="text-amber-700 hover:text-amber-900 font-medium"
                title="Marca apenas itens sem proposta de fornecedor"
              >
                Apenas sem proposta ({qtdSemProposta})
              </button>
            </>
          )}
        </div>
      </div>
      <div className="border border-gray-200 rounded-lg max-h-[280px] overflow-y-auto divide-y divide-gray-100">
        {todosItensCotaveis.map((it) => {
          const peso = Number(it.peso) || 0;
          const usaKg = peso > 0;
          const qtdMostrada = usaKg ? `${peso.toFixed(2)} KG` : `${it.qtd} ${it.unidade}`;
          const semProposta = it.status === "COTADO" && it.temPropostaComPreco === false;
          const statusBadge =
            semProposta ? "Sem proposta" :
            it.status === "EM_COTACAO" ? "Em cotação" :
            it.status === "COTADO" ? "Já cotado" : null;
          return (
            <label key={it.id} className="flex items-center gap-3 px-3 py-1.5 hover:bg-gray-50 cursor-pointer text-sm">
              <input
                type="checkbox"
                checked={itensSelecionados.has(it.id)}
                onChange={() => toggleItem(it.id)}
                className="w-4 h-4 rounded border-gray-300 text-torg-blue focus:ring-torg-blue"
              />
              {!it._rm.principal && (
                <span className="font-mono text-[10px] text-torg-blue bg-torg-blue-50 px-1.5 py-0.5 rounded">
                  {it._rm.numero}
                </span>
              )}
              <span className="flex-1 truncate">{it.descricao}</span>
              {statusBadge && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium whitespace-nowrap ${
                  semProposta
                    ? "bg-amber-50 text-amber-700"
                    : it.status === "COTADO"
                    ? "bg-torg-blue-100 text-torg-blue-800"
                    : "bg-torg-orange-50 text-torg-orange-700"
                }`}>
                  {statusBadge}
                </span>
              )}
              <span className="text-xs text-torg-gray tabular-nums">{qtdMostrada}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
