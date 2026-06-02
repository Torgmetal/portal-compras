"use client";
import { useState } from "react";
import { fmtOP } from "@/lib/utils";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bell, Plus, Trash2, AlertCircle, Loader2, Mail, FileText, Package,
  CheckCircle2, Circle, Filter,
} from "lucide-react";

const EVENTOS = [
  { codigo: "RM_CRIADA", label: "Nova RM criada", descricao: "Quando alguém sobe uma RM nova pra cotação" },
  { codigo: "COTACAO_RESPONDIDA", label: "Fornecedor respondeu cotação", descricao: "Quando um fornecedor envia ou atualiza a proposta dele" },
];

const fmtDataHora = (d) =>
  d ? new Date(d).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";

const fmtRelativa = (d) => {
  if (!d) return "—";
  const agora = new Date();
  const data = new Date(d);
  const diffMs = agora - data;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "agora";
  if (diffMin < 60) return `há ${diffMin} min`;
  const diffHoras = Math.floor(diffMin / 60);
  if (diffHoras < 24) return `há ${diffHoras}h`;
  const diffDias = Math.floor(diffHoras / 24);
  if (diffDias < 7) return `há ${diffDias} dia${diffDias > 1 ? "s" : ""}`;
  return data.toLocaleDateString("pt-BR");
};

