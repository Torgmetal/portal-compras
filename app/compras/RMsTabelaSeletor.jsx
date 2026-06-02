"use client";
import { useState, useMemo, useEffect } from "react";
import { fmtOP } from "@/lib/utils";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, AlertCircle, Loader2, Mail, X, FileText, Send, Copy, Check, ExternalLink, CheckCircle2, Truck, Clock, LayoutGrid, List, Plus } from "lucide-react";
import RMRowActions from "@/components/RMRowActions";
import {
  CATEGORIAS_FORNECEDOR_BUILTIN,
  mergeCategorias,
  chipCategoriaFornecedor,
  labelCategoriaFornecedor,
} from "@/lib/fornecedor-categorias";

const STATUS_LABELS = {
  ABERTA:        { label: "Aberta",         className: "bg-torg-blue-50 text-torg-blue" },
  EM_COTACAO:    { label: "Em cotação",     className: "bg-torg-orange-50 text-torg-orange-700" },
  COTADA:        { label: "Cotada",         className: "bg-torg-blue-100 text-torg-blue-800" },
  PEDIDO_GERADO: { label: "Pedido gerado",  className: "bg-torg-dark text-white" },
  CANCELADA:     { label: "Cancelada",      className: "bg-gray-100 text-gray-500" },
};

const TIPO_RM_LABELS = { ENGENHARIA: "Engenharia", INTERNA: "Interna" };
const fmtData = (d) => (d ? new Date(d).toLocaleDateString("pt-BR") : "—");

// Classifica uma RM em uma "categoria de ação" pra os KPI cards e a tabela.
// As categorias sao:
//   - ABERTA          → ainda nao enviou cotacao pra fornecedor
//   - EM_COTACAO      → enviou mas nenhuma proposta recebida ainda
//   - PARCIAL         → recebeu algumas propostas, outras ainda pendentes
//   - PRONTA          → todas propostas recebidas / status COTADA (pronta pra pedido)
function categoriaRM(rm) {
  if (rm.status === "ABERTA") return "ABERTA";
  if (rm.status === "COTADA") return "PRONTA";
  if (rm.status === "EM_COTACAO") {
    return (rm.recebidas || 0) > 0 ? "PARCIAL" : "EM_COTACAO";
  }
  return rm.status;
}

const PRIORIDADE_CAT = { PRONTA: 1, PARCIAL: 2, EM_COTACAO: 3, ABERTA: 4 };

