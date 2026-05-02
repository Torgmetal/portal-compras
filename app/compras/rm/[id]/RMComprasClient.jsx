"use client";
import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  XCircle, AlertTriangle, Lock, Loader2, AlertCircle, X, FileText,
  CheckCircle2, Truck, Mail, Edit2,
} from "lucide-react";
import { labelCategoria } from "@/lib/op-categorias";

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
  PENDENTE:      { label: "Pendente",      className: "bg-torg-blue-50 text-torg-blue" },
  EM_COTACAO:    { label: "Em cotação",    className: "bg-torg-orange-50 text-torg-orange-700" },
  COTADO:        { label: "Cotado",        className: "bg-torg-blue-100 text-torg-blue-800" },
  PEDIDO_GERADO: { label: "Pedido gerado", className: "bg-torg-dark text-white" },
  CANCELADO:     { label: "Cancelado",     className: "bg-gray-200 text-gray-500 line-through" },
};

export default function RMComprasClient({ rm, userRole }) {
  const router = useRouter();
  const isAdmin = userRole === "ADMIN";

  const [modalCancelarItem, setModalCancelarItem] = useState(null);
  const [modalEncerrarRM, setModalEncerrarRM] = useState(false);
  const [modalEnviarCot, setModalEnviarCot] = useState(false);
  const [linksParaEnvio, setLinksParaEnvio] = useState(null);

  const status = STATUS_RM_LABELS[rm.status] || STATUS_RM_LABELS.ABERTA;
  const pesoTotal = rm.itens.reduce((s, it) => s + (Number(it.peso) || 0), 0);

  // Estatísticas dos itens
  const stats = useMemo(() => {
    const counts = { PENDENTE: 0, EM_COTACAO: 0, COTADO: 0, PEDIDO_GERADO: 0, CANCELADO: 0 };
    for (const it of rm.itens) counts[it.status] = (counts[it.status] || 0) + 1;
    return counts;
  }, [rm.itens]);

  const podeEncerrar =
    isAdmin && rm.status !== "PEDIDO_GERADO" && rm.status !== "CANCELADA";

  return (
    <>
      {/* Cabeçalho */}
      <div className="bg-white rounded-xl shadow-sm border border-torg-blue-100 p-6">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-3xl font-extrabold text-torg-dark tracking-tight font-mono">{rm.numero}</h2>
              <span className={`text-xs px-2 py-1 rounded-full font-medium ${status.className}`}>{status.label}</span>
              <span className="text-xs px-2 py-1 rounded-full font-medium bg-torg-blue-50 text-torg-blue">
                {rm.tipoRM === "ENGENHARIA" ? "Engenharia" : "Interna"}
              </span>
            </div>
            <p className="text-torg-dark font-medium mt-1">{rm.descricao}</p>
            {rm.observacao && <p className="text-sm text-torg-gray mt-1">{rm.observacao}</p>}
          </div>
          {rm.op && (
            <div className="text-right text-sm">
              <p className="text-torg-gray">OP de origem</p>
              <p className="text-lg font-bold text-torg-blue font-mono">{rm.op.numero}</p>
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
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-4 pt-4 border-t border-gray-100 text-xs">
          {Object.entries(STATUS_ITEM_LABELS).map(([k, v]) => (
            <div key={k} className={`text-center px-2 py-2 rounded ${v.className}`}>
              <p className="font-medium">{v.label}</p>
              <p className="font-extrabold text-base">{stats[k] || 0}</p>
            </div>
          ))}
        </div>

        {rm.tipoRM === "ENGENHARIA" && rm.categoriasOP?.length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <p className="text-xs text-torg-gray mb-2">Cobre as categorias do escopo</p>
            <div className="flex flex-wrap gap-2">
              {rm.categoriasOP.map((cat) => (
                <span key={cat} className="text-xs px-2 py-1 rounded-full bg-torg-blue text-white font-medium">
                  {labelCategoria(cat)}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Ações */}
        <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-gray-100">
          <button
            onClick={() => setModalEnviarCot(true)}
            disabled={rm.status === "PEDIDO_GERADO" || rm.status === "CANCELADA"}
            className="px-4 py-2 bg-torg-blue text-white text-sm font-medium rounded-lg hover:bg-torg-blue-700 inline-flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Mail size={16} /> Enviar Cotação
          </button>
          <button
            disabled
            className="px-4 py-2 bg-white border border-gray-300 text-torg-gray text-sm font-medium rounded-lg inline-flex items-center gap-2 cursor-not-allowed"
            title="Em construção"
          >
            <Truck size={16} /> Gerar Pedido Omie (em breve)
          </button>
          {podeEncerrar && (
            <button
              onClick={() => setModalEncerrarRM(true)}
              className="ml-auto px-4 py-2 bg-white border border-red-200 text-red-600 text-sm font-medium rounded-lg hover:bg-red-50 inline-flex items-center gap-2"
            >
              <Lock size={16} /> Encerrar RM
            </button>
          )}
        </div>
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
                const statusItem = STATUS_ITEM_LABELS[it.status] || STATUS_ITEM_LABELS.PENDENTE;
                const podeCancelar = (isAdmin || userRole === "COMPRAS") && it.status === "PENDENTE";
                return (
                  <tr key={it.id} className={it.status === "CANCELADO" ? "opacity-60" : "hover:bg-gray-50"}>
                    <td className="px-3 py-1.5 text-gray-400">{i + 1}</td>
                    <td className="px-3 py-1.5 text-torg-dark font-medium">{it.descricao}</td>
                    <td className="px-3 py-1.5 text-torg-gray text-xs">{it.material || "—"}</td>
                    <td className="px-3 py-1.5 text-right text-torg-gray tabular-nums">{it.qtd} {it.unidade}</td>
                    <td className="px-3 py-1.5 text-right text-torg-gray tabular-nums">{it.peso ? Number(it.peso).toFixed(2) : "—"}</td>
                    <td className="px-3 py-1.5">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusItem.className}`}>
                        {statusItem.label}
                      </span>
                      {it.status === "CANCELADO" && it.canceladoMotivo && (
                        <p className="text-[10px] text-torg-gray mt-0.5">Motivo: {it.canceladoMotivo}</p>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      {podeCancelar && (
                        <button
                          onClick={() => setModalCancelarItem(it)}
                          className="text-xs text-red-600 hover:text-red-800 font-medium inline-flex items-center gap-1"
                        >
                          <XCircle size={12} /> Cancelar
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Cotações (placeholder) */}
      {rm.cotacoes.length > 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h3 className="text-lg font-semibold text-torg-dark">Cotações ({rm.cotacoes.length})</h3>
          </div>
          <ul className="divide-y divide-gray-100">
            {rm.cotacoes.map((c) => (
              <li key={c.id} className="px-6 py-3 flex items-center justify-between">
                <div>
                  <p className="text-torg-dark font-medium">{c.fornecedorNome}</p>
                  <p className="text-xs text-torg-gray">{fmtData(c.createdAt)} · status {c.status}</p>
                </div>
                <p className="text-torg-orange-700 font-semibold tabular-nums">{fmtMoeda(c.total)}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="bg-torg-blue-50/40 border border-torg-blue-100 rounded-lg p-4 text-sm text-torg-dark">
          <p className="font-medium">Cotações ainda não disponíveis</p>
          <p className="text-torg-gray text-xs mt-1">
            O fluxo completo de cotação (envio pra fornecedores, lançamento de propostas, geração de pedido Omie) chega na próxima parte do Dia 4.
          </p>
        </div>
      )}

      {/* Modais */}
      {modalEnviarCot && (
        <ModalEnviarCotacao
          rm={rm}
          onClose={() => setModalEnviarCot(false)}
          onSent={(links) => { setModalEnviarCot(false); setLinksParaEnvio(links); router.refresh(); }}
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
      {modalEncerrarRM && (
        <ModalEncerrarRM
          rm={rm}
          onClose={() => setModalEncerrarRM(false)}
          onSaved={() => { router.refresh(); router.push("/compras"); }}
        />
      )}
    </>
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

function ModalEnviarCotacao({ rm, onClose, onSent }) {
  // Aceita re-cotação de itens em qualquer status que ainda não virou pedido / cancelado
  const itensCotaveis = rm.itens.filter(
    (it) => it.status === "PENDENTE" || it.status === "EM_COTACAO" || it.status === "COTADO"
  );
  const [itensSelecionados, setItensSelecionados] = useState(
    new Set(itensCotaveis.map((it) => it.id))
  );
  const [emailsTexto, setEmailsTexto] = useState("");
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
  const marcarTodos = () => setItensSelecionados(new Set(itensCotaveis.map((i) => i.id)));
  const limparTodos = () => setItensSelecionados(new Set());

  const parsearFornecedores = () => {
    // Cada linha: "Nome Fornecedor <email@fornecedor.com>" ou só email
    const linhas = emailsTexto.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean);
    const fornecedores = [];
    for (const linha of linhas) {
      const m = linha.match(/^(.+?)\s*<(.+?@.+?\..+?)>\s*$/);
      if (m) {
        fornecedores.push({ nome: m[1].trim(), email: m[2].trim() });
      } else if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(linha)) {
        fornecedores.push({ nome: linha.split("@")[0], email: linha });
      }
    }
    return fornecedores;
  };

  const submit = async () => {
    setErro("");
    const fornecedores = parsearFornecedores();
    if (fornecedores.length === 0) return setErro("Adicione ao menos 1 fornecedor com email válido.");
    if (itensSelecionados.size === 0) return setErro("Selecione ao menos 1 item.");

    setSalvando(true);
    try {
      const res = await fetch("/api/cotacao/enviar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rmId: rm.id,
          itensIds: Array.from(itensSelecionados),
          fornecedores,
          prazoResposta: prazo || null,
          observacaoExtra: observacao.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro");
      onSent(data.cotacoes);
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

        {/* Itens */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-torg-dark">
              Itens pra cotar ({itensSelecionados.size} de {itensCotaveis.length})
            </label>
            <div className="flex gap-2 text-xs">
              <button onClick={marcarTodos} className="text-torg-blue hover:text-torg-dark font-medium">Todos</button>
              <span className="text-gray-300">·</span>
              <button onClick={limparTodos} className="text-torg-gray hover:text-torg-dark font-medium">Nenhum</button>
            </div>
          </div>
          <div className="border border-gray-200 rounded-lg max-h-[200px] overflow-y-auto divide-y divide-gray-100">
            {itensCotaveis.map((it) => {
              const peso = Number(it.peso) || 0;
              const usaKg = peso > 0;
              const qtdMostrada = usaKg ? `${peso.toFixed(2)} KG` : `${it.qtd} ${it.unidade}`;
              const statusBadge =
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
                  <span className="flex-1 truncate">{it.descricao}</span>
                  {statusBadge && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                      it.status === "COTADO"
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

        {/* Fornecedores */}
        <div>
          <label className="block text-sm font-medium text-torg-dark mb-1">Fornecedores</label>
          <textarea
            value={emailsTexto}
            onChange={(e) => setEmailsTexto(e.target.value)}
            rows={4}
            placeholder={`Soufer <vendas@soufer.com.br>\nGerdau <comercial@gerdau.com.br>\n...ou só email@fornecedor.com`}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-torg-blue"
          />
          <p className="text-xs text-torg-gray mt-1">
            Um por linha. Aceita "Nome &lt;email@&gt;" ou só email. Cada um receberá um link único e privado.
          </p>
        </div>

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
  const [copiado, setCopiado] = useState(null);
  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";

  const corpoEmail = (link) => {
    return [
      "Olá,",
      "",
      `Solicitamos cotação para a Requisição ${rm.numero} (${rm.descricao}).`,
      "",
      `Acesse o link abaixo para visualizar os itens e enviar sua proposta diretamente:`,
      "",
      link,
      "",
      "Atenciosamente,",
      "Torg Metal",
    ].join("\n");
  };

  const abrirEmail = (cot) => {
    const link = `${baseUrl}/fornecedores/c/${cot.token}`;
    const subject = encodeURIComponent(`Solicitação de Cotação — RM ${rm.numero}`);
    const body = encodeURIComponent(corpoEmail(link));
    window.location.href = `mailto:${cot.fornecedorEmail}?subject=${subject}&body=${body}`;
  };

  const copiarLink = async (cot) => {
    const link = `${baseUrl}/fornecedores/c/${cot.token}`;
    await navigator.clipboard.writeText(link);
    setCopiado(cot.id);
    setTimeout(() => setCopiado(null), 2000);
  };

  return (
    <Modal titulo={`Cotações criadas (${links.length})`} onClose={onClose}>
      <div className="px-6 py-5 space-y-3 max-h-[70vh] overflow-y-auto">
        <div className="bg-torg-blue-50 border border-torg-blue-100 rounded-lg p-3 text-sm text-torg-dark">
          <p className="font-medium">✓ Cotações criadas com sucesso</p>
          <p className="text-xs text-torg-gray mt-1">
            Clique em "Abrir email" pra cada fornecedor — vai abrir o Outlook com mensagem pré-formatada
            e o link único de cada um. Você também pode só copiar o link e enviar por WhatsApp/outro canal.
          </p>
        </div>

        <ul className="space-y-2">
          {links.map((cot) => (
            <li key={cot.id} className="border border-gray-200 rounded-lg p-3 flex items-center gap-3 flex-wrap">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-torg-dark">{cot.fornecedorNome}</p>
                <p className="text-xs text-torg-gray truncate">{cot.fornecedorEmail}</p>
                <p className="text-[10px] text-torg-gray font-mono mt-0.5 truncate">
                  /fornecedores/c/{cot.token.slice(0, 8)}...
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => copiarLink(cot)}
                  className="px-3 py-1.5 text-xs bg-white border border-gray-300 text-torg-gray rounded-lg hover:bg-gray-50 font-medium"
                >
                  {copiado === cot.id ? "✓ copiado" : "Copiar link"}
                </button>
                <button
                  onClick={() => abrirEmail(cot)}
                  className="px-3 py-1.5 text-xs bg-torg-blue text-white rounded-lg hover:bg-torg-blue-700 font-medium inline-flex items-center gap-1"
                >
                  <Mail size={12} /> Abrir email
                </button>
              </div>
            </li>
          ))}
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

  const submit = async () => {
    if (!motivo.trim()) return setErro("Descreva o motivo do encerramento.");
    setSalvando(true);
    try {
      const res = await fetch(`/api/rm/${rm.id}/encerrar`, {
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
