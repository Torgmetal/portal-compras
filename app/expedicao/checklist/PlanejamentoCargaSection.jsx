"use client";
import { useState, useMemo } from "react";
import {
  Truck, Plus, Calendar, Package, Wrench, CheckCircle2, Clock,
  AlertTriangle, ChevronDown, ChevronRight, Loader2, X, Search,
  ClipboardList, CircleDot, AlertCircle, ShieldAlert, Ban,
  Pencil, Save, History,
} from "lucide-react";
import { validarProntidaoExpedicao } from "@/lib/expedicao";

const fmtData = (d) => (d ? new Date(d).toLocaleDateString("pt-BR") : "—");
const fmtKg = (v) =>
  v != null ? `${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} kg` : "—";

const STATUS_PLAN = {
  PLANEJADO: { label: "Planejado", cor: "bg-blue-100 text-blue-700", Icon: Clock },
  EM_CARGA: { label: "Em carga", cor: "bg-amber-100 text-amber-700", Icon: Truck },
  CONCLUIDO: { label: "Concluido", cor: "bg-green-100 text-green-700", Icon: CheckCircle2 },
  CANCELADO: { label: "Cancelado", cor: "bg-red-100 text-red-700", Icon: AlertTriangle },
};

const STATUS_ITEM = {
  PLANEJADO: { label: "Planejado", cor: "text-blue-600" },
  CARREGADO: { label: "Carregado", cor: "text-green-600" },
  PARCIAL: { label: "Parcial", cor: "text-amber-600" },
  NAO_ENVIADO: { label: "Nao enviado", cor: "text-red-600" },
  REPROGRAMADO: { label: "Reprogramado", cor: "text-purple-600" },
};

const CATEGORIA_LABEL = {
  PARAFUSOS: "Parafusos",
  TELHAS: "Telhas",
  CALHAS_RUFOS: "Calhas e Rufos",
  STEEL_DECK: "Steel Deck",
  PLACA_WALL: "Placa Wall",
  GRADE_DE_PISO: "Grade de Piso",
  OUTRO: "Outro",
};

