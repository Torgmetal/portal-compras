"use client";
import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Calendar, Plus, Edit3, Clock, DollarSign, AlertCircle, Loader2, X,
  CheckCircle2, FileText, History, Trash2, RotateCcw, Pencil, Truck,
} from "lucide-react";
import ItemFormRow, { novoItem } from "@/components/ItemFormRow";
import { labelCategoria, agruparPorGrupo, isAluguel } from "@/lib/op-categorias";

const fmtMoeda = (v) =>
  v != null ? Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";
const fmtData = (d) => (d ? new Date(d).toLocaleDateString("pt-BR") : "—");

const STATUS_LABELS = {
  ABERTA: { label: "Aberta", className: "bg-torg-blue-50 text-torg-blue" },
  EM_EXECUCAO: { label: "Em execução", className: "bg-torg-orange-50 text-torg-orange-700" },
  ENCERRADA: { label: "Encerrada", className: "bg-gray-100 text-gray-600" },
  ATRASADA: { label: "Atrasada", className: "bg-red-50 text-red-700" },
  CANCELADA: { label: "Cancelada", className: "bg-gray-100 text-gray-500" },
};

function calcStatus(op) {
  if (op.status === "CANCELADA") return "CANCELADA";
  if (op.status === "ENCERRADA" || op.dataFimReal) return "ENCERRADA";
  if (op.dataFimPrevista && new Date(op.dataFimPrevista) < new Date()) return "ATRASADA";
  if (op.dataInicio && new Date(op.dataInicio) <= new Date()) return "EM_EXECUCAO";
  return "ABERTA";
}

