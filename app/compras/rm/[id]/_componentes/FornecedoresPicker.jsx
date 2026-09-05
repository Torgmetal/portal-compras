"use client";
import Link from "next/link";
import { Loader2, X, Plus } from "lucide-react";
import { CATEGORIAS_FORNECEDOR_BUILTIN, chipCategoriaFornecedor, labelCategoriaFornecedor } from "@/lib/fornecedor-categorias";
import { Modal } from "./Modal";

// FornecedoresPicker — bloco que combina:
// 1) Lista de fornecedores cadastrados (Vendor List) com checkbox + filtro
//    por categoria + busca
// 2) Linhas avulsas (nome + email) pra fornecedor nao cadastrado
// Usado nos modais de envio de cotacao.
export function FornecedoresPicker({
  fornecedoresCadastrados, fornFiltrados, carregandoForn,
  fornSelecionadosIds, toggleFornCadastrado,
  filtroCatForn, setFiltroCatForn, buscaForn, setBuscaForn,
  fornecedoresLinhas, setFornecedor, addFornecedor, removerFornecedor,
  categoriasFornecedor = CATEGORIAS_FORNECEDOR_BUILTIN,
}) {
  const qtdSelCadastrados = fornSelecionadosIds.size;
  const qtdAvulsosValidos = fornecedoresLinhas.filter((f) => f.email && f.nome).length;
  const totalSel = qtdSelCadastrados + qtdAvulsosValidos;
  return (
    <div>
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <label className="block text-sm font-medium text-torg-dark">
          Fornecedores selecionados ({totalSel})
        </label>
        <Link
          href="/compras/vendorlist"
          target="_blank"
          className="text-[11px] text-torg-blue hover:text-torg-dark font-medium inline-flex items-center gap-1"
          title="Abrir Vendor List em nova aba"
        >
          + Cadastrar novo fornecedor
        </Link>
      </div>

      {/* Filtros + busca pros cadastrados */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-2">
        <div className="flex items-center gap-2 flex-wrap mb-2">
          <span className="text-[11px] text-torg-gray font-medium">Categoria:</span>
          <button
            type="button"
            onClick={() => setFiltroCatForn(null)}
            className={`text-[11px] px-2 py-0.5 rounded-full border font-medium ${
              filtroCatForn === null
                ? "bg-torg-dark text-white border-torg-dark"
                : "bg-white text-torg-gray border-gray-300 hover:bg-gray-100"
            }`}
          >
            Todas
          </button>
          {categoriasFornecedor.map((cat) => (
            <button
              key={cat.codigo}
              type="button"
              onClick={() => setFiltroCatForn(filtroCatForn === cat.codigo ? null : cat.codigo)}
              className={`text-[11px] px-2 py-0.5 rounded-full border font-medium ${
                filtroCatForn === cat.codigo
                  ? "bg-torg-blue text-white border-torg-blue"
                  : `${chipCategoriaFornecedor(cat.codigo, categoriasFornecedor)} hover:opacity-80`
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
        <input
          type="text"
          value={buscaForn}
          onChange={(e) => setBuscaForn(e.target.value)}
          placeholder="Buscar fornecedor por nome, email, contato..."
          className="w-full text-xs border border-gray-300 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-torg-blue"
        />
      </div>

      {/* Lista de cadastrados — checkbox + chips de categoria */}
      <div className="border border-gray-200 rounded-lg max-h-[260px] overflow-y-auto divide-y divide-gray-100 mb-3">
        {carregandoForn ? (
          <p className="text-center text-xs text-torg-gray italic py-6">
            <Loader2 size={12} className="inline animate-spin mr-1" /> Carregando fornecedores...
          </p>
        ) : fornFiltrados.length === 0 ? (
          <p className="text-center text-xs text-torg-gray italic py-6">
            {fornecedoresCadastrados.length === 0
              ? "Nenhum fornecedor cadastrado. Use o link acima pra cadastrar."
              : "Nenhum fornecedor encontrado com esses filtros."}
          </p>
        ) : (
          fornFiltrados.map((f) => {
            const checked = fornSelecionadosIds.has(f.id);
            return (
              <label
                key={f.id}
                className={`flex items-start gap-2 px-3 py-2 cursor-pointer text-xs hover:bg-gray-50 ${
                  checked ? "bg-torg-blue-50/40" : ""
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleFornCadastrado(f.id)}
                  className="mt-0.5 w-4 h-4 rounded border-gray-300 text-torg-blue focus:ring-torg-blue"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <p className="text-torg-dark font-medium truncate">{f.razaoSocial}</p>
                    <span className="text-[10px] text-torg-gray">{f.email}</span>
                  </div>
                  {(f.categorias || []).length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {f.categorias.map((c) => (
                        <span
                          key={c}
                          className={`text-[9px] px-1.5 py-0.5 rounded-full border font-medium ${chipCategoriaFornecedor(c, categoriasFornecedor)}`}
                        >
                          {labelCategoriaFornecedor(c, categoriasFornecedor)}
                        </span>
                      ))}
                    </div>
                  )}
                  {f.contato && (
                    <p className="text-[10px] text-torg-gray mt-0.5 italic">contato: {f.contato}</p>
                  )}
                </div>
              </label>
            );
          })
        )}
      </div>

      {/* Avulsos (nao cadastrados) */}
      <details className="bg-amber-50/40 border border-amber-200 rounded-lg" {...(qtdAvulsosValidos > 0 ? { open: true } : {})}>
        <summary className="px-3 py-2 cursor-pointer text-xs font-medium text-amber-800 hover:bg-amber-50/60">
          + Adicionar fornecedor avulso (não cadastrado) {qtdAvulsosValidos > 0 && `(${qtdAvulsosValidos})`}
        </summary>
        <div className="p-3 border-t border-amber-200 space-y-2">
          {fornecedoresLinhas.map((f, idx) => (
            <div key={idx} className="flex gap-2 items-start">
              <input
                type="text"
                value={f.nome}
                onChange={(e) => setFornecedor(idx, "nome", e.target.value)}
                placeholder="Nome do fornecedor"
                className="flex-1 min-w-0 border border-amber-200 rounded-lg px-3 py-1.5 text-xs focus:ring-2 focus:ring-torg-blue bg-white"
              />
              <input
                type="email"
                value={f.email}
                onChange={(e) => setFornecedor(idx, "email", e.target.value)}
                placeholder="email@fornecedor.com.br"
                className="flex-1 min-w-0 border border-amber-200 rounded-lg px-3 py-1.5 text-xs focus:ring-2 focus:ring-torg-blue bg-white"
              />
              <button
                type="button"
                onClick={() => removerFornecedor(idx)}
                disabled={fornecedoresLinhas.length === 1 && !f.nome && !f.email}
                className="px-2 py-1.5 text-red-500 hover:text-red-700 disabled:opacity-30"
                title="Remover"
              >
                <X size={12} />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addFornecedor}
            className="text-[11px] text-amber-800 hover:text-amber-900 font-medium inline-flex items-center gap-1"
          >
            <Plus size={11} /> Mais um avulso
          </button>
        </div>
      </details>

      <p className="text-xs text-torg-gray mt-2">
        Cada fornecedor recebe um <strong>link único e privado</strong> com a cotação.
      </p>
    </div>
  );
}

/* ─── Modal: gerar pedido Omie direto de RM de MONTAGEM ou ALUGUEL ──
   Sem cotação: o solicitante já informou o valor (medição ou diária × dias);
   aqui o Compras só escolhe fornecedor/categoria e dispara — o pedido nasce
   vinculado à OP e o custo cai no extrato da obra. */