export default function PlanejamentoCargaSection({ opId, pecas, acessorios }) {
  const [planejamentos, setPlanejamentos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [erro, setErro] = useState("");
  const [aberta, setAberta] = useState(false);
  const [modalAberto, setModalAberto] = useState(false);
  const [detalhesAberto, setDetalhesAberto] = useState(null);

  // Carrega planejamentos
  const carregarPlanejamentos = async () => {
    setLoading(true);
    setErro("");
    try {
      const r = await fetch(`/api/expedicao/planejamento?opId=${opId}`);
      const data = await r.json();
      if (!data.success) throw new Error(data.error);
      setPlanejamentos(data.planejamentos || []);
      setLoaded(true);
    } catch (e) {
      setErro(e.message || "Erro ao carregar planejamentos.");
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = () => {
    const novoEstado = !aberta;
    setAberta(novoEstado);
    if (novoEstado && !loaded) {
      carregarPlanejamentos();
    }
  };

  const onCriado = (novoPlan) => {
    setPlanejamentos((prev) => [novoPlan, ...prev]);
    setModalAberto(false);
  };

  const ativos = planejamentos.filter((p) => p.status !== "CANCELADO");
  const concluidos = planejamentos.filter((p) => p.status === "CONCLUIDO");

  return (
    <>
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <button
          onClick={handleToggle}
          className="w-full px-5 py-4 flex items-center justify-between hover:bg-gray-50/50 transition-colors"
        >
          <div className="flex items-center gap-3">
            {aberta ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
            <Truck size={18} className="text-torg-blue" />
            <div className="text-left">
              <h4 className="font-semibold text-torg-dark">
                Planejamento de Carga
                {loaded && (
                  <span className="text-sm font-normal text-torg-gray ml-2">
                    ({ativos.length} ativas, {concluidos.length} concluidas)
                  </span>
                )}
              </h4>
              <p className="text-xs text-torg-gray">
                Planeje o que deve ser carregado em cada carga e compare com o romaneio
              </p>
            </div>
          </div>
          {loaded && (
            <div className="flex items-center gap-2">
              <span className="text-xs bg-torg-blue-50 text-torg-blue px-2 py-1 rounded-full font-medium">
                {planejamentos.length} cargas
              </span>
            </div>
          )}
        </button>

        {aberta && (
          <div className="border-t border-gray-100">
            {loading ? (
              <div className="py-8 text-center text-torg-gray">
                <Loader2 size={24} className="animate-spin mx-auto mb-2" />
                <p className="text-sm">Carregando planejamentos...</p>
              </div>
            ) : erro ? (
              <div className="p-4">
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 flex items-start gap-2">
                  <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
                  <span>{erro}</span>
                </div>
                <button
                  onClick={carregarPlanejamentos}
                  className="mt-2 text-sm text-torg-blue hover:underline"
                >
                  Tentar novamente
                </button>
              </div>
            ) : (
              <div className="p-4 space-y-3">
                {/* Botao Nova Carga */}
                <button
                  onClick={() => setModalAberto(true)}
                  className="w-full sm:w-auto bg-torg-blue text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-torg-blue-700 transition-colors flex items-center gap-2"
                >
                  <Plus size={16} /> Nova Carga
                </button>

                {/* Lista de planejamentos */}
                {planejamentos.length === 0 ? (
                  <div className="text-center py-6 text-torg-gray">
                    <ClipboardList size={28} className="mx-auto mb-2 text-gray-300" />
                    <p className="text-sm">Nenhuma carga planejada ainda.</p>
                    <p className="text-xs mt-1">
                      Clique em &quot;Nova Carga&quot; para planejar o que deve ser enviado.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {planejamentos.map((plan) => (
                      <PlanCard
                        key={plan.id}
                        plan={plan}
                        aberto={detalhesAberto === plan.id}
                        onToggle={() => setDetalhesAberto(detalhesAberto === plan.id ? null : plan.id)}
                        onChanged={carregarPlanejamentos}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal Nova Carga */}
      {modalAberto && (
        <NovaCargaModal
          opId={opId}
          pecas={pecas}
          acessorios={acessorios}
          onClose={() => setModalAberto(false)}
          onCriado={onCriado}
        />
      )}
    </>
  );
}

// ─── Card de planejamento individual ─────────────────────────

function PlanCard({ plan, aberto, onToggle, onChanged }) {
  const st = STATUS_PLAN[plan.status] || STATUS_PLAN.PLANEJADO;
  const StIcon = st.Icon;

  const totalItens = plan.itens?.length || 0;
  const naoEnviados = plan.itens?.filter((i) => i.status === "NAO_ENVIADO").length || 0;
  const pesoEstimado = plan.itens?.reduce((s, i) => s + (i.pesoEstimadoKg || 0), 0) || 0;
  const historico = plan.historico || [];
  const podeEditar = plan.status !== "CANCELADO" && plan.status !== "CONCLUIDO";

  const [editando, setEditando] = useState(false);
  const [data, setData] = useState("");
  const [qtds, setQtds] = useState({});
  const [salvando, setSalvando] = useState(false);
  const [erroEdit, setErroEdit] = useState("");
  const [histAberto, setHistAberto] = useState(false);

  function iniciarEdicao(e) {
    e?.stopPropagation();
    setData(new Date(plan.dataPrevista).toISOString().slice(0, 10));
    setQtds(Object.fromEntries((plan.itens || []).map((i) => [i.id, i.qtdPlanejada])));
    setErroEdit("");
    setEditando(true);
  }

  async function salvar() {
    setSalvando(true); setErroEdit("");
    try {
      const body = {};
      const dataOrig = new Date(plan.dataPrevista).toISOString().slice(0, 10);
      if (data && data !== dataOrig) body.dataPrevista = data;
      const itensAlt = (plan.itens || [])
        .filter((it) => qtds[it.id] !== "" && Number(qtds[it.id]) >= 0 && Number(qtds[it.id]) !== Number(it.qtdPlanejada))
        .map((it) => ({ id: it.id, qtdPlanejada: Number(qtds[it.id]) }));
      if (itensAlt.length) body.itens = itensAlt;
      if (Object.keys(body).length === 0) { setEditando(false); return; }
      const r = await fetch(`/api/expedicao/planejamento/${plan.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error || "Erro ao salvar");
      setEditando(false);
      onChanged?.();
    } catch (e) { setErroEdit(e.message); } finally { setSalvando(false); }
  }

  return (
    <div className="border border-gray-100 rounded-lg overflow-hidden">
      <div className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50/50">
        <button onClick={onToggle} className="flex items-center gap-3 text-left flex-1 min-w-0">
          {aberto ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <Calendar size={14} className="text-torg-gray" />
              <span className="text-sm font-medium text-torg-dark">{fmtData(plan.dataPrevista)}</span>
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${st.cor}`}>
                <StIcon size={10} /> {st.label}
              </span>
              {historico.length > 0 && <span className="text-[10px] text-torg-gray">· {historico.length} alteração(ões)</span>}
            </div>
            {plan.descricao && <p className="text-xs text-torg-gray mt-0.5">{plan.descricao}</p>}
          </div>
        </button>
        <div className="flex items-center gap-3 text-xs text-torg-gray">
          <span>{totalItens} itens</span>
          {pesoEstimado > 0 && <span>{fmtKg(pesoEstimado)}</span>}
          {naoEnviados > 0 && (
            <span className="text-red-500 font-medium flex items-center gap-1">
              <AlertTriangle size={12} /> {naoEnviados} nao enviados
            </span>
          )}
          {plan.romaneio && <span className="text-green-600 font-medium">Rom. {plan.romaneio.numero}</span>}
          {podeEditar && !editando && (
            <button onClick={iniciarEdicao} className="text-torg-blue hover:text-torg-dark flex items-center gap-1" title="Editar data / quantidades">
              <Pencil size={12} /> Editar
            </button>
          )}
        </div>
      </div>

      {/* Edição: data + quantidade a expedir por peça */}
      {editando && (
        <div className="border-t border-gray-100 bg-torg-blue-50/30 px-4 py-3 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <label className="text-xs text-torg-gray">Data prevista:</label>
            <input type="date" value={data} onChange={(e) => setData(e.target.value)} className="text-xs border border-gray-300 rounded-lg px-2 py-1.5 focus:border-torg-blue outline-none" />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-white/60"><tr>
                <th className="px-3 py-1.5 text-left text-[10px] font-medium text-gray-400">Item</th>
                <th className="px-3 py-1.5 text-center text-[10px] font-medium text-gray-400">Qtd a expedir</th>
                <th className="px-3 py-1.5 text-right text-[10px] font-medium text-gray-400">Peso</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-50">
                {(plan.itens || []).map((item) => (
                  <tr key={item.id}>
                    <td className="px-3 py-2 text-xs text-torg-dark max-w-[260px] truncate">
                      {item.descricao}{item.pecaConjunto && <span className="font-mono text-torg-blue ml-1">({item.pecaConjunto.marca})</span>}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <input type="number" min={0} step="any" value={qtds[item.id] ?? ""} onChange={(e) => setQtds((q) => ({ ...q, [item.id]: e.target.value }))} className="w-20 text-xs text-center border border-gray-300 rounded px-1.5 py-1 focus:border-torg-blue outline-none" />
                    </td>
                    <td className="px-3 py-2 text-right text-xs">{item.pesoEstimadoKg ? fmtKg(item.pesoEstimadoKg) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {erroEdit && <p className="text-xs text-red-600">{erroEdit}</p>}
          <div className="flex items-center justify-end gap-2">
            <button onClick={() => setEditando(false)} className="text-xs text-torg-gray border border-gray-300 rounded-lg px-3 py-1.5 hover:bg-gray-100">Cancelar</button>
            <button onClick={salvar} disabled={salvando} className="text-xs font-semibold text-white bg-torg-blue rounded-lg px-3 py-1.5 hover:bg-torg-dark disabled:opacity-50 inline-flex items-center gap-1.5">
              {salvando ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Salvar
            </button>
          </div>
        </div>
      )}

      {aberto && !editando && plan.itens && (
        <div className="border-t border-gray-100 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50/60">
              <tr>
                <th className="px-3 py-1.5 text-left text-[10px] font-medium text-gray-400">Tipo</th>
                <th className="px-3 py-1.5 text-left text-[10px] font-medium text-gray-400">Descricao</th>
                <th className="px-3 py-1.5 text-center text-[10px] font-medium text-gray-400">Planejado</th>
                <th className="px-3 py-1.5 text-center text-[10px] font-medium text-gray-400">Carregado</th>
                <th className="px-3 py-1.5 text-right text-[10px] font-medium text-gray-400">Peso</th>
                <th className="px-3 py-1.5 text-center text-[10px] font-medium text-gray-400">Status</th>
                <th className="px-3 py-1.5 text-left text-[10px] font-medium text-gray-400">Motivo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {plan.itens.map((item) => {
                const stItem = STATUS_ITEM[item.status] || STATUS_ITEM.PLANEJADO;
                return (
                  <tr key={item.id} className="hover:bg-gray-50/30">
                    <td className="px-3 py-2">
                      {item.tipo === "PECA" ? (
                        <Package size={14} className="text-teal-500" />
                      ) : (
                        <Wrench size={14} className="text-amber-500" />
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-torg-dark max-w-[200px] truncate">
                      {item.descricao}
                      {item.pecaConjunto && (
                        <span className="font-mono text-torg-blue ml-1">({item.pecaConjunto.marca})</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center text-xs">{item.qtdPlanejada}</td>
                    <td className="px-3 py-2 text-center text-xs font-medium">
                      {item.qtdCarregada > 0 ? (
                        <span className={item.qtdCarregada >= item.qtdPlanejada ? "text-green-600" : "text-amber-600"}>
                          {item.qtdCarregada}
                        </span>
                      ) : (
                        <span className="text-gray-300">0</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right text-xs">{item.pesoEstimadoKg ? fmtKg(item.pesoEstimadoKg) : "—"}</td>
                    <td className="px-3 py-2 text-center">
                      <span className={`text-[10px] font-medium ${stItem.cor}`}>{stItem.label}</span>
                    </td>
                    <td className="px-3 py-2 text-xs text-red-500 max-w-[150px] truncate">
                      {item.motivoNaoEnvio || ""}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Histórico de mudanças */}
      {aberto && !editando && historico.length > 0 && (
        <div className="border-t border-gray-100 px-4 py-2">
          <button onClick={() => setHistAberto(!histAberto)} className="text-[11px] text-torg-gray hover:text-torg-dark inline-flex items-center gap-1">
            <History size={12} /> Histórico de mudanças ({historico.length}) {histAberto ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
          </button>
          {histAberto && (
            <ul className="mt-1.5 space-y-1">
              {historico.map((h) => (
                <li key={h.id} className="text-[11px] text-torg-gray flex items-start gap-1.5">
                  <span className="text-gray-300">•</span>
                  <span><span className="text-torg-dark">{h.descricao}</span> — {h.userName || "—"} · {new Date(h.createdAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Modal Nova Carga ──────────────────────────────────────────

function NovaCargaModal({ opId, pecas, acessorios, onClose, onCriado }) {
  const [dataPrevista, setDataPrevista] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [descricao, setDescricao] = useState("");
  const [selecionados, setSelecionados] = useState(new Set());
  const [buscaItem, setBuscaItem] = useState("");
  const [soProntas, setSoProntas] = useState(false); // mostra só peças prontas (Pintura)
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState("");

  // Monta lista de itens selecionaveis (nao expedidos)
  const itensSelecionaveis = useMemo(() => {
    const lista = [];

    // Pecas nao expedidas
    for (const p of (pecas || [])) {
      if (p.status === "EXPEDIDO") continue;
      // Verifica se toda a qtd ja foi expedida via romaneios
      const qtdJaExpedida = (p.romaneioItens || []).reduce((s, ri) => s + (ri.qtd || 0), 0);
      if (qtdJaExpedida >= (p.qte || 1)) continue; // ja totalmente expedida
      const prontidao = validarProntidaoExpedicao(p.status);
      lista.push({
        key: `peca-${p.id}`,
        tipo: "PECA",
        id: p.id,
        descricao: `${p.marca} — ${p.descricao || "Peca"}`,
        qtd: (p.qte || 1) - qtdJaExpedida,
        pesoKg: p.pesoTotalKg || 0,
        statusProd: p.status,
        marca: p.marca,
        prontidao,
      });
    }

    // Acessorios nao totalmente expedidos
    for (const a of (acessorios || [])) {
      if (a.qtdExpedida >= a.qtdTotal) continue;
      const qtdRestante = a.qtdTotal - a.qtdExpedida;
      lista.push({
        key: `acess-${a.id}`,
        tipo: "ACESSORIO",
        id: a.id,
        descricao: `${a.descricao} (${CATEGORIA_LABEL[a.categoria] || a.categoria})`,
        qtd: qtdRestante,
        pesoKg: a.pesoKg || 0,
        statusCompra: a.statusCompra,
        rmNumero: a.rmNumero,
      });
    }

    return lista;
  }, [pecas, acessorios]);

  // Peças prontas (pós-pintura) = status PINTURA — as mais próximas de expedir.
  const totalProntas = useMemo(
    () => itensSelecionaveis.filter((i) => i.tipo === "PECA" && i.statusProd === "PINTURA").length,
    [itensSelecionaveis]
  );

  // Filtra itens pela busca + toggle "só prontas"
  const itensFiltrados = useMemo(() => {
    let base = itensSelecionaveis;
    if (soProntas) base = base.filter((i) => i.tipo !== "PECA" || i.statusProd === "PINTURA");
    if (!buscaItem.trim()) return base;
    const q = buscaItem.toLowerCase();
    return base.filter((i) => i.descricao.toLowerCase().includes(q));
  }, [itensSelecionaveis, buscaItem, soProntas]);

  const selecionarProntas = () => {
    setSelecionados(new Set(itensSelecionaveis.filter((i) => i.tipo === "PECA" && i.statusProd === "PINTURA").map((i) => i.key)));
  };

  const pecasFiltradas = itensFiltrados.filter((i) => i.tipo === "PECA");
  const acessFiltrados = itensFiltrados.filter((i) => i.tipo === "ACESSORIO");

  const toggleItem = (key) => {
    setSelecionados((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selecionarTodos = () => {
    if (selecionados.size === itensSelecionaveis.length) {
      setSelecionados(new Set());
    } else {
      setSelecionados(new Set(itensSelecionaveis.map((i) => i.key)));
    }
  };

  const pesoTotal = itensSelecionaveis
    .filter((i) => selecionados.has(i.key))
    .reduce((s, i) => s + (i.pesoKg || 0), 0);

  const handleSalvar = async () => {
    if (selecionados.size === 0) {
      setErro("Selecione pelo menos 1 item.");
      return;
    }
    setSaving(true);
    setErro("");

    const itens = itensSelecionaveis
      .filter((i) => selecionados.has(i.key))
      .map((i) => ({
        tipo: i.tipo,
        descricao: i.descricao,
        pecaConjuntoId: i.tipo === "PECA" ? i.id : null,
        rmItemId: i.tipo === "ACESSORIO" ? i.id : null,
        qtdPlanejada: i.qtd,
        pesoEstimadoKg: i.pesoKg || null,
      }));

    try {
      const r = await fetch("/api/expedicao/planejamento", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          opId,
          dataPrevista,
          descricao: descricao.trim() || null,
          itens,
        }),
      });
      const data = await r.json();
      if (!data.success) throw new Error(data.error);
      onCriado(data.planejamento);
    } catch (e) {
      setErro(e.message || "Erro ao criar planejamento.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h3 className="text-lg font-bold text-torg-dark flex items-center gap-2">
              <Truck size={20} className="text-torg-blue" />
              Nova Carga
            </h3>
            <p className="text-xs text-torg-gray mt-0.5">
              Selecione os itens que devem ser carregados nesta carga
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Data + Descricao */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-torg-dark mb-1 block">Data prevista</label>
              <input
                type="date"
                value={dataPrevista}
                onChange={(e) => setDataPrevista(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue focus:border-transparent"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-torg-dark mb-1 block">
                Descricao <span className="text-gray-400">(opcional)</span>
              </label>
              <input
                type="text"
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder="Ex: Carga 1 - Mezanino etapa 1"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue focus:border-transparent"
              />
            </div>
          </div>

          {/* Busca + Selecionar todos */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={buscaItem}
                onChange={(e) => setBuscaItem(e.target.value)}
                placeholder="Buscar itens..."
                className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-torg-blue focus:border-transparent"
              />
            </div>
            <button
              onClick={selecionarTodos}
              className="text-xs text-torg-blue hover:underline whitespace-nowrap"
            >
              {selecionados.size === itensSelecionaveis.length ? "Desmarcar todos" : "Selecionar todos"}
            </button>
          </div>

          {/* Atalho peças prontas (pós-pintura) */}
          <div className="flex items-center gap-3 flex-wrap">
            <label className="flex items-center gap-1.5 text-xs text-torg-dark cursor-pointer select-none">
              <input
                type="checkbox"
                checked={soProntas}
                onChange={(e) => setSoProntas(e.target.checked)}
                className="rounded border-gray-300 text-torg-blue focus:ring-torg-blue"
              />
              Mostrar só peças prontas (pós-pintura)
              <span className="text-torg-gray">· {totalProntas} pronta{totalProntas === 1 ? "" : "s"}</span>
            </label>
            {totalProntas > 0 && (
              <button onClick={selecionarProntas} className="text-xs text-torg-blue hover:underline whitespace-nowrap">
                Selecionar prontas
              </button>
            )}
          </div>

          {/* Resumo da selecao */}
          <div className="bg-torg-blue-50 rounded-lg px-4 py-2 flex items-center justify-between text-sm">
            <span className="text-torg-blue font-medium">
              {selecionados.size} itens selecionados
            </span>
            <span className="text-torg-blue-700 font-medium">{fmtKg(pesoTotal)}</span>
          </div>

          {/* Alertas de prontidao (pecas sem Jato/Pintura) */}
          <AlertasProntidao
            itensSelecionaveis={itensSelecionaveis}
            selecionados={selecionados}
          />

          {/* Lista de pecas */}
          {pecasFiltradas.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-torg-dark uppercase tracking-wider mb-2 flex items-center gap-2">
                <Package size={14} className="text-teal-500" />
                Pecas estruturais ({pecasFiltradas.length})
              </p>
              <div className="space-y-1 max-h-48 overflow-y-auto border border-gray-100 rounded-lg p-2">
                {pecasFiltradas.map((item) => (
                  <ItemCheckbox
                    key={item.key}
                    item={item}
                    checked={selecionados.has(item.key)}
                    onToggle={() => toggleItem(item.key)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Lista de acessorios */}
          {acessFiltrados.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-torg-dark uppercase tracking-wider mb-2 flex items-center gap-2">
                <Wrench size={14} className="text-amber-500" />
                Acessorios ({acessFiltrados.length})
              </p>
              <div className="space-y-1 max-h-48 overflow-y-auto border border-gray-100 rounded-lg p-2">
                {acessFiltrados.map((item) => (
                  <ItemCheckbox
                    key={item.key}
                    item={item}
                    checked={selecionados.has(item.key)}
                    onToggle={() => toggleItem(item.key)}
                  />
                ))}
              </div>
            </div>
          )}

          {itensSelecionaveis.length === 0 && (
            <div className="text-center py-6 text-torg-gray text-sm">
              <CheckCircle2 size={24} className="mx-auto mb-2 text-green-400" />
              Todos os itens ja foram expedidos!
            </div>
          )}

          {erro && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2 flex items-center gap-2">
              <AlertCircle size={14} /> {erro}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-torg-gray hover:text-torg-dark border border-gray-200 rounded-lg"
          >
            Cancelar
          </button>
          <button
            onClick={handleSalvar}
            disabled={saving || selecionados.size === 0}
            className="px-5 py-2 text-sm bg-torg-blue text-white rounded-lg font-medium hover:bg-torg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Truck size={16} />}
            {saving ? "Salvando..." : "Criar Carga"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Alertas de prontidao (banner no modal) ──────────────────────

function AlertasProntidao({ itensSelecionaveis, selecionados }) {
  // Conta pecas selecionadas com problemas
  const pecasSelecionadas = itensSelecionaveis.filter(
    (i) => i.tipo === "PECA" && selecionados.has(i.key) && i.prontidao
  );
  const bloqueios = pecasSelecionadas.filter((i) => i.prontidao.nivel === "BLOQUEIO");
  const atencoes = pecasSelecionadas.filter((i) => i.prontidao.nivel === "ATENCAO");

  if (bloqueios.length === 0 && atencoes.length === 0) return null;

  return (
    <div className="space-y-2">
      {bloqueios.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          <div className="flex items-start gap-2">
            <Ban size={16} className="text-red-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-red-700">
                {bloqueios.length} {bloqueios.length === 1 ? "peca nao passou" : "pecas nao passaram"} por Jato/Pintura
              </p>
              <p className="text-xs text-red-600 mt-0.5">
                NF nao pode ser emitida sem conferencia fisica de que o item esta na carga.
              </p>
              <div className="mt-2 flex flex-wrap gap-1">
                {bloqueios.map((i) => (
                  <span key={i.key} className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-mono">
                    {i.marca} ({i.statusProd})
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {atencoes.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
          <div className="flex items-start gap-2">
            <ShieldAlert size={16} className="text-amber-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-amber-700">
                {atencoes.length} {atencoes.length === 1 ? "peca ainda" : "pecas ainda"} em processo (Jato/Pintura)
              </p>
              <p className="text-xs text-amber-600 mt-0.5">
                Confirme fisicamente que a peca esta pronta antes de incluir na carga.
              </p>
              <div className="mt-2 flex flex-wrap gap-1">
                {atencoes.map((i) => (
                  <span key={i.key} className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-mono">
                    {i.marca} ({i.statusProd})
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Checkbox de item ──────────────────────────────────────────

function ItemCheckbox({ item, checked, onToggle }) {
  const temAlerta = item.prontidao && !item.prontidao.pronta;
  const isBloqueio = item.prontidao?.nivel === "BLOQUEIO";
  const isAtencao = item.prontidao?.nivel === "ATENCAO";

  // Borda colorida quando selecionado e com alerta
  let borderClass = "border border-transparent";
  if (checked && isBloqueio) borderClass = "border border-red-300 bg-red-50";
  else if (checked && isAtencao) borderClass = "border border-amber-300 bg-amber-50";
  else if (checked) borderClass = "border border-torg-blue-200 bg-torg-blue-50";

  return (
    <label
      className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors hover:bg-gray-50 ${borderClass}`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="rounded border-gray-300 text-torg-blue focus:ring-torg-blue"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-xs text-torg-dark truncate">{item.descricao}</p>
          {isBloqueio && (
            <span title={item.prontidao.mensagem}>
              <Ban size={12} className="text-red-500 flex-shrink-0" />
            </span>
          )}
          {isAtencao && (
            <span title={item.prontidao.mensagem}>
              <ShieldAlert size={12} className="text-amber-500 flex-shrink-0" />
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[10px] text-torg-gray">
            Qtd: {item.qtd} {item.pesoKg > 0 && `• ${fmtKg(item.pesoKg)}`}
          </span>
          {item.statusProd && (
            <span className={`text-[10px] px-1 rounded ${
              isBloqueio ? "bg-red-100 text-red-600 font-medium" :
              isAtencao ? "bg-amber-100 text-amber-600 font-medium" :
              "bg-gray-100 text-gray-500"
            }`}>
              {item.statusProd}
            </span>
          )}
          {item.rmNumero && (
            <span className="text-[10px] font-mono text-torg-blue">{item.rmNumero}</span>
          )}
        </div>
        {temAlerta && checked && (
          <p className={`text-[10px] mt-1 ${isBloqueio ? "text-red-500" : "text-amber-500"}`}>
            {item.prontidao.mensagem}
          </p>
        )}
      </div>
    </label>
  );
}