export default function OPDetailClient({ op, userRole, userId }) {
  const router = useRouter();
  const isMaster = userRole === "ADMIN";

  const [modalAditivo, setModalAditivo] = useState(false);
  const [modalRevisao, setModalRevisao] = useState(false);
  const [modalPrazo, setModalPrazo] = useState(false);
  const [modalVerba, setModalVerba] = useState(null); // { tipo: "op"|"aditivo", itemId, atual }
  const [modalEditarItem, setModalEditarItem] = useState(null); // { tipo: 'op'|'aditivo', item }
  const [modalAddItens, setModalAddItens] = useState(false);
  const [modalReceita, setModalReceita] = useState(null); // null | 'nova' | { ...receita }
  const [modalCliente, setModalCliente] = useState(false);
  const [modalEditarOP, setModalEditarOP] = useState(false);
  const [modalMedicao, setModalMedicao] = useState(false);
  const [syncMedicaoId, setSyncMedicaoId] = useState(null);
  const [acaoStatus, setAcaoStatus] = useState(null); // 'finalizar' | 'reabrir' | 'excluir'
  const [erroAcao, setErroAcao] = useState("");

  const status = calcStatus(op);
  const s = STATUS_LABELS[status];
  const encerradaOuCancelada = op.status === "ENCERRADA" || op.status === "CANCELADA";

  async function executarAcaoStatus(acao) {
    const confirms = {
      finalizar: `Finalizar a OP ${op.numero}? Ela some das listas ativas mas continua acessivel pelo historico.`,
      reabrir: `Reabrir a OP ${op.numero}? Ela volta pra lista ativa.`,
      cancelar: `Cancelar a OP ${op.numero}? Diferente de finalizar — usa quando a obra nao vai acontecer.`,
    };
    if (!window.confirm(confirms[acao])) return;
    setErroAcao("");
    setAcaoStatus(acao);
    try {
      const res = await fetch(`/api/comercial/op/${op.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro");
      router.refresh();
    } catch (e) {
      setErroAcao(e.message);
    } finally {
      setAcaoStatus(null);
    }
  }

  async function excluirOP() {
    if (!window.confirm(
      `EXCLUIR DEFINITIVAMENTE a OP ${op.numero}?\n\n` +
      `Apaga itens, aditivos, revisoes e ajustes de prazo.\n` +
      `So funciona se a OP nao tiver RMs vinculadas.\n\n` +
      `Essa acao NAO PODE ser desfeita.`
    )) return;
    setErroAcao("");
    setAcaoStatus("excluir");
    try {
      const res = await fetch(`/api/comercial/op/${op.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao excluir");
      router.push("/comercial");
    } catch (e) {
      setErroAcao(e.message);
      setAcaoStatus(null);
    }
  }

  const verbaTotal = useMemo(() => {
    const base = op.itens.reduce((s, i) => s + i.valorVerba, 0);
    const aditivos = op.aditivos.reduce(
      (s, a) => s + a.itens.reduce((ss, i) => ss + i.valorVerba, 0),
      0
    );
    return base + aditivos;
  }, [op]);

  return (
    <>
      {/* Cabeçalho */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-3xl font-extrabold text-torg-dark tracking-tight font-mono">
                OP {op.numero}
              </h2>
              <span className={`text-xs px-2 py-1 rounded-full font-medium ${s.className}`}>
                {s.label}
              </span>
              {!encerradaOuCancelada && (
                <button
                  onClick={() => setModalEditarOP(true)}
                  className="text-xs text-torg-gray hover:text-torg-blue inline-flex items-center gap-1 px-2 py-1 rounded hover:bg-torg-blue-50 transition-colors"
                  title="Editar dados da OP (número, cliente, obra, datas)"
                >
                  <Pencil size={12} /> Editar
                </button>
              )}
            </div>
            <p className="text-torg-dark font-medium mt-1">{op.cliente}</p>
            {op.obra && <p className="text-sm text-torg-gray">{op.obra}</p>}
            {op.descricao && <p className="text-sm text-torg-gray mt-2">{op.descricao}</p>}
          </div>
          <div className="text-right text-sm">
            <p className="text-torg-gray">Verba total contratada</p>
            <p className="text-2xl font-extrabold text-torg-orange-700 tabular-nums">
              {fmtMoeda(verbaTotal)}
            </p>
            <p className="text-xs text-torg-gray mt-1">
              Criada por {op.createdBy?.name} em {fmtData(op.createdAt)}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-5 pt-5 border-t border-gray-100 text-sm">
          <div className="flex items-center gap-2">
            <Calendar size={16} className="text-torg-blue" />
            <div>
              <p className="text-torg-gray text-xs">Início</p>
              <p className="text-torg-dark font-medium">{fmtData(op.dataInicio)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Clock size={16} className="text-torg-blue" />
            <div>
              <p className="text-torg-gray text-xs">Fim previsto</p>
              <p className="text-torg-dark font-medium">{fmtData(op.dataFimPrevista)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <FileText size={16} className="text-torg-blue" />
            <div>
              <p className="text-torg-gray text-xs">RMs vinculadas</p>
              <p className="text-torg-dark font-medium">{op._count.rms}</p>
            </div>
          </div>
          <a href="#pedidos-omie" className="flex items-center gap-2 hover:bg-torg-blue-50 -mx-2 px-2 py-1 rounded transition-colors">
            <Truck size={16} className="text-torg-blue" />
            <div>
              <p className="text-torg-gray text-xs">Pedidos vinculados</p>
              <p className="text-torg-dark font-medium">
                {op.resumoPedidos?.criados || 0}
                {op.resumoPedidos?.erros > 0 && (
                  <span className="text-[10px] text-red-600 font-medium ml-1">
                    +{op.resumoPedidos.erros} c/erro
                  </span>
                )}
              </p>
              {op.resumoPedidos?.valorTotal > 0 && (
                <p className="text-[10px] text-torg-orange-700 font-medium tabular-nums">
                  {fmtMoeda(op.resumoPedidos.valorTotal)}
                </p>
              )}
            </div>
          </a>
        </div>

        {/* Ações */}
        <div className="flex flex-wrap gap-2 mt-5 pt-5 border-t border-gray-100">
          <button
            onClick={() => setModalAditivo(true)}
            disabled={encerradaOuCancelada}
            className="px-4 py-2 bg-torg-blue text-white text-sm rounded-lg hover:bg-torg-blue-700 font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus size={16} /> Novo Aditivo
          </button>
          <button
            onClick={() => setModalRevisao(true)}
            disabled={encerradaOuCancelada}
            className="px-4 py-2 bg-white border border-torg-blue-200 text-torg-blue text-sm rounded-lg hover:bg-torg-blue-50 font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Edit3 size={16} /> Registrar Revisão
          </button>
          {isMaster && (
            <button
              onClick={() => setModalPrazo(true)}
              disabled={encerradaOuCancelada}
              className="px-4 py-2 bg-white border border-torg-blue-200 text-torg-blue text-sm rounded-lg hover:bg-torg-blue-50 font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Clock size={16} /> Ajustar Prazo
            </button>
          )}

          <div className="flex-1" />

          {encerradaOuCancelada ? (
            <button
              onClick={() => executarAcaoStatus("reabrir")}
              disabled={!!acaoStatus}
              className="px-4 py-2 bg-white border border-torg-blue-200 text-torg-blue text-sm rounded-lg hover:bg-torg-blue-50 font-medium flex items-center gap-2 disabled:opacity-50"
            >
              {acaoStatus === "reabrir" ? <Loader2 size={16} className="animate-spin" /> : <RotateCcw size={16} />}
              Reabrir OP
            </button>
          ) : (
            <button
              onClick={() => executarAcaoStatus("finalizar")}
              disabled={!!acaoStatus}
              className="px-4 py-2 bg-torg-orange text-white text-sm rounded-lg hover:bg-torg-orange-700 font-medium flex items-center gap-2 disabled:opacity-50"
            >
              {acaoStatus === "finalizar" ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
              Finalizar OP
            </button>
          )}

          {isMaster && (
            <button
              onClick={excluirOP}
              disabled={!!acaoStatus}
              title={op._count.rms > 0 ? "OP tem RMs vinculadas — use Cancelar pra arquivar" : "Excluir definitivamente"}
              className="px-4 py-2 bg-white border border-red-300 text-red-600 text-sm rounded-lg hover:bg-red-50 font-medium flex items-center gap-2 disabled:opacity-50"
            >
              {acaoStatus === "excluir" ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
              Excluir
            </button>
          )}
        </div>

        {erroAcao && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2 flex items-start gap-2 mt-3">
            <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
            <span>{erroAcao}</span>
          </div>
        )}
      </div>

      {/* KPIs financeiros: Receita / Verba / Margem com impostos detalhados */}
      {op.kpisFinanceiros && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-5">
          {/* Linha 1: RECEITA — em AZUL (entrada) */}
          <div>
            <p className="text-xs uppercase tracking-wide text-torg-blue font-semibold mb-3">
              Receita do contrato (entrada)
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-torg-gray">Receita bruta total</p>
                <p className="text-2xl font-extrabold text-torg-blue tabular-nums">
                  {fmtMoeda(op.kpisFinanceiros.receitaBruta)}
                </p>
                <p className="text-[10px] text-torg-gray mt-0.5">
                  {(op.receitas || []).length} {((op.receitas || []).length === 1) ? "receita" : "receitas"} cadastrada(s)
                </p>
              </div>
              <div>
                <p className="text-xs text-torg-gray">Impostos estimados</p>
                <p className="text-2xl font-extrabold text-torg-orange-700 tabular-nums">
                  − {fmtMoeda(op.kpisFinanceiros.totalImpostos)}
                </p>
                <p className="text-[10px] text-torg-gray mt-0.5">
                  Detalhado por tipo abaixo
                </p>
              </div>
              <div>
                <p className="text-xs text-torg-gray">Receita líquida</p>
                <p className="text-2xl font-extrabold text-torg-blue tabular-nums">
                  {fmtMoeda(op.kpisFinanceiros.receitaLiquida)}
                </p>
                <p className="text-[10px] text-torg-gray mt-0.5">Bruto − impostos</p>
              </div>
            </div>

            {/* Detalhe dos impostos por tipo */}
            {op.kpisFinanceiros.impostosDetalhados && op.kpisFinanceiros.totalImpostos > 0 && (
              <div className="mt-4 bg-torg-orange-50/30 border border-torg-orange-100 rounded-lg p-3">
                <p className="text-[11px] uppercase tracking-wide text-torg-orange-700 font-semibold mb-2">
                  Detalhamento dos impostos
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
                  {[
                    { key: "icms", label: "ICMS" },
                    { key: "ipi", label: "IPI" },
                    { key: "pis", label: "PIS" },
                    { key: "cofins", label: "COFINS" },
                    { key: "iss", label: "ISS" },
                    { key: "irrf", label: "IRRF" },
                    { key: "csll", label: "CSLL" },
                  ].map((imp) => {
                    const valor = op.kpisFinanceiros.impostosDetalhados[imp.key] || 0;
                    return (
                      <div key={imp.key}>
                        <p className="text-[10px] text-torg-gray font-semibold uppercase">{imp.label}</p>
                        <p className={`text-sm font-bold tabular-nums ${valor > 0 ? "text-torg-orange-700" : "text-gray-300"}`}>
                          {valor > 0 ? fmtMoeda(valor) : "—"}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-gray-100" />

          {/* Linha 2: VERBA — em LARANJA (despesa) */}
          <div>
            <p className="text-xs uppercase tracking-wide text-torg-orange-700 font-semibold mb-3">
              Verba pra compras (despesa)
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-torg-gray">Verba estimada</p>
                <p className="text-2xl font-extrabold text-torg-orange-700 tabular-nums">
                  {fmtMoeda(op.kpisFinanceiros.verbaTotal)}
                </p>
                <p className="text-[10px] text-torg-gray mt-0.5">Base + aditivos</p>
              </div>
              <div>
                <p className="text-xs text-torg-gray">Já em pedidos</p>
                <p className="text-2xl font-extrabold text-torg-orange-700 tabular-nums">
                  {fmtMoeda(op.kpisFinanceiros.totalEmPedidos)}
                </p>
                <p className="text-[10px] text-torg-gray mt-0.5">
                  {op.kpisFinanceiros.consumoPct.toFixed(1)}% da verba
                </p>
              </div>
              <div>
                <p className="text-xs text-torg-gray">Saldo restante</p>
                <p className={`text-2xl font-extrabold tabular-nums ${
                  op.kpisFinanceiros.saldo < 0
                    ? "text-red-600"
                    : op.kpisFinanceiros.consumoPct >= 70
                    ? "text-torg-orange-700"
                    : "text-torg-dark"
                }`}>
                  {fmtMoeda(op.kpisFinanceiros.saldo)}
                </p>
                {op.kpisFinanceiros.saldo < 0 && (
                  <p className="text-[10px] text-red-600 mt-0.5 font-medium">⚠ verba estourada</p>
                )}
                {op.kpisFinanceiros.saldo >= 0 && op.kpisFinanceiros.consumoPct >= 70 && (
                  <p className="text-[10px] text-torg-orange-700 mt-0.5 font-medium">⚠ acima de 70%</p>
                )}
              </div>
            </div>
          </div>

          {/* Margem prevista */}
          {op.kpisFinanceiros.receitaBruta > 0 && (
            <div className="border-t border-gray-100 pt-4 flex items-center justify-between flex-wrap gap-2">
              <p className="text-xs text-torg-gray uppercase tracking-wide font-semibold">
                Margem prevista (líquido − verba)
              </p>
              <div className="text-right">
                <p className={`text-xl font-extrabold tabular-nums ${
                  op.kpisFinanceiros.margemPrevista < 0
                    ? "text-red-600"
                    : op.kpisFinanceiros.margemPct < 10
                    ? "text-torg-orange-700"
                    : "text-torg-dark"
                }`}>
                  {fmtMoeda(op.kpisFinanceiros.margemPrevista)}
                  <span className="text-sm text-torg-gray font-medium ml-2">
                    ({op.kpisFinanceiros.margemPct.toFixed(1)}%)
                  </span>
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Faturamento e Dados Fiscais do Cliente */}
      <FaturamentoCard
        op={op}
        temFD={op.faturamento?.temFD}
        totalFD={op.faturamento?.totalFD}
        onEditar={() => setModalCliente(true)}
      />

      {/* Medições (Pedidos de Venda do Omie) */}
      <MedicoesCard
        medicoes={op.medicoes || []}
        resumo={op.resumoMedicoes}
        receitaBruta={op.kpisFinanceiros?.receitaBruta || 0}
        encerrada={encerradaOuCancelada}
        syncId={syncMedicaoId}
        onAdicionar={() => setModalMedicao(true)}
        onSync={async (id) => {
          setSyncMedicaoId(id);
          try {
            const res = await fetch(`/api/comercial/medicao/${id}`, { method: "POST" });
            const d = await res.json();
            if (!res.ok) alert(d.error || "Erro ao sincronizar");
            router.refresh();
          } finally {
            setSyncMedicaoId(null);
          }
        }}
        onRemover={async (id, numero) => {
          if (!window.confirm(`Desvincular medição ${numero}?\n\nIsso só remove o vínculo no portal — o pedido continua intacto no Omie.`)) return;
          const res = await fetch(`/api/comercial/medicao/${id}`, { method: "DELETE" });
          const d = await res.json();
          if (!res.ok) return alert(d.error || "Erro");
          router.refresh();
        }}
      />

      {/* Cobertura por categoria (gaps de RM da Engenharia) */}
      {op.cobertura && Object.keys(op.cobertura).length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-lg font-semibold text-torg-dark mb-1">Cobertura por categoria</h3>
          <p className="text-sm text-torg-gray mb-4">
            RMs de Engenharia vinculadas a cada categoria do escopo. Categorias sem RM podem indicar item esquecido.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {Object.entries(op.cobertura).map(([cat, rms]) => {
              const tem = rms.length > 0;
              return (
                <div
                  key={cat}
                  className={`p-3 rounded-lg border ${
                    tem ? "border-torg-orange-200 bg-torg-orange-50/30" : "border-gray-200 bg-gray-50"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-torg-dark">
                      {cat === "OUTRO" ? "Outro" : cat.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, l => l.toUpperCase())}
                    </p>
                    {tem ? (
                      <span className="text-xs font-medium text-torg-orange-700">
                        {rms.length} RM{rms.length !== 1 ? "s" : ""}
                      </span>
                    ) : (
                      <span className="text-xs font-medium text-gray-500">Sem RM</span>
                    )}
                  </div>
                  {tem && (
                    <p className="text-xs text-torg-gray mt-1 font-mono">
                      {rms.map((r) => r.numero).join(", ")}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Receitas do contrato */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="text-lg font-semibold text-torg-dark">
              Receitas do contrato ({(op.receitas || []).length})
            </h3>
            <p className="text-xs text-torg-gray mt-0.5">
              Linhas de receita por categoria (projeto, montagem, fabricação, etc.) com impostos por CFOP.
            </p>
          </div>
          {!encerradaOuCancelada && (
            <button
              onClick={() => setModalReceita("nova")}
              className="px-3 py-1.5 bg-white border border-torg-blue-200 text-torg-blue text-xs font-medium rounded-lg hover:bg-torg-blue-50 inline-flex items-center gap-1"
            >
              <Plus size={14} /> Adicionar receita
            </button>
          )}
        </div>
        <ReceitasTabela
          receitas={op.receitas || []}
          onEditar={(r) => setModalReceita(r)}
        />
      </div>

      {/* Itens base */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
          <h3 className="text-lg font-semibold text-torg-dark">
            Itens base do contrato ({op.itens.length})
          </h3>
          {isMaster && !encerradaOuCancelada && (
            <button
              onClick={() => setModalAddItens(true)}
              className="px-3 py-1.5 bg-white border border-torg-blue-200 text-torg-blue text-xs font-medium rounded-lg hover:bg-torg-blue-50 inline-flex items-center gap-1"
              title="Adicionar mais itens à OP base (ADMIN)"
            >
              <Plus size={14} /> Adicionar itens
            </button>
          )}
        </div>
        <ItensTabela
          itens={op.itens}
          onSolicitarVerba={(item) =>
            setModalVerba({ tipo: "op", itemId: item.id, atual: item.valorVerba, descricao: item.descricao })
          }
          onEditar={(item) => setModalEditarItem({ tipo: "op", item })}
          isMaster={isMaster}
        />
      </div>

      {/* Aditivos */}
      {op.aditivos.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-torg-dark">Aditivos ({op.aditivos.length})</h3>
          {op.aditivos.map((ad) => (
            <div key={ad.id} className="bg-white rounded-xl shadow-sm border border-torg-orange-100 overflow-hidden">
              <div className="px-6 py-4 border-b border-torg-orange-100 bg-torg-orange-50/50">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <h4 className="font-semibold text-torg-orange-700">Aditivo {ad.numero}</h4>
                    <p className="text-sm text-torg-gray">{ad.descricao}</p>
                  </div>
                  <p className="text-xs text-torg-gray">
                    {ad.createdBy?.name} • {fmtData(ad.createdAt)}
                  </p>
                </div>
              </div>
              <ItensTabela
                itens={ad.itens}
                onSolicitarVerba={(item) =>
                  setModalVerba({ tipo: "aditivo", itemId: item.id, atual: item.valorVerba, descricao: item.descricao })
                }
                onEditar={(item) => setModalEditarItem({ tipo: "aditivo", item })}
                isMaster={isMaster}
              />
            </div>
          ))}
        </div>
      )}

      {/* Histórico */}
      {(op.revisoes.length > 0 || op.ajustesPrazo.length > 0) && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
            <History size={18} className="text-torg-blue" />
            <h3 className="text-lg font-semibold text-torg-dark">Histórico</h3>
          </div>
          <ul className="divide-y divide-gray-100">
            {op.revisoes.map((r) => (
              <li key={r.id} className="px-6 py-3 text-sm">
                <p className="text-torg-dark">
                  <span className="font-semibold">Revisão {r.numero}</span> — {r.motivo}
                </p>
                <p className="text-xs text-torg-gray">
                  {r.createdBy?.name} • {fmtData(r.createdAt)}
                </p>
              </li>
            ))}
            {op.ajustesPrazo.map((aj) => (
              <li key={aj.id} className="px-6 py-3 text-sm">
                <p className="text-torg-dark">
                  <span className="font-semibold">Ajuste de prazo</span> — de {fmtData(aj.dataFimAnterior)} para {fmtData(aj.dataFimNova)}: {aj.motivo}
                </p>
                <p className="text-xs text-torg-gray">
                  {aj.createdBy?.name} • {fmtData(aj.createdAt)}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Modais */}
      {modalAditivo && (
        <ModalAditivo opId={op.id} proximoNumero={op.aditivos.length + 1} onClose={() => setModalAditivo(false)} onSaved={() => router.refresh()} />
      )}
      {modalRevisao && (
        <ModalRevisao opId={op.id} proximoNumero={op.revisoes.length + 1} onClose={() => setModalRevisao(false)} onSaved={() => router.refresh()} />
      )}
      {modalPrazo && isMaster && (
        <ModalPrazo opId={op.id} dataAtual={op.dataFimPrevista} onClose={() => setModalPrazo(false)} onSaved={() => router.refresh()} />
      )}
      {modalVerba && (
        <ModalSolicitarVerba
          {...modalVerba}
          onClose={() => setModalVerba(null)}
          onSaved={() => router.refresh()}
        />
      )}
      {modalEditarItem && (
        <ModalEditarItem
          tipo={modalEditarItem.tipo}
          item={modalEditarItem.item}
          onClose={() => setModalEditarItem(null)}
          onSaved={() => { setModalEditarItem(null); router.refresh(); }}
        />
      )}
      {modalAddItens && (
        <ModalAdicionarItens
          opId={op.id}
          onClose={() => setModalAddItens(false)}
          onSaved={() => { setModalAddItens(false); router.refresh(); }}
        />
      )}
      {modalReceita && (
        <ModalReceita
          opId={op.id}
          receita={modalReceita === "nova" ? null : modalReceita}
          onClose={() => setModalReceita(null)}
          onSaved={() => { setModalReceita(null); router.refresh(); }}
        />
      )}
      {modalCliente && (
        <ModalClienteFiscal
          opId={op.id}
          op={op}
          onClose={() => setModalCliente(false)}
          onSaved={() => { setModalCliente(false); router.refresh(); }}
        />
      )}
      {modalEditarOP && (
        <ModalEditarOP
          opId={op.id}
          op={op}
          onClose={() => setModalEditarOP(false)}
          onSaved={() => { setModalEditarOP(false); router.refresh(); }}
        />
      )}
      {modalMedicao && (
        <ModalMedicao
          opId={op.id}
          onClose={() => setModalMedicao(false)}
          onSaved={() => { setModalMedicao(false); router.refresh(); }}
        />
      )}
    </>
  );
}

// Card 'Medicoes' — lista pedidos de venda do Omie vinculados a OP
function MedicoesCard({ medicoes, resumo, receitaBruta, encerrada, syncId, onAdicionar, onSync, onRemover }) {
  const fmtData = (d) => (d ? new Date(d).toLocaleDateString("pt-BR") : "—");

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-lg font-semibold text-torg-dark">
            Medições no Omie ({medicoes.length})
          </h3>
          <p className="text-xs text-torg-gray mt-0.5">
            Pedidos de Venda do Omie vinculados a esta OP. Cada medição traz produtos cotados/faturados.
          </p>
        </div>
        {!encerrada && (
          <button
            onClick={onAdicionar}
            className="px-3 py-1.5 bg-white border border-torg-blue-200 text-torg-blue text-xs font-medium rounded-lg hover:bg-torg-blue-50 inline-flex items-center gap-1"
          >
            <Plus size={14} /> Vincular medição
          </button>
        )}
      </div>

      {/* Resumo */}
      {medicoes.length > 0 && (
        <div className="px-6 py-3 bg-torg-blue-50/30 border-b border-torg-blue-100 grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-[10px] text-torg-gray uppercase tracking-wide">Total medido (bruto)</p>
            <p className="text-lg font-extrabold text-torg-blue tabular-nums">{fmtMoeda(resumo?.totalMedido || 0)}</p>
            <p className="text-[10px] text-torg-gray">{(resumo?.pctMedido || 0).toFixed(1)}% da receita do contrato</p>
          </div>
          <div>
            <p className="text-[10px] text-torg-gray uppercase tracking-wide">Receita do contrato</p>
            <p className="text-lg font-extrabold text-torg-dark tabular-nums">{fmtMoeda(receitaBruta)}</p>
          </div>
          <div>
            <p className="text-[10px] text-torg-gray uppercase tracking-wide">Saldo a medir</p>
            <p className={`text-lg font-extrabold tabular-nums ${
              (resumo?.saldoAMedir || 0) < 0 ? "text-red-600" : "text-torg-dark"
            }`}>
              {fmtMoeda(resumo?.saldoAMedir || 0)}
            </p>
            {(resumo?.saldoAMedir || 0) < 0 && (
              <p className="text-[10px] text-red-600 font-medium">⚠ medido acima do contrato</p>
            )}
          </div>
        </div>
      )}

      {/* Tabela */}
      {medicoes.length === 0 ? (
        <p className="px-6 py-6 text-sm text-torg-gray text-center">
          Nenhuma medição vinculada ainda. Clique em "Vincular medição" e informe o número do Pedido de Venda do Omie.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Pedido</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Descrição</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Data</th>
                <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Itens</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Valor</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {medicoes.map((m) => (
                <tr key={m.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2">
                    <a
                      href={`/api/omie/pedido-compra-pdf/${m.codigoPedidoOmie || m.numeroPedidoOmie}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono font-semibold text-torg-blue hover:underline"
                      title="Abrir no Omie"
                    >
                      {m.numeroPedidoOmie}
                    </a>
                  </td>
                  <td className="px-4 py-2 text-torg-dark text-xs max-w-xs truncate" title={m.descricao || ""}>
                    {m.descricao || "—"}
                  </td>
                  <td className="px-4 py-2 text-torg-gray text-xs">{fmtData(m.data)}</td>
                  <td className="px-4 py-2 text-center text-torg-gray text-xs">{m.qtdItens || 0}</td>
                  <td className="px-4 py-2 text-right text-torg-dark font-medium tabular-nums">
                    {fmtMoeda(m.valorBruto)}
                  </td>
                  <td className="px-4 py-2 text-xs">
                    {m.status ? (
                      <span className={`px-2 py-0.5 rounded-full font-medium ${statusMedicaoClasses(m.etapa)}`}>
                        {m.status}
                      </span>
                    ) : (
                      <span className="text-torg-gray">—</span>
                    )}
                    {m.syncErro && (
                      <p className="text-[10px] text-red-600 mt-1" title={m.syncErro}>⚠ erro no sync</p>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <div className="inline-flex items-center gap-2">
                      <button
                        onClick={() => onSync(m.id)}
                        disabled={syncId === m.id}
                        className="text-xs text-torg-gray hover:text-torg-blue disabled:opacity-50 inline-flex items-center gap-1"
                        title="Sincronizar com o Omie"
                      >
                        {syncId === m.id ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
                        Sync
                      </button>
                      <button
                        onClick={() => onRemover(m.id, m.numeroPedidoOmie)}
                        className="text-xs text-red-600 hover:text-red-700 inline-flex items-center gap-1"
                        title="Desvincular medição"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function statusMedicaoClasses(etapa) {
  const e = String(etapa || "");
  if (e === "60" || e === "80") return "bg-torg-blue text-white"; // Faturado
  if (e === "50") return "bg-torg-blue-100 text-torg-blue-800"; // Faturado parcial
  if (e === "20") return "bg-torg-orange-50 text-torg-orange-700"; // Pre-faturado
  if (e === "70") return "bg-gray-200 text-gray-500 line-through"; // Cancelado
  return "bg-torg-blue-50 text-torg-blue"; // Default (nao faturado)
}

// Modal pra vincular medicao
function ModalMedicao({ opId, onClose, onSaved }) {
  const [numero, setNumero] = useState("");
  const [descricao, setDescricao] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  const submit = async () => {
    setErro("");
    if (!numero.trim()) return setErro("Informe o número do Pedido de Venda no Omie.");
    setSalvando(true);
    try {
      const res = await fetch(`/api/comercial/op/${opId}/medicao`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ numeroPedido: numero.trim(), descricao: descricao.trim() || null }),
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
    <Modal titulo="Vincular medição (Pedido de Venda do Omie)" onClose={onClose}>
      <div className="px-6 py-5 space-y-4">
        {erro && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded px-3 py-2 flex items-start gap-2">
            <AlertCircle size={14} className="mt-0.5" /> <span>{erro}</span>
          </div>
        )}

        <p className="text-xs text-torg-gray">
          Digite o número do Pedido de Venda que você criou no Omie (ex: 1500). O portal busca os
          dados via API: data, valor total, status e quantidade de itens.
        </p>

        <div>
          <label className="block text-sm font-medium text-torg-dark mb-1">Nº do Pedido de Venda no Omie *</label>
          <input
            type="text"
            value={numero}
            onChange={(e) => setNumero(e.target.value.replace(/\D/g, ""))}
            placeholder="Ex: 1500"
            autoFocus
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-torg-blue"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-torg-dark mb-1">Descrição da medição (opcional)</label>
          <input
            type="text"
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder="Ex: Medição 01 — março/2026"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue"
          />
          <p className="text-[10px] text-torg-gray mt-0.5">
            Se vazio, usamos a observação do pedido no Omie.
          </p>
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
          {salvando && <Loader2 size={14} className="animate-spin" />} Buscar e vincular
        </button>
      </div>
    </Modal>
  );
}

// Modal pra editar dados cadastrais da OP (numero, cliente, obra, datas)
function ModalEditarOP({ opId, op, onClose, onSaved }) {
  const fmtDateInput = (d) => (d ? new Date(d).toISOString().slice(0, 10) : "");
  const [form, setForm] = useState({
    numero: op.numero || "",
    cliente: op.cliente || "",
    obra: op.obra || "",
    descricao: op.descricao || "",
    dataInicio: fmtDateInput(op.dataInicio),
    dataFimPrevista: fmtDateInput(op.dataFimPrevista),
  });
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const numeroMudou = form.numero.trim().toUpperCase() !== op.numero;

  const submit = async () => {
    setErro("");
    if (!form.numero.trim()) return setErro("Número da OP é obrigatório.");
    if (!form.cliente.trim()) return setErro("Cliente é obrigatório.");
    if (numeroMudou) {
      const ok = window.confirm(
        `Você está alterando o NÚMERO da OP de ${op.numero} para ${form.numero.trim().toUpperCase()}.\n\n` +
        `RMs, cotações e pedidos vinculados continuam ligados (são por ID, não por número), ` +
        `mas relatórios e referências em texto que mencionam o número antigo precisarão ser ajustados manualmente.\n\n` +
        `Deseja continuar?`
      );
      if (!ok) return;
    }
    setSalvando(true);
    try {
      const res = await fetch(`/api/comercial/op/${opId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          numero: form.numero.trim().toUpperCase(),
          cliente: form.cliente.trim(),
          obra: form.obra.trim() || null,
          descricao: form.descricao.trim() || null,
          dataInicio: form.dataInicio || null,
          dataFimPrevista: form.dataFimPrevista || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao salvar");
      onSaved();
    } catch (e) {
      setErro(e.message);
      setSalvando(false);
    }
  };

  return (
    <Modal titulo="Editar OP" onClose={onClose}>
      <div className="px-6 py-5 space-y-4">
        {erro && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded px-3 py-2 flex items-start gap-2">
            <AlertCircle size={14} className="mt-0.5" /> <span>{erro}</span>
          </div>
        )}

        {numeroMudou && (
          <div className="bg-torg-orange-50 border border-torg-orange-200 text-torg-orange-700 text-xs rounded px-3 py-2 flex items-start gap-2">
            <AlertCircle size={14} className="mt-0.5" />
            <span>
              Você está alterando o número da OP. Isso muda em toda a plataforma —
              relatórios e referências em texto antigos não serão atualizados automaticamente.
            </span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-torg-dark mb-1">Nº OP *</label>
            <input
              type="text" value={form.numero}
              onChange={(e) => set("numero", e.target.value.toUpperCase())}
              placeholder="Ex: T083"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono font-semibold focus:ring-2 focus:ring-torg-blue"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-torg-dark mb-1">Cliente *</label>
            <input
              type="text" value={form.cliente}
              onChange={(e) => set("cliente", e.target.value)}
              placeholder="Ex: JHSF"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-torg-dark mb-1">Obra</label>
          <input
            type="text" value={form.obra}
            onChange={(e) => set("obra", e.target.value)}
            placeholder="Ex: Mezanino Industrial"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-torg-dark mb-1">Descrição</label>
          <textarea
            value={form.descricao}
            onChange={(e) => set("descricao", e.target.value)}
            rows={2}
            placeholder="Escopo geral do contrato"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-torg-dark mb-1">Data de início</label>
            <input
              type="date" value={form.dataInicio}
              onChange={(e) => set("dataInicio", e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-torg-dark mb-1">Data de fim prevista</label>
            <input
              type="date" value={form.dataFimPrevista}
              onChange={(e) => set("dataFimPrevista", e.target.value)}
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
          {salvando && <Loader2 size={14} className="animate-spin" />} Salvar alterações
        </button>
      </div>
    </Modal>
  );
}

// Card 'Faturamento e Dados Fiscais do Cliente'.
// Muda de comportamento conforme a OP tem ou nao itens em FD.
function FaturamentoCard({ op, temFD, totalFD, onEditar }) {
  const dadosPreenchidos = !!(op.clienteRazaoSocial || op.clienteCnpj || op.clienteEndereco);
  const cnpjFmt = (v) => {
    const d = (v || "").replace(/\D/g, "");
    if (d.length !== 14) return v || "—";
    return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12)}`;
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-lg font-semibold text-torg-dark">Faturamento e Dados Fiscais</h3>
          <p className="text-xs text-torg-gray mt-0.5">
            {temFD
              ? "Esta OP tem itens em Faturamento Direto — preencha os dados pra Omie emitir nota correta."
              : "Faturamento padrão pra Torg Metal. Dados do cliente são opcionais aqui."}
          </p>
        </div>
        <button
          onClick={onEditar}
          className="px-3 py-1.5 bg-white border border-torg-blue-200 text-torg-blue text-xs font-medium rounded-lg hover:bg-torg-blue-50 inline-flex items-center gap-1"
        >
          <Pencil size={14} /> Editar dados
        </button>
      </div>

      <div className="px-6 py-5 space-y-4">
        {/* Banner do tipo de faturamento */}
        {temFD ? (
          <div className="bg-torg-orange-50 border border-torg-orange-200 rounded-lg px-4 py-3 flex items-start gap-3">
            <AlertCircle size={18} className="text-torg-orange-700 mt-0.5 flex-shrink-0" />
            <div className="text-sm">
              <p className="font-semibold text-torg-orange-700">
                Considerar faturamento para os dados do CLIENTE
              </p>
              <p className="text-torg-dark mt-0.5">
                Esta OP tem <strong>{fmtMoeda(totalFD || 0)}</strong> em itens marcados como Faturamento Direto (FD).
                A nota fiscal desses itens vai direto pro cliente — preencha os dados cadastrais abaixo
                pra que o Omie consiga emitir a nota correta.
              </p>
            </div>
          </div>
        ) : (
          <div className="bg-torg-blue-50 border border-torg-blue-200 rounded-lg px-4 py-3 flex items-start gap-3">
            <CheckCircle2 size={18} className="text-torg-blue mt-0.5 flex-shrink-0" />
            <div className="text-sm">
              <p className="font-semibold text-torg-blue">
                Faturamento padrão para a TORG METAL
              </p>
              <p className="text-torg-dark mt-0.5">
                Todos os pedidos desta OP serão faturados pra Torg. Os dados do cliente abaixo
                ficam apenas como referência cadastral — não são obrigatórios.
              </p>
            </div>
          </div>
        )}

        {/* Dados do cliente */}
        {!dadosPreenchidos ? (
          <div className="text-center py-6">
            <p className="text-torg-gray text-sm">
              Nenhum dado cadastral do cliente preenchido ainda.
            </p>
            <button
              onClick={onEditar}
              className={`mt-3 inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg ${
                temFD
                  ? "bg-torg-orange text-white hover:bg-torg-orange-700"
                  : "bg-white border border-torg-blue-200 text-torg-blue hover:bg-torg-blue-50"
              }`}
            >
              <Plus size={14} /> {temFD ? "Preencher dados (obrigatório)" : "Preencher dados (opcional)"}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <div>
              <p className="text-xs text-torg-gray">Razão Social</p>
              <p className="text-torg-dark font-medium">{op.clienteRazaoSocial || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-torg-gray">CNPJ</p>
              <p className="text-torg-dark font-mono">{cnpjFmt(op.clienteCnpj)}</p>
            </div>
            <div>
              <p className="text-xs text-torg-gray">Inscrição Estadual</p>
              <p className="text-torg-dark font-mono">{op.clienteIE || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-torg-gray">Endereço</p>
              <p className="text-torg-dark">{op.clienteEndereco || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-torg-gray">Cidade / UF</p>
              <p className="text-torg-dark">
                {op.clienteCidade || "—"}{op.clienteUF ? ` / ${op.clienteUF}` : ""}
              </p>
            </div>
            <div>
              <p className="text-xs text-torg-gray">CEP</p>
              <p className="text-torg-dark font-mono">{op.clienteCep || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-torg-gray">Contato</p>
              <p className="text-torg-dark">{op.clienteContato || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-torg-gray">Email / Telefone</p>
              <p className="text-torg-dark">
                {op.clienteEmail || "—"}{op.clienteTelefone ? ` · ${op.clienteTelefone}` : ""}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Modal pra editar dados fiscais do cliente
function ModalClienteFiscal({ opId, op, onClose, onSaved }) {
  const [form, setForm] = useState({
    clienteRazaoSocial: op.clienteRazaoSocial || "",
    clienteCnpj: op.clienteCnpj || "",
    clienteIE: op.clienteIE || "",
    clienteEndereco: op.clienteEndereco || "",
    clienteCidade: op.clienteCidade || "",
    clienteUF: op.clienteUF || "",
    clienteCep: op.clienteCep || "",
    clienteContato: op.clienteContato || "",
    clienteEmail: op.clienteEmail || "",
    clienteTelefone: op.clienteTelefone || "",
  });
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    setErro("");
    setSalvando(true);
    try {
      const res = await fetch(`/api/comercial/op/${opId}/cliente`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
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
    <Modal titulo="Dados fiscais do cliente" onClose={onClose}>
      <div className="px-6 py-5 space-y-4">
        {erro && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded px-3 py-2 flex items-start gap-2">
            <AlertCircle size={14} className="mt-0.5" /> <span>{erro}</span>
          </div>
        )}

        <p className="text-xs text-torg-gray">
          Necessário pra emissão de nota fiscal direta ao cliente (faturamento direto).
          Pode preencher só o que tiver agora — atualiza depois.
        </p>

        <div>
          <label className="block text-xs font-medium text-torg-dark mb-1">Razão Social</label>
          <input
            type="text" value={form.clienteRazaoSocial}
            onChange={(e) => set("clienteRazaoSocial", e.target.value)}
            placeholder="Ex: Construtora ABC LTDA"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-torg-dark mb-1">CNPJ</label>
            <input
              type="text" value={form.clienteCnpj}
              onChange={(e) => set("clienteCnpj", e.target.value)}
              placeholder="00.000.000/0001-00"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-torg-blue"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-torg-dark mb-1">Inscrição Estadual</label>
            <input
              type="text" value={form.clienteIE}
              onChange={(e) => set("clienteIE", e.target.value)}
              placeholder="Opcional"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-torg-blue"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-torg-dark mb-1">Endereço completo</label>
          <input
            type="text" value={form.clienteEndereco}
            onChange={(e) => set("clienteEndereco", e.target.value)}
            placeholder="Rua, número, complemento, bairro"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue"
          />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <label className="block text-xs font-medium text-torg-dark mb-1">Cidade</label>
            <input
              type="text" value={form.clienteCidade}
              onChange={(e) => set("clienteCidade", e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-torg-dark mb-1">UF</label>
            <input
              type="text" value={form.clienteUF} maxLength={2}
              onChange={(e) => set("clienteUF", e.target.value.toUpperCase())}
              placeholder="SP"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono uppercase focus:ring-2 focus:ring-torg-blue"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-torg-dark mb-1">CEP</label>
            <input
              type="text" value={form.clienteCep}
              onChange={(e) => set("clienteCep", e.target.value)}
              placeholder="00000-000"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-torg-blue"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-torg-dark mb-1">Contato (nome)</label>
            <input
              type="text" value={form.clienteContato}
              onChange={(e) => set("clienteContato", e.target.value)}
              placeholder="Pessoa responsável"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-torg-dark mb-1">Email</label>
            <input
              type="email" value={form.clienteEmail}
              onChange={(e) => set("clienteEmail", e.target.value)}
              placeholder="contato@cliente.com.br"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-torg-dark mb-1">Telefone</label>
            <input
              type="text" value={form.clienteTelefone}
              onChange={(e) => set("clienteTelefone", e.target.value)}
              placeholder="(00) 0000-0000"
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
          {salvando && <Loader2 size={14} className="animate-spin" />} Salvar
        </button>
      </div>
    </Modal>
  );
}

// Tabela das receitas no detalhe da OP
function ReceitasTabela({ receitas, onEditar }) {
  if (!receitas || receitas.length === 0) {
    return (
      <p className="px-6 py-4 text-sm text-torg-gray">
        Nenhuma receita cadastrada. Clique em "Adicionar receita" pra começar.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Categoria</th>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Descrição</th>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">CFOP</th>
            <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Bruto</th>
            <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Impostos</th>
            <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Líquido</th>
            <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Ação</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {receitas.map((r) => {
            const aliqTotal = (r.icmsPct || 0) + (r.ipiPct || 0) + (r.pisPct || 0)
              + (r.cofinsPct || 0) + (r.issPct || 0) + (r.irrfPct || 0) + (r.csllPct || 0);
            const impostosVal = (r.valor || 0) * (aliqTotal / 100);
            const liq = (r.valor || 0) - impostosVal;
            return (
              <tr key={r.id} className="hover:bg-gray-50">
                <td className="px-4 py-2 text-torg-dark text-xs">
                  <span className="font-medium">{labelCategoriaReceita(r.categoria)}</span>
                </td>
                <td className="px-4 py-2 text-torg-dark">{r.descricao}</td>
                <td className="px-4 py-2 text-torg-gray text-xs font-mono">{r.cfop || "—"}</td>
                <td className="px-4 py-2 text-right text-torg-dark font-medium tabular-nums">{fmtMoeda(r.valor)}</td>
                <td className="px-4 py-2 text-right text-torg-orange-700 tabular-nums text-xs">
                  − {fmtMoeda(impostosVal)}
                  <span className="text-[10px] text-torg-gray block">
                    {aliqTotal > 0 ? `${aliqTotal.toFixed(2)}%` : "sem impostos"}
                  </span>
                </td>
                <td className="px-4 py-2 text-right text-torg-blue font-bold tabular-nums">{fmtMoeda(liq)}</td>
                <td className="px-4 py-2 text-right">
                  <button
                    onClick={() => onEditar(r)}
                    className="text-xs text-torg-gray hover:text-torg-dark font-medium inline-flex items-center gap-1"
                  >
                    <Pencil size={12} /> Editar
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const CATEGORIAS_RECEITA = [
  { codigo: "PROJETO", label: "Projeto / Engenharia" },
  { codigo: "FABRICACAO", label: "Fabricação" },
  { codigo: "MONTAGEM", label: "Montagem em campo" },
  { codigo: "MATERIAL", label: "Venda de Material" },
  { codigo: "OUTRO", label: "Outro" },
];

function labelCategoriaReceita(cod) {
  return CATEGORIAS_RECEITA.find((c) => c.codigo === cod)?.label || cod;
}

// CFOPs sugeridos (Brasil)
const CFOPS_SUGERIDOS = [
  { cfop: "5101", label: "Venda mercadoria de produção própria (estado)" },
  { cfop: "6101", label: "Venda mercadoria de produção própria (interestadual)" },
  { cfop: "5117", label: "Venda industrialização sob encomenda (estado)" },
  { cfop: "6117", label: "Venda industrialização sob encomenda (interestadual)" },
  { cfop: "5933", label: "Prestação de serviço tributado pelo ICMS (estado)" },
  { cfop: "6933", label: "Prestação de serviço tributado pelo ICMS (interestadual)" },
  { cfop: "5949", label: "Outras saídas (estado)" },
  { cfop: "6949", label: "Outras saídas (interestadual)" },
];

// Modal de criar/editar receita
function ModalReceita({ opId, receita, onClose, onSaved }) {
  const isEdit = !!receita;
  const [form, setForm] = useState({
    categoria: receita?.categoria || "PROJETO",
    descricao: receita?.descricao || "",
    valor: receita?.valor ?? 0,
    cfop: receita?.cfop || "",
    codigoServico: receita?.codigoServico || "",
    icmsPct: receita?.icmsPct ?? "",
    ipiPct: receita?.ipiPct ?? "",
    pisPct: receita?.pisPct ?? "",
    cofinsPct: receita?.cofinsPct ?? "",
    issPct: receita?.issPct ?? "",
    irrfPct: receita?.irrfPct ?? "",
    csllPct: receita?.csllPct ?? "",
    observacao: receita?.observacao || "",
  });
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  // Calculos em tempo real
  const valorNum = Number(form.valor) || 0;
  const aliquotas = ["icmsPct","ipiPct","pisPct","cofinsPct","issPct","irrfPct","csllPct"];
  const aliqTotal = aliquotas.reduce((s, k) => s + (Number(form[k]) || 0), 0);
  const impostosVal = valorNum * (aliqTotal / 100);
  const liquido = valorNum - impostosVal;

  const submit = async () => {
    setErro("");
    if (!form.descricao.trim()) return setErro("Descrição é obrigatória.");
    if (!valorNum || valorNum <= 0) return setErro("Valor da receita deve ser maior que zero.");
    setSalvando(true);
    try {
      const payload = {
        categoria: form.categoria,
        descricao: form.descricao.trim(),
        valor: valorNum,
        cfop: form.cfop || null,
        codigoServico: form.codigoServico || null,
        icmsPct: form.icmsPct === "" ? null : Number(form.icmsPct),
        ipiPct: form.ipiPct === "" ? null : Number(form.ipiPct),
        pisPct: form.pisPct === "" ? null : Number(form.pisPct),
        cofinsPct: form.cofinsPct === "" ? null : Number(form.cofinsPct),
        issPct: form.issPct === "" ? null : Number(form.issPct),
        irrfPct: form.irrfPct === "" ? null : Number(form.irrfPct),
        csllPct: form.csllPct === "" ? null : Number(form.csllPct),
        observacao: form.observacao || null,
      };
      const res = await fetch(
        isEdit ? `/api/comercial/receita/${receita.id}` : `/api/comercial/op/${opId}/receita`,
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro");
      onSaved();
    } catch (e) {
      setErro(e.message);
      setSalvando(false);
    }
  };

  const excluir = async () => {
    if (!isEdit) return;
    if (!window.confirm(`Excluir essa receita?\n\nValor: ${fmtMoeda(receita.valor)}`)) return;
    setExcluindo(true);
    try {
      const res = await fetch(`/api/comercial/receita/${receita.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro");
      onSaved();
    } catch (e) {
      setErro(e.message);
      setExcluindo(false);
    }
  };

  return (
    <Modal titulo={isEdit ? "Editar receita" : "Adicionar receita"} onClose={onClose}>
      <div className="px-6 py-5 space-y-4">
        {erro && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded px-3 py-2 flex items-start gap-2">
            <AlertCircle size={14} className="mt-0.5" /> <span>{erro}</span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-torg-dark mb-1">Categoria *</label>
            <select
              value={form.categoria}
              onChange={(e) => set("categoria", e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue bg-white"
            >
              {CATEGORIAS_RECEITA.map((c) => (
                <option key={c.codigo} value={c.codigo}>{c.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-torg-dark mb-1">Valor bruto (R$) *</label>
            <input
              type="number" step="0.01" min="0"
              value={form.valor || ""}
              onChange={(e) => set("valor", e.target.value)}
              placeholder="R$ 0,00"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-right tabular-nums focus:ring-2 focus:ring-torg-blue"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-torg-dark mb-1">Descrição *</label>
          <input
            type="text" value={form.descricao}
            onChange={(e) => set("descricao", e.target.value)}
            placeholder="Ex: Projeto executivo de estrutura metálica"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-torg-dark mb-1">CFOP</label>
            <input
              type="text"
              list="cfop-suggest"
              value={form.cfop}
              onChange={(e) => set("cfop", e.target.value)}
              placeholder="Ex: 5101"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-torg-blue"
            />
            <datalist id="cfop-suggest">
              {CFOPS_SUGERIDOS.map((c) => (
                <option key={c.cfop} value={c.cfop}>{c.label}</option>
              ))}
            </datalist>
            <p className="text-[10px] text-torg-gray mt-0.5">Comece a digitar pra ver sugestões</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-torg-dark mb-1">Código de serviço (ISS)</label>
            <input
              type="text" value={form.codigoServico}
              onChange={(e) => set("codigoServico", e.target.value)}
              placeholder="Ex: 7.02 (montagem)"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-torg-blue"
            />
          </div>
        </div>

        {/* Impostos */}
        <div>
          <p className="text-xs font-semibold text-torg-dark mb-2 uppercase tracking-wide">
            Alíquotas tributárias (%)
          </p>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {[
              { key: "icmsPct", label: "ICMS" },
              { key: "ipiPct", label: "IPI" },
              { key: "pisPct", label: "PIS" },
              { key: "cofinsPct", label: "COFINS" },
              { key: "issPct", label: "ISS" },
              { key: "irrfPct", label: "IRRF" },
              { key: "csllPct", label: "CSLL" },
            ].map((imp) => (
              <div key={imp.key}>
                <label className="block text-[11px] font-medium text-torg-gray mb-1">{imp.label}</label>
                <input
                  type="number" step="0.01" min="0" max="100"
                  value={form[imp.key]}
                  onChange={(e) => set(imp.key, e.target.value)}
                  placeholder="0"
                  className="w-full border border-gray-300 rounded px-2 py-1.5 text-xs text-right tabular-nums focus:ring-1 focus:ring-torg-blue"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Resumo de calculo */}
        <div className="bg-torg-blue-50/40 border border-torg-blue-100 rounded-lg p-3 text-sm space-y-1">
          <div className="flex justify-between">
            <span className="text-torg-gray">Bruto:</span>
            <span className="font-medium text-torg-dark tabular-nums">{fmtMoeda(valorNum)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-torg-gray">Impostos ({aliqTotal.toFixed(2)}%):</span>
            <span className="text-torg-orange-700 tabular-nums">− {fmtMoeda(impostosVal)}</span>
          </div>
          <div className="flex justify-between pt-1 border-t border-torg-blue-100">
            <span className="font-semibold text-torg-dark">Líquido:</span>
            <span className="font-bold text-torg-blue tabular-nums">{fmtMoeda(liquido)}</span>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-torg-dark mb-1">Observação</label>
          <textarea
            value={form.observacao}
            onChange={(e) => set("observacao", e.target.value)}
            rows={2}
            placeholder="Opcional"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue"
          />
        </div>
      </div>
      <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-between flex-wrap gap-3">
        {isEdit ? (
          <button
            onClick={excluir}
            disabled={excluindo || salvando}
            className="px-4 py-2 text-red-600 border border-red-200 rounded-lg hover:bg-red-50 text-sm font-medium flex items-center gap-2 disabled:opacity-50"
          >
            {excluindo ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
            Excluir
          </button>
        ) : <span />}
        <div className="flex gap-3">
          <button onClick={onClose} className="px-4 py-2 text-torg-gray border border-gray-300 rounded-lg hover:bg-gray-100 text-sm">
            Cancelar
          </button>
          <button
            onClick={submit}
            disabled={salvando || excluindo}
            className="px-5 py-2 bg-torg-blue text-white rounded-lg hover:bg-torg-blue-700 text-sm font-medium flex items-center gap-2 disabled:opacity-50"
          >
            {salvando && <Loader2 size={14} className="animate-spin" />}
            {isEdit ? "Salvar alterações" : "Adicionar receita"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function detalhesItem(it) {
  if (it.tipo === "ALUGUEL") {
    const partes = [];
    if (it.meses) partes.push(`${it.meses} mes${it.meses !== 1 ? "es" : ""}`);
    if (it.valorPorMes) partes.push(`${fmtMoeda(it.valorPorMes)}/mês`);
    if (it.capacidade) partes.push(it.capacidade);
    return partes.join(" · ") || "—";
  }
  if (it.tipo === "VERBA") return "Verba alocada";
  if (it.qtdContratada) {
    const base = `${it.qtdContratada} ${it.unidade || ""}`.trim();
    if (it.cmcMedio) {
      return `${base} × ${fmtMoeda(it.cmcMedio)}/${it.unidade || "un"}`;
    }
    return base;
  }
  return "—";
}

function localLabel(codigo) {
  if (codigo === "FABRICA") return "Fábrica";
  if (codigo === "TERCEIRO") return "Terceiro";
  return null;
}

function ItensTabela({ itens, onSolicitarVerba, onEditar, isMaster }) {
  if (!itens || itens.length === 0) {
    return <p className="px-6 py-4 text-sm text-torg-gray">Nenhum item.</p>;
  }
  const { materiais, alugueis, outros } = agruparPorGrupo(itens);
  return (
    <div className="space-y-4">
      {materiais.length > 0 && (
        <BlocoItens titulo="Materiais" itens={materiais} onSolicitarVerba={onSolicitarVerba} onEditar={onEditar} isMaster={isMaster} />
      )}
      {alugueis.length > 0 && (
        <BlocoItens titulo="Aluguéis e Equipamentos" itens={alugueis} onSolicitarVerba={onSolicitarVerba} onEditar={onEditar} isMaster={isMaster} aluguel />
      )}
      {outros.length > 0 && (
        <BlocoItens titulo="Outros" itens={outros} onSolicitarVerba={onSolicitarVerba} onEditar={onEditar} isMaster={isMaster} />
      )}
    </div>
  );
}

function BlocoItens({ titulo, itens, onSolicitarVerba, onEditar, isMaster, aluguel }) {
  return (
    <div>
      <p className="px-6 pt-4 text-xs font-semibold text-torg-gray uppercase tracking-wide">{titulo}</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Categoria</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Descrição</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Detalhes</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Local</th>
              <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Verba</th>
              <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Fat. direto</th>
              <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Ação</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {itens.map((it) => {
              const temPendente = (it.solicitacoesVerba || []).length > 0;
              return (
                <tr key={it.id}>
                  <td className="px-4 py-2 text-torg-gray text-xs">{labelCategoria(it.categoria)}</td>
                  <td className="px-4 py-2 text-torg-dark font-medium">{it.descricao}</td>
                  <td className="px-4 py-2 text-torg-gray text-xs">{detalhesItem(it)}</td>
                  <td className="px-4 py-2 text-torg-gray text-xs">{localLabel(it.localEstoque) || "—"}</td>
                  <td className="px-4 py-2 text-right text-torg-dark font-medium tabular-nums">
                    {fmtMoeda(it.valorVerba)}
                    {temPendente && (
                      <p className="text-[10px] text-torg-orange-700 font-medium">⏳ alteração pendente</p>
                    )}
                  </td>
                  <td className="px-4 py-2 text-center">
                    {it.faturamentoDireto && (
                      <span className="text-xs bg-torg-orange-100 text-torg-orange-700 px-2 py-0.5 rounded-full">Direto</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <div className="inline-flex items-center gap-3 justify-end">
                      {isMaster && onEditar && (
                        <button
                          onClick={() => onEditar(it)}
                          className="text-xs text-torg-gray hover:text-torg-dark font-medium inline-flex items-center gap-1"
                          title="Editar item (ADMIN — edição direta)"
                        >
                          <Pencil size={12} /> Editar
                        </button>
                      )}
                      <button
                        onClick={() => onSolicitarVerba(it)}
                        disabled={temPendente}
                        className="text-xs text-torg-blue hover:text-torg-dark font-medium inline-flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
                        title={temPendente ? "Já tem solicitação pendente" : "Solicitar mudança de verba"}
                      >
                        <DollarSign size={12} /> {isMaster ? "Alterar verba" : "Solicitar verba"}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── MODAIS ─────────────────────────────────────────────

function Modal({ titulo, children, onClose }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-auto">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white">
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

function ModalRevisao({ opId, proximoNumero, onClose, onSaved }) {
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  const submit = async () => {
    if (!motivo.trim()) return setErro("Descreva o motivo da revisão.");
    setSalvando(true);
    try {
      const res = await fetch(`/api/comercial/op/${opId}/revisao`, {
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
    <Modal titulo={`Registrar Revisão ${proximoNumero}`} onClose={onClose}>
      <div className="px-6 py-5 space-y-4">
        {erro && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded px-3 py-2 flex items-start gap-2">
            <AlertCircle size={14} className="mt-0.5" /> <span>{erro}</span>
          </div>
        )}
        <p className="text-sm text-torg-gray">
          A revisão registra que houve uma mudança no escopo da OP. Descreva o motivo abaixo. As mudanças nos itens devem ser feitas em seguida.
        </p>
        <div>
          <label className="block text-sm font-medium text-torg-dark mb-1">Motivo da revisão</label>
          <textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={4}
            placeholder="Ex: Cliente solicitou aumento de qtd da viga IPN-200 de 50 para 80 unidades."
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue"
          />
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
          {salvando && <Loader2 size={14} className="animate-spin" />} Registrar
        </button>
      </div>
    </Modal>
  );
}

function ModalPrazo({ opId, dataAtual, onClose, onSaved }) {
  const [novaData, setNovaData] = useState("");
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  const submit = async () => {
    if (!novaData) return setErro("Selecione a nova data fim.");
    if (!motivo.trim()) return setErro("Descreva o motivo do ajuste.");
    setSalvando(true);
    try {
      const res = await fetch(`/api/comercial/op/${opId}/ajuste-prazo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataFimNova: novaData, motivo: motivo.trim() }),
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
    <Modal titulo="Ajustar prazo" onClose={onClose}>
      <div className="px-6 py-5 space-y-4">
        {erro && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded px-3 py-2 flex items-start gap-2">
            <AlertCircle size={14} className="mt-0.5" /> <span>{erro}</span>
          </div>
        )}
        <p className="text-sm text-torg-gray">
          Data atual: <strong>{fmtData(dataAtual)}</strong>
        </p>
        <div>
          <label className="block text-sm font-medium text-torg-dark mb-1">Nova data fim</label>
          <input
            type="date"
            value={novaData}
            onChange={(e) => setNovaData(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-torg-dark mb-1">Motivo do ajuste</label>
          <textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={3}
            placeholder="Ex: Atraso na liberação do cliente."
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue"
          />
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
          {salvando && <Loader2 size={14} className="animate-spin" />} Aplicar
        </button>
      </div>
    </Modal>
  );
}

function ModalSolicitarVerba({ tipo, itemId, atual, descricao, onClose, onSaved }) {
  const [valorProposto, setValorProposto] = useState(atual);
  const [justificativa, setJustificativa] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  const submit = async () => {
    if (!justificativa.trim()) return setErro("Descreva a justificativa.");
    setSalvando(true);
    try {
      const res = await fetch(`/api/comercial/solicitacao-verba`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipoItem: tipo,
          itemId,
          valorAtual: atual,
          valorProposto: Number(valorProposto),
          justificativa: justificativa.trim(),
        }),
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
    <Modal titulo="Solicitar mudança de verba" onClose={onClose}>
      <div className="px-6 py-5 space-y-4">
        {erro && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded px-3 py-2 flex items-start gap-2">
            <AlertCircle size={14} className="mt-0.5" /> <span>{erro}</span>
          </div>
        )}
        <div className="bg-torg-blue-50 border border-torg-blue-100 rounded-lg p-3 text-sm">
          <p className="text-torg-dark font-medium">{descricao}</p>
          <p className="text-torg-gray mt-1">
            Valor atual: <strong className="text-torg-dark">{fmtMoeda(atual)}</strong>
          </p>
        </div>
        <div>
          <label className="block text-sm font-medium text-torg-dark mb-1">Valor proposto (R$)</label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={valorProposto || ""}
            onChange={(e) => setValorProposto(e.target.value)}
            placeholder="R$ 0,00"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue tabular-nums"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-torg-dark mb-1">Justificativa</label>
          <textarea
            value={justificativa}
            onChange={(e) => setJustificativa(e.target.value)}
            rows={3}
            placeholder="Por que essa mudança é necessária?"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue"
          />
        </div>
        <p className="text-xs text-torg-gray">
          A solicitação fica pendente até aprovação do master.
        </p>
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
          {salvando && <Loader2 size={14} className="animate-spin" />} Enviar solicitação
        </button>
      </div>
    </Modal>
  );
}

// Modal de edicao direta de item (so ADMIN). Reusa ItemFormRow + ajustarItem.
function ModalEditarItem({ tipo, item, onClose, onSaved }) {
  const [form, setForm] = useState({
    categoria: item.categoria,
    tipo: item.tipo,
    descricao: item.descricao || "",
    codigoOmie: item.codigoOmie || "",
    localEstoque: item.localEstoque || "",
    unidade: item.unidade || "",
    qtdContratada: item.qtdContratada || 0,
    cmcMedio: item.cmcMedio || 0,
    meses: item.meses || 0,
    valorPorMes: item.valorPorMes || 0,
    capacidade: item.capacidade || "",
    valorVerba: item.valorVerba || 0,
    faturamentoDireto: !!item.faturamentoDireto,
    observacao: item.observacao || "",
  });
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  const submit = async () => {
    setErro("");
    if (!form.descricao.trim()) return setErro("Descrição é obrigatória.");
    setSalvando(true);
    try {
      const endpoint = tipo === "op"
        ? `/api/comercial/op-item/${item.id}`
        : `/api/comercial/aditivo-item/${item.id}`;
      const payload = {
        descricao: form.descricao.trim(),
        codigoOmie: form.codigoOmie || null,
        localEstoque: form.localEstoque || null,
        unidade: form.unidade || null,
        qtdContratada: Number(form.qtdContratada) || null,
        cmcMedio: Number(form.cmcMedio) || null,
        meses: Number(form.meses) || null,
        valorPorMes: Number(form.valorPorMes) || null,
        capacidade: form.capacidade || null,
        valorVerba: Number(form.valorVerba) || 0,
        faturamentoDireto: !!form.faturamentoDireto,
        observacao: form.observacao || null,
      };
      const res = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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
    <Modal titulo="Editar item (ADMIN)" onClose={onClose}>
      <div className="px-2 py-2">
        <div className="bg-torg-orange-50/40 border border-torg-orange-100 rounded px-3 py-2 text-xs text-torg-dark mx-4 mt-2">
          ⚠️ Edição direta de ADMIN — bypass do fluxo de Solicitação de Verba.
          Use só pra correção de erro de digitação. Tudo fica registrado em audit log.
        </div>
        <ItemFormRow
          item={form}
          onChange={setForm}
          onRemove={() => {}}
          canRemove={false}
          compact
        />
        {erro && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded px-3 py-2 flex items-start gap-2 mx-4 mb-2">
            <AlertCircle size={14} className="mt-0.5" /> <span>{erro}</span>
          </div>
        )}
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

// Modal de adicionar itens NOVOS a uma OP existente (ADMIN-only).
// Mesma UX do ModalAditivo mas vai pra OP base, sem criar aditivo.
function ModalAdicionarItens({ opId, onClose, onSaved }) {
  const [itens, setItens] = useState([novoItem()]);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  const updateItem = (i, novo) => setItens((p) => p.map((it, idx) => (idx === i ? novo : it)));
  const addItem = (cat = "MATERIA_PRIMA") => setItens((p) => [...p, novoItem(cat)]);
  const removeItem = (i) => setItens((p) => p.filter((_, idx) => idx !== i));

  const totalVerba = itens.reduce((s, it) => s + (Number(it.valorVerba) || 0), 0);

  const submit = async () => {
    setErro("");
    const validos = itens.filter((it) => it.descricao.trim());
    if (validos.length === 0) return setErro("Adicione pelo menos um item.");
    setSalvando(true);
    try {
      const res = await fetch(`/api/comercial/op/${opId}/itens`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itens: validos.map((it) => ({
            categoria: it.categoria,
            tipo: it.tipo,
            descricao: it.descricao,
            codigoOmie: it.codigoOmie || null,
            localEstoque: it.localEstoque || null,
            unidade: it.unidade || null,
            qtdContratada: Number(it.qtdContratada) || null,
            cmcMedio: Number(it.cmcMedio) || null,
            meses: Number(it.meses) || null,
            valorPorMes: Number(it.valorPorMes) || null,
            capacidade: it.capacidade || null,
            valorVerba: Number(it.valorVerba) || 0,
            faturamentoDireto: !!it.faturamentoDireto,
            observacao: it.observacao || null,
          })),
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
    <Modal titulo="Adicionar itens à OP base" onClose={onClose}>
      <div className="px-6 py-5 space-y-4">
        {erro && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded px-3 py-2 flex items-start gap-2">
            <AlertCircle size={14} className="mt-0.5" /> <span>{erro}</span>
          </div>
        )}

        <div className="bg-torg-orange-50/40 border border-torg-orange-100 rounded px-3 py-2 text-xs text-torg-dark">
          ⚠️ Edição direta de ADMIN — adiciona itens à OP base sem criar aditivo.
          Use só pra completar OPs que esqueceram itens. Tudo registrado em audit log.
        </div>

        <div>
          <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
            <label className="block text-sm font-medium text-torg-dark">Novos itens ({itens.length})</label>
            <div className="flex gap-2">
              <button onClick={() => addItem("MATERIA_PRIMA")} className="text-xs text-torg-blue hover:text-torg-dark font-medium inline-flex items-center gap-1">
                <Plus size={12} /> Material
              </button>
              <button onClick={() => addItem("ALUGUEL_PLATAFORMA")} className="text-xs text-torg-orange-700 hover:text-torg-dark font-medium inline-flex items-center gap-1">
                <Plus size={12} /> Aluguel
              </button>
              <button onClick={() => addItem("OUTRO")} className="text-xs text-torg-gray hover:text-torg-dark font-medium inline-flex items-center gap-1">
                <Plus size={12} /> Outro
              </button>
            </div>
          </div>
          <div className="border border-gray-100 rounded-lg divide-y divide-gray-100">
            {itens.map((it, i) => (
              <ItemFormRow
                key={i}
                item={it}
                onChange={(novo) => updateItem(i, novo)}
                onRemove={() => removeItem(i)}
                canRemove={itens.length > 1}
                compact
              />
            ))}
          </div>
          <div className="mt-2 text-right text-sm">
            <span className="text-torg-gray">Total verba a adicionar: </span>
            <span className="font-bold text-torg-orange-700 tabular-nums">{fmtMoeda(totalVerba)}</span>
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
          {salvando && <Loader2 size={14} className="animate-spin" />} Adicionar {itens.length > 1 ? `${itens.length} itens` : "item"}
        </button>
      </div>
    </Modal>
  );
}

function ModalAditivo({ opId, proximoNumero, onClose, onSaved }) {
  const [descricao, setDescricao] = useState("");
  const [itens, setItens] = useState([novoItem()]);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  const updateItem = (i, novo) => setItens((p) => p.map((it, idx) => (idx === i ? novo : it)));
  const addItem = (cat = "MATERIA_PRIMA") => setItens((p) => [...p, novoItem(cat)]);
  const removeItem = (i) => setItens((p) => p.filter((_, idx) => idx !== i));

  const totalVerba = itens.reduce((s, it) => s + (Number(it.valorVerba) || 0), 0);

  const submit = async () => {
    if (!descricao.trim()) return setErro("Descreva o motivo do aditivo.");
    const validos = itens.filter((it) => it.descricao.trim());
    if (validos.length === 0) return setErro("Adicione pelo menos um item.");

    setSalvando(true);
    try {
      const res = await fetch(`/api/comercial/op/${opId}/aditivo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          descricao: descricao.trim(),
          itens: validos.map((it) => ({
            ...it,
            qtdContratada: Number(it.qtdContratada) || null,
            meses: Number(it.meses) || null,
            valorPorMes: Number(it.valorPorMes) || null,
            valorVerba: Number(it.valorVerba),
          })),
        }),
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
    <Modal titulo={`Novo Aditivo ${proximoNumero}`} onClose={onClose}>
      <div className="px-6 py-5 space-y-4">
        {erro && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded px-3 py-2 flex items-start gap-2">
            <AlertCircle size={14} className="mt-0.5" /> <span>{erro}</span>
          </div>
        )}
        <div>
          <label className="block text-sm font-medium text-torg-dark mb-1">Descrição do aditivo</label>
          <textarea
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            rows={2}
            placeholder="Ex: Aditivo 1 — inclusão de pipe rack adicional."
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
            <label className="block text-sm font-medium text-torg-dark">Itens do aditivo</label>
            <div className="flex gap-2">
              <button onClick={() => addItem("MATERIA_PRIMA")} className="text-xs text-torg-blue hover:text-torg-dark font-medium inline-flex items-center gap-1">
                <Plus size={12} /> Material
              </button>
              <button onClick={() => addItem("ALUGUEL_PLATAFORMA")} className="text-xs text-torg-orange-700 hover:text-torg-dark font-medium inline-flex items-center gap-1">
                <Plus size={12} /> Aluguel
              </button>
              <button onClick={() => addItem("OUTRO")} className="text-xs text-torg-gray hover:text-torg-dark font-medium inline-flex items-center gap-1">
                <Plus size={12} /> Outro
              </button>
            </div>
          </div>
          <div className="border border-gray-100 rounded-lg divide-y divide-gray-100">
            {itens.map((it, i) => (
              <ItemFormRow
                key={i}
                item={it}
                onChange={(novo) => updateItem(i, novo)}
                onRemove={() => removeItem(i)}
                canRemove={itens.length > 1}
                compact
              />
            ))}
          </div>
          <div className="mt-2 text-right text-sm">
            <span className="text-torg-gray">Total verba do aditivo: </span>
            <span className="font-bold text-torg-orange-700 tabular-nums">{fmtMoeda(totalVerba)}</span>
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
          {salvando && <Loader2 size={14} className="animate-spin" />} Criar aditivo
        </button>
      </div>
    </Modal>
  );
}
