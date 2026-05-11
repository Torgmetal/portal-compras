"use client";
import { useState, useMemo, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  XCircle, AlertTriangle, Lock, Loader2, AlertCircle, X, FileText,
  CheckCircle2, Mail, Edit2, Settings, Edit3, Trash2, Unlink, Plus,
  Upload, Sparkles,
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

// Variante: item marcado como COTADO mas fornecedor nao deu preço pra ele —
// mostra como "Sem proposta" pro usuario perceber que precisa re-cotar.
const STATUS_SEM_PROPOSTA = { label: "Sem proposta", className: "bg-amber-50 text-amber-700" };

export default function RMComprasClient({ rm, outrasRMs = [], userRole }) {
  const router = useRouter();
  const isAdmin = userRole === "ADMIN";

  const [modalCancelarItem, setModalCancelarItem] = useState(null);
  const [modalEncerrarRM, setModalEncerrarRM] = useState(false);
  const [modalEnviarCot, setModalEnviarCot] = useState(false);
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

  async function excluirRM() {
    if (!window.confirm(
      `EXCLUIR DEFINITIVAMENTE a RM ${rm.numero}?\n\n` +
      `Apaga itens, cotações, envios e anexos.\n` +
      `Não funciona se a RM já gerou pedido no Omie.\n\n` +
      `Essa ação NÃO PODE ser desfeita.`
    )) return;
    setErroExcluir("");
    setExcluindo(true);
    try {
      const res = await fetch(`/api/rm/${rm.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao excluir");
      router.push("/compras");
    } catch (e) {
      setErroExcluir(e.message);
      setExcluindo(false);
    }
  }

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
            onClick={() => { setPreSelecionarMode(null); setModalEnviarCot(true); }}
            disabled={rm.status === "PEDIDO_GERADO" || rm.status === "CANCELADA"}
            className="px-4 py-2 bg-torg-blue text-white text-sm font-medium rounded-lg hover:bg-torg-blue-700 inline-flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Mail size={16} /> Enviar Cotação
          </button>
          {qtdSemPropostaRm > 0 && rm.status !== "PEDIDO_GERADO" && rm.status !== "CANCELADA" && (
            <button
              onClick={() => { setPreSelecionarMode("sem-proposta"); setModalEnviarCot(true); }}
              className="px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 inline-flex items-center gap-2"
              title={`Envia cotação só pros ${qtdSemPropostaRm} itens que ficaram sem proposta`}
            >
              <Mail size={16} /> Re-cotar Sem Proposta ({qtdSemPropostaRm})
            </button>
          )}
          <div className="ml-auto flex gap-2 flex-wrap">
            {rm.opId && rm.status !== "PEDIDO_GERADO" && (
              <button
                onClick={desvincularDaOP}
                disabled={desvinculando}
                className="px-4 py-2 bg-white border border-torg-blue-200 text-torg-blue text-sm font-medium rounded-lg hover:bg-torg-blue-50 inline-flex items-center gap-2 disabled:opacity-50"
              >
                {desvinculando ? <Loader2 size={16} className="animate-spin" /> : <Unlink size={16} />}
                Desvincular da OP
              </button>
            )}
            {podeFecharComoPedido && (
              <button
                onClick={fecharComoPedidoGerado}
                disabled={fechandoComoPedido}
                className="px-4 py-2 bg-torg-blue text-white text-sm font-medium rounded-lg hover:bg-torg-blue-700 inline-flex items-center gap-2 disabled:opacity-50"
                title={itensLeftover > 0
                  ? `Marca RM como Pedido Gerado e cancela ${itensLeftover} item(ns) leftover`
                  : "Marca RM como Pedido Gerado"}
              >
                {fechandoComoPedido ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                Fechar como Pedido Gerado
                {itensLeftover > 0 && <span className="text-[10px] opacity-80">({itensPedidoGerado}+{itensLeftover} cancelar)</span>}
              </button>
            )}
            {podeEncerrar && (
              <button
                onClick={() => setModalEncerrarRM(true)}
                className="px-4 py-2 bg-white border border-torg-orange-200 text-torg-orange-700 text-sm font-medium rounded-lg hover:bg-torg-orange-50 inline-flex items-center gap-2"
              >
                <XCircle size={16} /> Cancelar RM
              </button>
            )}
            {isAdmin && (
              <button
                onClick={excluirRM}
                disabled={excluindo}
                className="px-4 py-2 bg-white border border-red-300 text-red-600 text-sm font-medium rounded-lg hover:bg-red-50 inline-flex items-center gap-2 disabled:opacity-50"
              >
                {excluindo ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                Excluir
              </button>
            )}
          </div>
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
                return (
                  <tr key={it.id} className={it.status === "CANCELADO" ? "opacity-60" : "hover:bg-gray-50"}>
                    <td className="px-3 py-1.5 text-gray-400">{i + 1}</td>
                    <td className="px-3 py-1.5 text-torg-dark font-medium">{it.descricao}</td>
                    <td className="px-3 py-1.5 text-torg-gray text-xs">{it.material || "—"}</td>
                    <td className="px-3 py-1.5 text-right text-torg-gray tabular-nums whitespace-nowrap">{it.qtd} {it.unidade}</td>
                    <td className="px-3 py-1.5 text-right text-torg-gray tabular-nums whitespace-nowrap">{it.peso ? Number(it.peso).toFixed(2) : "—"}</td>
                    <td className="px-3 py-1.5">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap inline-block ${statusItem.className}`}>
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

      {/* Cotações */}
      {rm.cotacoes.length > 0 ? (
        <CotacoesList rm={rm} outrasRMs={outrasRMs} />
      ) : (
        <div className="bg-torg-blue-50/40 border border-torg-blue-100 rounded-lg p-4 text-sm text-torg-dark">
          <p className="font-medium">Nenhuma cotação enviada ainda</p>
          <p className="text-torg-gray text-xs mt-1">
            Use o botão &quot;Enviar Cotação&quot; acima pra solicitar propostas aos fornecedores.
          </p>
        </div>
      )}

      {/* Modais */}
      {modalEnviarCot && (
        <ModalEnviarCotacao
          preSelecionarMode={preSelecionarMode}
          rm={rm}
          outrasRMs={outrasRMs}
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

// ─── CONFIG PEDIDO OMIE (categoria + local de estoque) ──

function ConfigPedidoOmie({ rm }) {
  const router = useRouter();
  const [categoria, setCategoria] = useState(rm.categoriaCompra || "");
  const [local, setLocal] = useState(rm.localEstoque || "");
  const [categoriasOpcoes, setCategoriasOpcoes] = useState([]);
  const [locaisOpcoes, setLocaisOpcoes] = useState([]);
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState("");
  const [erro, setErro] = useState("");

  useEffect(() => {
    setCarregando(true);
    Promise.all([
      fetch("/api/omie/categorias").then((r) => r.json()).catch(() => ({})),
      fetch("/api/omie/locais-estoque").then((r) => r.json()).catch(() => ({})),
    ])
      .then(([dc, dl]) => {
        if (dc?.categorias?.length) setCategoriasOpcoes(dc.categorias);
        if (dl?.locais?.length) setLocaisOpcoes(dl.locais);
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

  const completo = !!categoria && !!local;

  return (
    <div className={`bg-white rounded-xl shadow-sm p-5 border ${
      completo ? "border-torg-blue-100" : "border-torg-orange-200 bg-torg-orange-50/20"
    }`}>
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <h3 className="text-base font-semibold text-torg-dark flex items-center gap-2">
          <Settings size={18} className="text-torg-blue" /> Configuração para pedido Omie
        </h3>
        <div className="text-xs">
          {carregando && <span className="text-torg-gray">carregando opções...</span>}
          {salvando && <span className="text-torg-blue inline-flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> salvando</span>}
          {msg && <span className="text-torg-orange-700 font-medium">✓ {msg}</span>}
          {erro && <span className="text-red-600">{erro}</span>}
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
        <div>
          <label className="block text-xs font-medium text-torg-gray mb-1">Local de Estoque</label>
          {locaisOpcoes.length > 0 ? (
            <select
              value={local}
              onChange={(e) => { setLocal(e.target.value); salvar("localEstoque", e.target.value); }}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue bg-white"
            >
              <option value="">— Selecionar —</option>
              {locaisOpcoes.map((l) => (
                <option key={l.nCodLocal || l.cCodLocal || l.cDescricao} value={l.cCodLocal || l.cDescricao}>
                  {l.cDescricao} {l.cCodLocal ? `(${l.cCodLocal})` : ""}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={local}
              onChange={(e) => setLocal(e.target.value)}
              onBlur={(e) => salvar("localEstoque", e.target.value)}
              placeholder="Código ou descrição"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue"
            />
          )}
        </div>
      </div>
      {!completo && (
        <p className="text-xs text-torg-orange-700 mt-2">
          ⚠ Preencha categoria e local de estoque antes de gerar o pedido — esses campos viajam pro Omie.
        </p>
      )}
    </div>
  );
}

// ─── LISTA DE COTAÇÕES ──────────────────────────────

function CotacoesList({ rm, outrasRMs = [] }) {
  const [modalVincular, setModalVincular] = useState(null); // cotação selecionada
  const [copiado, setCopiado] = useState(null);
  const [modalManual, setModalManual] = useState(null);
  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";

  const corpoEmail = (link, fornecedorNome) => [
    `Olá, ${fornecedorNome},`,
    "",
    `Solicitamos cotação para a Requisição ${rm.numero} (${rm.descricao}).`,
    "",
    "Acesse o link abaixo para visualizar os itens e enviar (ou atualizar) sua proposta:",
    "",
    link,
    "",
    "Atenciosamente,",
    "Torg Metal",
  ].join("\n");

  const abrirEmail = (cot) => {
    const link = `${baseUrl}/fornecedores/c/${cot.token}`;
    const subject = encodeURIComponent(`Solicitação de Cotação — RM ${rm.numero}`);
    const body = encodeURIComponent(corpoEmail(link, cot.fornecedorNome));
    window.location.href = `mailto:${cot.fornecedorEmail}?subject=${subject}&body=${body}`;
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
                <button
                  onClick={() => abrirEmail(c)}
                  className="px-3 py-1.5 text-xs bg-torg-blue text-white rounded-lg hover:bg-torg-blue-700 font-medium inline-flex items-center gap-1"
                  title="Abrir o email no Outlook com mensagem pré-formatada"
                >
                  <Mail size={12} /> {c.recebidaEm ? "Reenviar" : "Enviar email"}
                </button>
              </div>
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
      alert(`✓ ${data.itensCriados} itens adicionados (RMs: ${data.rmsAdicionadas.join(", ")})`);
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
                    <span className="text-[10px] text-torg-gray">OP {r.op.numero}</span>
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
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [arquivoNome, setArquivoNome] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parseInfo, setParseInfo] = useState(null);
  const [autoFilled, setAutoFilled] = useState(new Set());
  const [revisado, setRevisado] = useState(new Set());
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

  const total = linhas.reduce((s, l) => {
    const p = parseFloat(String(l.precoUnit).replace(",", ".")) || 0;
    const q = parseFloat(String(l.qtdCotada).replace(",", ".")) || 0;
    return s + p * q;
  }, 0);

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
                  Anexe o arquivo e a IA preenche os preços automaticamente. Você revisa antes de salvar.
                </p>
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
                    <td colSpan={5} className="px-2 py-2 text-right text-torg-gray">Total bruto:</td>
                    <td className="px-2 py-2 text-right font-bold text-torg-orange-700 tabular-nums">{fmtMoeda(total)}</td>
                  </tr>
                </tfoot>
              </table>
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

function ModalEnviarCotacao({ rm, outrasRMs = [], onClose, onSent, preSelecionarMode = null }) {
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

  const parsearFornecedores = () => {
    const linhas = emailsTexto.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean);
    const fornecedores = [];
    for (const linha of linhas) {
      const m = linha.match(/^(.+?)\s*<(.+?@.+?\..+?)>\s*$/);
      if (m) fornecedores.push({ nome: m[1].trim(), email: m[2].trim() });
      else if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(linha)) fornecedores.push({ nome: linha.split("@")[0], email: linha });
    }
    return fornecedores;
  };

  const submit = async () => {
    setErro("");
    const fornecedores = parsearFornecedores();
    if (fornecedores.length === 0) return setErro("Adicione ao menos 1 fornecedor com email válido.");
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
                        OP {r.op.numero}
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
