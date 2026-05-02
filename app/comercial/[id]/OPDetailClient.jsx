"use client";
import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Calendar, Plus, Edit3, Clock, DollarSign, AlertCircle, Loader2, X,
  CheckCircle2, FileText, History,
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

  const status = calcStatus(op);
  const s = STATUS_LABELS[status];

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
      <div className="bg-white rounded-xl shadow-sm border border-torg-blue-100 p-6">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-3xl font-extrabold text-torg-dark tracking-tight font-mono">
                OP {op.numero}
              </h2>
              <span className={`text-xs px-2 py-1 rounded-full font-medium ${s.className}`}>
                {s.label}
              </span>
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

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-5 pt-5 border-t border-gray-100 text-sm">
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
        </div>

        {/* Ações */}
        <div className="flex flex-wrap gap-2 mt-5 pt-5 border-t border-gray-100">
          <button
            onClick={() => setModalAditivo(true)}
            className="px-4 py-2 bg-torg-blue text-white text-sm rounded-lg hover:bg-torg-blue-700 font-medium flex items-center gap-2"
          >
            <Plus size={16} /> Novo Aditivo
          </button>
          <button
            onClick={() => setModalRevisao(true)}
            className="px-4 py-2 bg-white border border-torg-blue-200 text-torg-blue text-sm rounded-lg hover:bg-torg-blue-50 font-medium flex items-center gap-2"
          >
            <Edit3 size={16} /> Registrar Revisão
          </button>
          {isMaster && (
            <button
              onClick={() => setModalPrazo(true)}
              className="px-4 py-2 bg-white border border-torg-blue-200 text-torg-blue text-sm rounded-lg hover:bg-torg-blue-50 font-medium flex items-center gap-2"
            >
              <Clock size={16} /> Ajustar Prazo
            </button>
          )}
        </div>
      </div>

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

      {/* Itens base */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-torg-dark">
            Itens base do contrato ({op.itens.length})
          </h3>
        </div>
        <ItensTabela
          itens={op.itens}
          onSolicitarVerba={(item) =>
            setModalVerba({ tipo: "op", itemId: item.id, atual: item.valorVerba, descricao: item.descricao })
          }
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
    </>
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

function ItensTabela({ itens, onSolicitarVerba, isMaster }) {
  if (!itens || itens.length === 0) {
    return <p className="px-6 py-4 text-sm text-torg-gray">Nenhum item.</p>;
  }
  const { materiais, alugueis, outros } = agruparPorGrupo(itens);
  return (
    <div className="space-y-4">
      {materiais.length > 0 && (
        <BlocoItens titulo="Materiais" itens={materiais} onSolicitarVerba={onSolicitarVerba} isMaster={isMaster} />
      )}
      {alugueis.length > 0 && (
        <BlocoItens titulo="Aluguéis e Equipamentos" itens={alugueis} onSolicitarVerba={onSolicitarVerba} isMaster={isMaster} aluguel />
      )}
      {outros.length > 0 && (
        <BlocoItens titulo="Outros" itens={outros} onSolicitarVerba={onSolicitarVerba} isMaster={isMaster} />
      )}
    </div>
  );
}

function BlocoItens({ titulo, itens, onSolicitarVerba, isMaster, aluguel }) {
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
                    <button
                      onClick={() => onSolicitarVerba(it)}
                      disabled={temPendente}
                      className="text-xs text-torg-blue hover:text-torg-dark font-medium inline-flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
                      title={temPendente ? "Já tem solicitação pendente" : "Solicitar mudança de verba"}
                    >
                      <DollarSign size={12} /> {isMaster ? "Alterar verba" : "Solicitar verba"}
                    </button>
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
            value={valorProposto}
            onChange={(e) => setValorProposto(e.target.value)}
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