export default function RMsTabelaSeletor({ rms, isAdmin, categoriasCustom = [] }) {
  // Lista mesclada (built-in + custom do banco) — passada por toda a arvore
  const todasCategoriasFornecedor = useMemo(
    () => mergeCategorias(categoriasCustom),
    [categoriasCustom]
  );
  const router = useRouter();
  const [selecionadas, setSelecionadas] = useState(new Set());
  const [modalEnviar, setModalEnviar] = useState(false);
  const [linksGerados, setLinksGerados] = useState(null); // { cotacoes, rmsNumeros }
  // Filtro click-to-filter dos KPI cards. null = todas, ou string com categoria
  const [filtroCat, setFiltroCat] = useState(null);
  // Toggle entre tabela e kanban
  const [viewMode, setViewMode] = useState("tabela"); // "tabela" | "kanban"

  // Só permite cotar RMs que ainda estão em fluxo ativo
  const cotaveis = useMemo(
    () => rms.filter((r) => ["ABERTA", "EM_COTACAO", "COTADA"].includes(r.status)),
    [rms]
  );

  // KPIs agregados por categoria de ação
  const stats = useMemo(() => {
    const acc = { ABERTA: 0, EM_COTACAO: 0, PARCIAL: 0, PRONTA: 0 };
    let atrasadas = 0;
    for (const r of rms) {
      const cat = categoriaRM(r);
      if (acc[cat] != null) acc[cat]++;
      if ((r.atrasadas || 0) > 0) atrasadas++;
    }
    return { ...acc, atrasadas };
  }, [rms]);

  // RMs filtradas pelos KPI cards, ordenadas por prioridade (PRONTA primeiro)
  const rmsExibidas = useMemo(() => {
    const filtrada = filtroCat ? rms.filter((r) => categoriaRM(r) === filtroCat) : rms;
    return [...filtrada].sort((a, b) => {
      const pa = PRIORIDADE_CAT[categoriaRM(a)] || 99;
      const pb = PRIORIDADE_CAT[categoriaRM(b)] || 99;
      if (pa !== pb) return pa - pb;
      // Empate: mais recente primeiro
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [rms, filtroCat]);

  const toggle = (id) => {
    setSelecionadas((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };
  const limpar = () => setSelecionadas(new Set());

  const rmsSelecionadas = useMemo(
    () => rms.filter((r) => selecionadas.has(r.id)),
    [rms, selecionadas]
  );

  return (
    <>
      {/* KPI cards click-to-filter */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <KpiCard
          label="Abertas"
          subtitle="Aguardando envio"
          value={stats.ABERTA}
          color="blue"
          icon={FileText}
          active={filtroCat === "ABERTA"}
          onClick={() => setFiltroCat(filtroCat === "ABERTA" ? null : "ABERTA")}
        />
        <KpiCard
          label="Em cotação"
          subtitle="Aguardando proposta"
          value={stats.EM_COTACAO}
          alerta={stats.atrasadas > 0 ? `${stats.atrasadas} atrasada(s)` : null}
          color="orange"
          icon={Clock}
          active={filtroCat === "EM_COTACAO"}
          onClick={() => setFiltroCat(filtroCat === "EM_COTACAO" ? null : "EM_COTACAO")}
        />
        <KpiCard
          label="Recebida parcial"
          subtitle="Algumas propostas vieram"
          value={stats.PARCIAL}
          color="emerald"
          icon={Mail}
          active={filtroCat === "PARCIAL"}
          onClick={() => setFiltroCat(filtroCat === "PARCIAL" ? null : "PARCIAL")}
        />
        <KpiCard
          label="Pronta pra pedido"
          subtitle="Fechar no Omie"
          value={stats.PRONTA}
          color="torg-blue"
          icon={Truck}
          highlight
          active={filtroCat === "PRONTA"}
          onClick={() => setFiltroCat(filtroCat === "PRONTA" ? null : "PRONTA")}
        />
      </div>

      {/* Toggle de visualizacao + filtro ativo */}
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div className="flex items-center gap-2 text-xs">
          {filtroCat && (
            <button
              onClick={() => setFiltroCat(null)}
              className="text-torg-blue font-medium hover:underline inline-flex items-center gap-1"
            >
              <X size={12} /> Limpar filtro
            </button>
          )}
          <span className="text-torg-gray">
            Mostrando {rmsExibidas.length} de {rms.length} RM{rms.length !== 1 ? "s" : ""}
          </span>
        </div>
        <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden">
          <button
            onClick={() => setViewMode("tabela")}
            className={`px-3 py-1.5 text-xs font-medium inline-flex items-center gap-1 ${
              viewMode === "tabela" ? "bg-torg-blue text-white" : "bg-white text-torg-gray hover:bg-gray-50"
            }`}
          >
            <List size={14} /> Tabela
          </button>
          <button
            onClick={() => setViewMode("kanban")}
            className={`px-3 py-1.5 text-xs font-medium inline-flex items-center gap-1 border-l border-gray-200 ${
              viewMode === "kanban" ? "bg-torg-blue text-white" : "bg-white text-torg-gray hover:bg-gray-50"
            }`}
          >
            <LayoutGrid size={14} /> Kanban
          </button>
        </div>
      </div>
      {/* Action bar — aparece quando 1+ RM selecionada */}
      {selecionadas.size > 0 && (
        <div className="bg-torg-blue text-white rounded-xl shadow-md px-4 py-3 flex items-center justify-between flex-wrap gap-3 sticky top-2 z-10">
          <div className="flex items-center gap-3">
            <span className="font-semibold">
              {selecionadas.size} RM{selecionadas.size !== 1 ? "s" : ""} selecionada{selecionadas.size !== 1 ? "s" : ""}
            </span>
            <span className="text-xs text-white/80">
              ({rmsSelecionadas.reduce((s, r) => s + (r._count?.itens || 0), 0)} itens no total)
            </span>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={limpar}
              className="px-3 py-1.5 text-xs bg-white/10 hover:bg-white/20 rounded-lg font-medium"
            >
              Limpar
            </button>
            <button
              onClick={() => setModalEnviar(true)}
              className="px-3 py-1.5 text-xs bg-white text-torg-blue rounded-lg hover:bg-torg-blue-50 font-semibold inline-flex items-center gap-1"
            >
              <Mail size={14} /> Enviar cotação consolidada
            </button>
          </div>
        </div>
      )}

      {viewMode === "kanban" ? (
        <KanbanView rms={rmsExibidas} isAdmin={isAdmin} />
      ) : (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-3 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={cotaveis.length > 0 && selecionadas.size === cotaveis.length}
                    onChange={(e) => {
                      if (e.target.checked) setSelecionadas(new Set(cotaveis.map((r) => r.id)));
                      else limpar();
                    }}
                    className="w-4 h-4 rounded border-gray-300 text-torg-blue focus:ring-torg-blue"
                    title="Selecionar todas as RMs ativas"
                  />
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Nº RM</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Tipo</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">OP / Cliente</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Descrição</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Solicitante</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Itens</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Cot.</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Data</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-3 py-3 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rmsExibidas.map((rm) => {
                const s = STATUS_LABELS[rm.status] || STATUS_LABELS.ABERTA;
                const cat = categoriaRM(rm);
                const pedidoCount = (rm.itens || []).filter((i) => i.status === "PEDIDO_GERADO").length;
                const pendentes = (rm.itens || []).filter((i) => i.status === "PENDENTE").length;
                const podeSelecionar = ["ABERTA", "EM_COTACAO", "COTADA"].includes(rm.status);
                const checked = selecionadas.has(rm.id);
                // Fundo sutil por categoria — destaca PRONTA (azul) e PARCIAL (verde)
                const bgRow =
                  cat === "PRONTA" ? "bg-torg-blue-50/40 hover:bg-torg-blue-50/60" :
                  cat === "PARCIAL" ? "bg-emerald-50/40 hover:bg-emerald-50/60" :
                  cat === "EM_COTACAO" ? "bg-amber-50/20 hover:bg-amber-50/40" :
                  "hover:bg-gray-50";
                return (
                  <tr key={rm.id} className={`${bgRow} ${checked ? "ring-2 ring-torg-blue ring-inset" : ""}`}>
                    <td className="px-3 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={!podeSelecionar}
                        onChange={() => toggle(rm.id)}
                        className="w-4 h-4 rounded border-gray-300 text-torg-blue focus:ring-torg-blue disabled:opacity-30"
                        title={podeSelecionar ? "Selecionar pra cotação consolidada" : "RM não está em fluxo ativo"}
                      />
                    </td>
                    <td className="px-6 py-3 whitespace-nowrap">
                      <Link href={`/compras/rm/${rm.id}`} className="font-mono font-semibold text-torg-blue hover:underline whitespace-nowrap">
                        {rm.numero}
                      </Link>
                    </td>
                    <td className="px-6 py-3 text-xs text-torg-gray">{TIPO_RM_LABELS[rm.tipoRM]}</td>
                    <td className="px-6 py-3 text-torg-dark whitespace-nowrap">
                      {rm.op ? (
                        <>
                          <span className="font-mono text-xs">{fmtOP(rm.op.numero)}</span>
                          <span className="text-xs text-torg-gray block">{rm.op.cliente}</span>
                        </>
                      ) : (
                        <span className="text-torg-gray text-xs">—</span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-torg-dark max-w-xs truncate">{rm.descricao}</td>
                    <td className="px-6 py-3 text-torg-gray text-xs">
                      {rm.createdBy?.name}
                      {rm.setor && <span className="block text-[10px]">{rm.setor}</span>}
                    </td>
                    <td className="px-6 py-3 text-center text-xs">
                      {pedidoCount > 0 ? (
                        <span>
                          <strong>{pedidoCount}</strong> / {rm._count.itens}
                          {pendentes > 0 && <AlertTriangle size={12} className="inline ml-1 text-torg-orange-700" />}
                        </span>
                      ) : (
                        rm._count.itens
                      )}
                    </td>
                    <td className="px-6 py-3 text-center text-torg-gray">{rm._count.cotacoes}</td>
                    <td className="px-6 py-3 text-torg-gray text-xs">{fmtData(rm.createdAt)}</td>
                    <td className="px-6 py-3">
                      <div className="flex flex-col gap-0.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap inline-block w-fit ${s.className}`}>
                          {s.label}
                        </span>
                        {(rm.recebidas > 0 || rm.pendentes > 0) && (
                          <span className="text-[10px] text-torg-gray whitespace-nowrap">
                            {rm.recebidas}/{rm.recebidas + rm.pendentes} recebida{(rm.recebidas + rm.pendentes) !== 1 ? "s" : ""}
                          </span>
                        )}
                        {rm.atrasadas > 0 && (
                          <span className="text-[10px] text-red-600 font-semibold whitespace-nowrap inline-flex items-center gap-0.5">
                            🔴 {rm.atrasadas} atrasada{rm.atrasadas !== 1 ? "s" : ""}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <RMRowActions rmId={rm.id} numero={rm.numero} status={rm.status} isAdmin={isAdmin} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {modalEnviar && (
        <ModalEnviarConsolidada
          rms={rmsSelecionadas}
          categoriasFornecedor={todasCategoriasFornecedor}
          onClose={() => setModalEnviar(false)}
          onSent={(payload) => {
            setModalEnviar(false);
            setLinksGerados(payload);
            limpar();
            router.refresh();
          }}
        />
      )}
      {linksGerados && (
        <ModalLinksGerados
          payload={linksGerados}
          onClose={() => setLinksGerados(null)}
        />
      )}
    </>
  );
}

// Copia HTML via clipboard event handler + execCommand.
function copyHtmlSync(html, text) {
  let ok = false;
  let container = null;
  let listener = null;
  try {
    listener = (e) => {
      try {
        e.clipboardData.setData("text/html", html);
        e.clipboardData.setData("text/plain", text || html.replace(/<[^>]+>/g, ""));
        e.preventDefault();
      } catch {}
    };
    document.addEventListener("copy", listener);

    container = document.createElement("div");
    container.setAttribute("contenteditable", "true");
    container.innerHTML = html;
    container.style.position = "fixed";
    container.style.left = "0";
    container.style.top = "0";
    container.style.width = "2px";
    container.style.height = "2px";
    container.style.opacity = "0.01";
    container.style.zIndex = "-1";
    container.style.overflow = "hidden";
    document.body.appendChild(container);
    const range = document.createRange();
    range.selectNodeContents(container);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    ok = document.execCommand("copy");
    sel.removeAllRanges();
  } catch {
    ok = false;
  } finally {
    if (listener) document.removeEventListener("copy", listener);
    if (container && container.parentNode) container.parentNode.removeChild(container);
  }
  return ok;
}

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

function enviarEmailComCache(cachedData) {
  if (!cachedData) throw new Error("Email ainda nao foi carregado");
  const copiouHtml = copyHtmlSync(cachedData.html, cachedData.text);
  setTimeout(() => abrirOutlookMailto(cachedData.to, cachedData.subject), 300);
  return { copiouHtml };
}

function reCopiarEmail(cachedData) {
  if (!cachedData) return false;
  return copyHtmlSync(cachedData.html, cachedData.text);
}

// Modal mostrando os links únicos gerados pra cada fornecedor (após envio)
function ModalLinksGerados({ payload, onClose }) {
  const cotacoes = payload?.cotacoes || [];
  const rmsNumeros = payload?.rmsNumeros || [];
  const [copiado, setCopiado] = useState(null);
  const [emailToast, setEmailToast] = useState(null);
  const [emailsCache, setEmailsCache] = useState({});
  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";

  const linkOf = (cot) => `${baseUrl}/fornecedores/c/${cot.token}`;

  // Pre-fetch dos emails de cada cotacao do payload
  useEffect(() => {
    cotacoes.forEach((cot) => {
      if (emailsCache[cot.id]) return;
      fetch(`/api/cotacao/${cot.id}/preview-email?format=json`)
        .then((r) => r.ok ? r.json() : null)
        .then((d) => d && setEmailsCache((prev) => ({ ...prev, [cot.id]: d })))
        .catch(() => {});
    });
  }, [cotacoes]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleEnviarEmail = (cot) => {
    setEmailToast(null);
    const cached = emailsCache[cot.id];
    if (!cached) {
      setEmailToast({ id: cot.id, ok: false, msg: "Aguarde o email carregar e tente de novo." });
      return;
    }
    try {
      const r = enviarEmailComCache(cached);
      setEmailToast({
        id: cot.id,
        ok: true,
        msg: r.copiouHtml ? "Email copiado. Cole no Outlook (Ctrl+V) e envie." : "Outlook aberto. Cole manualmente.",
      });
      setTimeout(() => setEmailToast(null), 8000);
    } catch (e) {
      setEmailToast({ id: cot.id, ok: false, msg: e.message });
    }
  };

  const copiarLink = async (cot) => {
    try {
      await navigator.clipboard.writeText(linkOf(cot));
      setCopiado(cot.id);
      setTimeout(() => setCopiado(null), 2000);
    } catch {
      // fallback
      const ta = document.createElement("textarea");
      ta.value = linkOf(cot);
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); setCopiado(cot.id); setTimeout(() => setCopiado(null), 2000); } catch {}
      document.body.removeChild(ta);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-auto">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10">
          <div>
            <h3 className="text-lg font-semibold text-torg-dark inline-flex items-center gap-2">
              <CheckCircle2 size={18} className="text-torg-blue" />
              {cotacoes.length} cotação{cotacoes.length !== 1 ? "ões" : ""} criada{cotacoes.length !== 1 ? "s" : ""}
            </h3>
            <p className="text-xs text-torg-gray mt-0.5">
              RMs incluídas: {rmsNumeros.join(", ")}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <div className="px-6 py-5 space-y-3">
          <div className="bg-torg-blue-50/40 border border-torg-blue-100 rounded-lg p-3 text-xs text-torg-dark">
            💡 Cada fornecedor abaixo recebe um link <strong>único</strong> e <strong>privado</strong>.
            Copie o link ou clique em &quot;Email&quot; pra abrir o Outlook com mensagem pré-pronta.
          </div>

          {cotacoes.map((cot) => (
            <div key={cot.id} className="border border-gray-200 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-torg-dark truncate">{cot.fornecedorNome}</p>
                  <p className="text-xs text-torg-gray truncate">{cot.fornecedorEmail}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => copiarLink(cot)}
                    className="px-3 py-1.5 text-xs bg-white border border-gray-300 text-torg-gray hover:text-torg-dark hover:bg-gray-50 rounded font-medium inline-flex items-center gap-1"
                  >
                    {copiado === cot.id ? <Check size={12} className="text-torg-blue" /> : <Copy size={12} />}
                    {copiado === cot.id ? "Copiado!" : "Copiar link"}
                  </button>
                  <a
                    href={linkOf(cot)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1.5 text-xs bg-white border border-torg-blue-200 text-torg-blue hover:bg-torg-blue-50 rounded font-medium inline-flex items-center gap-1"
                  >
                    <ExternalLink size={12} /> Abrir
                  </a>
                  <button
                    onClick={() => handleEnviarEmail(cot)}
                    className="px-3 py-1.5 text-xs bg-torg-blue text-white hover:bg-torg-blue-700 rounded font-medium inline-flex items-center gap-1"
                    title="Copia o email e abre o Outlook — Ctrl+V e enviar"
                  >
                    <Mail size={12} /> Enviar email
                  </button>
                </div>
              </div>
              {emailToast?.id === cot.id && (
                <div className={`text-xs rounded px-2 py-2 ${
                  emailToast.ok
                    ? "bg-emerald-50 border border-emerald-200 text-emerald-800"
                    : "bg-red-50 border border-red-200 text-red-700"
                }`}>
                  <div>{emailToast.ok ? "✓ " : "✗ "}{emailToast.msg}</div>
                  {emailToast.ok && (
                    <div className="flex gap-2 mt-2 flex-wrap">
                      <button
                        onClick={() => {
                          const cached = emailsCache[cot.id];
                          const ok = reCopiarEmail(cached);
                          setEmailToast({
                            id: cot.id,
                            ok,
                            msg: ok ? "Email recopiado. Cole no Outlook (Ctrl+V)." : "Falha ao recopiar.",
                          });
                        }}
                        className="px-2 py-1 rounded font-medium bg-emerald-600 text-white hover:bg-emerald-700 whitespace-nowrap"
                      >
                        Copiar de novo
                      </button>
                      <button
                        onClick={() => {
                          const cached = emailsCache[cot.id];
                          if (cached) abrirOutlookMailto(cached.to, cached.subject);
                        }}
                        className="px-2 py-1 rounded font-medium bg-torg-blue text-white hover:bg-torg-blue-700 whitespace-nowrap"
                      >
                        Abrir Outlook
                      </button>
                    </div>
                  )}
                </div>
              )}
              <div className="bg-gray-50 border border-gray-200 rounded px-2 py-1.5 font-mono text-[11px] text-torg-gray break-all">
                {linkOf(cot)}
              </div>
            </div>
          ))}
        </div>

        <div className="px-6 py-3 bg-gray-50 border-t border-gray-100 flex justify-end sticky bottom-0">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-torg-blue text-white rounded-lg hover:bg-torg-blue-700 text-sm font-medium"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

function ModalEnviarConsolidada({ rms, onClose, onSent, categoriasFornecedor = CATEGORIAS_FORNECEDOR_BUILTIN }) {
  // Coleta todos os itens cotaveis das RMs selecionadas
  const itensCotaveis = useMemo(() => {
    return rms.flatMap((r) =>
      (r.itens || [])
        .filter((it) => ["PENDENTE", "EM_COTACAO", "COTADO"].includes(it.status))
        .map((it) => ({ ...it, _rmNumero: r.numero }))
    );
  }, [rms]);

  const [itensSelecionados, setItensSelecionados] = useState(
    new Set(itensCotaveis.map((i) => i.id))
  );
  // Vendor List
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

  // Linhas avulsas (fornecedor nao cadastrado)
  const [fornecedoresLinhas, setFornecedoresLinhas] = useState([{ nome: "", email: "" }]);
  const addFornecedor = () => setFornecedoresLinhas((p) => [...p, { nome: "", email: "" }]);
  const setFornecedor = (idx, campo, valor) =>
    setFornecedoresLinhas((p) => p.map((f, i) => (i === idx ? { ...f, [campo]: valor } : f)));
  const removerFornecedor = (idx) =>
    setFornecedoresLinhas((p) => (p.length === 1 ? [{ nome: "", email: "" }] : p.filter((_, i) => i !== idx)));

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
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const parsearFornecedores = () => {
    const out = [];
    const emailsVistos = new Set();
    for (const id of fornSelecionadosIds) {
      const f = fornecedoresCadastrados.find((x) => x.id === id);
      if (!f) continue;
      const email = f.email.toLowerCase();
      if (emailsVistos.has(email)) continue;
      emailsVistos.add(email);
      out.push({ fornecedorId: f.id, nome: f.razaoSocial, email, nCodOmie: f.nCodOmie || null, cnpj: f.cnpj || null });
    }
    for (const f of fornecedoresLinhas) {
      const email = String(f.email || "").trim().toLowerCase();
      const nome = String(f.nome || "").trim();
      if (!email && !nome) continue;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return { error: `Email inválido: "${email || "(em branco)"}"${nome ? ` — fornecedor "${nome}"` : ""}` };
      }
      if (!nome) return { error: `Preencha o nome pro email "${email}"` };
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

    setSalvando(true);
    try {
      const res = await fetch("/api/cotacao/enviar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rmIds: rms.map((r) => r.id),
          itensIds: Array.from(itensSelecionados),
          fornecedores,
          prazoResposta: prazo || null,
          observacaoExtra: observacao.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro");
      onSent({
        cotacoes: data.cotacoes || [],
        rmsNumeros: data.cotacoes?.[0]?.rmsVinculadas || rms.map((r) => r.numero),
      });
    } catch (e) {
      setErro(e.message);
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-auto">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10">
          <div>
            <h3 className="text-lg font-semibold text-torg-dark inline-flex items-center gap-2">
              <Send size={18} className="text-torg-blue" /> Enviar cotação consolidada
            </h3>
            <p className="text-xs text-torg-gray mt-0.5">
              {rms.length} RMs · {itensCotaveis.length} itens disponíveis
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {erro && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded px-3 py-2 flex items-start gap-2">
              <AlertCircle size={14} className="mt-0.5" /> <span>{erro}</span>
            </div>
          )}

          {/* RMs incluídas */}
          <div className="bg-torg-blue-50/40 border border-torg-blue-100 rounded-lg p-3">
            <p className="text-xs font-semibold text-torg-blue mb-2 uppercase tracking-wide">RMs Incluídas</p>
            <div className="flex flex-wrap gap-2">
              {rms.map((r) => (
                <span key={r.id} className="inline-flex items-center gap-1 px-2 py-1 bg-white border border-torg-blue-200 rounded text-xs">
                  <FileText size={11} className="text-torg-blue" />
                  <span className="font-mono font-semibold text-torg-blue">{r.numero}</span>
                  <span className="text-torg-gray">·</span>
                  <span className="text-torg-gray">{(r.itens || []).filter((it) => ["PENDENTE", "EM_COTACAO", "COTADO"].includes(it.status)).length} itens</span>
                </span>
              ))}
            </div>
          </div>

          {/* Itens consolidados */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-torg-dark">
                Itens pra cotar ({itensSelecionados.size} de {itensCotaveis.length})
              </label>
              <div className="flex gap-2 text-xs">
                <button onClick={() => setItensSelecionados(new Set(itensCotaveis.map((i) => i.id)))} className="text-torg-blue font-medium hover:text-torg-dark">Todos</button>
                <span className="text-gray-300">·</span>
                <button onClick={() => setItensSelecionados(new Set())} className="text-torg-gray font-medium hover:text-torg-dark">Nenhum</button>
              </div>
            </div>
            <div className="border border-gray-200 rounded-lg max-h-[300px] overflow-y-auto divide-y divide-gray-100">
              {itensCotaveis.map((it) => {
                const peso = Number(it.peso) || 0;
                const usaKg = peso > 0;
                const qtd = usaKg ? `${peso.toFixed(2)} KG` : `${it.qtd} ${it.unidade}`;
                return (
                  <label key={it.id} className="flex items-center gap-3 px-3 py-1.5 hover:bg-gray-50 cursor-pointer text-sm">
                    <input
                      type="checkbox"
                      checked={itensSelecionados.has(it.id)}
                      onChange={() => toggleItem(it.id)}
                      className="w-4 h-4 rounded border-gray-300 text-torg-blue focus:ring-torg-blue"
                    />
                    <span className="font-mono text-[10px] text-torg-blue bg-torg-blue-50 px-1.5 py-0.5 rounded">{it._rmNumero}</span>
                    <span className="flex-1 truncate">{it.descricao}</span>
                    <span className="text-xs text-torg-gray tabular-nums whitespace-nowrap">{qtd}</span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Fornecedores — Vendor List + avulsos */}
          <FornecedoresPickerConsolidada
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
                type="date" value={prazo}
                onChange={(e) => setPrazo(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-torg-dark mb-1">Observação (opcional)</label>
              <input
                type="text" value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                placeholder="Ex: Entrega urgente, frete CIF"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue"
              />
            </div>
          </div>
        </div>

        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-3 sticky bottom-0">
          <button onClick={onClose} className="px-4 py-2 text-torg-gray border border-gray-300 rounded-lg hover:bg-gray-100 text-sm">
            Cancelar
          </button>
          <button
            onClick={submit}
            disabled={salvando}
            className="px-5 py-2 bg-torg-blue text-white rounded-lg hover:bg-torg-blue-700 text-sm font-medium flex items-center gap-2 disabled:opacity-50"
          >
            {salvando && <Loader2 size={14} className="animate-spin" />}
            <Send size={14} /> Enviar pra fornecedores
          </button>
        </div>
      </div>
    </div>
  );
}

// KPI card click-to-filter no topo do painel.
// color: "blue" | "orange" | "emerald" | "torg-blue"
// highlight: borda mais grossa quando e a categoria prioritaria
function KpiCard({ label, subtitle, value, color, icon: Icon, active, onClick, highlight, alerta }) {
  const colorMap = {
    blue:       { bg: "bg-torg-blue-50",   text: "text-torg-blue",         border: "border-torg-blue-200",   activeBg: "bg-torg-blue text-white",       activeBorder: "border-torg-blue" },
    orange:     { bg: "bg-torg-orange-50", text: "text-torg-orange-700",   border: "border-torg-orange-200", activeBg: "bg-torg-orange text-white",     activeBorder: "border-torg-orange" },
    emerald:    { bg: "bg-emerald-50",     text: "text-emerald-700",       border: "border-emerald-200",     activeBg: "bg-emerald-600 text-white",     activeBorder: "border-emerald-600" },
    "torg-blue":{ bg: "bg-torg-blue-50",   text: "text-torg-blue",         border: "border-torg-blue-300",   activeBg: "bg-torg-blue text-white",       activeBorder: "border-torg-blue" },
  };
  const c = colorMap[color] || colorMap.blue;
  return (
    <button
      onClick={onClick}
      className={`text-left p-4 rounded-xl border-2 transition-all ${
        active ? `${c.activeBg} ${c.activeBorder} shadow-md` : `bg-white ${c.border} hover:shadow-sm`
      } ${highlight && !active ? "ring-1 ring-torg-blue/20" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className={`text-xs font-semibold uppercase tracking-wide ${active ? "text-white/90" : c.text}`}>
            {label}
          </p>
          <p className={`text-3xl font-extrabold tabular-nums mt-1 ${active ? "text-white" : "text-torg-dark"}`}>
            {value}
          </p>
          {subtitle && (
            <p className={`text-[10px] mt-0.5 ${active ? "text-white/80" : "text-torg-gray"}`}>
              {subtitle}
            </p>
          )}
          {alerta && (
            <p className={`text-[10px] mt-1 font-semibold ${active ? "text-white/90" : "text-red-600"}`}>
              🔴 {alerta}
            </p>
          )}
        </div>
        <div className={`p-2 rounded-lg ${active ? "bg-white/20" : c.bg}`}>
          <Icon size={18} className={active ? "text-white" : c.text} />
        </div>
      </div>
    </button>
  );
}

// Visualizacao Kanban — 4 colunas por categoria de acao.
function KanbanView({ rms, isAdmin }) {
  const colunas = [
    { cat: "ABERTA",     titulo: "Abertas",            subtitle: "Aguardando envio",       color: "blue" },
    { cat: "EM_COTACAO", titulo: "Em cotação",         subtitle: "Aguardando proposta",    color: "orange" },
    { cat: "PARCIAL",    titulo: "Recebida parcial",   subtitle: "Algumas propostas",      color: "emerald" },
    { cat: "PRONTA",     titulo: "Pronta pra pedido",  subtitle: "Fechar no Omie",         color: "torg-blue" },
  ];
  const headerColor = {
    blue: "bg-torg-blue-50 text-torg-blue border-torg-blue-200",
    orange: "bg-torg-orange-50 text-torg-orange-700 border-torg-orange-200",
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
    "torg-blue": "bg-torg-blue text-white border-torg-blue",
  };
  const cardColor = {
    blue: "bg-white border-torg-blue-100 hover:border-torg-blue-300",
    orange: "bg-white border-torg-orange-100 hover:border-torg-orange-300",
    emerald: "bg-white border-emerald-100 hover:border-emerald-300",
    "torg-blue": "bg-torg-blue-50/40 border-torg-blue-200 hover:border-torg-blue-400 shadow-sm",
  };
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
      {colunas.map((col) => {
        const itens = rms.filter((r) => categoriaRM(r) === col.cat);
        return (
          <div key={col.cat} className="flex flex-col bg-gray-50 rounded-xl border border-gray-200 overflow-hidden min-h-[300px]">
            <div className={`px-3 py-3 border-b ${headerColor[col.color]}`}>
              <div className="flex items-center justify-between">
                <p className="font-bold text-sm">{col.titulo}</p>
                <span className="text-xs font-bold bg-white/30 px-2 py-0.5 rounded-full">
                  {itens.length}
                </span>
              </div>
              <p className="text-[10px] mt-0.5 opacity-90">{col.subtitle}</p>
            </div>
            <div className="flex-1 p-2 space-y-2 overflow-y-auto max-h-[600px]">
              {itens.length === 0 ? (
                <p className="text-center text-xs text-torg-gray italic py-8">
                  Nenhuma RM
                </p>
              ) : (
                itens.map((rm) => {
                  const diasAtras = rm.createdAt
                    ? Math.floor((Date.now() - new Date(rm.createdAt).getTime()) / (1000 * 60 * 60 * 24))
                    : null;
                  return (
                    <Link
                      key={rm.id}
                      href={`/compras/rm/${rm.id}`}
                      className={`block p-3 rounded-lg border-2 transition-all ${cardColor[col.color]}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-mono font-bold text-torg-blue text-sm">{rm.numero}</p>
                        <span className="text-[10px] text-torg-gray whitespace-nowrap">
                          {diasAtras != null && diasAtras > 0 ? `há ${diasAtras}d` : "hoje"}
                        </span>
                      </div>
                      {rm.op && (
                        <p className="text-xs text-torg-gray mt-1 font-mono">
                          {fmtOP(rm.op.numero)} <span className="text-torg-gray/70">·</span> {rm.op.cliente}
                        </p>
                      )}
                      <p className="text-xs text-torg-dark mt-1 line-clamp-2 leading-tight">{rm.descricao}</p>
                      <div className="flex items-center justify-between gap-2 mt-2 text-[10px] text-torg-gray">
                        <span>{rm._count?.itens || 0} itens</span>
                        {(rm.recebidas > 0 || rm.pendentes > 0) && (
                          <span className="font-semibold">
                            {rm.recebidas}/{rm.recebidas + rm.pendentes} props
                          </span>
                        )}
                      </div>
                      {rm.atrasadas > 0 && (
                        <p className="text-[10px] mt-1 text-red-600 font-bold">
                          🔴 {rm.atrasadas} atrasada{rm.atrasadas !== 1 ? "s" : ""}
                        </p>
                      )}
                      {col.cat === "PRONTA" && (
                        <div className="mt-2 inline-flex items-center gap-1 text-[11px] text-torg-blue font-semibold">
                          <Truck size={11} /> Pronta pra fechar pedido →
                        </div>
                      )}
                    </Link>
                  );
                })
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Picker de fornecedores pra envio consolidado (Vendor List + avulsos).
// Mesma estrutura do FornecedoresPicker do RMComprasClient.jsx, replicado
// aqui por enquanto pra evitar criar componente compartilhado.
function FornecedoresPickerConsolidada({
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
        >
          + Cadastrar novo fornecedor
        </Link>
      </div>
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-2">
        <div className="flex items-center gap-2 flex-wrap mb-2">
          <span className="text-[11px] text-torg-gray font-medium">Categoria:</span>
          <button
            type="button"
            onClick={() => setFiltroCatForn(null)}
            className={`text-[11px] px-2 py-0.5 rounded-full border font-medium ${
              filtroCatForn === null ? "bg-torg-dark text-white border-torg-dark" : "bg-white text-torg-gray border-gray-300 hover:bg-gray-100"
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
                filtroCatForn === cat.codigo ? "bg-torg-blue text-white border-torg-blue" : `${chipCategoriaFornecedor(cat.codigo, categoriasFornecedor)} hover:opacity-80`
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
                className={`flex items-start gap-2 px-3 py-2 cursor-pointer text-xs hover:bg-gray-50 ${checked ? "bg-torg-blue-50/40" : ""}`}
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
                </div>
              </label>
            );
          })
        )}
      </div>
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
        Cada fornecedor recebe um <strong>link único</strong> com TODOS os itens das RMs selecionadas.
      </p>
    </div>
  );
}
