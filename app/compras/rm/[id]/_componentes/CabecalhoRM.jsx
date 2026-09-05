"use client";
import { fmtOP } from "@/lib/utils";
import { XCircle, Loader2, AlertCircle, CheckCircle2, Mail, Edit2, Trash2, Unlink, RotateCcw, Package } from "lucide-react";
import { labelCategoria } from "@/lib/op-categorias";
import BotaoMapaCotacao from "../BotaoMapaCotacao";
import { AnexosSection } from "./AnexosSection";
import { fmtData, STATUS_ITEM_LABELS } from "../_lib/formatos";

// Cartao do topo da tela da RM: identificacao, indicadores, anexos e a barra de acoes.
// Extraido do RMComprasClient — e um bloco de UI, nao tem estado proprio.
export function CabecalhoRM({
  rm,
  status,
  pesoTotal,
  stats,
  isAdmin,
  userRole,
  ehServicoDireto,
  qtdSemPropostaRm,
  podeFecharComoPedido,
  fecharComoPedidoGerado,
  fechandoComoPedido,
  itensLeftover,
  itensPedidoGerado,
  podeEncerrar,
  excluirRM,
  excluindo,
  desvincularDaOP,
  desvinculando,
  erroExcluir,
  setModalEditarCategorias,
  setModalPedidoDireto,
  setPreSelecionarMode,
  setModalEnviarCot,
  setModalEncerrarRM,
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-3xl font-extrabold text-torg-dark tracking-tight font-mono">{rm.numero}</h2>
            <span className={`text-xs px-2 py-1 rounded-full font-medium ${status.className}`}>{status.label}</span>
            <span className={`text-xs px-2 py-1 rounded-full font-medium ${
              rm.tipoRM === "MONTAGEM" ? "bg-emerald-50 text-emerald-700" :
              rm.tipoRM === "ALUGUEL" ? "bg-orange-50 text-torg-orange" : "bg-torg-blue-50 text-torg-blue"
            }`}>
              {rm.tipoRM === "ENGENHARIA" ? "Engenharia" : rm.tipoRM === "ALUGUEL" ? "Aluguel" : rm.tipoRM === "MONTAGEM" ? "Medição de Montagem" : "Interna"}
            </span>
          </div>
          <p className="text-torg-dark font-medium mt-1">{rm.descricao}</p>
          {rm.observacao && <p className="text-sm text-torg-gray mt-1">{rm.observacao}</p>}
        </div>
        {rm.op && (
          <div className="text-right text-sm">
            <p className="text-torg-gray">OP de origem</p>
            <p className="text-lg font-bold text-torg-blue font-mono">{fmtOP(rm.op.numero)}</p>
            <p className="text-xs text-torg-gray">{rm.op.cliente}{rm.op.obra ? ` — ${rm.op.obra}` : ""}</p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4 pt-4 border-t border-gray-100 text-sm">
        <div>
          <p className="text-torg-gray text-xs">Solicitante</p>
          <p className="text-torg-dark font-medium">{rm.createdBy?.name}</p>
          {rm.setor && <p className="text-torg-gray text-xs">{rm.setor}</p>}
        </div>
        <div>
          <p className="text-torg-gray text-xs">Data</p>
          <p className="text-torg-dark font-medium">{fmtData(rm.createdAt)}</p>
        </div>
        <div>
          <p className="text-torg-gray text-xs">Itens / Peso</p>
          <p className="text-torg-dark font-medium">
            {rm.itens.length}
            {pesoTotal > 0 && <span className="text-torg-gray"> · {pesoTotal.toFixed(2)} kg</span>}
          </p>
        </div>
        <div>
          <p className="text-torg-gray text-xs">Cotações</p>
          <p className="text-torg-dark font-medium">{rm.cotacoes.length}</p>
        </div>
        {/* ⚠ ao lado da contagem de cotações, que é onde a pessoa está olhando quando decide
            comparar. Só aparece quando há cotação recebida — ver BotaoMapaCotacao. */}
        <div className="flex items-end">
          <BotaoMapaCotacao rmId={rm.id} numero={rm.numero}
            cotacoes={rm.cotacoes.filter((c) => c.status === "RECEBIDA").length} />
        </div>
      </div>

      {/* Pizza de status dos itens */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mt-4 pt-4 border-t border-gray-100 text-xs">
        {Object.entries(STATUS_ITEM_LABELS).map(([k, v]) => (
          <div key={k} className={`text-center px-2 py-2 rounded ${v.className}`}>
            <p className="font-medium">{v.label}</p>
            <p className="font-extrabold text-base">{stats[k] || 0}</p>
          </div>
        ))}
      </div>

      {rm.tipoRM === "ENGENHARIA" && (
        <div className="mt-4 pt-4 border-t border-gray-100">
          <div className="flex items-center justify-between gap-2 mb-2">
            <p className="text-xs text-torg-gray">Cobre as categorias do escopo</p>
            {(isAdmin || userRole === "COMPRAS") && (
              <button
                onClick={() => setModalEditarCategorias(true)}
                className="text-xs text-torg-blue hover:text-torg-dark font-medium inline-flex items-center gap-1"
                title="Editar as categorias cobertas por essa RM (metadata — não afeta pedidos já gerados)"
              >
                <Edit2 size={12} /> Editar
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {(rm.categoriasOP || []).length > 0 ? (
              rm.categoriasOP.map((cat) => (
                <span key={cat} className="text-xs px-2 py-1 rounded-full bg-torg-blue text-white font-medium">
                  {labelCategoria(cat)}
                </span>
              ))
            ) : (
              <span className="text-xs text-torg-gray italic">Nenhuma categoria selecionada</span>
            )}
          </div>
        </div>
      )}

      {/* Anexos (desenhos, especificacoes) — enviados junto com a cotacao */}
      <AnexosSection
        rmId={rm.id}
        anexos={rm.anexos || []}
        editavel={(isAdmin || userRole === "COMPRAS") && rm.status !== "CANCELADA"}
      />

      {/* Ações — 3 grupos: Próximas ações | Vínculo | Destrutivas */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2 mt-4 pt-4 border-t border-gray-100">
        {/* Grupo 1: Próximas ações (cotação / fechar pedido) */}
        {ehServicoDireto ? (
          <button
            onClick={() => setModalPedidoDireto(true)}
            disabled={rm.status === "PEDIDO_GERADO" || rm.status === "CANCELADA"}
            className="h-9 px-3.5 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 inline-flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
            title={`${rm.tipoRM === "ALUGUEL" ? "Aluguel de equipamentos" : "Medição de montagem"}: sem cotação — gera o pedido direto no Omie com o valor informado pelo solicitante`}
          >
            <Package size={15} /> Gerar pedido Omie ({rm.tipoRM === "ALUGUEL" ? "aluguel" : "montagem"})
          </button>
        ) : (
        <button
          onClick={() => { setPreSelecionarMode(null); setModalEnviarCot(true); }}
          disabled={rm.status === "PEDIDO_GERADO" || rm.status === "CANCELADA"}
          className="h-9 px-3.5 bg-torg-blue text-white text-sm font-medium rounded-lg hover:bg-torg-blue-700 inline-flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Mail size={15} /> Enviar Cotação
        </button>
        )}
        {!ehServicoDireto && (rm.status === "EM_COTACAO" || rm.status === "COTADA") && (
          <button
            onClick={() => { setPreSelecionarMode("re-enviar"); setModalEnviarCot(true); }}
            className="h-9 px-3.5 bg-white border border-torg-blue text-torg-blue text-sm font-medium rounded-lg hover:bg-torg-blue-50 inline-flex items-center gap-1.5"
            title="Reenvia a cotação numa nova rodada — pra corrigir um erro ou pedir desconto. Os fornecedores da última cotação já vêm marcados."
          >
            <RotateCcw size={15} /> Reenviar cotação
          </button>
        )}
        {!ehServicoDireto && qtdSemPropostaRm > 0 && rm.status !== "PEDIDO_GERADO" && rm.status !== "CANCELADA" && (
          <button
            onClick={() => { setPreSelecionarMode("sem-proposta"); setModalEnviarCot(true); }}
            className="h-9 px-3.5 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 inline-flex items-center gap-1.5"
            title={`Envia cotação só pros ${qtdSemPropostaRm} itens que ficaram sem proposta`}
          >
            <Mail size={15} /> Re-cotar Sem Proposta
            <span className="text-[10px] bg-white/20 px-1.5 py-0.5 rounded-full ml-0.5">{qtdSemPropostaRm}</span>
          </button>
        )}
        {podeFecharComoPedido && (
          <button
            onClick={fecharComoPedidoGerado}
            disabled={fechandoComoPedido}
            className="h-9 px-3.5 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 inline-flex items-center gap-1.5 disabled:opacity-50"
            title={itensLeftover > 0
              ? `Marca RM como Pedido Gerado: ${itensPedidoGerado} ja em pedido + ${itensLeftover} serao cancelados`
              : `Marca RM como Pedido Gerado (${itensPedidoGerado} itens)`}
          >
            {fechandoComoPedido ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
            Fechar como Pedido Gerado
            {itensLeftover > 0 && (
              <span className="text-[10px] bg-white/20 px-1.5 py-0.5 rounded-full ml-0.5">+{itensLeftover}</span>
            )}
          </button>
        )}

        {/* Spacer empurra os secundarios pra direita */}
        <div className="flex-1 min-w-[12px]" />

        {/* Grupo 2: Destrutivas + Desvincular (todas ghost/sutis) */}
        {(podeEncerrar || isAdmin || rm.opId) && (
          <div className="flex items-center gap-2 pl-2 ml-1 border-l border-gray-200">
            {podeEncerrar && (
              <button
                onClick={() => setModalEncerrarRM(true)}
                className="h-9 px-3 text-torg-orange-700 text-sm font-medium rounded-lg hover:bg-torg-orange-50 inline-flex items-center gap-1.5"
                title="Cancela a RM"
              >
                <XCircle size={15} /> Cancelar RM
              </button>
            )}
            {isAdmin && (
              <button
                onClick={excluirRM}
                disabled={excluindo}
                className="h-9 px-3 text-red-600 text-sm font-medium rounded-lg hover:bg-red-50 inline-flex items-center gap-1.5 disabled:opacity-50"
                title="Exclui a RM permanentemente"
              >
                {excluindo ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                Excluir
              </button>
            )}
            {rm.opId && rm.status !== "PEDIDO_GERADO" && (
              <button
                onClick={desvincularDaOP}
                disabled={desvinculando}
                className="h-9 px-3 text-torg-gray text-sm font-medium rounded-lg hover:bg-gray-100 inline-flex items-center gap-1.5 disabled:opacity-50"
                title="Desvincula a RM da OP — itens voltam pro estado original"
              >
                {desvinculando ? <Loader2 size={15} className="animate-spin" /> : <Unlink size={15} />}
                Desvincular
              </button>
            )}
          </div>
        )}
      </div>
      {erroExcluir && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg px-3 py-2 flex items-start gap-2 mt-3">
          <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
          <span>{erroExcluir}</span>
        </div>
      )}
    </div>
  );
}
