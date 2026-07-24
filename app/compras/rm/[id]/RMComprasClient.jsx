"use client";
import { useState, useMemo, useEffect, useRef } from "react";
import { upload as blobUpload } from "@vercel/blob/client";
import { fmtOP } from "@/lib/utils";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  XCircle, AlertTriangle, Lock, Loader2, AlertCircle, X, FileText,
  CheckCircle2, CheckCircle, Check, Mail, Edit2, Settings, Edit3, Trash2, Unlink, Plus,
  Upload, Sparkles, RotateCcw, Package,
} from "lucide-react";
import {
  labelCategoria, CATEGORIAS_MATERIAL, CATEGORIAS_SERVICOS_TERCEIRIZADOS,
  CATEGORIAS_ALUGUEL, CATEGORIA_OUTRO,
} from "@/lib/op-categorias";
import {
  CATEGORIAS_FORNECEDOR_BUILTIN,
  mergeCategorias,
  chipCategoriaFornecedor,
  labelCategoriaFornecedor,
} from "@/lib/fornecedor-categorias";
import MapaCotacaoClient from "@/app/compras/painel-ops/[opId]/MapaCotacaoClient";

const fmtMoeda = (v) =>
  Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtData = (d) => (d ? new Date(d).toLocaleDateString("pt-BR") : "—");

const STATUS_RM_LABELS = {
  ABERTA:        { label: "Aberta",         className: "bg-torg-blue-50 text-torg-blue" },
  EM_COTACAO:    { label: "Em cotação",     className: "bg-torg-orange-50 text-torg-orange-700" },
  COTADA:        { label: "Cotada",         className: "bg-torg-blue-100 text-torg-blue-800" },
  PEDIDO_GERADO: { label: "Pedido gerado",  className: "bg-torg-dark text-white" },
  CANCELADA:     { label: "Cancelada",      className: "bg-gray-100 text-gray-500" },
};

const STATUS_ITEM_LABELS = {
  PENDENTE:          { label: "Pendente",           className: "bg-torg-blue-50 text-torg-blue" },
  EM_COTACAO:        { label: "Em cotação",         className: "bg-torg-orange-50 text-torg-orange-700" },
  COTADO:            { label: "Cotado",             className: "bg-torg-blue-100 text-torg-blue-800" },
  PEDIDO_GERADO:     { label: "Pedido gerado",      className: "bg-torg-dark text-white" },
  ATENDIDO_ESTOQUE:  { label: "Atendido (estoque)", className: "bg-emerald-100 text-emerald-700" },
  CANCELADO:         { label: "Cancelado",          className: "bg-gray-200 text-gray-500 line-through" },
};

// Variante: item marcado como COTADO mas fornecedor nao deu preço pra ele —
// mostra como "Sem proposta" pro usuario perceber que precisa re-cotar.
const STATUS_SEM_PROPOSTA = { label: "Sem proposta", className: "bg-amber-50 text-amber-700" };