export default function NotificacoesClient({
  feedInicial = [],
  inscritosIniciais = [],
  isAdmin = false,
  resendConfigurado = true,
}) {
  const router = useRouter();
  const [aba, setAba] = useState("atividades");
  const [feed, setFeed] = useState(feedInicial);
  const [inscritos, setInscritos] = useState(inscritosIniciais);
  const [modalNovo, setModalNovo] = useState(false);
  const [erro, setErro] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("todos");
  const [filtroLidas, setFiltroLidas] = useState("todas");

  const naoLidas = feed.filter((n) => !n.lida).length;

  // Aplica filtros locais (sem recarregar)
  const feedFiltrado = feed.filter((n) => {
    if (filtroTipo !== "todos" && n.tipo !== filtroTipo) return false;
    if (filtroLidas === "lidas" && !n.lida) return false;
    if (filtroLidas === "naoLidas" && n.lida) return false;
    return true;
  });

  const marcarComoLida = async (notif, lida) => {
    try {
      const res = await fetch(`/api/notificacoes/${notif.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lida }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Erro");
      }
      setFeed((prev) => prev.map((n) =>
        n.id === notif.id ? { ...n, lida, lidaEm: lida ? new Date().toISOString() : null } : n
      ));
    } catch (e) {
      setErro(e.message);
    }
  };

  const marcarTodasLidas = async () => {
    try {
      const res = await fetch("/api/notificacoes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ marcarTodasComoLidas: true }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Erro");
      }
      setFeed((prev) => prev.map((n) =>
        n.lida ? n : { ...n, lida: true, lidaEm: new Date().toISOString() }
      ));
    } catch (e) {
      setErro(e.message);
    }
  };

  const removerNotif = async (notif) => {
    if (!window.confirm("Remover essa notificação do feed?")) return;
    try {
      const res = await fetch(`/api/notificacoes/${notif.id}`, { method: "DELETE" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Erro");
      }
      setFeed((prev) => prev.filter((n) => n.id !== notif.id));
    } catch (e) {
      setErro(e.message);
    }
  };

  // — Inscritos email (aba 2) —
  const toggleAtivo = async (inscrito) => {
    setErro("");
    try {
      const res = await fetch(`/api/admin/notificacoes/${inscrito.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ativo: !inscrito.ativo }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro");
      setInscritos((p) => p.map((i) => (i.id === inscrito.id ? data.inscrito : i)));
    } catch (e) {
      setErro(e.message);
    }
  };

  const removerInscrito = async (inscrito) => {
    if (!window.confirm(`Remover ${inscrito.email} das notificações?`)) return;
    setErro("");
    try {
      const res = await fetch(`/api/admin/notificacoes/${inscrito.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro");
      setInscritos((p) => p.filter((i) => i.id !== inscrito.id));
    } catch (e) {
      setErro(e.message);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-3xl font-extrabold text-torg-dark tracking-tight inline-flex items-center gap-2">
            <Bell size={26} className="text-torg-blue" /> Notificações
          </h2>
          <p className="text-sm text-torg-gray mt-1">
            Atividades recentes do sistema (novas RMs, propostas recebidas) e configuração de e-mails.
          </p>
        </div>
        {aba === "atividades" && naoLidas > 0 && (
          <button
            onClick={marcarTodasLidas}
            className="px-4 py-2 border border-gray-300 text-torg-gray hover:bg-gray-50 text-sm font-medium rounded-lg inline-flex items-center gap-2"
          >
            <CheckCircle2 size={14} /> Marcar todas como lidas
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <div className="flex gap-1">
          <button
            onClick={() => setAba("atividades")}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors inline-flex items-center gap-2 ${
              aba === "atividades"
                ? "border-torg-blue text-torg-blue"
                : "border-transparent text-torg-gray hover:text-torg-dark"
            }`}
          >
            Atividades
            {naoLidas > 0 && (
              <span className="bg-torg-blue text-white text-[10px] px-1.5 py-0.5 rounded-full font-semibold tabular-nums">
                {naoLidas}
              </span>
            )}
          </button>
          {isAdmin && (
            <button
              onClick={() => setAba("emails")}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors inline-flex items-center gap-2 ${
                aba === "emails"
                  ? "border-torg-blue text-torg-blue"
                  : "border-transparent text-torg-gray hover:text-torg-dark"
              }`}
            >
              <Mail size={14} /> E-mails ({inscritos.length})
            </button>
          )}
        </div>
      </div>

      {erro && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2 flex items-start gap-2">
          <AlertCircle size={14} className="mt-0.5" /> <span>{erro}</span>
          <button onClick={() => setErro("")} className="ml-auto text-red-500 hover:text-red-700">×</button>
        </div>
      )}

      {/* ABA ATIVIDADES */}
      {aba === "atividades" && (
        <>
          {/* Filtros */}
          <div className="flex items-center gap-2 flex-wrap text-xs">
            <Filter size={12} className="text-torg-gray" />
            <span className="text-torg-gray">Filtrar:</span>
            <div className="inline-flex rounded-lg border border-gray-300 overflow-hidden">
              {[
                { v: "todos", l: "Todos" },
                { v: "RM_CRIADA", l: "RMs criadas" },
                { v: "COTACAO_RESPONDIDA", l: "Cotações respondidas" },
              ].map((opt) => (
                <button
                  key={opt.v}
                  onClick={() => setFiltroTipo(opt.v)}
                  className={`px-3 py-1.5 ${filtroTipo === opt.v ? "bg-torg-blue text-white" : "bg-white text-torg-gray hover:bg-gray-50"} border-l border-gray-300 first:border-l-0`}
                >
                  {opt.l}
                </button>
              ))}
            </div>
            <div className="inline-flex rounded-lg border border-gray-300 overflow-hidden ml-2">
              {[
                { v: "todas", l: "Todas" },
                { v: "naoLidas", l: "Não lidas" },
                { v: "lidas", l: "Lidas" },
              ].map((opt) => (
                <button
                  key={opt.v}
                  onClick={() => setFiltroLidas(opt.v)}
                  className={`px-3 py-1.5 ${filtroLidas === opt.v ? "bg-torg-blue text-white" : "bg-white text-torg-gray hover:bg-gray-50"} border-l border-gray-300 first:border-l-0`}
                >
                  {opt.l}
                </button>
              ))}
            </div>
          </div>

          {feedFiltrado.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
              <Bell size={48} className="mx-auto text-gray-300 mb-4" />
              <p className="text-torg-gray text-lg">
                {feed.length === 0
                  ? "Nenhuma atividade ainda"
                  : "Nenhuma atividade com esses filtros"}
              </p>
              {feed.length === 0 && (
                <p className="text-xs text-torg-gray mt-2">
                  Quando alguém criar uma RM ou um fornecedor responder uma cotação, aparece aqui.
                </p>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <ul className="divide-y divide-gray-100">
                {feedFiltrado.map((n) => (
                  <NotificacaoLinha
                    key={n.id}
                    notif={n}
                    onMarcar={marcarComoLida}
                    onRemover={removerNotif}
                  />
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {/* ABA E-MAILS */}
      {aba === "emails" && isAdmin && (
        <>
          {!resendConfigurado && (
            <div className="bg-amber-50 border border-amber-300 text-amber-800 text-xs rounded-lg p-3">
              <p className="font-semibold inline-flex items-center gap-2">
                <AlertCircle size={14} /> Resend não configurado
              </p>
              <p className="mt-1">
                Os e-mails abaixo só vão ser enviados quando você configurar a variável <code className="bg-amber-100 px-1 rounded">RESEND_API_KEY</code> no Vercel.
                Por enquanto, as notificações aparecem só aqui no feed.
              </p>
            </div>
          )}

          <div className="flex justify-end">
            <button
              onClick={() => setModalNovo(true)}
              className="px-4 py-2 bg-torg-blue text-white text-sm font-medium rounded-lg hover:bg-torg-blue-700 inline-flex items-center gap-2"
            >
              <Plus size={16} /> Adicionar email
            </button>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            {inscritos.length === 0 ? (
              <div className="p-12 text-center">
                <Mail size={48} className="mx-auto text-gray-300 mb-4" />
                <p className="text-torg-gray text-lg">Nenhum email inscrito</p>
                <p className="text-xs text-torg-gray mt-1">
                  Adicione um email pra começar a receber notificações.
                </p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email / Nome</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Eventos</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {inscritos.map((i) => (
                    <tr key={i.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <p className="text-torg-dark font-medium">{i.email}</p>
                        {i.nome && <p className="text-xs text-torg-gray">{i.nome}</p>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {(i.eventos || []).map((ev) => {
                            const e = EVENTOS.find((x) => x.codigo === ev);
                            return (
                              <span key={ev} className="text-[11px] bg-torg-blue-50 text-torg-blue px-2 py-0.5 rounded-full font-medium" title={e?.descricao || ev}>
                                {e?.label || ev}
                              </span>
                            );
                          })}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => toggleAtivo(i)}
                          className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            i.ativo
                              ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                              : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                          }`}
                        >
                          {i.ativo ? "Ativo" : "Pausado"}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => removerInscrito(i)}
                          className="text-xs text-red-600 hover:text-red-800 font-medium inline-flex items-center gap-1"
                        >
                          <Trash2 size={12} /> Remover
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {modalNovo && (
        <ModalNovo
          eventos={EVENTOS}
          onClose={() => setModalNovo(false)}
          onSaved={(novo) => {
            setInscritos((p) => [novo, ...p.filter((i) => i.id !== novo.id)]);
            setModalNovo(false);
          }}
        />
      )}
    </div>
  );
}

function NotificacaoLinha({ notif, onMarcar, onRemover }) {
  const isRM = notif.tipo === "RM_CRIADA";
  const Icon = isRM ? FileText : Package;
  const corBorda = isRM ? "border-l-torg-blue" : "border-l-torg-orange";
  const corFundo = isRM ? "bg-torg-blue-50" : "bg-torg-orange-50";
  const corIcon = isRM ? "text-torg-blue" : "text-torg-orange";

  return (
    <li className={`flex items-start gap-3 px-4 py-3 border-l-4 ${corBorda} ${notif.lida ? "bg-white" : "bg-amber-50/30"} hover:bg-gray-50`}>
      <button
        onClick={() => onMarcar(notif, !notif.lida)}
        className="mt-1 flex-shrink-0"
        title={notif.lida ? "Marcar como não lida" : "Marcar como lida"}
      >
        {notif.lida ? (
          <Circle size={16} className="text-gray-300 hover:text-torg-blue" />
        ) : (
          <CheckCircle2 size={16} className="text-torg-blue hover:text-emerald-500" />
        )}
      </button>

      <div className={`w-9 h-9 rounded-lg ${corFundo} ${corIcon} flex items-center justify-center flex-shrink-0`}>
        <Icon size={18} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex-1 min-w-0">
            <p className={`text-sm ${notif.lida ? "text-torg-gray" : "text-torg-dark font-semibold"}`}>
              {notif.titulo}
            </p>
            <p className="text-xs text-torg-gray mt-0.5">{notif.mensagem}</p>
            {notif.dados && (
              <NotifMetadados tipo={notif.tipo} dados={notif.dados} />
            )}
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <span className="text-xs text-torg-gray whitespace-nowrap" title={fmtDataHora(notif.createdAt)}>
              {fmtRelativa(notif.createdAt)}
            </span>
            {notif.link && (
              <Link
                href={notif.link}
                onClick={() => !notif.lida && onMarcar(notif, true)}
                className="text-xs bg-torg-blue text-white px-3 py-1 rounded font-medium hover:bg-torg-blue-700 whitespace-nowrap"
              >
                Abrir
              </Link>
            )}
            <button
              onClick={() => onRemover(notif)}
              className="text-gray-400 hover:text-red-600 flex-shrink-0"
              title="Remover"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      </div>
    </li>
  );
}

// Renderiza metadados estruturados de cada tipo (chips)
function NotifMetadados({ tipo, dados }) {
  if (tipo === "RM_CRIADA") {
    return (
      <div className="flex flex-wrap gap-1.5 mt-1.5">
        {dados.tipoRM && (
          <span className="text-[10px] bg-gray-100 text-torg-gray px-1.5 py-0.5 rounded">
            {dados.tipoRM}
          </span>
        )}
        {dados.opNumero && (
          <span className="text-[10px] bg-torg-blue-50 text-torg-blue px-1.5 py-0.5 rounded font-medium">
            {fmtOP(dados.opNumero)}{dados.opCliente ? ` · ${dados.opCliente}` : ""}
          </span>
        )}
        {dados.itensCount != null && (
          <span className="text-[10px] bg-gray-100 text-torg-gray px-1.5 py-0.5 rounded">
            {dados.itensCount} item(s)
          </span>
        )}
      </div>
    );
  }
  if (tipo === "COTACAO_RESPONDIDA") {
    const totalFmt = dados.total != null
      ? Number(dados.total).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
      : null;
    return (
      <div className="flex flex-wrap gap-1.5 mt-1.5">
        {totalFmt && (
          <span className="text-[10px] bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded font-semibold">
            {totalFmt}
          </span>
        )}
        {(dados.rmsNumeros || []).map((r) => (
          <span key={r} className="text-[10px] bg-torg-blue-50 text-torg-blue px-1.5 py-0.5 rounded">
            RM {r}
          </span>
        ))}
        {dados.itens != null && (
          <span className="text-[10px] bg-gray-100 text-torg-gray px-1.5 py-0.5 rounded">
            {dados.itens} item(s)
          </span>
        )}
        {dados.revisao && (
          <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-medium">
            Revisão #{dados.numeroRevisao}
          </span>
        )}
      </div>
    );
  }
  return null;
}

function ModalNovo({ eventos, onClose, onSaved }) {
  const [email, setEmail] = useState("");
  const [nome, setNome] = useState("");
  const [eventosMarcados, setEventosMarcados] = useState(new Set(eventos.map((e) => e.codigo)));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const toggleEvento = (codigo) => {
    setEventosMarcados((p) => {
      const next = new Set(p);
      if (next.has(codigo)) next.delete(codigo);
      else next.add(codigo);
      return next;
    });
  };

  const submit = async () => {
    setErro("");
    if (!email.trim()) return setErro("Email obrigatório.");
    if (eventosMarcados.size === 0) return setErro("Marque ao menos 1 evento.");
    setSalvando(true);
    try {
      const res = await fetch("/api/admin/notificacoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          nome: nome.trim() || null,
          eventos: Array.from(eventosMarcados),
          ativo: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro");
      onSaved(data.inscrito);
    } catch (e) {
      setErro(e.message);
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-torg-dark">Adicionar email pra notificações</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>
        <div className="px-6 py-5 space-y-4">
          {erro && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded px-3 py-2 flex items-start gap-2">
              <AlertCircle size={14} className="mt-0.5" /> <span>{erro}</span>
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-torg-dark mb-1">Email *</label>
            <input
              type="email" value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="vitor@torg.com.br"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-torg-dark mb-1">Nome (opcional)</label>
            <input
              type="text" value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Vitor Costa"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-torg-dark mb-2">Eventos *</label>
            <div className="space-y-2">
              {eventos.map((ev) => (
                <label key={ev.codigo} className="flex items-start gap-2 px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={eventosMarcados.has(ev.codigo)}
                    onChange={() => toggleEvento(ev.codigo)}
                    className="mt-0.5 w-4 h-4 rounded border-gray-300 text-torg-blue focus:ring-torg-blue"
                  />
                  <div>
                    <p className="text-sm font-medium text-torg-dark">{ev.label}</p>
                    <p className="text-xs text-torg-gray">{ev.descricao}</p>
                  </div>
                </label>
              ))}
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
            {salvando && <Loader2 size={14} className="animate-spin" />} Adicionar
          </button>
        </div>
      </div>
    </div>
  );
}