export default function RMComprasClient({ rm, outrasRMs = [], userRole, dadosMapa = null, apiBaseMapa = null, categoriasCustom = [], pedidos = [], verbaMaterial = null, menorCotacaoRM = null }) {
  const router = useRouter();
  const isAdmin = userRole === "ADMIN";
  // Lista mesclada (built-in + custom do banco)
  const todasCategoriasFornecedor = useMemo(
    () => mergeCategorias(categoriasCustom),
    [categoriasCustom]
  );

  const [modalCancelarItem, setModalCancelarItem] = useState(null);
  const [modalAtenderEstoque, setModalAtenderEstoque] = useState(null);
  const [modalEditarItem, setModalEditarItem] = useState(null);
  const [modalEncerrarRM, setModalEncerrarRM] = useState(false);
  const [modalEnviarCot, setModalEnviarCot] = useState(false);
  const [modalPedidoDireto, setModalPedidoDireto] = useState(false);
  // ALUGUEL e MONTAGEM não passam por cotação — o pedido Omie sai direto
  const ehServicoDireto = rm.tipoRM === "MONTAGEM" || rm.tipoRM === "ALUGUEL";
  // Painel de origem por tipo — voltar/redirecionar sem cair em RMs Materiais
  const painelLista =
    rm.tipoRM === "ALUGUEL" ? "/compras/aluguel" :
    rm.tipoRM === "MONTAGEM" ? "/compras/montagem" :
    rm.tipoRM === "INTERNA" ? "/compras/consumiveis" : "/compras";
  const [modalEditarCategorias, setModalEditarCategorias] = useState(false);
  // Quando o usuario clica "Re-cotar Sem Proposta", o modal abre ja filtrando
  // os itens. Reseta pro modo normal ao fechar.
  const [preSelecionarMode, setPreSelecionarMode] = useState(null);
  const [linksParaEnvio, setLinksParaEnvio] = useState(null);
  const [excluindo, setExcluindo] = useState(false);
  const [erroExcluir, setErroExcluir] = useState("");
  const [desvinculando, setDesvinculando] = useState(false);

  async function desvincularDaOP() {
    if (!window.confirm(
      `Desvincular a RM ${rm.numero} da OP atual?\n\n` +
      `A RM permanece, mas deixa de estar ligada a essa OP. ` +
      `Os vinculos de itens (com itens da OP/aditivo) tambem serao limpos.\n\n` +
      `Use isso quando quiser excluir a OP — depois de desvincular ` +
      `todas as RMs, a OP fica liberada pra exclusao.`
    )) return;
    setErroExcluir("");
    setDesvinculando(true);
    try {
      const res = await fetch(`/api/rm/${rm.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "desvincular" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro");
      router.refresh();
    } catch (e) {
      setErroExcluir(e.message);
    } finally {
      setDesvinculando(false);
    }
  }

  async function excluirRM(force = false) {
    if (!force && !window.confirm(
      `EXCLUIR DEFINITIVAMENTE a RM ${rm.numero}?\n\n` +
      `Apaga itens, cotações, envios e anexos.\n` +
      `Não funciona se a RM já gerou pedido no Omie (a menos que voce confirme que cancelou la).\n\n` +
      `Essa ação NÃO PODE ser desfeita.`
    )) return;
    setErroExcluir("");
    setExcluindo(true);
    try {
      const url = force ? `/api/rm/${rm.id}?force=1` : `/api/rm/${rm.id}`;
      const res = await fetch(url, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        // Backend bloqueia quando ha pedido CRIADO no Omie. Oferece forcar.
        if (data.requiresForce) {
          setExcluindo(false);
          const numeros = (data.pedidosCriados || []).join(", ");
          const ok = window.confirm(
            `${data.error}\n\n` +
            `Pedido(s): ${numeros}\n\n` +
            `Confirma que voce JA cancelou esse(s) pedido(s) no Omie?\n` +
            `Se sim, vou forcar a exclusao da RM no Workspace (so afeta nosso historico, nao reabre nada no Omie).`
          );
          if (ok) return excluirRM(true);
          return;
        }
        throw new Error(data.error || "Erro ao excluir");
      }
      router.push(painelLista);
    } catch (e) {
      setErroExcluir(e.message);
      setExcluindo(false);
    }
  }

  const status = STATUS_RM_LABELS[rm.status] || STATUS_RM_LABELS.ABERTA;
  const pesoTotal = rm.itens.reduce((s, it) => s + (Number(it.peso) || 0), 0);

  // Estatísticas dos itens
  const stats = useMemo(() => {
    const counts = { PENDENTE: 0, EM_COTACAO: 0, COTADO: 0, PEDIDO_GERADO: 0, ATENDIDO_ESTOQUE: 0, CANCELADO: 0 };
    for (const it of rm.itens) counts[it.status] = (counts[it.status] || 0) + 1;
    return counts;
  }, [rm.itens]);

  const podeEncerrar =
    isAdmin && rm.status !== "PEDIDO_GERADO" && rm.status !== "CANCELADA";

  // RM tem itens PEDIDO_GERADO mas a RM em si nao virou PEDIDO_GERADO ainda —
  // mostra botao pra fechar (cancela itens leftover).
  const itensPedidoGerado = stats.PEDIDO_GERADO || 0;
  const itensLeftover =
    (stats.PENDENTE || 0) +
    (stats.EM_COTACAO || 0) +
    (stats.COTADO || 0);
  const podeFecharComoPedido =
    rm.status !== "PEDIDO_GERADO" &&
    rm.status !== "CANCELADA" &&
    itensPedidoGerado > 0;

  // Quantidade de itens "Sem proposta" (COTADO mas sem precoUnit > 0 em
  // nenhuma cotacao recebida) — usado pra mostrar atalho de re-cotacao.
  const qtdSemPropostaRm = rm.itens.filter(
    (it) => it.status === "COTADO" && it.temPropostaComPreco === false
  ).length;

  const [fechandoComoPedido, setFechandoComoPedido] = useState(false);
  const fecharComoPedidoGerado = async () => {
    const msg = itensLeftover > 0
      ? `Atenção: vai marcar a RM como Pedido Gerado e CANCELAR ${itensLeftover} item(ns) que ainda não viraram pedido. Continuar?`
      : `Marcar RM como Pedido Gerado?`;
    if (!window.confirm(msg)) return;
    setFechandoComoPedido(true);
    try {
      const res = await fetch(`/api/rm/${rm.id}/fechar-como-pedido`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro");
      router.refresh();
    } catch (e) {
      alert(e.message);
    } finally {
      setFechandoComoPedido(false);
    }
  };

  return (
    <>
      {/* Cabeçalho */}
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

      {/* Itens */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-torg-dark">Itens ({rm.itens.length})</h3>
        </div>
        <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase w-8">#</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Descrição</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Material</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Qtd</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Peso</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rm.itens.map((it, i) => {
                // Item marcado como COTADO mas sem proposta com preço — fornecedor
                // nao cotou. Mostra label "Sem proposta" pro usuario perceber.
                const semProposta = it.status === "COTADO" && it.temPropostaComPreco === false;
                const statusItem = semProposta
                  ? STATUS_SEM_PROPOSTA
                  : (STATUS_ITEM_LABELS[it.status] || STATUS_ITEM_LABELS.PENDENTE);
                const podeCancelar =
                  (isAdmin || userRole === "COMPRAS") &&
                  ["PENDENTE", "EM_COTACAO", "COTADO"].includes(it.status);
                const podeAtenderEstoque =
                  (isAdmin || userRole === "COMPRAS") &&
                  ["PENDENTE", "EM_COTACAO", "COTADO"].includes(it.status);
                // Editar item: ADMIN/COMPRAS sempre podem revisar dados.
                // Pra itens ja PEDIDO_GERADO/CANCELADO aparece aviso no modal
                // (ajustes nao alteram pedido ja criado no Omie).
                const podeEditarItem = isAdmin || userRole === "COMPRAS";
                return (
                  <tr key={it.id} className={it.status === "CANCELADO" ? "opacity-60" : it.status === "ATENDIDO_ESTOQUE" ? "bg-emerald-50/30" : "hover:bg-gray-50"}>
                    <td className="px-3 py-1.5 text-gray-400 align-top">{i + 1}</td>
                    <td className="px-3 py-1.5 align-top">
                      <p className="text-torg-dark font-medium">{it.descricao}</p>
                      {(it.comprimento || it.largura || it.tratamento) && (
                        <p className="text-[10px] text-torg-gray mt-0.5">
                          {it.comprimento && it.largura
                            ? <span className="text-torg-blue-700 font-medium">{it.comprimento} × {it.largura}</span>
                            : <span className="text-torg-blue-700 font-medium">{it.comprimento || it.largura}</span>}
                          {it.tratamento && <span> · {it.tratamento}</span>}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-torg-gray text-xs align-top">{it.material || "—"}</td>
                    <td className="px-3 py-1.5 text-right text-torg-gray tabular-nums whitespace-nowrap align-top">{it.qtd} {it.unidade}</td>
                    <td className="px-3 py-1.5 text-right text-torg-gray tabular-nums whitespace-nowrap align-top">
                      {it.valorTotal ? <span className="font-semibold text-torg-dark">{fmtMoeda(it.valorTotal)}</span> : (it.peso ? Number(it.peso).toFixed(2) : "—")}
                    </td>
                    <td className="px-3 py-1.5">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap inline-block ${statusItem.className}`}>
                        {statusItem.label}
                      </span>
                      {it.status === "CANCELADO" && it.canceladoMotivo && (
                        <p className="text-[10px] text-torg-gray mt-0.5">Motivo: {it.canceladoMotivo}</p>
                      )}
                      {it.status === "ATENDIDO_ESTOQUE" && (
                        <p className="text-[10px] text-emerald-600 mt-0.5">
                          {it.atendidoEstoqueQtd ? `${Number(it.atendidoEstoqueQtd).toLocaleString("pt-BR")} ${it.unidade}` : ""}
                          {it.atendidoEstoqueObs ? ` · ${it.atendidoEstoqueObs}` : ""}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      <div className="inline-flex items-center gap-3 justify-end">
                        {podeEditarItem && (
                          <button
                            onClick={() => setModalEditarItem(it)}
                            className="text-xs text-torg-blue hover:text-torg-dark font-medium inline-flex items-center gap-1"
                            title="Editar dados do item"
                          >
                            <Edit2 size={12} /> Editar
                          </button>
                        )}
                        {podeAtenderEstoque && (
                          <button
                            onClick={() => setModalAtenderEstoque(it)}
                            className="text-xs text-emerald-600 hover:text-emerald-800 font-medium inline-flex items-center gap-1"
                            title="Marcar como atendido pelo estoque interno"
                          >
                            <Package size={12} /> Estoque
                          </button>
                        )}
                        {podeCancelar && (
                          <button
                            onClick={() => setModalCancelarItem(it)}
                            className="text-xs text-red-600 hover:text-red-800 font-medium inline-flex items-center gap-1"
                          >
                            <XCircle size={12} /> Cancelar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Verba de material da OP — quanto ainda tem pra comprar × preço cotado */}
      {verbaMaterial && verbaMaterial.verbaTotal > 0 && (
        <VerbaMaterialCard verba={verbaMaterial} menorCotacao={menorCotacaoRM} categoriasRM={rm.categoriasOP || []} />
      )}

      {/* Mapa de Cotação — escopo dessa RM (mesma UI do painel de OPs) */}
      {dadosMapa && rm.cotacoes.some((c) => c.status === "RECEBIDA") && (
        <div>
          <div className="bg-torg-blue-50/40 border border-torg-blue-100 rounded-lg px-4 py-2 mb-2 text-xs text-torg-dark flex items-start gap-2">
            <span>💡</span>
            <span>
              {rm.opId
                ? <>Mapa filtrado pra esta RM. Clique nas células pra escolher vencedores e gerar os pedidos. O botão &quot;Gerar Pedidos Omie&quot; abaixo cria pedidos pra <strong>todos os itens vencedores dessa OP</strong> (não só desta RM).</>
                : <>Mapa de cotações desta RM. Clique nas células pra escolher vencedores e gerar pedidos no Omie.</>
              }
            </span>
          </div>
          <MapaCotacaoClient op={dadosMapa} apiBase={apiBaseMapa || undefined} />
        </div>
      )}

      {/* Pedidos gerados */}
      {pedidos.length > 0 && (
        <PedidosGerados pedidos={pedidos} rmId={rm.id} onRevertido={() => router.refresh()} isAdmin={isAdmin} userRole={userRole} />
      )}

      {/* Cotações — ALUGUEL/MONTAGEM não passam por cotação */}
      {rm.cotacoes.length > 0 ? (
        <CotacoesList rm={rm} outrasRMs={outrasRMs} />
      ) : ehServicoDireto ? (
        <div className="bg-emerald-50/60 border border-emerald-100 rounded-lg p-4 text-sm text-torg-dark">
          <p className="font-medium">Sem cotação — pedido direto no Omie</p>
          <p className="text-torg-gray text-xs mt-1">
            {rm.tipoRM === "ALUGUEL" ? "Aluguel de equipamentos" : "Medição de montagem"}: registre e use o botão
            &quot;Gerar pedido Omie&quot; acima — o custo entra direto no extrato da OP.
          </p>
        </div>
      ) : (
        <div className="bg-torg-blue-50/40 border border-torg-blue-100 rounded-lg p-4 text-sm text-torg-dark">
          <p className="font-medium">Nenhuma cotação enviada ainda</p>
          <p className="text-torg-gray text-xs mt-1">
            Use o botão &quot;Enviar Cotação&quot; acima pra solicitar propostas aos fornecedores.
          </p>
        </div>
      )}

      {/* Modais */}
      {modalPedidoDireto && (
        <ModalPedidoDireto
          rm={rm}
          onClose={() => setModalPedidoDireto(false)}
          onGerado={() => { setModalPedidoDireto(false); router.refresh(); }}
        />
      )}
      {modalEnviarCot && (
        <ModalEnviarCotacao
          preSelecionarMode={preSelecionarMode}
          rm={rm}
          outrasRMs={outrasRMs}
          categoriasFornecedor={todasCategoriasFornecedor}
          onClose={() => setModalEnviarCot(false)}
          onSent={(result) => { setModalEnviarCot(false); setLinksParaEnvio(result); router.refresh(); }}
        />
      )}
      {linksParaEnvio && (
        <ModalLinksEnvio
          rm={rm}
          links={linksParaEnvio}
          onClose={() => setLinksParaEnvio(null)}
        />
      )}
      {modalCancelarItem && (
        <ModalCancelarItem
          item={modalCancelarItem}
          rmId={rm.id}
          onClose={() => setModalCancelarItem(null)}
          onSaved={() => router.refresh()}
        />
      )}
      {modalAtenderEstoque && (
        <ModalAtenderEstoque
          item={modalAtenderEstoque}
          rmId={rm.id}
          onClose={() => setModalAtenderEstoque(null)}
          onSaved={() => { setModalAtenderEstoque(null); router.refresh(); }}
        />
      )}
      {modalEditarItem && (
        <ModalEditarRMItem
          item={modalEditarItem}
          rmId={rm.id}
          onClose={() => setModalEditarItem(null)}
          onSaved={() => { setModalEditarItem(null); router.refresh(); }}
        />
      )}
      {modalEncerrarRM && (
        <ModalEncerrarRM
          rm={rm}
          onClose={() => setModalEncerrarRM(false)}
          onSaved={() => { router.refresh(); router.push(painelLista); }}
        />
      )}
      {modalEditarCategorias && (
        <ModalEditarCategorias
          rm={rm}
          onClose={() => setModalEditarCategorias(false)}
          onSaved={() => { setModalEditarCategorias(false); router.refresh(); }}
        />
      )}
    </>
  );
}

// ─── PEDIDOS GERADOS (com opcao de reverter e marcar recebido) ──

function VerbaMaterialCard({ verba, menorCotacao, categoriasRM = [] }) {
  const { verbaTotal, totalEmPedidos, saldo, porCategoria = [] } = verba;
  const catsRM = new Set(categoriasRM);
  const cabe = menorCotacao != null ? saldo - menorCotacao : null;
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2 flex-wrap">
        <Package size={16} className="text-torg-blue" />
        <h3 className="text-lg font-semibold text-torg-dark">Verba de material da OP</h3>
        <span className="text-xs text-torg-gray">quanto ainda há pra comprar × o preço cotado desta RM</span>
      </div>
      <div className="grid grid-cols-3 gap-px bg-gray-100 border-b border-gray-100">
        <div className="bg-white p-4">
          <p className="text-[10px] font-medium text-torg-gray uppercase tracking-wider mb-1">Orçado (verba)</p>
          <p className="text-lg font-extrabold text-torg-dark tabular-nums">{fmtMoeda(verbaTotal)}</p>
        </div>
        <div className="bg-white p-4">
          <p className="text-[10px] font-medium text-torg-gray uppercase tracking-wider mb-1">Comprometido</p>
          <p className="text-lg font-extrabold text-torg-orange-700 tabular-nums">{fmtMoeda(totalEmPedidos)}</p>
          <p className="text-[10px] text-torg-gray mt-1">em pedidos</p>
        </div>
        <div className="bg-white p-4">
          <p className="text-[10px] font-medium text-torg-gray uppercase tracking-wider mb-1">Disponível</p>
          <p className={`text-lg font-extrabold tabular-nums ${saldo >= 0 ? "text-emerald-700" : "text-red-600"}`}>{fmtMoeda(saldo)}</p>
        </div>
      </div>
      {menorCotacao != null && (
        <div className={`px-5 py-3 text-sm flex items-start gap-2 ${cabe >= 0 ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>
          <span>{cabe >= 0 ? "✓" : "⚠"}</span>
          <p>
            Menor cotação desta RM: <span className="font-semibold">{fmtMoeda(menorCotacao)}</span>.{" "}
            {cabe >= 0
              ? <>Cabe na verba disponível — sobrariam <span className="font-semibold">{fmtMoeda(cabe)}</span>.</>
              : <>Estoura a verba disponível em <span className="font-semibold">{fmtMoeda(-cabe)}</span>.</>}
          </p>
        </div>
      )}
      {porCategoria.length > 0 && (
        <div className="px-5 py-3">
          <p className="text-[11px] font-medium text-torg-gray uppercase tracking-wider mb-2">Orçado por categoria</p>
          <div className="space-y-0.5">
            {porCategoria.map((c) => (
              <div key={c.categoria} className={`flex items-center justify-between text-sm py-1 ${catsRM.has(c.categoria) ? "" : "opacity-50"}`}>
                <span className="text-torg-dark">{labelCategoria(c.categoria)}{catsRM.has(c.categoria) && <span className="ml-1.5 text-[10px] text-torg-blue font-medium">• desta RM</span>}</span>
                <span className="tabular-nums text-torg-dark">{fmtMoeda(c.orcado)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <p className="px-5 py-2 text-[11px] text-torg-gray border-t border-gray-50">Disponível = verba orçada da OP − pedidos já emitidos (OP inteira, todas as categorias). O comparativo abaixo é o menor preço das propostas recebidas desta RM.</p>
    </div>
  );
}

function PedidosGerados({ pedidos, rmId, onRevertido, isAdmin, userRole }) {
  const [revertendo, setRevertendo] = useState(null);
  const [confirmando, setConfirmando] = useState(null);
  const [toast, setToast] = useState(null);
  const [modalReceber, setModalReceber] = useState(null);
  const [modalEditar, setModalEditar] = useState(null);

  const handleReverter = async (pedido) => {
    setRevertendo(pedido.id);
    setConfirmando(null);
    try {
      const res = await fetch(`/api/pedido-omie/${pedido.id}/reverter`, { method: "POST" });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setToast({ ok: true, msg: `Pedido ${pedido.numeroPedido || ""} revertido. Itens voltaram para cotação.` });
      setTimeout(() => { setToast(null); onRevertido(); }, 2000);
    } catch (e) {
      setToast({ ok: false, msg: `Erro: ${e.message}` });
      setTimeout(() => setToast(null), 5000);
    } finally {
      setRevertendo(null);
    }
  };

  const podeReverter = isAdmin || userRole === "COMPRAS";
  const podeReceber = isAdmin || userRole === "COMPRAS";
  const pedidosAtivos = pedidos.filter((p) => p.status === "CRIADO");
  const pedidosRevertidos = pedidos.filter((p) => p.status === "REVERTIDO");
  const qtdRecebidos = pedidosAtivos.filter((p) => ["ENTREGUE", "ATRASADO", "RECEBIDO"].includes(p.statusEntrega)).length;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100">
        <h3 className="text-lg font-semibold text-torg-dark inline-flex items-center gap-2">
          <Package size={18} className="text-torg-blue" />
          Pedidos de Compra ({pedidosAtivos.length})
          {qtdRecebidos > 0 && (
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
              {qtdRecebidos} recebido{qtdRecebidos > 1 ? "s" : ""}
            </span>
          )}
        </h3>
        <p className="text-xs text-torg-gray mt-1">
          Pedidos gerados no Omie a partir dos vencedores desta RM. Para comprar de outro fornecedor, cancele o pedido no Omie e reverta aqui.
        </p>
      </div>

      {toast && (
        <div className={`mx-6 mt-3 text-xs rounded-lg px-3 py-2 ${
          toast.ok ? "bg-emerald-50 border border-emerald-200 text-emerald-800" : "bg-red-50 border border-red-200 text-red-700"
        }`}>
          {toast.ok ? "✓ " : "✗ "}{toast.msg}
        </div>
      )}

      <ul className="divide-y divide-gray-100">
        {pedidosAtivos.map((p) => {
          const recebido = ["ENTREGUE", "ATRASADO", "RECEBIDO"].includes(p.statusEntrega);
          return (
            <li key={p.id} className={`px-6 py-4 ${recebido ? "bg-emerald-50/30" : ""}`}>
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-torg-dark font-semibold">{p.fornecedorNome}</p>
                    {p.numeroPedido && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-torg-dark text-white font-medium">
                        #{p.numeroPedido}
                      </span>
                    )}
                    {p.faturamentoDireto && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-medium">
                        FD
                      </span>
                    )}
                    {recebido ? (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium inline-flex items-center gap-1">
                        <CheckCircle2 size={10} /> Recebido
                      </span>
                    ) : (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-medium">
                        Aguardando entrega
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-torg-gray mt-0.5">
                    {p.rmItens.length} {p.rmItens.length === 1 ? "item" : "itens"} desta RM
                    {" · "}{new Date(p.createdAt).toLocaleDateString("pt-BR")}
                  </p>
                  {/* Info de NF e recebimento */}
                  {recebido && (
                    <div className="mt-1.5 flex items-center gap-3 flex-wrap">
                      {p.nfNumero && (
                        <span className="text-xs inline-flex items-center gap-1 text-emerald-700 font-medium">
                          <FileText size={10} /> NF {p.nfNumero}{p.nfSerie ? ` / Série ${p.nfSerie}` : ""}
                        </span>
                      )}
                      {p.recebidoEm && (
                        <span className="text-xs text-torg-gray">
                          Recebido em {new Date(p.recebidoEm).toLocaleDateString("pt-BR")}
                        </span>
                      )}
                      {p.recebidoPor?.name && (
                        <span className="text-xs text-torg-gray">
                          por {p.recebidoPor.name}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <span className="text-torg-orange-700 font-semibold tabular-nums text-sm">
                  {Number(p.total || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </span>
                {/* Botoes de acao */}
                <div className="flex items-center gap-2 flex-wrap">
                  {podeReverter && (
                    <button
                      onClick={() => setModalEditar(p)}
                      className="px-3 py-1.5 text-xs bg-white border border-gray-200 text-torg-dark rounded-lg hover:bg-gray-50 font-medium inline-flex items-center gap-1"
                      title="Editar valor, fornecedor ou observação do pedido"
                    >
                      <Edit2 size={12} /> Editar
                    </button>
                  )}
                  {podeReceber && !recebido && (
                    <button
                      onClick={() => setModalReceber(p)}
                      className="px-3 py-1.5 text-xs bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium inline-flex items-center gap-1"
                      title="Registrar recebimento com numero da NF"
                    >
                      <CheckCircle2 size={12} /> Receber
                    </button>
                  )}
                  {podeReceber && recebido && (
                    <button
                      onClick={() => setModalReceber(p)}
                      className="px-3 py-1.5 text-xs bg-white border border-emerald-200 text-emerald-700 rounded-lg hover:bg-emerald-50 font-medium inline-flex items-center gap-1"
                      title="Editar dados do recebimento"
                    >
                      <Edit3 size={12} /> Editar NF
                    </button>
                  )}
                  {podeReverter && !recebido && (
                    <>
                      {confirmando === p.id ? (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-red-600 font-medium">Cancelou no Omie?</span>
                          <button
                            onClick={() => handleReverter(p)}
                            disabled={revertendo === p.id}
                            className="px-3 py-1.5 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium inline-flex items-center gap-1 disabled:opacity-50"
                          >
                            {revertendo === p.id ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                            Sim, reverter
                          </button>
                          <button
                            onClick={() => setConfirmando(null)}
                            className="px-2 py-1.5 text-xs text-torg-gray hover:text-torg-dark"
                          >
                            Não
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmando(p.id)}
                          className="px-3 py-1.5 text-xs bg-white border border-red-200 text-red-600 rounded-lg hover:bg-red-50 font-medium inline-flex items-center gap-1"
                          title="Reverter pedido: volta os itens pro status Cotado e desmarca vencedores. Cancele o pedido no Omie antes!"
                        >
                          <RotateCcw size={12} /> Reverter
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {pedidosRevertidos.length > 0 && (
        <div className="px-6 py-3 border-t border-gray-100 bg-gray-50/60">
          <p className="text-xs text-torg-gray mb-2">Revertidos anteriormente:</p>
          {pedidosRevertidos.map((p) => (
            <div key={p.id} className="flex items-center gap-2 text-xs text-gray-400 mb-1">
              <RotateCcw size={10} />
              <span className="line-through">{p.fornecedorNome}</span>
              {p.numeroPedido && <span>#{p.numeroPedido}</span>}
              <span>{Number(p.total || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span>
            </div>
          ))}
        </div>
      )}

      {/* Modal de Recebimento */}
      {modalReceber && (
        <ModalReceberPedido
          pedido={modalReceber}
          onClose={() => setModalReceber(null)}
          onSaved={() => { setModalReceber(null); onRevertido(); }}
        />
      )}

      {/* Modal de Edição do Pedido */}
      {modalEditar && (
        <ModalEditarPedido
          pedido={modalEditar}
          onClose={() => setModalEditar(null)}
          onSaved={() => { setModalEditar(null); onRevertido(); }}
        />
      )}
    </div>
  );
}

// ─── MODAL EDITAR PEDIDO ──

function ModalEditarPedido({ pedido, onClose, onSaved }) {
  const [total, setTotal] = useState(String(pedido.total || 0));
  const [fornecedor, setFornecedor] = useState(pedido.fornecedorNome || "");
  const [numeroPed, setNumeroPed] = useState(pedido.numeroPedido || "");
  const [obs, setObs] = useState(pedido.observacao || "");
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState("");

  const parseTotal = (v) => {
    // Aceita "39.804,33" (BR) ou "39804.33" (EN)
    const limpo = String(v).replace(/\s/g, "");
    if (/^\d{1,3}(\.\d{3})*(,\d+)?$/.test(limpo)) {
      return Number(limpo.replace(/\./g, "").replace(",", "."));
    }
    return Number(limpo.replace(",", "."));
  };

  const handleSalvar = async () => {
    const totalNum = parseTotal(total);
    if (isNaN(totalNum) || totalNum < 0) {
      setErro("Valor invalido");
      return;
    }
    if (!fornecedor.trim()) {
      setErro("Nome do fornecedor obrigatorio");
      return;
    }
    setSaving(true);
    setErro("");
    try {
      const res = await fetch(`/api/pedido-omie/${pedido.id}/editar`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          total: totalNum,
          fornecedorNome: fornecedor.trim(),
          numeroPedido: numeroPed.trim() || null,
          observacao: obs.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || "Erro ao salvar");
      onSaved();
    } catch (e) {
      setErro(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-torg-dark inline-flex items-center gap-2">
            <Edit2 size={16} className="text-torg-blue" />
            Editar Pedido
          </h3>
          <button onClick={onClose} className="text-torg-gray hover:text-torg-dark"><X size={18} /></button>
        </div>

        <div className="px-6 py-4 space-y-4">
          <p className="text-xs text-torg-gray">
            Ajuste os dados do pedido no portal para refletir alterações feitas diretamente no Omie.
          </p>

          <div>
            <label className="block text-xs font-medium text-torg-dark mb-1">Valor total (R$) *</label>
            <input
              type="text"
              value={total}
              onChange={(e) => setTotal(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-torg-blue focus:border-torg-blue"
              placeholder="39.804,33"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-torg-dark mb-1">Fornecedor *</label>
            <input
              type="text"
              value={fornecedor}
              onChange={(e) => setFornecedor(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-torg-blue focus:border-torg-blue"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-torg-dark mb-1">Nº Pedido Omie</label>
            <input
              type="text"
              value={numeroPed}
              onChange={(e) => setNumeroPed(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-torg-blue focus:border-torg-blue"
              placeholder="1461"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-torg-dark mb-1">Observação</label>
            <textarea
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              rows={2}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-torg-blue focus:border-torg-blue resize-none"
              placeholder="Motivo da alteração..."
            />
          </div>

          {erro && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex items-start gap-1.5">
              <AlertCircle size={12} className="mt-0.5 shrink-0" /> {erro}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-torg-gray hover:text-torg-dark">
            Cancelar
          </button>
          <button
            onClick={handleSalvar}
            disabled={saving}
            className="px-4 py-2 text-sm bg-torg-blue text-white rounded-lg hover:bg-torg-blue/90 font-medium inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── MODAL RECEBER PEDIDO ──

function ModalReceberPedido({ pedido, onClose, onSaved }) {
  const jaRecebido = pedido.statusEntrega === "RECEBIDO";
  const [nfNumero, setNfNumero] = useState(pedido.nfNumero || "");
  const [nfSerie, setNfSerie] = useState(pedido.nfSerie || "");
  const [dataRecebimento, setDataRecebimento] = useState(
    pedido.recebidoEm
      ? new Date(pedido.recebidoEm).toISOString().split("T")[0]
      : new Date().toISOString().split("T")[0]
  );
  const [salvando, setSalvando] = useState(false);
  const [desfazendo, setDesfazendo] = useState(false);
  const [erro, setErro] = useState("");

  const handleSalvar = async () => {
    if (!nfNumero.trim()) { setErro("Numero da NF obrigatorio"); return; }
    setSalvando(true);
    setErro("");
    try {
      const res = await fetch(`/api/pedido-omie/${pedido.id}/receber`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nfNumero: nfNumero.trim(),
          nfSerie: nfSerie.trim() || null,
          dataRecebimento: dataRecebimento || undefined,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      onSaved();
    } catch (e) {
      setErro(e.message);
    } finally {
      setSalvando(false);
    }
  };

  const handleDesfazer = async () => {
    if (!window.confirm("Desfazer recebimento? O pedido volta pro status anterior.")) return;
    setDesfazendo(true);
    setErro("");
    try {
      const res = await fetch(`/api/pedido-omie/${pedido.id}/receber`, { method: "DELETE" });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      onSaved();
    } catch (e) {
      setErro(e.message);
    } finally {
      setDesfazendo(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-torg-dark inline-flex items-center gap-2">
            <CheckCircle2 size={18} className="text-emerald-600" />
            {jaRecebido ? "Editar Recebimento" : "Registrar Recebimento"}
          </h3>
          <button onClick={onClose} className="text-torg-gray hover:text-torg-dark">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-4 space-y-4">
          {/* Info do pedido */}
          <div className="text-sm text-torg-gray bg-gray-50 rounded-lg px-3 py-2">
            <p className="font-medium text-torg-dark">{pedido.fornecedorNome}</p>
            <p className="text-xs mt-0.5">
              Pedido {pedido.numeroPedido ? `#${pedido.numeroPedido}` : "(sem numero)"}
              {" · "}{Number(pedido.total || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
            </p>
          </div>

          {/* Numero da NF */}
          <div>
            <label className="block text-sm font-medium text-torg-dark mb-1">
              Numero da NF <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={nfNumero}
              onChange={(e) => setNfNumero(e.target.value)}
              placeholder="Ex: 12345"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue outline-none"
              autoFocus
            />
          </div>

          {/* Serie (opcional) */}
          <div>
            <label className="block text-sm font-medium text-torg-dark mb-1">
              Serie <span className="text-xs text-torg-gray font-normal">(opcional)</span>
            </label>
            <input
              type="text"
              value={nfSerie}
              onChange={(e) => setNfSerie(e.target.value)}
              placeholder="Ex: 1"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue outline-none"
            />
          </div>

          {/* Data de recebimento */}
          <div>
            <label className="block text-sm font-medium text-torg-dark mb-1">
              Data de recebimento
            </label>
            <input
              type="date"
              value={dataRecebimento}
              onChange={(e) => setDataRecebimento(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue outline-none"
            />
          </div>

          {erro && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {erro}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between gap-3">
          <div>
            {jaRecebido && (
              <button
                onClick={handleDesfazer}
                disabled={desfazendo}
                className="px-3 py-2 text-xs bg-white border border-red-200 text-red-600 rounded-lg hover:bg-red-50 font-medium inline-flex items-center gap-1 disabled:opacity-50"
              >
                {desfazendo ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
                Desfazer recebimento
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-torg-gray hover:text-torg-dark font-medium"
            >
              Cancelar
            </button>
            <button
              onClick={handleSalvar}
              disabled={salvando || !nfNumero.trim()}
              className="px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              {salvando ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
              {jaRecebido ? "Atualizar" : "Confirmar Recebimento"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── CONFIG PEDIDO OMIE (categoria) ──

function ConfigPedidoOmie({ rm }) {
  const router = useRouter();
  const [categoria, setCategoria] = useState(rm.categoriaCompra || "");
  const [categoriasOpcoes, setCategoriasOpcoes] = useState([]);
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState("");
  const [erro, setErro] = useState("");

  useEffect(() => {
    setCarregando(true);
    fetch("/api/omie/categorias").then((r) => r.json()).catch(() => ({}))
      .then((dc) => {
        if (dc?.categorias?.length) setCategoriasOpcoes(dc.categorias);
      })
      .finally(() => setCarregando(false));
  }, []);

  const salvar = async (campo, valor) => {
    setSalvando(true);
    setErro("");
    setMsg("");
    try {
      const res = await fetch(`/api/rm/${rm.id}/config-omie`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [campo]: valor }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro");
      setMsg("Salvo");
      setTimeout(() => setMsg(""), 1500);
      router.refresh();
    } catch (e) {
      setErro(e.message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className={`bg-white rounded-xl shadow-sm p-5 border ${
      categoria ? "border-torg-blue-100" : "border-torg-orange-200 bg-torg-orange-50/20"
    }`}>
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <h3 className="text-base font-semibold text-torg-dark flex items-center gap-2">
          <Settings size={18} className="text-torg-blue" /> Configuracao para pedido Omie
        </h3>
        <div className="text-xs">
          {carregando && <span className="text-torg-gray">carregando opcoes...</span>}
          {salvando && <span className="text-torg-blue inline-flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> salvando</span>}
          {msg && <span className="text-torg-orange-700 font-medium">✓ {msg}</span>}
          {erro && <span className="text-red-600">{erro}</span>}
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-torg-gray mb-1">Categoria de Compra</label>
        {categoriasOpcoes.length > 0 ? (
          <select
            value={categoria}
            onChange={(e) => { setCategoria(e.target.value); salvar("categoriaCompra", e.target.value); }}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue bg-white"
          >
            <option value="">— Selecionar —</option>
            {categoriasOpcoes.map((c) => (
              <option key={c.codigo} value={c.codigo}>
                {c.codigo} — {c.descricao}
              </option>
            ))}
          </select>
        ) : (
          <input
            type="text"
            value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
            onBlur={(e) => salvar("categoriaCompra", e.target.value)}
            placeholder="Ex: 3.1"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue"
          />
        )}
      </div>
      {!categoria && (
        <p className="text-xs text-torg-orange-700 mt-2">
          ⚠ Preencha a categoria de compra — o local de estoque sera informado na hora de gerar o pedido.
        </p>
      )}
    </div>
  );
}

// ─── LISTA DE COTAÇÕES ──────────────────────────────

// Copia HTML pro clipboard usando 2 estrategias em sequencia:
// 1) Listener no evento "copy" que injeta HTML estruturado
// 2) Selecao de elemento contenteditable visivel
// Logs verbose pra debug.
function copyHtmlSync(html, text) {
  let ok = false;
  let container = null;
  let listener = null;
  try {
    // Strategy 1: registrar handler que injeta HTML no clipboardData
    listener = (e) => {
      try {
        e.clipboardData.setData("text/html", html);
        e.clipboardData.setData("text/plain", text || html.replace(/<[^>]+>/g, ""));
        e.preventDefault();
        console.log("[copyHtmlSync] clipboardData setData OK");
      } catch (err) {
        console.warn("[copyHtmlSync] setData falhou:", err?.message);
      }
    };
    document.addEventListener("copy", listener);

    // Cria container visivel mas no canto da tela
    container = document.createElement("div");
    container.setAttribute("contenteditable", "true");
    container.innerHTML = html;
    container.style.position = "fixed";
    container.style.left = "0";
    container.style.top = "0";
    container.style.width = "2px";
    container.style.height = "2px";
    container.style.opacity = "0.01"; // pequeno mas visivel
    container.style.zIndex = "-1";
    container.style.overflow = "hidden";
    document.body.appendChild(container);

    const range = document.createRange();
    range.selectNodeContents(container);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);

    ok = document.execCommand("copy");
    console.log("[copyHtmlSync] execCommand return:", ok, "| html len:", html.length);
    sel.removeAllRanges();
  } catch (e) {
    console.warn("[copyHtmlSync] erro:", e?.message);
    ok = false;
  } finally {
    if (listener) document.removeEventListener("copy", listener);
    if (container && container.parentNode) container.parentNode.removeChild(container);
  }
  return ok;
}

// Dispara mailto: via <a>.click() — mais robusto que window.location.href
function abrirOutlookMailto(to, subject) {
  const mailto = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}`;
  const a = document.createElement("a");
  a.href = mailto;
  a.rel = "noopener noreferrer";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// Helper: usa dados ja em cache (pre-buscados) pra fazer copy sincrono + mailto.
// O clipboard precisa ser chamado SINCRONAMENTE no momento do clique pra nao
// perder o user gesture. Pequeno delay antes do mailto evita que o navegador
// invalide o clipboard ao trocar de contexto (protocolo handler).
function enviarEmailComCache(cachedData) {
  if (!cachedData) throw new Error("Email ainda nao foi carregado");
  console.log("[enviarEmail] iniciando copy + mailto");
  const copiouHtml = copyHtmlSync(cachedData.html, cachedData.text);
  console.log("[enviarEmail] copy returned:", copiouHtml);
  // Atraso de 300ms — clipboard estabiliza, depois dispara mailto.
  setTimeout(() => {
    console.log("[enviarEmail] disparando mailto agora");
    abrirOutlookMailto(cachedData.to, cachedData.subject);
  }, 300);
  return { copiouHtml };
}

// Re-copia o HTML pro clipboard. Usado quando o usuario perdeu o conteudo.
function reCopiarEmail(cachedData) {
  if (!cachedData) return false;
  return copyHtmlSync(cachedData.html, cachedData.text);
}

function CotacoesList({ rm, outrasRMs = [] }) {
  const router = useRouter();
  const [modalVincular, setModalVincular] = useState(null); // cotação selecionada
  const [copiado, setCopiado] = useState(null);
  const [modalManual, setModalManual] = useState(null);
  const [emailToast, setEmailToast] = useState(null);
  const [emailsCache, setEmailsCache] = useState({}); // cotId -> { html, text, to, subject }
  const [cancelando, setCancelando] = useState(null);
  const [confirmCancelar, setConfirmCancelar] = useState(null);
  const [enviandoEmail, setEnviandoEmail] = useState(null); // cotId em envio direto
  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";

  const handleCancelarCotacao = async (cotId) => {
    setCancelando(cotId);
    setConfirmCancelar(null);
    try {
      const res = await fetch(`/api/cotacao/${cotId}/cancelar`, { method: "POST" });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      router.refresh();
    } catch (e) {
      setEmailToast({ id: cotId, ok: false, msg: `Erro ao cancelar: ${e.message}` });
      setTimeout(() => setEmailToast(null), 5000);
    } finally {
      setCancelando(null);
    }
  };

  // Pre-fetch dos emails das cotacoes ativas. Cacheia no state pra que o
  // clipboard.write seja sincrono no clique (sem perder user gesture).
  useEffect(() => {
    const ativas = (rm.cotacoes || []).filter((c) => c.status !== "CANCELADA" && c.status !== "DECLINADA");
    ativas.forEach((c) => {
      if (emailsCache[c.id]) return;
      fetch(`/api/cotacao/${c.id}/preview-email?format=json`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data) setEmailsCache((prev) => ({ ...prev, [c.id]: data }));
        })
        .catch(() => { /* silencioso */ });
    });
  }, [rm.cotacoes]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reenvia a cotação por e-mail DIRETO pela plataforma (Resend) — não copia
  // mais pro clipboard nem abre o Outlook. Se o Resend não estiver configurado,
  // o endpoint devolve 503 com instrução pra usar "Copiar link".
  const handleEnviarEmail = async (cot) => {
    setEmailToast(null);
    setEnviandoEmail(cot.id);
    try {
      const res = await fetch(`/api/cotacao/${cot.id}/enviar-email`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Falha ao enviar e-mail");
      setEmailToast({ id: cot.id, ok: true, msg: `E-mail enviado para ${data.emailEnviadoPara || cot.fornecedorEmail || "o fornecedor"}` });
      setTimeout(() => setEmailToast(null), 6000);
    } catch (e) {
      setEmailToast({ id: cot.id, ok: false, msg: e.message });
    } finally {
      setEnviandoEmail(null);
    }
  };

  const copiarLink = async (cot) => {
    const link = `${baseUrl}/fornecedores/c/${cot.token}`;
    await navigator.clipboard.writeText(link);
    setCopiado(cot.id);
    setTimeout(() => setCopiado(null), 2000);
  };

  const STATUS_COT = {
    PENDENTE: { label: "Aguardando", className: "bg-torg-blue-50 text-torg-blue" },
    RECEBIDA: { label: "Recebida",   className: "bg-torg-orange-50 text-torg-orange-700" },
    VENCIDA:  { label: "Vencida",    className: "bg-red-50 text-red-700" },
    CANCELADA:{ label: "Cancelada",  className: "bg-gray-100 text-gray-500" },
    DECLINADA:{ label: "Declinada",  className: "bg-gray-100 text-gray-500" },
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100">
        <h3 className="text-lg font-semibold text-torg-dark">Cotações ({rm.cotacoes.length})</h3>
        <p className="text-xs text-torg-gray mt-1">
          Use os botões pra reenviar o link ao fornecedor (mesmo após ele responder).
        </p>
      </div>
      <ul className="divide-y divide-gray-100">
        {rm.cotacoes.map((c) => {
          const s = STATUS_COT[c.status] || STATUS_COT.PENDENTE;
          const vencida = c.prazoResposta && new Date(c.prazoResposta) < new Date() && c.status === "PENDENTE";
          return (
            <li key={c.id} className="px-6 py-4 flex items-center gap-3 flex-wrap">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-torg-dark font-medium">{c.fornecedorNome}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.className}`}>
                    {s.label}
                  </span>
                  {vencida && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-700 font-medium">
                      vencida
                    </span>
                  )}
                  {c.numeroRevisao > 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-torg-blue-100 text-torg-blue-800 font-medium">
                      rev {c.numeroRevisao}
                    </span>
                  )}
                  {c.ehPrimaria === false && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-torg-orange-50 text-torg-orange-700 font-medium" title="Esta RM é apenas uma das incluídas — a cotação foi criada a partir de outra RM principal">
                      RM extra
                    </span>
                  )}
                </div>
                {c.rmsVinculadas && c.rmsVinculadas.length > 1 && (
                  <p className="text-[10px] text-torg-gray mt-1">
                    Consolidada com {c.rmsVinculadas.length} RMs:{" "}
                    {c.rmsVinculadas.map((r) => r.numero).join(" + ")}
                  </p>
                )}
                <p className="text-xs text-torg-gray truncate mt-0.5">
                  {c.fornecedorEmail}
                  {" · enviada em "}{fmtData(c.createdAt)}
                  {c.recebidaEm && ` · respondida em ${fmtData(c.recebidaEm)}`}
                  {c.prazoResposta && ` · prazo ${fmtData(c.prazoResposta)}`}
                </p>
                {/* Anexos da cotacao (PDF/imagens da proposta) */}
                {(c.anexos || []).length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {c.anexos.map((a) => (
                      <CotacaoAnexoChip key={a.id} anexo={a} cotacaoId={c.id} />
                    ))}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                {c.total > 0 && (
                  <span className="text-torg-orange-700 font-semibold tabular-nums text-sm">
                    {fmtMoeda(c.total)}
                  </span>
                )}
                <button
                  onClick={() => setModalManual(c)}
                  className="px-3 py-1.5 text-xs bg-white border border-torg-orange-200 text-torg-orange-700 rounded-lg hover:bg-torg-orange-50 font-medium inline-flex items-center gap-1"
                  title="Lançar a proposta manualmente (quando recebida fora do portal)"
                >
                  <Edit3 size={12} /> {c.recebidaEm ? "Editar" : "Lançar manual"}
                </button>
                <button
                  onClick={() => copiarLink(c)}
                  className="px-3 py-1.5 text-xs bg-white border border-gray-300 text-torg-gray rounded-lg hover:bg-gray-50 font-medium"
                  title="Copiar o link único do fornecedor"
                >
                  {copiado === c.id ? "✓ copiado" : "Copiar link"}
                </button>
                {outrasRMs.length > 0 && c.status !== "CANCELADA" && (
                  <button
                    onClick={() => setModalVincular(c)}
                    className="px-3 py-1.5 text-xs bg-white border border-torg-blue-200 text-torg-blue rounded-lg hover:bg-torg-blue-50 font-medium inline-flex items-center gap-1"
                    title="Vincular outra RM nessa cotação (esqueceu de incluir antes)"
                  >
                    <Plus size={12} /> Vincular RM
                  </button>
                )}
                {c.status !== "CANCELADA" && (
                  <>
                    {confirmCancelar === c.id ? (
                      <div className="flex items-center gap-1.5 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5">
                        <span className="text-xs text-red-700 font-medium">
                          Cancelar cotação{c.status === "RECEBIDA" ? " e reverter pedido" : ""}?
                        </span>
                        <button
                          onClick={() => handleCancelarCotacao(c.id)}
                          disabled={cancelando === c.id}
                          className="px-2 py-1 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium inline-flex items-center gap-1 disabled:opacity-50"
                        >
                          {cancelando === c.id ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                          Confirmar
                        </button>
                        <button
                          onClick={() => setConfirmCancelar(null)}
                          className="px-2 py-1 text-xs text-torg-gray hover:text-torg-dark font-medium"
                        >
                          Voltar
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmCancelar(c.id)}
                        disabled={cancelando === c.id}
                        className="px-3 py-1.5 text-xs bg-white border border-red-200 text-red-600 rounded-lg hover:bg-red-50 font-medium inline-flex items-center gap-1 disabled:opacity-50"
                        title="Cancelar esta cotação — reverte pedidos e itens voltam para cotação"
                      >
                        {cancelando === c.id ? <Loader2 size={12} className="animate-spin" /> : <XCircle size={12} />}
                        Cancelar
                      </button>
                    )}
                  </>
                )}
                <button
                  onClick={() => handleEnviarEmail(c)}
                  disabled={enviandoEmail === c.id}
                  className="px-3 py-1.5 text-xs bg-torg-blue text-white rounded-lg hover:bg-torg-blue-700 font-medium inline-flex items-center gap-1 disabled:opacity-60"
                  title="Envia o e-mail com o link da cotação direto pelo sistema (Resend) — não precisa colar no Outlook"
                >
                  {enviandoEmail === c.id ? <Loader2 size={12} className="animate-spin" /> : <Mail size={12} />}
                  {enviandoEmail === c.id ? "Enviando…" : (c.recebidaEm ? "Reenviar email" : "Enviar email")}
                </button>
              </div>
              {emailToast?.id === c.id && (
                <div className={`w-full mt-2 text-xs rounded px-3 py-2 ${
                  emailToast.ok
                    ? "bg-emerald-50 border border-emerald-200 text-emerald-800"
                    : "bg-red-50 border border-red-200 text-red-700"
                }`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex-1">
                      {emailToast.ok ? "✓ " : "✗ "}{emailToast.msg}
                    </span>
                    <button onClick={() => setEmailToast(null)} className="opacity-60 hover:opacity-100">×</button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {modalManual && (
        <ModalLancarManual cotacao={modalManual} rm={rm} onClose={() => setModalManual(null)} />
      )}
      {modalVincular && (
        <ModalVincularRM
          cotacao={modalVincular}
          outrasRMs={outrasRMs}
          onClose={() => setModalVincular(null)}
        />
      )}
    </div>
  );
}

// Modal pra adicionar RMs a uma cotação ja existente
function ModalVincularRM({ cotacao, outrasRMs, onClose }) {
  const router = useRouter();
  const [rmsSelecionadas, setRmsSelecionadas] = useState(new Set());
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  const toggle = (id) => {
    setRmsSelecionadas((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const itensTotal = useMemo(() => {
    let n = 0;
    for (const r of outrasRMs) {
      if (rmsSelecionadas.has(r.id)) {
        n += r.itens.filter((it) => ["PENDENTE", "EM_COTACAO", "COTADO"].includes(it.status)).length;
      }
    }
    return n;
  }, [outrasRMs, rmsSelecionadas]);

  const submit = async () => {
    setErro("");
    if (rmsSelecionadas.size === 0) return setErro("Selecione ao menos 1 RM.");
    setSalvando(true);
    try {
      const res = await fetch(`/api/cotacao/${cotacao.id}/adicionar-rm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rmIds: Array.from(rmsSelecionadas) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro");
      let msg = `✓ ${data.itensCriados} itens adicionados (RMs: ${data.rmsAdicionadas.join(", ")})`;
      if (data.estoque) {
        const partes = [
          ...(data.estoque.abatidos || []).map((a) => `${a.descricao}: ${a.barrasDisponiveis} ${a.unidade} em estoque, cotado só ${a.barrasACotar} ${a.unidade}`),
          ...(data.estoque.excluidos || []).map((e2) => `${e2.descricao}: 100% em estoque — FORA da cotação (use "Atender estoque")`),
        ];
        if (partes.length) msg += `\n\nEstoque abatido:\n• ${partes.join("\n• ")}`;
      }
      alert(msg);
      onClose();
      router.refresh();
    } catch (e) {
      setErro(e.message);
      setSalvando(false);
    }
  };

  return (
    <Modal titulo={`Vincular RM à cotação de ${cotacao.fornecedorNome}`} onClose={onClose}>
      <div className="px-6 py-5 space-y-4">
        {erro && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded px-3 py-2 flex items-start gap-2">
            <AlertCircle size={14} className="mt-0.5" /> <span>{erro}</span>
          </div>
        )}

        <div className="bg-torg-orange-50/40 border border-torg-orange-100 rounded-lg p-3 text-xs text-torg-dark">
          ⚠️ Os itens das RMs marcadas serão adicionados a essa cotação. O fornecedor vai precisar
          preencher os preços das novas linhas (você pode reenviar o link pra ele revisar).
          {cotacao.status === "RECEBIDA" && (
            <p className="mt-1">
              Como essa cotação já foi respondida, ela voltará pra status &quot;Aguardando&quot; até
              o fornecedor preencher os novos itens.
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-torg-dark mb-2">
            RMs disponíveis ({rmsSelecionadas.size} selecionada{rmsSelecionadas.size !== 1 ? "s" : ""}, {itensTotal} itens)
          </label>
          <div className="border border-gray-200 rounded-lg max-h-[300px] overflow-y-auto divide-y divide-gray-100">
            {outrasRMs.map((r) => {
              const itensCotaveis = r.itens.filter((it) => ["PENDENTE", "EM_COTACAO", "COTADO"].includes(it.status)).length;
              const checked = rmsSelecionadas.has(r.id);
              return (
                <label key={r.id} className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer text-sm">
                  <input
                    type="checkbox" checked={checked}
                    onChange={() => toggle(r.id)}
                    className="w-4 h-4 rounded border-gray-300 text-torg-blue focus:ring-torg-blue"
                  />
                  <span className="font-mono font-semibold text-torg-blue">{r.numero}</span>
                  <span className="flex-1 truncate text-torg-dark">{r.descricao}</span>
                  {r.op && (
                    <span className="text-[10px] text-torg-gray">{fmtOP(r.op.numero)}</span>
                  )}
                  <span className="text-[10px] text-torg-gray">{itensCotaveis} itens</span>
                </label>
              );
            })}
          </div>
        </div>
      </div>
      <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
        <button onClick={onClose} className="px-4 py-2 text-torg-gray border border-gray-300 rounded-lg hover:bg-gray-100 text-sm">
          Cancelar
        </button>
        <button
          onClick={submit}
          disabled={salvando || rmsSelecionadas.size === 0}
          className="px-5 py-2 bg-torg-blue text-white rounded-lg hover:bg-torg-blue-700 text-sm font-medium flex items-center gap-2 disabled:opacity-50"
        >
          {salvando && <Loader2 size={14} className="animate-spin" />}
          Adicionar à cotação ({itensTotal} itens)
        </button>
      </div>
    </Modal>
  );
}

function ModalLancarManual({ cotacao, rm, onClose }) {
  const router = useRouter();
  const [cnpj, setCnpj] = useState(cotacao.cnpj || "");
  const [razaoSocial, setRazaoSocial] = useState(cotacao.fornecedorNome || "");
  // Se a cotacao tem itensCotaveis (vem do server enriquecido), usa eles —
  // assim o modal mostra TODOS os itens da cotacao consolidada (de varias RMs).
  // Fallback: itens da RM atual (compatibilidade).
  const [linhas, setLinhas] = useState(() => {
    if (cotacao.itensCotaveis && cotacao.itensCotaveis.length > 0) {
      return cotacao.itensCotaveis.map((it) => ({
        rmItemId: it.rmItemId,
        descricao: it.descricao,
        unidade: it.unidade,
        qtdRm: it.qtdRm,
        precoUnit: it.precoUnit || "",
        qtdCotada: it.qtdCotada,
        icmsPct: it.icmsPct || "",
        ipiPct: it.ipiPct || "",
        _rmNumero: it._rmNumero,
        _ehDestaRM: it._ehDestaRM,
      }));
    }
    return rm.itens
      .filter((it) => it.status === "PENDENTE" || it.status === "EM_COTACAO" || it.status === "COTADO")
      .map((it) => {
        const peso = Number(it.peso) || 0;
        const usaKg = peso > 0;
        return {
          rmItemId: it.id,
          descricao: it.descricao,
          unidade: usaKg ? "KG" : it.unidade,
          qtdRm: usaKg ? peso : it.qtd,
          precoUnit: "",
          qtdCotada: usaKg ? peso : it.qtd,
          icmsPct: "",
          ipiPct: "",
        };
      });
  });
  const [prazoEntrega, setPrazoEntrega] = useState("");
  const [condicaoPagamento, setCondicaoPagamento] = useState("");
  const [observacao, setObservacao] = useState("");
  // Total da nota declarado pelo fornecedor (PDF). Quando preenchido, vira
  // a "fonte da verdade" do total — gerar-pedidos vai escalar precos pra bater.
  const [totalPropostaInput, setTotalPropostaInput] = useState(
    cotacao.totalProposta ? String(cotacao.totalProposta) : ""
  );
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [arquivoNome, setArquivoNome] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parseInfo, setParseInfo] = useState(null);
  const [autoFilled, setAutoFilled] = useState(new Set());
  const [revisado, setRevisado] = useState(new Set());
  // Anexo pendente: arquivo ja uploaded pro blob, aguardando vinculo a
  // cotacao quando o usuario salvar. { url, nomeArquivo, tamanho, tipo }
  const [anexoPendente, setAnexoPendente] = useState(null);
  const fileRef = useRef(null);

  const setLinha = (id, k, v) => {
    setLinhas((p) => p.map((l) => (l.rmItemId === id ? { ...l, [k]: v } : l)));
    if (autoFilled.has(id)) {
      setAutoFilled((prev) => { const n = new Set(prev); n.delete(id); return n; });
      setRevisado((prev) => new Set(prev).add(id));
    }
  };
  const marcarRevisado = (id) => {
    setAutoFilled((prev) => { const n = new Set(prev); n.delete(id); return n; });
    setRevisado((prev) => new Set(prev).add(id));
  };

  // Upload de PDF/imagem do fornecedor — usa mesmo endpoint /api/parse-cotacao-ai
  async function uploadProposta(file) {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setErro("Arquivo muito grande (limite 10MB).");
      return;
    }
    setErro("");
    setParseInfo(null);
    setParsing(true);
    setArquivoNome(file.name);
    setAnexoPendente(null);
    try {
      const base64 = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result);
        r.onerror = rej;
        r.readAsDataURL(file);
      });
      const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
      const isImg = (file.type || "").startsWith("image/");
      if (!isPdf && !isImg) {
        throw new Error("Formato não suportado. Use PDF ou imagem.");
      }

      // Em paralelo: sobe o arquivo pro Vercel Blob (vira anexo da cotacao
      // quando o usuario salvar). Best-effort — se falhar, segue sem anexo.
      try {
        const fd = new FormData();
        fd.append("file", file);
        const upRes = await fetch("/api/upload-blob", { method: "POST", body: fd });
        const upData = await upRes.json();
        if (upRes.ok) {
          setAnexoPendente({
            url: upData.url,
            nomeArquivo: upData.nomeArquivo,
            tamanho: upData.tamanho,
            tipo: upData.tipo,
          });
        }
      } catch {
        // Sem blob — segue mesmo assim. Usuario ainda vê os dados parseados.
      }

      const body = isPdf
        ? { pdfBase64: base64, rmItens: linhas.map((l) => ({
            descricao: l.descricao, qtd: l.qtdRm, unidade: l.unidade,
            pesoKg: l.unidade === "KG" ? l.qtdRm : null,
          })) }
        : { imageBase64: base64, imageType: file.type, rmItens: linhas.map((l) => ({
            descricao: l.descricao, qtd: l.qtdRm, unidade: l.unidade,
            pesoKg: l.unidade === "KG" ? l.qtdRm : null,
          })) };

      const res = await fetch("/api/parse-cotacao-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao processar");

      // Aplica os itens via rmIndex (a IA ja casou com a RM)
      const itensIA = data.itens || [];
      const linhasNovas = [...linhas];
      const idsAuto = new Set();
      let casados = 0;
      for (const it of itensIA) {
        const idx = it.rmIndex;
        if (idx == null || idx < 0 || idx >= linhasNovas.length) continue;
        const l = linhasNovas[idx];
        if (it.precoUnit) l.precoUnit = String(it.precoUnit);
        if (it.qtdCotada || it.qtd) l.qtdCotada = it.qtdCotada || it.qtd;
        if (it.icmsPct != null) l.icmsPct = String(it.icmsPct);
        if (it.ipiPct != null) l.ipiPct = String(it.ipiPct);
        idsAuto.add(l.rmItemId);
        casados++;
      }
      setLinhas(linhasNovas);
      setAutoFilled(idsAuto);
      setRevisado(new Set());
      setParseInfo({ match: casados, total: itensIA.length, fornecedor: data.fornecedor, prazo: data.prazoPagamento });

      // Pre-popula identificacao se vier no PDF
      if (data.fornecedor && !razaoSocial) setRazaoSocial(data.fornecedor);
      if (data.prazoPagamento && !condicaoPagamento) setCondicaoPagamento(data.prazoPagamento);
    } catch (e) {
      setErro("Falha ao processar: " + e.message);
    } finally {
      setParsing(false);
    }
  }

  // Total da nota: bruto × qtd × (1 + IPI%). Bate com "Valor total" do PDF.
  // ICMS nao entra (credito Torg, nao soma na NF).
  const total = linhas.reduce((s, l) => {
    const p = parseFloat(String(l.precoUnit).replace(",", ".")) || 0;
    const q = parseFloat(String(l.qtdCotada).replace(",", ".")) || 0;
    const ipi = parseFloat(String(l.ipiPct).replace(",", ".")) || 0;
    return s + p * q * (1 + ipi / 100);
  }, 0);
  // Subtotais pra mostrar separados embaixo
  const totalBrutoSemIPI = linhas.reduce((s, l) => {
    const p = parseFloat(String(l.precoUnit).replace(",", ".")) || 0;
    const q = parseFloat(String(l.qtdCotada).replace(",", ".")) || 0;
    return s + p * q;
  }, 0);
  const totalIPI = total - totalBrutoSemIPI;

  const submit = async () => {
    setErro("");
    const cnpjLimpo = cnpj.replace(/\D/g, "");
    if (cnpjLimpo.length !== 14) return setErro("Informe o CNPJ (14 dígitos).");
    // Itens: o cotacaoItem precisa ser identificado. Como o admin pode lancar pra
    // RMItens que talvez nao estejam na cotacao original, mapeamos pelo rmItemId
    // → busca/cria cotacaoItem correspondente no submit (API ja faz match).
    const itens = linhas
      .map((l) => ({
        rmItemId: l.rmItemId,
        precoUnit: parseFloat(String(l.precoUnit).replace(",", ".")) || 0,
        qtdCotada: parseFloat(String(l.qtdCotada).replace(",", ".")) || 0,
        icmsPct: parseFloat(String(l.icmsPct).replace(",", ".")) || 0,
        ipiPct: parseFloat(String(l.ipiPct).replace(",", ".")) || 0,
      }))
      .filter((l) => l.precoUnit > 0);
    if (itens.length === 0) return setErro("Preencha ao menos um preço unitário.");

    setSalvando(true);
    try {
      const totalPropostaNum = parseFloat(String(totalPropostaInput).replace(",", "."));
      const res = await fetch(`/api/cotacao/${cotacao.id}/lancar-manual`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cnpj: cnpjLimpo,
          razaoSocial: razaoSocial.trim() || null,
          itens,
          prazoEntrega: prazoEntrega || null,
          condicaoPagamento: condicaoPagamento || null,
          observacao: observacao || null,
          totalProposta: !isNaN(totalPropostaNum) && totalPropostaNum > 0 ? totalPropostaNum : null,
          anexo: anexoPendente,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro");
      router.refresh();
      onClose();
    } catch (e) {
      setErro(e.message);
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-auto">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white">
          <h3 className="text-lg font-semibold text-torg-dark flex items-center gap-2">
            <Edit3 size={20} className="text-torg-orange" /> Lançar proposta manualmente
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <p className="text-xs text-torg-gray">
            Use quando o fornecedor mandou a proposta por email/telefone e você está digitando manualmente.
            Os valores vão pro Mapa Comparativo igual aos lançados pelo portal.
          </p>

          {erro && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded px-3 py-2 flex items-start gap-2">
              <AlertCircle size={14} className="mt-0.5" /> <span>{erro}</span>
            </div>
          )}

          {/* Upload de PDF/imagem do fornecedor (auto-preenchimento via IA) */}
          <div className="bg-torg-blue-50/30 border border-torg-blue-100 rounded-lg p-3">
            <div className="flex items-start justify-between flex-wrap gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-torg-dark inline-flex items-center gap-1.5">
                  <Sparkles size={14} className="text-torg-orange" /> Tem a proposta em PDF ou imagem?
                </p>
                <p className="text-xs text-torg-gray mt-0.5">
                  Anexe o arquivo, a IA preenche os preços automaticamente E o arquivo fica salvo na cotação pra consulta.
                </p>
                {anexoPendente && (
                  <p className="text-[11px] text-emerald-700 mt-1 inline-flex items-center gap-1">
                    <CheckCircle2 size={11} /> Arquivo salvo — será vinculado à cotação ao salvar
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={parsing}
                className="px-3 py-1.5 bg-torg-blue text-white text-xs rounded-lg hover:bg-torg-blue-700 font-medium flex items-center gap-1 disabled:opacity-50 whitespace-nowrap"
              >
                {parsing ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                {parsing ? "Lendo..." : arquivoNome ? "Trocar arquivo" : "Anexar PDF/imagem"}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="application/pdf,.pdf,image/*"
                className="hidden"
                onChange={(e) => { uploadProposta(e.target.files?.[0]); e.target.value = ""; }}
              />
            </div>
            {arquivoNome && (
              <div className="mt-2 flex items-center gap-2 bg-white border border-torg-blue-100 rounded px-2 py-1">
                <FileText size={12} className="text-torg-blue flex-shrink-0" />
                <p className="text-xs text-torg-dark flex-1 truncate">{arquivoNome}</p>
                <button
                  type="button"
                  onClick={() => { setArquivoNome(""); setParseInfo(null); setAutoFilled(new Set()); }}
                  className="text-gray-400 hover:text-red-600"
                >
                  <X size={12} />
                </button>
              </div>
            )}
            {parseInfo && (
              <div className="mt-2 flex items-center justify-between flex-wrap gap-2 text-xs">
                {parseInfo.match > 0 ? (
                  <p className="text-torg-dark">
                    ✓ <strong>{parseInfo.match}</strong> {parseInfo.match === 1 ? "item preenchido" : "itens preenchidos"} via IA
                    {parseInfo.total > parseInfo.match && (
                      <span className="text-torg-gray"> ({parseInfo.total - parseInfo.match} do PDF não casaram — preencha manualmente)</span>
                    )}
                  </p>
                ) : (
                  <p className="text-torg-orange-700">⚠ Lemos o arquivo mas não conseguimos casar os itens. Preencha manualmente.</p>
                )}
                {autoFilled.size > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      const ids = Array.from(autoFilled);
                      setRevisado((prev) => { const n = new Set(prev); ids.forEach((id) => n.add(id)); return n; });
                      setAutoFilled(new Set());
                    }}
                    className="px-2 py-1 bg-torg-blue text-white text-xs rounded hover:bg-torg-blue-700 font-medium"
                  >
                    ✓ Conferi todos ({autoFilled.size})
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-torg-gray mb-1">CNPJ *</label>
              <input
                type="text" value={cnpj} onChange={(e) => setCnpj(e.target.value)}
                placeholder="00.000.000/0001-00"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-torg-blue"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-torg-gray mb-1">Razão Social</label>
              <input
                type="text" value={razaoSocial} onChange={(e) => setRazaoSocial(e.target.value)}
                placeholder="Nome do fornecedor"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue"
              />
            </div>
          </div>

          <div>
            <p className="text-xs font-medium text-torg-gray mb-2">Itens ({linhas.length})</p>
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-2 py-1.5 text-left font-medium text-gray-500 uppercase">Descrição</th>
                    <th className="px-2 py-1.5 text-right font-medium text-gray-500 uppercase">Qtd</th>
                    <th className="px-2 py-1.5 text-right font-medium text-gray-500 uppercase">Preço *</th>
                    <th className="px-2 py-1.5 text-right font-medium text-gray-500 uppercase">ICMS%</th>
                    <th className="px-2 py-1.5 text-right font-medium text-gray-500 uppercase">IPI%</th>
                    <th className="px-2 py-1.5 text-right font-medium text-gray-500 uppercase">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {linhas.map((l) => {
                    const t = (parseFloat(String(l.precoUnit).replace(",", ".")) || 0) * (parseFloat(String(l.qtdCotada).replace(",", ".")) || 0);
                    const isAuto = autoFilled.has(l.rmItemId);
                    const isRevisado = revisado.has(l.rmItemId);
                    const inputCls = isAuto
                      ? "border-torg-orange-300 bg-torg-orange-50/40"
                      : isRevisado
                      ? "border-torg-blue-200 bg-torg-blue-50/30"
                      : "border-gray-200";
                    return (
                      <tr key={l.rmItemId} className={isAuto ? "bg-torg-orange-50/20" : ""}>
                        <td className="px-2 py-1.5 text-torg-dark">
                          {l._rmNumero && !l._ehDestaRM && (
                            <span className="font-mono text-[10px] text-torg-blue bg-torg-blue-50 px-1.5 py-0.5 rounded mr-1.5">
                              {l._rmNumero}
                            </span>
                          )}
                          {l.descricao}
                          {isAuto && (
                            <button
                              type="button"
                              onClick={() => marcarRevisado(l.rmItemId)}
                              className="ml-2 text-[10px] text-torg-orange-700 hover:text-torg-orange-800 font-medium inline-flex items-center gap-0.5"
                              title="Marcar como conferido"
                            >
                              ⚠ via IA
                            </button>
                          )}
                          {isRevisado && (
                            <span className="ml-2 text-[10px] text-torg-blue font-medium">✓</span>
                          )}
                        </td>
                        <td className="px-2 py-1.5 text-right">
                          <input type="number" step="0.01" value={l.qtdCotada}
                            onChange={(e) => setLinha(l.rmItemId, "qtdCotada", e.target.value)}
                            className={`w-20 border rounded px-1.5 py-0.5 text-xs text-right tabular-nums ${inputCls}`} />
                        </td>
                        <td className="px-2 py-1.5 text-right">
                          <input type="number" step="0.01" value={l.precoUnit}
                            onChange={(e) => setLinha(l.rmItemId, "precoUnit", e.target.value)}
                            placeholder="0,00"
                            className={`w-24 border rounded px-1.5 py-0.5 text-xs text-right tabular-nums ${inputCls}`} />
                        </td>
                        <td className="px-2 py-1.5 text-right">
                          <input type="number" step="0.01" value={l.icmsPct}
                            onChange={(e) => setLinha(l.rmItemId, "icmsPct", e.target.value)}
                            placeholder="0"
                            className="w-14 border border-gray-200 rounded px-1.5 py-0.5 text-xs text-right tabular-nums" />
                        </td>
                        <td className="px-2 py-1.5 text-right">
                          <input type="number" step="0.01" value={l.ipiPct}
                            onChange={(e) => setLinha(l.rmItemId, "ipiPct", e.target.value)}
                            placeholder="0"
                            className="w-14 border border-gray-200 rounded px-1.5 py-0.5 text-xs text-right tabular-nums" />
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-torg-dark font-medium">
                          {t > 0 ? fmtMoeda(t) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-gray-50">
                  <tr>
                    <td colSpan={5} className="px-2 py-1 text-right text-torg-gray text-[11px]">Mercadoria (bruto):</td>
                    <td className="px-2 py-1 text-right text-torg-gray tabular-nums text-xs">{fmtMoeda(totalBrutoSemIPI)}</td>
                  </tr>
                  {totalIPI > 0 && (
                    <tr>
                      <td colSpan={5} className="px-2 py-1 text-right text-torg-gray text-[11px]">+ IPI:</td>
                      <td className="px-2 py-1 text-right text-torg-gray tabular-nums text-xs">{fmtMoeda(totalIPI)}</td>
                    </tr>
                  )}
                  <tr className="border-t border-gray-200">
                    <td colSpan={5} className="px-2 py-2 text-right text-torg-dark font-semibold">Total da nota (calculado):</td>
                    <td className="px-2 py-2 text-right font-bold text-torg-orange-700 tabular-nums">{fmtMoeda(total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            {/* Total da NF do fornecedor — ajuste pra bater com o PDF da proposta */}
            <div className="mt-3 bg-amber-50/60 border border-amber-200 rounded-lg p-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-torg-dark inline-flex items-center gap-1.5">
                    <FileText size={14} className="text-amber-700" /> Total da nota (PDF do fornecedor)
                  </p>
                  <p className="text-xs text-torg-gray mt-0.5">
                    Preencha o valor total exato do PDF do fornecedor. Se preenchido, os preços vão ser ajustados proporcionalmente na hora de gerar o pedido no Omie pra bater com esse total. Deixe vazio pra usar o calculado.
                  </p>
                </div>
                <div className="text-right">
                  <div className="inline-flex items-center bg-white border border-amber-300 rounded-lg overflow-hidden">
                    <span className="px-2 text-xs text-torg-gray">R$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={totalPropostaInput}
                      onChange={(e) => setTotalPropostaInput(e.target.value)}
                      placeholder="0,00"
                      className="w-32 px-2 py-1.5 text-right text-sm font-bold text-amber-700 tabular-nums focus:outline-none"
                    />
                  </div>
                  {totalPropostaInput && parseFloat(String(totalPropostaInput).replace(",", ".")) > 0 && (
                    <p className="text-[10px] text-torg-gray mt-1 tabular-nums">
                      Diff calc: {fmtMoeda(parseFloat(String(totalPropostaInput).replace(",", ".")) - total)}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-torg-gray mb-1">Prazo de entrega</label>
              <input type="text" value={prazoEntrega} onChange={(e) => setPrazoEntrega(e.target.value)}
                placeholder="Ex: 15 dias úteis"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue" />
            </div>
            <div>
              <label className="block text-xs font-medium text-torg-gray mb-1">Condição de pagamento</label>
              <input type="text" value={condicaoPagamento} onChange={(e) => setCondicaoPagamento(e.target.value)}
                placeholder="Ex: 30 dias"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-torg-gray mb-1">Observação</label>
            <textarea value={observacao} onChange={(e) => setObservacao(e.target.value)} rows={2}
              placeholder="Observações da proposta"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue" />
          </div>
        </div>
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-torg-gray border border-gray-300 rounded-lg hover:bg-gray-100 text-sm">
            Cancelar
          </button>
          <button onClick={submit} disabled={salvando}
            className="px-5 py-2 bg-torg-orange text-white rounded-lg hover:bg-torg-orange-600 text-sm font-medium flex items-center gap-2 disabled:opacity-50">
            {salvando && <Loader2 size={14} className="animate-spin" />}
            Salvar proposta
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── MODAIS ─────────────────────────────────────────

function Modal({ titulo, children, onClose }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-torg-dark">{titulo}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ModalCancelarItem({ item, rmId, onClose, onSaved }) {
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  const submit = async () => {
    if (!motivo.trim()) return setErro("Descreva o motivo do cancelamento.");
    setSalvando(true);
    try {
      const res = await fetch(`/api/rm/${rmId}/itens/${item.id}/cancelar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ motivo: motivo.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro");
      onSaved();
      onClose();
    } catch (e) {
      setErro(e.message);
      setSalvando(false);
    }
  };

  return (
    <Modal titulo="Cancelar item da RM" onClose={onClose}>
      <div className="px-6 py-5 space-y-4">
        {erro && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded px-3 py-2 flex items-start gap-2">
            <AlertCircle size={14} className="mt-0.5" /> <span>{erro}</span>
          </div>
        )}
        <p className="text-sm text-torg-gray">
          Cancelando: <strong className="text-torg-dark">{item.descricao}</strong>
        </p>
        <div>
          <label className="block text-sm font-medium text-torg-dark mb-1">Motivo *</label>
          <textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={3}
            placeholder="Ex: Item descontinuado pelo fornecedor; comprado externamente; substituído por outro."
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue"
          />
        </div>
        <p className="text-xs text-torg-gray">
          O item fica registrado como cancelado com seu motivo (não é apagado, fica no histórico).
        </p>
      </div>
      <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
        <button onClick={onClose} className="px-4 py-2 text-torg-gray border border-gray-300 rounded-lg hover:bg-gray-100 text-sm">
          Voltar
        </button>
        <button
          onClick={submit}
          disabled={salvando}
          className="px-5 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium flex items-center gap-2 disabled:opacity-50"
        >
          {salvando && <Loader2 size={14} className="animate-spin" />} Cancelar item
        </button>
      </div>
    </Modal>
  );
}

function ModalAtenderEstoque({ item, rmId, onClose, onSaved }) {
  const qtdSugerida = item.peso > 0 ? Number(item.peso) : Number(item.qtd) || 0;
  const [quantidade, setQuantidade] = useState(qtdSugerida || "");
  const [precoUnit, setPrecoUnit] = useState("");
  const [observacao, setObservacao] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [buscandoPreco, setBuscandoPreco] = useState(false);
  const [infoOmie, setInfoOmie] = useState(null);

  // Busca preco medio do Omie quando tem codigo
  useEffect(() => {
    if (!item.codigo) return;
    setBuscandoPreco(true);
    fetch(`/api/omie/preco-medio?codigo=${encodeURIComponent(item.codigo)}`)
      .then((r) => r.json())
      .then((data) => {
        setInfoOmie(data);
        // Prioriza ultimo preco de compra; fallback pro CMC
        const preco = data.precoUltCompra || data.cmc || 0;
        if (preco > 0) setPrecoUnit(String(preco));
      })
      .catch(() => {})
      .finally(() => setBuscandoPreco(false));
  }, [item.codigo]);

  const totalEstimado = Number(precoUnit || 0) * Number(quantidade || 0);

  const submit = async () => {
    const qtd = Number(quantidade);
    if (!qtd || qtd <= 0) return setErro("Informe a quantidade atendida.");
    setSalvando(true);
    try {
      const res = await fetch(`/api/rm/${rmId}/itens/${item.id}/atender-estoque`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quantidade: qtd,
          precoUnitario: Number(precoUnit) || undefined,
          observacao: observacao.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro");
      onSaved();
    } catch (e) {
      setErro(e.message);
      setSalvando(false);
    }
  };

  return (
    <Modal titulo="Atender com estoque" onClose={onClose}>
      <div className="px-6 py-5 space-y-4">
        {erro && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded px-3 py-2 flex items-start gap-2">
            <AlertCircle size={14} className="mt-0.5" /> <span>{erro}</span>
          </div>
        )}
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
          <p className="text-sm text-emerald-800 font-medium">{item.descricao}</p>
          <p className="text-xs text-emerald-600 mt-1">
            Solicitado: {item.peso > 0 ? `${Number(item.peso).toLocaleString("pt-BR")} KG` : `${Number(item.qtd).toLocaleString("pt-BR")} ${item.unidade}`}
            {item.material && ` · ${item.material}`}
            {item.codigo && ` · Cod: ${item.codigo}`}
          </p>
        </div>
        <div>
          <label className="block text-sm font-medium text-torg-dark mb-1">Quantidade atendida *</label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              step="0.01"
              min="0"
              value={quantidade}
              onChange={(e) => setQuantidade(e.target.value)}
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500"
            />
            <span className="text-sm text-torg-gray font-medium">{item.peso > 0 ? "KG" : item.unidade}</span>
          </div>
        </div>
        {/* Preco unitario (CMC do Omie) */}
        <div>
          <label className="block text-sm font-medium text-torg-dark mb-1">
            Preco unitario (R$)
            <span className="text-xs text-torg-gray font-normal ml-1">
              {buscandoPreco ? "(buscando no Omie...)" : infoOmie?.cmc ? "(sugerido pelo Omie)" : "(opcional)"}
            </span>
          </label>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-torg-gray">R$</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={precoUnit}
                onChange={(e) => setPrecoUnit(e.target.value)}
                placeholder="0,00"
                className="w-full border border-gray-300 rounded-lg pl-10 pr-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            {buscandoPreco && <Loader2 size={16} className="text-emerald-500 animate-spin" />}
          </div>
          {infoOmie && (infoOmie.cmc > 0 || infoOmie.precoUltCompra > 0) && (
            <div className="mt-1.5 flex items-center gap-3 flex-wrap text-[10px] text-torg-gray">
              {infoOmie.cmc > 0 && (
                <button
                  type="button"
                  onClick={() => setPrecoUnit(String(infoOmie.cmc))}
                  className="hover:text-emerald-700 underline"
                >
                  CMC: {fmtMoeda(infoOmie.cmc)}
                </button>
              )}
              {infoOmie.precoUltCompra > 0 && (
                <button
                  type="button"
                  onClick={() => setPrecoUnit(String(infoOmie.precoUltCompra))}
                  className="hover:text-emerald-700 underline"
                >
                  Ult. compra: {fmtMoeda(infoOmie.precoUltCompra)}
                  {infoOmie.dataUltCompra && ` (${infoOmie.dataUltCompra})`}
                </button>
              )}
              {infoOmie.saldo > 0 && (
                <span>Saldo: {Number(infoOmie.saldo).toLocaleString("pt-BR")} {infoOmie.unidade}</span>
              )}
            </div>
          )}
        </div>
        {/* Total estimado */}
        {totalEstimado > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-center justify-between">
            <span className="text-xs text-amber-800 font-medium">Custo estimado (controle interno)</span>
            <span className="text-sm text-amber-900 font-bold tabular-nums">{fmtMoeda(totalEstimado)}</span>
          </div>
        )}
        <div>
          <label className="block text-sm font-medium text-torg-dark mb-1">Observacao</label>
          <textarea
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            rows={2}
            placeholder="Ex: Material retirado do estoque principal; saldo da OP anterior."
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500"
          />
        </div>
        <p className="text-xs text-torg-gray">
          O item sera marcado como atendido pelo estoque interno. O custo estimado sera usado apenas para controle financeiro da OP
          (nao entra no calculo de FD/contrato). Nenhum pedido Omie sera gerado.
        </p>
      </div>
      <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
        <button onClick={onClose} className="px-4 py-2 text-torg-gray border border-gray-300 rounded-lg hover:bg-gray-100 text-sm">
          Voltar
        </button>
        <button
          onClick={submit}
          disabled={salvando}
          className="px-5 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm font-medium flex items-center gap-2 disabled:opacity-50"
        >
          {salvando && <Loader2 size={14} className="animate-spin" />} Atender com estoque
        </button>
      </div>
    </Modal>
  );
}

function ModalEnviarCotacao({ rm, outrasRMs = [], onClose, onSent, preSelecionarMode = null, categoriasFornecedor = CATEGORIAS_FORNECEDOR_BUILTIN }) {
  // RMs incluidas no envio: a atual sempre, mais as escolhidas via checkbox
  const [rmsExtrasIds, setRmsExtrasIds] = useState(new Set());
  // Itens cotaveis (RM atual + extras selecionadas), recalculado quando muda extras
  const todosItensCotaveis = useMemo(() => {
    const base = rm.itens
      .filter((it) => ["PENDENTE", "EM_COTACAO", "COTADO"].includes(it.status))
      .map((it) => ({ ...it, _rm: { id: rm.id, numero: rm.numero, principal: true } }));
    const extras = outrasRMs
      .filter((r) => rmsExtrasIds.has(r.id))
      .flatMap((r) =>
        r.itens
          .filter((it) => ["PENDENTE", "EM_COTACAO", "COTADO"].includes(it.status))
          .map((it) => ({ ...it, _rm: { id: r.id, numero: r.numero, principal: false } }))
      );
    return [...base, ...extras];
  }, [rm, outrasRMs, rmsExtrasIds]);

  // Itens selecionados — começa de acordo com o preSelecionarMode:
  // - "sem-proposta": só itens marcados COTADO sem proposta com preço
  // - null/default: todos os itens cotaveis (comportamento normal)
  const [itensSelecionados, setItensSelecionados] = useState(() => {
    if (preSelecionarMode === "sem-proposta") {
      return new Set(
        rm.itens
          .filter((it) => it.status === "COTADO" && it.temPropostaComPreco === false)
          .map((it) => it.id)
      );
    }
    return new Set(
      rm.itens
        .filter((it) => ["PENDENTE", "EM_COTACAO", "COTADO"].includes(it.status))
        .map((it) => it.id)
    );
  });
  // Quando uma RM extra é incluída, marca os itens dela automaticamente.
  // Quando é removida, desmarca os ids dela.
  const toggleRmExtra = (rmExtraId) => {
    setRmsExtrasIds((prev) => {
      const next = new Set(prev);
      if (next.has(rmExtraId)) {
        next.delete(rmExtraId);
        // Tira itens dessa RM do selecionado
        const rmExtra = outrasRMs.find((r) => r.id === rmExtraId);
        if (rmExtra) {
          setItensSelecionados((sel) => {
            const out = new Set(sel);
            for (const it of rmExtra.itens) out.delete(it.id);
            return out;
          });
        }
      } else {
        next.add(rmExtraId);
        // Adiciona itens cotáveis dessa RM
        const rmExtra = outrasRMs.find((r) => r.id === rmExtraId);
        if (rmExtra) {
          setItensSelecionados((sel) => {
            const out = new Set(sel);
            for (const it of rmExtra.itens) {
              if (["PENDENTE", "EM_COTACAO", "COTADO"].includes(it.status)) out.add(it.id);
            }
            return out;
          });
        }
      }
      return next;
    });
  };

  // Vendor List (fornecedores cadastrados) — busca quando modal abre
  const [fornecedoresCadastrados, setFornecedoresCadastrados] = useState([]);
  const [carregandoForn, setCarregandoForn] = useState(true);
  const [fornSelecionadosIds, setFornSelecionadosIds] = useState(new Set());
  const [filtroCatForn, setFiltroCatForn] = useState(null);
  const [buscaForn, setBuscaForn] = useState("");
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/fornecedores");
        const data = await res.json();
        setFornecedoresCadastrados(data.fornecedores || []);
      } catch (_) { /* silently */ }
      finally { setCarregandoForn(false); }
    })();
  }, []);

  // Linhas avulsas (nome + email) pra fornecedor nao cadastrado. Default vazio.
  const [fornecedoresLinhas, setFornecedoresLinhas] = useState([{ nome: "", email: "" }]);
  const addFornecedor = () => setFornecedoresLinhas((p) => [...p, { nome: "", email: "" }]);
  const setFornecedor = (idx, campo, valor) =>
    setFornecedoresLinhas((p) => p.map((f, i) => (i === idx ? { ...f, [campo]: valor } : f)));
  const removerFornecedor = (idx) =>
    setFornecedoresLinhas((p) => (p.length === 1 ? [{ nome: "", email: "" }] : p.filter((_, i) => i !== idx)));

  // Fornecedores da última cotação (pra pré-marcar no modo "re-enviar").
  const fornecedoresAnteriores = useMemo(() => {
    const seen = new Set(), out = [];
    for (const c of (rm.cotacoes || [])) {
      if (["CANCELADA", "DECLINADA"].includes(c.status)) continue;
      const email = String(c.fornecedorEmail || "").trim().toLowerCase();
      if (!email || seen.has(email)) continue;
      seen.add(email);
      out.push({ fornecedorId: c.fornecedorId || null, nome: c.fornecedorNome || "", email });
    }
    return out;
  }, [rm.cotacoes]);
  // Modo re-enviar: quando os fornecedores cadastrados terminam de carregar,
  // pré-marca os da última cotação — registrados via vendor list (mantém nCodOmie),
  // avulsos por e-mail. Roda uma vez (quando carregandoForn vira false).
  useEffect(() => {
    if (preSelecionarMode !== "re-enviar" || carregandoForn) return;
    const regIds = new Set(fornecedoresCadastrados.map((f) => f.id));
    const sel = new Set(), linhas = [];
    for (const f of fornecedoresAnteriores) {
      if (f.fornecedorId && regIds.has(f.fornecedorId)) sel.add(f.fornecedorId);
      else if (f.email) linhas.push({ nome: f.nome, email: f.email });
    }
    setFornSelecionadosIds(sel);
    setFornecedoresLinhas(linhas.length ? linhas : [{ nome: "", email: "" }]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carregandoForn]);

  // Lista filtrada de fornecedores cadastrados pra exibir
  const fornFiltrados = useMemo(() => {
    return fornecedoresCadastrados.filter((f) => {
      if (!f.ativo) return false;
      if (filtroCatForn && !(f.categorias || []).includes(filtroCatForn)) return false;
      if (buscaForn) {
        const b = buscaForn.toLowerCase();
        const hay = [f.razaoSocial, f.nomeFantasia, f.email, f.contato].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(b)) return false;
      }
      return true;
    });
  }, [fornecedoresCadastrados, filtroCatForn, buscaForn]);

  const toggleFornCadastrado = (id) => {
    setFornSelecionadosIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const [prazo, setPrazo] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 5);
    return d.toISOString().slice(0, 10);
  });
  const [observacao, setObservacao] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  const toggleItem = (id) => {
    setItensSelecionados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const marcarTodos = () => setItensSelecionados(new Set(todosItensCotaveis.map((i) => i.id)));
  const limparTodos = () => setItensSelecionados(new Set());
  // Marca apenas itens "Sem proposta" (status COTADO mas sem precoUnit > 0 em
  // nenhuma cotacao RECEBIDA) — fornecedor anterior nao precificou.
  const marcarSemProposta = () => {
    setItensSelecionados(new Set(
      todosItensCotaveis
        .filter((it) => it.status === "COTADO" && it.temPropostaComPreco === false)
        .map((it) => it.id)
    ));
  };
  const qtdSemProposta = todosItensCotaveis.filter(
    (it) => it.status === "COTADO" && it.temPropostaComPreco === false
  ).length;

  // Monta a lista final de fornecedores combinando: (1) selecionados da
  // Vendor List + (2) avulsos digitados nos campos. Dedupe por email.
  const parsearFornecedores = () => {
    const out = [];
    const emailsVistos = new Set();
    // 1) Da Vendor List
    for (const id of fornSelecionadosIds) {
      const f = fornecedoresCadastrados.find((x) => x.id === id);
      if (!f) continue;
      const email = f.email.toLowerCase();
      if (emailsVistos.has(email)) continue;
      emailsVistos.add(email);
      out.push({ fornecedorId: f.id, nome: f.razaoSocial, email, nCodOmie: f.nCodOmie || null, cnpj: f.cnpj || null });
    }
    // 2) Avulsos
    for (const f of fornecedoresLinhas) {
      const email = String(f.email || "").trim().toLowerCase();
      const nome = String(f.nome || "").trim();
      if (!email && !nome) continue;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return { error: `Email inválido: "${email || "(em branco)"}"${nome ? ` — fornecedor "${nome}"` : ""}` };
      }
      if (!nome) {
        return { error: `Preencha o nome do fornecedor pro email "${email}"` };
      }
      if (emailsVistos.has(email)) continue;
      emailsVistos.add(email);
      out.push({ nome, email });
    }
    return { fornecedores: out };
  };

  const submit = async () => {
    setErro("");
    const parsed = parsearFornecedores();
    if (parsed.error) return setErro(parsed.error);
    const fornecedores = parsed.fornecedores;
    if (fornecedores.length === 0) return setErro("Adicione ao menos 1 fornecedor com nome e email válido.");
    if (itensSelecionados.size === 0) return setErro("Selecione ao menos 1 item.");

    // Lista de RMs envolvidas: a atual + as extras selecionadas
    const rmIds = [rm.id, ...Array.from(rmsExtrasIds)];

    setSalvando(true);
    try {
      const res = await fetch("/api/cotacao/enviar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rmIds,
          itensIds: Array.from(itensSelecionados),
          fornecedores,
          prazoResposta: prazo || null,
          observacaoExtra: observacao.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro");
      onSent({ cotacoes: data.cotacoes, emails: data.emails || [], estoque: data.estoque || null });
    } catch (e) {
      setErro(e.message);
      setSalvando(false);
    }
  };

  return (
    <Modal titulo="Enviar Cotação aos Fornecedores" onClose={onClose}>
      <div className="px-6 py-5 space-y-5 max-h-[70vh] overflow-y-auto">
        {erro && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded px-3 py-2 flex items-start gap-2">
            <AlertCircle size={14} className="mt-0.5" /> <span>{erro}</span>
          </div>
        )}

        {preSelecionarMode === "sem-proposta" && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded px-3 py-2 flex items-start gap-2">
            <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium">Modo: Re-cotar itens sem proposta</p>
              <p className="text-xs mt-0.5">
                Já marcamos só os itens que o fornecedor anterior não precificou. Adicione um novo fornecedor abaixo pra enviar.
              </p>
            </div>
          </div>
        )}

        {preSelecionarMode === "re-enviar" && (
          <div className="bg-torg-blue-50 border border-torg-blue-100 text-torg-dark text-sm rounded px-3 py-2 flex items-start gap-2">
            <RotateCcw size={14} className="mt-0.5 flex-shrink-0 text-torg-blue" />
            <div>
              <p className="font-medium">Reenvio da cotação — nova rodada</p>
              <p className="text-xs mt-0.5 text-torg-gray">
                Pra corrigir um erro ou pedir desconto. Já marcamos os itens e os fornecedores da última cotação — confira, ajuste se precisar e envie. Cada envio gera uma nova cotação (a anterior fica no histórico).
              </p>
            </div>
          </div>
        )}

        {/* Vincular outras RMs (consolidar) */}
        {outrasRMs.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-torg-dark mb-1">
              Vincular outras RMs (opcional)
            </label>
            <p className="text-[11px] text-torg-gray mb-2">
              Marque RMs adicionais pra mandar todos os itens delas pro mesmo fornecedor numa proposta só.
            </p>
            <div className="border border-gray-200 rounded-lg max-h-[150px] overflow-y-auto divide-y divide-gray-100">
              {outrasRMs.map((r) => {
                const checked = rmsExtrasIds.has(r.id);
                const mesmoOp = r.opId === rm.opId;
                return (
                  <label key={r.id} className="flex items-center gap-3 px-3 py-1.5 hover:bg-gray-50 cursor-pointer text-xs">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleRmExtra(r.id)}
                      className="w-4 h-4 rounded border-gray-300 text-torg-blue focus:ring-torg-blue"
                    />
                    <span className="font-mono font-semibold text-torg-blue">{r.numero}</span>
                    <span className="text-torg-dark truncate flex-1">{r.descricao}</span>
                    {r.op && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${mesmoOp ? "bg-torg-blue-50 text-torg-blue" : "bg-gray-100 text-torg-gray"}`}>
                        {fmtOP(r.op.numero)}
                      </span>
                    )}
                    <span className="text-[10px] text-torg-gray">{r.itens.length} itens</span>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {/* Itens (consolidados das RMs marcadas) */}
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

        {/* Fornecedores — Vendor List (cadastrados) + avulsos */}
        <FornecedoresPicker
          fornecedoresCadastrados={fornecedoresCadastrados}
          fornFiltrados={fornFiltrados}
          carregandoForn={carregandoForn}
          fornSelecionadosIds={fornSelecionadosIds}
          toggleFornCadastrado={toggleFornCadastrado}
          filtroCatForn={filtroCatForn}
          setFiltroCatForn={setFiltroCatForn}
          buscaForn={buscaForn}
          setBuscaForn={setBuscaForn}
          fornecedoresLinhas={fornecedoresLinhas}
          setFornecedor={setFornecedor}
          addFornecedor={addFornecedor}
          removerFornecedor={removerFornecedor}
          categoriasFornecedor={categoriasFornecedor}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-torg-dark mb-1">Prazo de resposta</label>
            <input
              type="date"
              value={prazo}
              onChange={(e) => setPrazo(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-torg-dark mb-1">Observação (opcional)</label>
            <input
              type="text"
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Ex: Entrega urgente, frete CIF"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue"
            />
          </div>
        </div>
      </div>
      <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
        <button onClick={onClose} className="px-4 py-2 text-torg-gray border border-gray-300 rounded-lg hover:bg-gray-100 text-sm">
          Cancelar
        </button>
        <button
          onClick={submit}
          disabled={salvando}
          className="px-5 py-2 bg-torg-blue text-white rounded-lg hover:bg-torg-blue-700 text-sm font-medium flex items-center gap-2 disabled:opacity-50"
        >
          {salvando && <Loader2 size={14} className="animate-spin" />} Criar cotações
        </button>
      </div>
    </Modal>
  );
}

function ModalLinksEnvio({ rm, links, onClose }) {
  // links agora é { cotacoes: [...], emails: [...], estoque: {abatidos, excluidos} | null }
  const cotacoes = links?.cotacoes || links || [];
  const emailResults = links?.emails || [];
  const estoque = links?.estoque || null;
  const [copiado, setCopiado] = useState(null);
  const [reenvioStatus, setReenvioStatus] = useState({});
  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";

  // Mapa email -> resultado do envio automático
  const emailPorFornecedor = {};
  emailResults.forEach((e) => { emailPorFornecedor[e.email] = e; });

  const todosEnviados = emailResults.length > 0 && emailResults.every((e) => e.ok);
  const algumFalhou = emailResults.some((e) => !e.ok);
  const nenhumEnviado = emailResults.length === 0;

  const copiarLink = async (cot) => {
    const link = `${baseUrl}/fornecedores/c/${cot.token}`;
    await navigator.clipboard.writeText(link);
    setCopiado(cot.id);
    setTimeout(() => setCopiado(null), 2000);
  };

  const reenviarEmail = async (cot) => {
    setReenvioStatus((prev) => ({ ...prev, [cot.id]: "enviando" }));
    try {
      const res = await fetch(`/api/cotacao/${cot.id}/enviar-email`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro");
      setReenvioStatus((prev) => ({ ...prev, [cot.id]: "ok" }));
    } catch (e) {
      setReenvioStatus((prev) => ({ ...prev, [cot.id]: "erro" }));
    }
  };

  return (
    <Modal titulo={`Cotações criadas (${cotacoes.length})`} onClose={onClose}>
      <div className="px-6 py-5 space-y-3 max-h-[70vh] overflow-y-auto">
        {/* Abatimento por estoque (consulta respondida pela Produção) */}
        {estoque && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm rounded-lg px-3 py-2.5 space-y-1">
            <p className="font-semibold text-xs uppercase tracking-wide">Estoque abatido da cotação</p>
            {estoque.abatidos?.map((a, i) => (
              <p key={`a${i}`} className="text-xs">
                • {a.descricao}: {a.barrasDisponiveis} {a.unidade} em estoque — cotado só {a.barrasACotar} {a.unidade}.
              </p>
            ))}
            {estoque.excluidos?.map((e, i) => (
              <p key={`e${i}`} className="text-xs">
                • {e.descricao}: {e.barrasDisponiveis} {e.unidade} em estoque (100%) — <strong>fora da cotação</strong>. Use &quot;Atender estoque&quot; no item.
              </p>
            ))}
          </div>
        )}
        {/* Status geral */}
        {todosEnviados && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-sm text-emerald-800">
            <p className="font-medium flex items-center gap-1.5">
              <CheckCircle size={15} /> Emails enviados automaticamente
            </p>
            <p className="text-xs text-emerald-700 mt-1">
              Você recebeu cópia em CC de cada email. O fornecedor já pode acessar o link e enviar a proposta.
            </p>
          </div>
        )}
        {algumFalhou && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
            <p className="font-medium flex items-center gap-1.5">
              <AlertCircle size={15} /> Alguns emails falharam
            </p>
            <p className="text-xs text-amber-700 mt-1">
              As cotações foram criadas, mas nem todos os emails puderam ser enviados. Use "Reenviar" ou "Copiar link" e envie manualmente.
            </p>
          </div>
        )}
        {nenhumEnviado && (
          <div className="bg-torg-blue-50 border border-torg-blue-100 rounded-lg p-3 text-sm text-torg-dark">
            <p className="font-medium">✓ Cotações criadas com sucesso</p>
            <p className="text-xs text-torg-gray mt-1">
              O serviço de email não está configurado. Copie o link e envie manualmente por email ou WhatsApp.
            </p>
          </div>
        )}

        <ul className="space-y-2">
          {cotacoes.map((cot) => {
            const emailStatus = emailPorFornecedor[cot.fornecedorEmail];
            const enviado = emailStatus?.ok;
            const reenvio = reenvioStatus[cot.id];

            return (
              <li key={cot.id} className="border border-gray-200 rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-torg-dark flex items-center gap-2">
                      {cot.fornecedorNome}
                      {(enviado || reenvio === "ok") && (
                        <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-medium">
                          ✓ email enviado
                        </span>
                      )}
                      {emailStatus && !enviado && reenvio !== "ok" && (
                        <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full font-medium">
                          ✗ falhou
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-torg-gray truncate">{cot.fornecedorEmail}</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => copiarLink(cot)}
                      className="px-3 py-1.5 text-xs bg-white border border-gray-300 text-torg-gray rounded-lg hover:bg-gray-50 font-medium"
                    >
                      {copiado === cot.id ? "✓ copiado" : "Copiar link"}
                    </button>
                    {/* Reenviar — mostra quando falhou ou como opção sempre */}
                    {(!enviado || reenvio === "erro") && (
                      <button
                        onClick={() => reenviarEmail(cot)}
                        disabled={reenvio === "enviando"}
                        className="px-3 py-1.5 text-xs bg-torg-blue text-white rounded-lg hover:bg-torg-blue-700 font-medium inline-flex items-center gap-1 disabled:opacity-50"
                      >
                        <Mail size={12} />
                        {reenvio === "enviando" ? "Enviando..." : "Enviar email"}
                      </button>
                    )}
                    {reenvio === "ok" && (
                      <span className="px-3 py-1.5 text-xs bg-emerald-100 text-emerald-700 rounded-lg font-medium inline-flex items-center gap-1">
                        <CheckCircle size={12} /> Enviado
                      </span>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
      <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end">
        <button onClick={onClose} className="px-5 py-2 bg-torg-blue text-white rounded-lg hover:bg-torg-blue-700 text-sm font-medium">
          Fechar
        </button>
      </div>
    </Modal>
  );
}

function ModalEncerrarRM({ rm, onClose, onSaved }) {
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  const itensPendentes = rm.itens.filter((i) => i.status === "PENDENTE" || i.status === "EM_COTACAO" || i.status === "COTADO");

  const submit = async (force = false) => {
    if (!motivo.trim()) return setErro("Descreva o motivo do encerramento.");
    setErro("");
    setSalvando(true);
    try {
      const res = await fetch(`/api/rm/${rm.id}/encerrar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ motivo: motivo.trim(), force: !!force }),
      });
      const data = await res.json();
      if (!res.ok) {
        // Quando ha pedido CRIADO no Omie, backend bloqueia e devolve
        // requiresForce. Oferece confirmar pra forcar.
        if (data.requiresForce) {
          setSalvando(false);
          const ok = window.confirm(
            `${data.error}\n\n` +
            `Confirma que voce JA cancelou o(s) pedido(s) no Omie?\n` +
            `Se sim, vou cancelar a RM no Workspace (so afeta nosso historico).`
          );
          if (ok) return submit(true);
          return;
        }
        throw new Error(data.error || "Erro");
      }
      onSaved();
      onClose();
    } catch (e) {
      setErro(e.message);
      setSalvando(false);
    }
  };

  return (
    <Modal titulo="Encerrar RM" onClose={onClose}>
      <div className="px-6 py-5 space-y-4">
        {erro && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded px-3 py-2 flex items-start gap-2">
            <AlertCircle size={14} className="mt-0.5" /> <span>{erro}</span>
          </div>
        )}
        {itensPendentes.length > 0 && (
          <div className="bg-torg-orange-50 border border-torg-orange-200 rounded p-3 text-sm text-torg-orange-700 flex items-start gap-2">
            <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
            <p>
              Existem <strong>{itensPendentes.length} ite{itensPendentes.length === 1 ? "m" : "ns"}</strong> ainda não comprados.
              Eles serão cancelados automaticamente com o motivo informado abaixo.
            </p>
          </div>
        )}
        <div>
          <label className="block text-sm font-medium text-torg-dark mb-1">Motivo do encerramento *</label>
          <textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={3}
            placeholder="Ex: Cliente cancelou esse pacote; substituída pela RM-XXXX; etc."
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue"
          />
        </div>
      </div>
      <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
        <button onClick={onClose} className="px-4 py-2 text-torg-gray border border-gray-300 rounded-lg hover:bg-gray-100 text-sm">
          Voltar
        </button>
        <button
          onClick={submit}
          disabled={salvando}
          className="px-5 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium flex items-center gap-2 disabled:opacity-50"
        >
          {salvando && <Loader2 size={14} className="animate-spin" />} Encerrar RM
        </button>
      </div>
    </Modal>
  );
}

// Modal de edicao das categorias da OP que essa RM cobre. Permite (des)marcar
// categorias de Material / Aluguel / Outro. Mudancas vao via PATCH na RM.
function ModalEditarCategorias({ rm, onClose, onSaved }) {
  const [selecionadas, setSelecionadas] = useState(new Set(rm.categoriasOP || []));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const toggle = (codigo) => {
    setSelecionadas((prev) => {
      const next = new Set(prev);
      if (next.has(codigo)) next.delete(codigo);
      else next.add(codigo);
      return next;
    });
  };

  const salvar = async () => {
    setErro("");
    setSalvando(true);
    try {
      const res = await fetch(`/api/rm/${rm.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          acao: "atualizar_categorias",
          categoriasOP: Array.from(selecionadas),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro");
      onSaved();
    } catch (e) {
      setErro(e.message);
      setSalvando(false);
    }
  };

  const grupos = [
    { titulo: "Material", itens: CATEGORIAS_MATERIAL },
    { titulo: "Serviços Terceirizados", itens: CATEGORIAS_SERVICOS_TERCEIRIZADOS },
    { titulo: "Aluguel", itens: CATEGORIAS_ALUGUEL },
    { titulo: "Outro", itens: [CATEGORIA_OUTRO] },
  ];

  return (
    <Modal titulo="Editar categorias do escopo" onClose={onClose}>
      <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
        {erro && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded px-3 py-2 flex items-start gap-2">
            <AlertCircle size={14} className="mt-0.5" /> <span>{erro}</span>
          </div>
        )}
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-torg-gray">
            Marque/desmarque as categorias que essa RM cobre.
          </p>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-torg-gray font-medium">{selecionadas.size} marcadas</span>
            {selecionadas.size > 0 && (
              <button
                type="button"
                onClick={() => setSelecionadas(new Set())}
                className="text-torg-blue hover:text-torg-dark font-medium"
              >
                Limpar tudo
              </button>
            )}
          </div>
        </div>
        {grupos.map((g) => (
          <div key={g.titulo}>
            <p className="text-xs font-semibold text-torg-dark mb-1.5 uppercase tracking-wide">{g.titulo}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
              {g.itens.map((cat) => {
                const checked = selecionadas.has(cat.codigo);
                return (
                  <label
                    key={cat.codigo}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer text-sm ${
                      checked
                        ? "bg-torg-blue-50 border-torg-blue-200 text-torg-dark"
                        : "bg-white border-gray-200 text-torg-gray hover:bg-gray-50"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(cat.codigo)}
                      className="w-4 h-4 rounded border-gray-300 text-torg-blue focus:ring-torg-blue"
                    />
                    <span className="flex-1">{cat.label}</span>
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
        <button onClick={onClose} className="px-4 py-2 text-torg-gray border border-gray-300 rounded-lg hover:bg-gray-100 text-sm">
          Cancelar
        </button>
        <button
          onClick={salvar}
          disabled={salvando}
          className="px-5 py-2 bg-torg-blue text-white rounded-lg hover:bg-torg-blue-700 text-sm font-medium flex items-center gap-2 disabled:opacity-50"
        >
          {salvando && <Loader2 size={14} className="animate-spin" />} Salvar
        </button>
      </div>
    </Modal>
  );
}

// Secao de anexos (desenhos, especificacoes) na pagina da RM.
// Permite upload de novos arquivos e remocao dos existentes.
// Os arquivos sao enviados aos fornecedores junto com a cotacao.
function AnexosSection({ rmId, anexos: anexosIniciais, editavel }) {
  const router = useRouter();
  const [anexos, setAnexos] = useState(anexosIniciais || []);
  const [uploading, setUploading] = useState(0);
  const [erro, setErro] = useState("");
  const fileRef = useRef(null);

  const fmtBytes = (n) => {
    if (n < 1024) return n + " B";
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
    return (n / (1024 * 1024)).toFixed(1) + " MB";
  };

  const upload = async (files) => {
    if (!files || files.length === 0) return;
    setErro("");
    for (const file of files) {
      setUploading((n) => n + 1);
      try {
        const safe = String(file.name || "arquivo").replace(/[^\w\d.\- ]/g, "_").slice(0, 100);
        const blob = await blobUpload(`rm-anexos/${Date.now()}-${safe}`, file, {
          access: "public",
          handleUploadUrl: "/api/rm/upload-token",
        });
        const upData = { url: blob.url, nomeArquivo: file.name, tamanho: file.size, tipo: file.type || "application/octet-stream" };

        const linkRes = await fetch(`/api/rm/${rmId}/anexos`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(upData),
        });
        const linkData = await linkRes.json();
        if (!linkRes.ok) throw new Error(linkData.error || "Falha ao vincular");
        setAnexos((p) => [...p, linkData]);
      } catch (e) {
        setErro(`Falha ao enviar "${file.name}": ${e.message}`);
      } finally {
        setUploading((n) => n - 1);
      }
    }
  };

  const remover = async (anexo) => {
    if (!window.confirm(`Remover "${anexo.nomeArquivo}"?`)) return;
    setErro("");
    try {
      const res = await fetch(`/api/rm/${rmId}/anexos/${anexo.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao remover");
      setAnexos((p) => p.filter((a) => a.id !== anexo.id));
    } catch (e) {
      setErro(e.message);
    }
  };

  if (anexos.length === 0 && !editavel) return null;

  return (
    <div className="mt-4 pt-4 border-t border-gray-100">
      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
        <div>
          <p className="text-sm font-semibold text-torg-dark inline-flex items-center gap-1.5">
            <FileText size={14} className="text-torg-blue" /> Anexos
            <span className="text-xs text-torg-gray font-normal">({anexos.length})</span>
          </p>
          <p className="text-[11px] text-torg-gray mt-0.5">
            Desenhos, especificações e referências. Visíveis pros fornecedores quando enviar cotação.
          </p>
        </div>
        {editavel && (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading > 0}
            className="px-3 py-1.5 bg-white border border-torg-blue-200 text-torg-blue text-xs rounded-lg hover:bg-torg-blue-50 font-medium flex items-center gap-1.5 disabled:opacity-50"
          >
            {uploading > 0 ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
            {uploading > 0 ? `Enviando ${uploading}...` : "Anexar"}
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          multiple
          accept="application/pdf,image/*,.dwg,.dxf,.zip,.docx,.xlsx,.txt"
          className="hidden"
          onChange={(e) => { upload(Array.from(e.target.files || [])); e.target.value = ""; }}
        />
      </div>
      {erro && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded px-3 py-1.5 mb-2 flex items-start gap-2">
          <AlertCircle size={12} className="mt-0.5 flex-shrink-0" /> <span>{erro}</span>
        </div>
      )}
      {anexos.length > 0 ? (
        <ul className="divide-y divide-gray-100 border border-gray-200 rounded-lg">
          {anexos.map((a) => (
            <li key={a.id} className="px-3 py-2 flex items-center gap-3 hover:bg-gray-50">
              <FileText size={14} className="text-torg-blue flex-shrink-0" />
              <a
                href={a.blobUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 min-w-0 truncate text-sm text-torg-dark hover:text-torg-blue hover:underline"
                title={a.nomeArquivo}
              >
                {a.nomeArquivo}
              </a>
              <span className="text-xs text-torg-gray tabular-nums whitespace-nowrap">{fmtBytes(a.tamanho || 0)}</span>
              {editavel && (
                <button
                  type="button"
                  onClick={() => remover(a)}
                  className="text-red-500 hover:text-red-700"
                  title="Remover anexo"
                >
                  <X size={14} />
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-torg-gray italic">Nenhum anexo. Clique em "Anexar" pra adicionar desenhos/PDFs.</p>
      )}
    </div>
  );
}

// Modal de edicao dos dados do item da RM. Permite ajustar descricao, qtd,
// peso, unidade, codigo, material, comprimento, largura, tratamento. Bloqueado
// pra itens em PEDIDO_GERADO / CANCELADO.
function ModalEditarRMItem({ item, rmId, onClose, onSaved }) {
  const [form, setForm] = useState({
    descricao: item.descricao || "",
    unidade: item.unidade || "",
    qtd: item.qtd != null ? String(item.qtd) : "",
    codigo: item.codigo || "",
    material: item.material || "",
    comprimento: item.comprimento || "",
    largura: item.largura || "",
    tratamento: item.tratamento || "",
    peso: item.peso != null ? String(item.peso) : "",
    pesoLinear: item.pesoLinear != null ? String(item.pesoLinear) : "",
  });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const parseNum = (s) => {
    const n = parseFloat(String(s).replace(",", "."));
    return isNaN(n) ? null : n;
  };

  const submit = async () => {
    setErro("");
    if (!form.descricao.trim()) return setErro("Descrição é obrigatória.");
    if (!form.unidade.trim()) return setErro("Unidade é obrigatória.");
    setSalvando(true);
    try {
      const res = await fetch(`/api/rm/${rmId}/itens/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          descricao: form.descricao.trim(),
          unidade: form.unidade.trim(),
          qtd: parseNum(form.qtd) ?? 0,
          codigo: form.codigo.trim() || null,
          material: form.material.trim() || null,
          comprimento: form.comprimento.trim() || null,
          largura: form.largura.trim() || null,
          tratamento: form.tratamento.trim() || null,
          peso: parseNum(form.peso),
          pesoLinear: parseNum(form.pesoLinear),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro");
      onSaved();
    } catch (e) {
      setErro(e.message);
      setSalvando(false);
    }
  };

  return (
    <Modal titulo="Editar item da RM" onClose={onClose}>
      <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
        {erro && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded px-3 py-2 flex items-start gap-2">
            <AlertCircle size={14} className="mt-0.5" /> <span>{erro}</span>
          </div>
        )}
        {(item.status === "PEDIDO_GERADO" || item.status === "CANCELADO" || item.status === "ATENDIDO_ESTOQUE") && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded px-3 py-2 flex items-start gap-2">
            <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
            <span>
              Item em status <strong>{item.status}</strong>. Ajustes aqui são pra
              correção de dados (material, descrição, etc) e <strong>não alteram
              o pedido já criado no Omie</strong>. Se precisar mudar quantidade
              ou preço efetivo, edite direto no Omie.
            </span>
          </div>
        )}
        <div>
          <label className="block text-xs font-medium text-torg-dark mb-1">Descrição *</label>
          <input
            type="text" value={form.descricao}
            onChange={(e) => set("descricao", e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-torg-dark mb-1">Quantidade *</label>
            <input
              type="number" step="0.01" min="0" value={form.qtd}
              onChange={(e) => set("qtd", e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm tabular-nums focus:ring-2 focus:ring-torg-blue"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-torg-dark mb-1">Unidade *</label>
            <input
              type="text" value={form.unidade}
              onChange={(e) => set("unidade", e.target.value.toUpperCase())}
              placeholder="UN / KG / M / PÇ"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-torg-dark mb-1">Código</label>
            <input
              type="text" value={form.codigo}
              onChange={(e) => set("codigo", e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-torg-blue"
            />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-torg-dark mb-1">Material</label>
            <input
              type="text" value={form.material}
              onChange={(e) => set("material", e.target.value)}
              placeholder="Ex: NBR 5590"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-torg-dark mb-1">Tratamento</label>
            <input
              type="text" value={form.tratamento}
              onChange={(e) => set("tratamento", e.target.value)}
              placeholder="Ex: Galvanizado"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue"
            />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-torg-dark mb-1">Comprimento</label>
            <input
              type="text" value={form.comprimento}
              onChange={(e) => set("comprimento", e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-torg-dark mb-1">Largura</label>
            <input
              type="text" value={form.largura}
              onChange={(e) => set("largura", e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue"
            />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-torg-dark mb-1">Peso (kg)</label>
            <input
              type="number" step="0.01" min="0" value={form.peso}
              onChange={(e) => set("peso", e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm tabular-nums focus:ring-2 focus:ring-torg-blue"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-torg-dark mb-1">Peso linear (kg/m)</label>
            <input
              type="number" step="0.001" min="0" value={form.pesoLinear}
              onChange={(e) => set("pesoLinear", e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm tabular-nums focus:ring-2 focus:ring-torg-blue"
            />
          </div>
        </div>
      </div>
      <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
        <button onClick={onClose} className="px-4 py-2 text-torg-gray border border-gray-300 rounded-lg hover:bg-gray-100 text-sm">
          Cancelar
        </button>
        <button
          onClick={submit}
          disabled={salvando}
          className="px-5 py-2 bg-torg-blue text-white rounded-lg hover:bg-torg-blue-700 text-sm font-medium flex items-center gap-2 disabled:opacity-50"
        >
          {salvando && <Loader2 size={14} className="animate-spin" />} Salvar
        </button>
      </div>
    </Modal>
  );
}

// Chip clicavel pra abrir/baixar anexo da cotacao + botao X pra remover.
function CotacaoAnexoChip({ anexo, cotacaoId }) {
  const router = useRouter();
  const [removendo, setRemovendo] = useState(false);
  const tamMb = anexo.tamanho ? (anexo.tamanho / (1024 * 1024)).toFixed(2) : null;
  const remover = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm(`Remover o anexo "${anexo.nomeArquivo}"? Essa ação não pode ser desfeita.`)) return;
    setRemovendo(true);
    try {
      const res = await fetch(`/api/cotacao/${cotacaoId}/anexos/${anexo.id}`, { method: "DELETE" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Erro");
      }
      router.refresh();
    } catch (err) {
      alert("Falha ao remover: " + err.message);
      setRemovendo(false);
    }
  };
  return (
    <span className="inline-flex items-center text-[11px] bg-torg-blue-50 text-torg-blue rounded border border-torg-blue-100 overflow-hidden">
      <a
        href={anexo.blobUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 px-2 py-0.5 hover:bg-torg-blue-100"
        title={`${anexo.nomeArquivo}${tamMb ? ` · ${tamMb} MB` : ""}`}
      >
        <FileText size={11} />
        <span className="truncate max-w-[180px]">{anexo.nomeArquivo}</span>
      </a>
      <button
        type="button"
        onClick={remover}
        disabled={removendo}
        className="px-1.5 py-0.5 text-red-500 hover:text-white hover:bg-red-500 disabled:opacity-50 border-l border-torg-blue-100"
        title="Remover anexo"
      >
        {removendo ? <Loader2 size={10} className="animate-spin" /> : <X size={10} />}
      </button>
    </span>
  );
}

// FornecedoresPicker — bloco que combina:
// 1) Lista de fornecedores cadastrados (Vendor List) com checkbox + filtro
//    por categoria + busca
// 2) Linhas avulsas (nome + email) pra fornecedor nao cadastrado
// Usado nos modais de envio de cotacao.
function FornecedoresPicker({
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
function ModalPedidoDireto({ rm, onClose, onGerado }) {
  const ehAluguel = rm.tipoRM === "ALUGUEL";
  const [fornecedores, setFornecedores] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [locais, setLocais] = useState([]);
  const [fornecedorId, setFornecedorId] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [fornecedorNome, setFornecedorNome] = useState("");
  const [categoria, setCategoria] = useState("");
  const [localEstoque, setLocalEstoque] = useState("");
  const [codigoServicoOmie, setCodigoServicoOmie] = useState("");
  const [prazoPagamento, setPrazoPagamento] = useState("");
  const [observacao, setObservacao] = useState("");
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    fetch("/api/fornecedores").then((r) => r.json()).then((d) => setFornecedores(d.fornecedores || d.data || d || [])).catch(() => {});
    fetch("/api/omie/categorias").then((r) => r.json()).then((d) => setCategorias(d.categorias || [])).catch(() => {});
    fetch("/api/omie/locais-estoque").then((r) => r.json()).then((d) => setLocais(d.locais || [])).catch(() => {});
  }, []);

  // Selecionar do cadastro preenche nome/cnpj automaticamente
  const escolherFornecedor = (id) => {
    setFornecedorId(id);
    const f = (fornecedores || []).find((x) => x.id === id);
    if (f) { setFornecedorNome(f.razaoSocial || ""); setCnpj(f.cnpj || ""); }
  };

  const itensPendentes = (rm.itens || []).filter((it) => !["PEDIDO_GERADO", "CANCELADO", "ATENDIDO_ESTOQUE"].includes(it.status) && !it.canceladoEm);
  // Valor do item: montagem usa valorTotal; aluguel tem fallback diária × dias
  // (× qtd de unidades) para registros antigos sem valorTotal preenchido
  const valorItem = (it) => {
    const unit = Number(it.valorTotal) > 0
      ? Number(it.valorTotal)
      : (Number(it.valorDiaria) || 0) * (Number(it.qtdDias) || 0);
    return unit * (Number(it.qtd) || 1);
  };
  const total = itensPendentes.reduce((s, it) => s + valorItem(it), 0);

  const gerar = async () => {
    setErro("");
    if (!fornecedorNome.trim()) return setErro(`Informe o fornecedor (${ehAluguel ? "locador" : "montador"}).`);
    if (!categoria) return setErro("Escolha a Categoria de Compra.");
    setGerando(true);
    try {
      const f = (fornecedores || []).find((x) => x.id === fornecedorId);
      const res = await fetch(`/api/rm/${rm.id}/gerar-pedido-direto`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fornecedorNome: fornecedorNome.trim(),
          cnpj: cnpj.trim() || null,
          nCodOmie: f?.nCodOmie || null,
          categoria,
          localEstoque: localEstoque || null,
          codigoServicoOmie: codigoServicoOmie.trim() || null,
          prazoPagamento: prazoPagamento.trim() || null,
          observacao: observacao.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao gerar pedido");
      alert(`✓ Pedido ${data.pedido?.numeroPedido || ""} criado no Omie — ${fmtMoeda(data.pedido?.total)} no extrato da OP ${rm.op?.numero || ""}.`);
      onGerado();
    } catch (e) {
      setErro(e.message);
    } finally {
      setGerando(false);
    }
  };

  return (
    <Modal titulo={`Gerar pedido Omie — ${ehAluguel ? "Aluguel de Equipamentos" : "Medição de Montagem"}`} onClose={onClose}>
      <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
        {erro && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded px-3 py-2 flex items-start gap-2">
            <AlertCircle size={14} className="mt-0.5 shrink-0" /> <span>{erro}</span>
          </div>
        )}

        {/* Resumo dos itens (valores informados pelo solicitante) */}
        <div className="border border-gray-100 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50/60">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">{ehAluguel ? "Equipamento" : "Medição"}</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Valor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {itensPendentes.map((it) => (
                <tr key={it.id}>
                  <td className="px-3 py-1.5 text-torg-dark">
                    {it.descricao}
                    {ehAluguel && Number(it.valorDiaria) > 0 && Number(it.qtdDias) > 0 && (
                      <span className="block text-[11px] text-torg-gray">
                        {fmtMoeda(it.valorDiaria)}/dia × {it.qtdDias} dia{it.qtdDias > 1 ? "s" : ""}{Number(it.qtd) > 1 ? ` × ${it.qtd} un` : ""}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums font-medium">{fmtMoeda(valorItem(it))}</td>
                </tr>
              ))}
              <tr className="bg-gray-50/60">
                <td className="px-3 py-1.5 font-bold text-torg-dark">TOTAL</td>
                <td className="px-3 py-1.5 text-right tabular-nums font-bold text-torg-dark">{fmtMoeda(total)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-torg-gray mb-1">Fornecedor ({ehAluguel ? "locador" : "montador"}) — do cadastro</label>
            <select value={fornecedorId} onChange={(e) => escolherFornecedor(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white">
              <option value="">— Escolher do Vendor List (ou preencha abaixo) —</option>
              {(fornecedores || []).map((f) => (
                <option key={f.id} value={f.id}>{f.razaoSocial}{f.cnpj ? ` — ${f.cnpj}` : ""}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-torg-gray mb-1">Nome do fornecedor *</label>
            <input type="text" value={fornecedorNome} onChange={(e) => setFornecedorNome(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg" />
          </div>
          <div>
            <label className="block text-xs font-medium text-torg-gray mb-1">CNPJ * <span className="font-normal">(precisa existir no Omie)</span></label>
            <input type="text" value={cnpj} onChange={(e) => setCnpj(e.target.value)} placeholder="00.000.000/0001-00"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg" />
          </div>
          <div>
            <label className="block text-xs font-medium text-torg-gray mb-1">Categoria de Compra *</label>
            <select value={categoria} onChange={(e) => setCategoria(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white">
              <option value="">Selecione…</option>
              {(categorias || []).map((c) => (
                <option key={c.codigo} value={c.codigo}>{c.codigo} — {c.descricao}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-torg-gray mb-1">Local de estoque</label>
            <select value={localEstoque} onChange={(e) => setLocalEstoque(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white">
              <option value="">(padrão)</option>
              {(locais || []).map((l) => (
                <option key={l.codigo} value={l.codigo}>{l.descricao || l.codigo}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-torg-gray mb-1">Código do serviço no Omie</label>
            <input type="text" value={codigoServicoOmie} onChange={(e) => setCodigoServicoOmie(e.target.value)}
              placeholder={ehAluguel ? "Ex.: SERV-ALUG (recomendado)" : "Ex.: SERV-MONT (recomendado)"}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg" />
            <p className="text-[10px] text-torg-gray mt-0.5">Sem ele, o Omie tenta achar o item pela descrição — pode falhar.</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-torg-gray mb-1">Prazo de pagamento</label>
            <input type="text" value={prazoPagamento} onChange={(e) => setPrazoPagamento(e.target.value)}
              placeholder="Ex.: 28 dias"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg" />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-torg-gray mb-1">Observação (vai no pedido)</label>
            <input type="text" value={observacao} onChange={(e) => setObservacao(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg" />
          </div>
        </div>

        <p className="text-[11px] text-torg-gray bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
          Sem cotação: o pedido é criado direto no Omie com os valores informados pelo solicitante e
          fica vinculado à <strong>OP {rm.op?.numero}</strong> — o custo aparece no extrato/controle financeiro da obra.
        </p>
      </div>
      <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
        <button onClick={onClose} disabled={gerando} className="px-4 py-2 text-sm text-torg-gray border border-gray-200 rounded-lg hover:bg-gray-50">Cancelar</button>
        <button onClick={gerar} disabled={gerando || itensPendentes.length === 0}
          className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50">
          {gerando ? <Loader2 size={15} className="animate-spin" /> : <Package size={15} />}
          {gerando ? "Gerando no Omie…" : `Gerar pedido (${fmtMoeda(total)})`}
        </button>
      </div>
    </Modal>
  );
}
