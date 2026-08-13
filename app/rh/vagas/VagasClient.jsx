"use client";
import { useState, useEffect, useRef } from "react";
import {
  Briefcase, Search, PlusCircle, Loader2, AlertCircle, X,
  ChevronDown, Clock, CheckCircle2, XCircle, Users, AlertTriangle,
  ArrowRight, Calendar, Filter, Mail, Send, Image as ImageIcon,
  Download, Palette, CheckCircle, Copy,
} from "lucide-react";

const STATUS_LABELS = {
  SOLICITADA: { label: "Solicitada", cor: "bg-blue-100 text-blue-800" },
  APROVADA: { label: "Aprovada", cor: "bg-amber-100 text-amber-800" },
  EM_RECRUTAMENTO: { label: "Em Recrutamento", cor: "bg-purple-100 text-purple-800" },
  PREENCHIDA: { label: "Preenchida", cor: "bg-emerald-100 text-emerald-800" },
  CANCELADA: { label: "Cancelada", cor: "bg-red-100 text-red-800" },
};

const PRIORIDADE_LABELS = {
  URGENTE: { label: "Urgente", cor: "bg-red-100 text-red-700" },
  ALTA: { label: "Alta", cor: "bg-orange-100 text-orange-700" },
  NORMAL: { label: "Normal", cor: "bg-gray-100 text-gray-700" },
  BAIXA: { label: "Baixa", cor: "bg-blue-50 text-blue-600" },
};

const fmtData = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—");

function diasAberto(dataAbertura, dataFechamento) {
  const fim = dataFechamento ? new Date(dataFechamento) : new Date();
  const inicio = new Date(dataAbertura);
  return Math.round((fim - inicio) / (1000 * 60 * 60 * 24));
}

export default function VagasClient() {
  const [vagas, setVagas] = useState([]);
  const [setores, setSetores] = useState([]);
  const [cargos, setCargos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("");
  const [filtroSetor, setFiltroSetor] = useState("");
  const [verTodas, setVerTodas] = useState(false);
  // Modal
  const [modalAberto, setModalAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [form, setForm] = useState({});
  // Modal status
  const [modalStatus, setModalStatus] = useState(null);
  const [atualizando, setAtualizando] = useState(false);
  // E-mails de aprovação + arte de divulgação
  const [aviso, setAviso] = useState("");
  const [notificando, setNotificando] = useState("");
  const [arteVaga, setArteVaga] = useState(null);

  const carregar = async () => {
    setCarregando(true);
    setErro("");
    try {
      const params = verTodas ? "?todos=true" : "";
      const [vRes, sRes, cRes] = await Promise.all([
        fetch(`/api/rh/vagas${params}`).then((r) => r.json()),
        fetch("/api/rh/setores").then((r) => r.json()),
        fetch("/api/rh/cargos").then((r) => r.json()),
      ]);
      if (!vRes.success) throw new Error(vRes.error);
      setVagas(vRes.data || []);
      setSetores(sRes.data || []);
      setCargos(cRes.data || []);
    } catch (e) {
      setErro(e.message);
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => { carregar(); }, [verTodas]);

  // Filtros
  const filtradas = vagas.filter((v) => {
    if (filtroStatus && v.status !== filtroStatus) return false;
    if (filtroSetor && v.setor?.id !== filtroSetor) return false;
    if (busca) {
      const b = busca.toLowerCase();
      const hay = `${v.titulo} ${v.setor?.nome || ""} ${v.cargo?.nome || ""}`.toLowerCase();
      if (!hay.includes(b)) return false;
    }
    return true;
  });

  // Criar vaga
  const abrirNova = () => {
    setForm({
      titulo: "", setorId: setores[0]?.id || "", cargoId: "",
      quantidade: 1, prioridade: "NORMAL", tipo: "CLT",
      nivelCargo: "", justificativa: "", requisitos: "", salarioFaixa: "",
    });
    setModalAberto(true);
  };

  const salvarVaga = async () => {
    setSalvando(true);
    setErro("");
    try {
      const body = {
        ...form,
        quantidade: Number(form.quantidade) || 1,
        cargoId: form.cargoId || undefined,
        nivelCargo: form.nivelCargo || undefined,
        justificativa: form.justificativa || undefined,
        requisitos: form.requisitos || undefined,
        salarioFaixa: form.salarioFaixa || undefined,
      };
      const res = await fetch("/api/rh/vagas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao criar vaga");
      setVagas((prev) => [data.data, ...prev]);
      setModalAberto(false);
    } catch (e) {
      setErro(e.message);
    } finally {
      setSalvando(false);
    }
  };

  // Atualizar status
  const handleStatusChange = async (vaga, novoStatus) => {
    setAtualizando(true);
    try {
      const body = { status: novoStatus };
      if (novoStatus === "PREENCHIDA") {
        const nome = prompt("Nome do contratado (opcional):");
        if (nome) body.funcionarioContratadoNome = nome;
      }
      const res = await fetch(`/api/rh/vagas/${vaga.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setVagas((prev) => prev.map((v) => (v.id === vaga.id ? { ...v, ...data.data } : v)));
      setModalStatus(null);
    } catch (e) {
      setErro(e.message);
    } finally {
      setAtualizando(false);
    }
  };

  // Enviar e-mail: pedir aprovação (→ aprovadores) ou avisar o RH (→ time de RH)
  const notificar = async (vaga, tipo) => {
    setNotificando(`${vaga.id}:${tipo}`);
    setErro("");
    setAviso("");
    try {
      const res = await fetch(`/api/rh/vagas/${vaga.id}/notificar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao enviar e-mail");
      const alvo = tipo === "APROVADA" ? "o RH" : "os aprovadores";
      setAviso(`E-mail enviado para ${alvo} (${data.enviados} destinatário${data.enviados !== 1 ? "s" : ""}).`);
      setTimeout(() => setAviso(""), 6000);
    } catch (e) {
      setErro(e.message);
    } finally {
      setNotificando("");
    }
  };

  // Contadores
  const abertas = vagas.filter((v) => !["PREENCHIDA", "CANCELADA"].includes(v.status)).length;
  const urgentes = vagas.filter((v) => v.prioridade === "URGENTE" && !["PREENCHIDA", "CANCELADA"].includes(v.status)).length;

  if (carregando) {
    return (
      <div className="flex items-center justify-center py-20 text-torg-gray">
        <Loader2 size={20} className="animate-spin mr-2" /> Carregando vagas…
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-3xl font-extrabold text-torg-dark tracking-tight">Vagas / Recrutamento</h2>
          <p className="text-sm text-torg-gray mt-1">
            {abertas} vaga{abertas !== 1 ? "s" : ""} aberta{abertas !== 1 ? "s" : ""}
            {urgentes > 0 && <span className="text-red-600 ml-2">• {urgentes} urgente{urgentes !== 1 ? "s" : ""}</span>}
          </p>
        </div>
        <button
          onClick={abrirNova}
          disabled={setores.length === 0}
          className="px-4 py-2 bg-torg-blue text-white text-sm font-medium rounded-lg hover:bg-torg-blue/90 inline-flex items-center gap-2 disabled:opacity-50"
        >
          <PlusCircle size={16} /> Nova Vaga
        </button>
      </div>

      {erro && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2 flex items-start gap-2">
          <AlertCircle size={14} className="mt-0.5 shrink-0" /> {erro}
        </div>
      )}
      {aviso && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded-lg px-3 py-2 flex items-start gap-2">
          <CheckCircle size={14} className="mt-0.5 shrink-0" /> {aviso}
        </div>
      )}

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex-1 min-w-[200px] relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-torg-gray" />
            <input type="text" value={busca} onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por título, setor, cargo…"
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-torg-blue focus:border-torg-blue" />
          </div>
          <div className="relative">
            <select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)}
              className="appearance-none pl-3 pr-8 py-2 text-sm border border-gray-200 rounded-lg bg-white">
              <option value="">Todos os status</option>
              {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-torg-gray pointer-events-none" />
          </div>
          <div className="relative">
            <select value={filtroSetor} onChange={(e) => setFiltroSetor(e.target.value)}
              className="appearance-none pl-3 pr-8 py-2 text-sm border border-gray-200 rounded-lg bg-white">
              <option value="">Todos os setores</option>
              {setores.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
            </select>
            <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-torg-gray pointer-events-none" />
          </div>
          <label className="inline-flex items-center gap-2 text-xs text-torg-gray cursor-pointer">
            <input type="checkbox" checked={verTodas} onChange={(e) => setVerTodas(e.target.checked)}
              className="rounded border-gray-300 text-torg-blue focus:ring-torg-blue" />
            Incluir preenchidas/canceladas
          </label>
        </div>
      </div>

      {/* Cards de vagas */}
      {filtradas.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <Briefcase size={48} className="mx-auto text-gray-300 mb-4" />
          <p className="text-torg-gray text-lg font-medium">
            {vagas.length === 0 ? "Nenhuma vaga cadastrada" : "Nenhum resultado"}
          </p>
          <p className="text-sm text-gray-400 mt-1">Clique em "Nova Vaga" para solicitar pessoal</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filtradas.map((v) => {
            const st = STATUS_LABELS[v.status] || { label: v.status, cor: "bg-gray-100 text-gray-700" };
            const pri = PRIORIDADE_LABELS[v.prioridade] || PRIORIDADE_LABELS.NORMAL;
            const dias = diasAberto(v.dataAbertura, v.dataFechamento);
            const aberta = !["PREENCHIDA", "CANCELADA"].includes(v.status);

            return (
              <div key={v.id} className={`bg-white rounded-xl border shadow-sm p-5 ${
                v.prioridade === "URGENTE" && aberta ? "border-red-200" : "border-gray-100"
              }`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-bold text-torg-dark text-sm truncate">{v.titulo}</h3>
                    <p className="text-xs text-torg-gray mt-0.5">
                      {v.setor?.nome || "—"} {v.cargo ? `• ${v.cargo.nome}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${pri.cor}`}>{pri.label}</span>
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${st.cor}`}>{st.label}</span>
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-4 text-xs text-torg-gray">
                  <span className="inline-flex items-center gap-1"><Users size={12} /> {v.quantidade} vaga{v.quantidade !== 1 ? "s" : ""}</span>
                  <span className="inline-flex items-center gap-1"><Calendar size={12} /> {fmtData(v.dataAbertura)}</span>
                  <span className="inline-flex items-center gap-1">
                    <Clock size={12} />
                    <span className={dias > 30 && aberta ? "text-red-600 font-medium" : ""}>{dias} dias</span>
                  </span>
                </div>

                {v.justificativa && (
                  <p className="mt-2 text-xs text-gray-500 line-clamp-2">{v.justificativa}</p>
                )}

                {v.funcionarioContratadoNome && (
                  <p className="mt-2 text-xs text-emerald-700 flex items-center gap-1">
                    <CheckCircle2 size={12} /> Contratado: {v.funcionarioContratadoNome}
                  </p>
                )}

                {/* Ações */}
                {aberta && (
                  <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-2 flex-wrap">
                    {v.status === "SOLICITADA" && (
                      <>
                        <button onClick={() => handleStatusChange(v, "APROVADA")}
                          className="px-3 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition">
                          Aprovar
                        </button>
                        <button onClick={() => notificar(v, "SOLICITAR_APROVACAO")}
                          disabled={notificando === `${v.id}:SOLICITAR_APROVACAO`}
                          title="Enviar e-mail aos aprovadores pedindo a liberação desta vaga"
                          className="px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition inline-flex items-center gap-1.5 disabled:opacity-50">
                          {notificando === `${v.id}:SOLICITAR_APROVACAO` ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                          Solicitar aprovação
                        </button>
                      </>
                    )}
                    {v.status === "APROVADA" && (
                      <>
                        <button onClick={() => handleStatusChange(v, "EM_RECRUTAMENTO")}
                          className="px-3 py-1.5 text-xs font-medium text-purple-700 bg-purple-50 border border-purple-200 rounded-lg hover:bg-purple-100 transition">
                          Iniciar Recrutamento
                        </button>
                        <button onClick={() => notificar(v, "APROVADA")}
                          disabled={notificando === `${v.id}:APROVADA`}
                          title="Avisar o time de RH por e-mail que a vaga foi liberada"
                          className="px-3 py-1.5 text-xs font-medium text-sky-700 bg-sky-50 border border-sky-200 rounded-lg hover:bg-sky-100 transition inline-flex items-center gap-1.5 disabled:opacity-50">
                          {notificando === `${v.id}:APROVADA` ? <Loader2 size={12} className="animate-spin" /> : <Mail size={12} />}
                          Avisar RH
                        </button>
                      </>
                    )}
                    {v.status === "EM_RECRUTAMENTO" && (
                      <button onClick={() => handleStatusChange(v, "PREENCHIDA")}
                        className="px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition">
                        Marcar Preenchida
                      </button>
                    )}
                    {["APROVADA", "EM_RECRUTAMENTO"].includes(v.status) && (
                      <button onClick={() => setArteVaga(v)}
                        title="Gerar arte para Instagram, Facebook e LinkedIn"
                        className="px-3 py-1.5 text-xs font-medium text-orange-700 bg-orange-50 border border-orange-200 rounded-lg hover:bg-orange-100 transition inline-flex items-center gap-1.5">
                        <Palette size={12} /> Gerar arte
                      </button>
                    )}
                    <button onClick={() => handleStatusChange(v, "CANCELADA")}
                      className="px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition ml-auto">
                      Cancelar
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Nova Vaga */}
      {modalAberto && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-lg font-bold text-torg-dark">Nova Solicitação de Vaga</h3>
              <button onClick={() => setModalAberto(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4">
              <Campo label="Título da vaga *" value={form.titulo}
                onChange={(v) => setForm({ ...form, titulo: v })} placeholder="Ex: Soldador MIG/MAG" />

              <div className="grid grid-cols-2 gap-4">
                <Sel label="Setor *" value={form.setorId} onChange={(v) => setForm({ ...form, setorId: v })}
                  options={setores.map((s) => ({ value: s.id, label: s.nome }))} />
                <Sel label="Cargo" value={form.cargoId} onChange={(v) => setForm({ ...form, cargoId: v })}
                  options={[{ value: "", label: "— Opcional —" }, ...cargos.map((c) => ({ value: c.id, label: c.nome }))]} />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <Campo label="Quantidade" type="number" value={form.quantidade}
                  onChange={(v) => setForm({ ...form, quantidade: v })} />
                <Sel label="Prioridade" value={form.prioridade} onChange={(v) => setForm({ ...form, prioridade: v })}
                  options={Object.entries(PRIORIDADE_LABELS).map(([k, v]) => ({ value: k, label: v.label }))} />
                <Sel label="Tipo" value={form.tipo} onChange={(v) => setForm({ ...form, tipo: v })}
                  options={[
                    { value: "CLT", label: "CLT" },
                    { value: "PJ", label: "PJ" },
                    { value: "ESTAGIO", label: "Estágio" },
                    { value: "TEMPORARIO", label: "Temporário" },
                  ]} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Sel label="Nível" value={form.nivelCargo} onChange={(v) => setForm({ ...form, nivelCargo: v })}
                  options={[
                    { value: "", label: "— Opcional —" },
                    { value: "OPERACIONAL", label: "Operacional" },
                    { value: "TECNICO", label: "Técnico" },
                    { value: "SUPERVISAO", label: "Supervisão" },
                    { value: "GERENCIA", label: "Gerência" },
                  ]} />
                <Campo label="Faixa salarial" value={form.salarioFaixa}
                  onChange={(v) => setForm({ ...form, salarioFaixa: v })} placeholder="Ex: R$ 3.000 - 4.500" />
              </div>

              <div>
                <label className="block text-xs font-medium text-torg-gray mb-1">Justificativa</label>
                <textarea value={form.justificativa || ""} onChange={(e) => setForm({ ...form, justificativa: e.target.value })}
                  rows={2} placeholder="Por que essa vaga é necessária?"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-torg-blue focus:border-torg-blue" />
              </div>
              <div>
                <label className="block text-xs font-medium text-torg-gray mb-1">Requisitos</label>
                <textarea value={form.requisitos || ""} onChange={(e) => setForm({ ...form, requisitos: e.target.value })}
                  rows={2} placeholder="Experiência, qualificações, NRs obrigatórias…"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-torg-blue focus:border-torg-blue" />
              </div>
            </div>
            <div className="p-6 border-t border-gray-100 flex items-center justify-end gap-3">
              <button onClick={() => setModalAberto(false)} disabled={salvando}
                className="px-4 py-2 text-sm text-torg-gray border border-gray-200 rounded-lg hover:bg-gray-50">
                Cancelar
              </button>
              <button onClick={salvarVaga} disabled={salvando || !form.titulo || !form.setorId}
                className="px-4 py-2 bg-torg-blue text-white text-sm font-medium rounded-lg hover:bg-torg-blue/90 inline-flex items-center gap-2 disabled:opacity-50">
                {salvando ? <Loader2 size={14} className="animate-spin" /> : <PlusCircle size={14} />}
                {salvando ? "Criando…" : "Criar Vaga"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Gerar Arte */}
      {arteVaga && <ArteModal vaga={arteVaga} onClose={() => setArteVaga(null)} />}
    </div>
  );
}

function Campo({ label, value, onChange, type = "text", placeholder, className = "" }) {
  return (
    <div className={className}>
      <label className="block text-xs font-medium text-torg-gray mb-1">{label}</label>
      <input type={type} value={value || ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-torg-blue focus:border-torg-blue" />
    </div>
  );
}

function Sel({ label, value, onChange, options }) {
  return (
    <div>
      <label className="block text-xs font-medium text-torg-gray mb-1">{label}</label>
      <div className="relative">
        <select value={value || ""} onChange={(e) => onChange(e.target.value)}
          className="appearance-none w-full pl-3 pr-8 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:ring-2 focus:ring-torg-blue focus:border-torg-blue">
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-torg-gray pointer-events-none" />
      </div>
    </div>
  );
}

// ───────────────────────── Arte de divulgação (Instagram / Facebook / LinkedIn) ─────────────────────────
// Renderiza no <canvas> do navegador — a foto nunca sai do dispositivo; baixa PNG pronto.
const OBRAS_ARTE = [
  { nome: "Planta industrial", src: "/obras/planta-industrial.jpg" },
  { nome: "Ponte (pôr do sol)", src: "/obras/ponte-sunset.jpg" },
  { nome: "Ponte treliçada", src: "/obras/ponte-trelica.jpg" },
  { nome: "Torre / escada", src: "/obras/torre-escada.jpg" },
];
const TIPO_ARTE = { CLT: "CLT", PJ: "PJ", ESTAGIO: "Estágio", TEMPORARIO: "Temporário" };

function slugArte(s) {
  return (String(s || "vaga").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40)) || "vaga";
}

function wrapArte(ctx, text, maxW, maxLines) {
  const words = String(text).trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const lines = [];
  let cur = "";
  for (const w of words) {
    const test = cur ? cur + " " + w : w;
    if (ctx.measureText(test).width > maxW && cur) { lines.push(cur); cur = w; } else cur = test;
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    let last = kept[maxLines - 1];
    while (last && ctx.measureText(last + "…").width > maxW) last = last.slice(0, -1);
    kept[maxLines - 1] = (last || "").trimEnd() + "…";
    return kept;
  }
  return lines;
}

function roundRectArte(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) { ctx.roundRect(x, y, w, h, r); return; }
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function ArteModal({ vaga, onClose }) {
  const canvasRef = useRef(null);
  const [formato, setFormato] = useState("feed"); // feed 1080×1080 | story 1080×1920
  const [fotoSrc, setFotoSrc] = useState(OBRAS_ARTE[0].src);
  const [fotoLabel, setFotoLabel] = useState(OBRAS_ARTE[0].nome);
  const [headline, setHeadline] = useState("ESTAMOS CONTRATANDO");
  const [titulo, setTitulo] = useState((vaga.titulo || vaga.cargo?.nome || "").toUpperCase());
  const [mensagem, setMensagem] = useState("Venha fazer parte de uma equipe engajada em crescer e construir grandes obras.");
  const [contato, setContato] = useState("Envie seu currículo: rh@torg.com.br");
  const [imgObra, setImgObra] = useState(null);
  const [logo, setLogo] = useState(null);
  const [copiado, setCopiado] = useState(false);

  const subInfo = vaga.setor?.nome || "";

  const [legenda, setLegenda] = useState(
    `🏗️ Estamos contratando: ${vaga.titulo}${vaga.setor?.nome ? " — " + vaga.setor.nome : ""}\n\n` +
    `Venha fazer parte de uma equipe engajada em crescer e construir grandes obras em estruturas metálicas. Aqui o seu trabalho faz parte de projetos que ficam de pé.\n\n` +
    `📩 Envie seu currículo para rh@torg.com.br\n\n` +
    `#vagas #trabalheconosco #estruturasmetalicas #torgmetal`
  );

  const copiarLegenda = async () => {
    try { await navigator.clipboard.writeText(legenda); setCopiado(true); setTimeout(() => setCopiado(false), 2000); } catch { /* clipboard indisponível */ }
  };

  useEffect(() => {
    const l = new window.Image();
    l.onload = () => setLogo(l);
    l.src = "/torg-logo-white.png";
  }, []);

  useEffect(() => {
    if (!fotoSrc) { setImgObra(null); return; }
    const im = new window.Image();
    im.crossOrigin = "anonymous";
    im.onload = () => setImgObra(im);
    im.onerror = () => setImgObra(null);
    im.src = fotoSrc;
  }, [fotoSrc]);

  useEffect(() => { desenhar(); }, [formato, imgObra, logo, headline, titulo, mensagem, contato]); // eslint-disable-line

  function desenhar() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const W = 1080, H = formato === "story" ? 1920 : 1080;
    if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
    const ctx = canvas.getContext("2d");
    const NAVY = "#0D1F3C", ORANGE = "#F4801F";
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = NAVY; ctx.fillRect(0, 0, W, H);

    // Foto de obra (cover)
    if (imgObra && imgObra.width) {
      const ir = imgObra.width / imgObra.height, cr = W / H;
      let dw, dh, dx, dy;
      if (ir > cr) { dh = H; dw = H * ir; dx = (W - dw) / 2; dy = 0; }
      else { dw = W; dh = W / ir; dx = 0; dy = (H - dh) / 2; }
      ctx.drawImage(imgObra, dx, dy, dw, dh);
    }

    // Gradiente navy p/ legibilidade
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "rgba(13,31,60,0.55)");
    g.addColorStop(0.35, "rgba(13,31,60,0.18)");
    g.addColorStop(0.68, "rgba(13,31,60,0.78)");
    g.addColorStop(1, "rgba(13,31,60,0.97)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    const M = 84;

    // Logo (topo-esquerda) + acento laranja (topo-direita)
    if (logo && logo.width) {
      const lh = 90, lw = lh * (logo.width / logo.height);
      ctx.drawImage(logo, M, M - 6, lw, lh);
    }
    ctx.fillStyle = ORANGE; ctx.fillRect(W - M - 120, M + 34, 120, 8);

    // ── Bloco inferior (medido → alinhado à base) ──
    const TITLE = 90, lhTitle = TITLE * 1.1;
    ctx.font = `800 ${TITLE}px Arial, sans-serif`;
    const linhas = wrapArte(ctx, titulo || "", W - 2 * M, 3);

    const pillTxt = (headline || "").toUpperCase().trim();
    ctx.font = `800 34px Arial, sans-serif`;
    const pillW = pillTxt ? ctx.measureText(pillTxt).width + 56 : 0;
    const pillH = pillTxt ? 66 : 0;

    const gapPill = pillTxt ? 30 : 0;
    const gapSub = 22, subH = subInfo ? 44 : 0;
    ctx.font = `600 32px Arial, sans-serif`;
    const mLines = mensagem ? wrapArte(ctx, mensagem, W - 2 * M, 2) : [];
    const gapMsg = mLines.length ? 18 : 0, msgH = mLines.length * 40;
    const gapDiv = 30, ctaH = 40;
    const blocoH = pillH + gapPill + linhas.length * lhTitle + gapSub + subH + gapMsg + msgH + gapDiv + 5 + gapDiv + ctaH;

    let cy = H - M - blocoH;

    // Pill headline
    if (pillTxt) {
      roundRectArte(ctx, M, cy, pillW, pillH, 10);
      ctx.fillStyle = ORANGE; ctx.fill();
      ctx.fillStyle = NAVY; ctx.textBaseline = "middle";
      ctx.fillText(pillTxt, M + 28, cy + pillH / 2 + 2);
      cy += pillH + gapPill;
    }

    // Título (cargo)
    ctx.textBaseline = "top";
    ctx.fillStyle = "#ffffff"; ctx.font = `800 ${TITLE}px Arial, sans-serif`;
    ctx.shadowColor = "rgba(0,0,0,0.4)"; ctx.shadowBlur = 14; ctx.shadowOffsetY = 2;
    for (const ln of linhas) { ctx.fillText(ln, M, cy); cy += lhTitle; }
    ctx.shadowColor = "transparent"; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

    cy += gapSub;
    if (subInfo) { ctx.fillStyle = "#e2e8f0"; ctx.font = `600 34px Arial, sans-serif`; ctx.fillText(subInfo, M, cy); cy += subH; }
    if (mLines.length) { cy += gapMsg; ctx.fillStyle = "#f1f5f9"; ctx.font = `600 32px Arial, sans-serif`; for (const ln of mLines) { ctx.fillText(ln, M, cy); cy += 40; } }

    cy += gapDiv;
    ctx.fillStyle = ORANGE; ctx.fillRect(M, cy, 96, 5); cy += 5 + gapDiv;
    ctx.fillStyle = "#ffffff"; ctx.font = `700 34px Arial, sans-serif`; ctx.fillText(contato || "", M, cy);
    ctx.textBaseline = "alphabetic";
  }

  const onUpload = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => { setFotoSrc(String(rd.result)); setFotoLabel(f.name); };
    rd.readAsDataURL(f);
  };

  const baixar = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const a = document.createElement("a");
    a.download = `vaga-${slugArte(vaga.titulo || vaga.cargo?.nome)}-${formato}.png`;
    a.href = canvas.toDataURL("image/png");
    a.click();
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl max-w-4xl w-full max-h-[94vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-torg-dark flex items-center gap-2"><Palette size={18} className="text-torg-orange" /> Gerar arte de divulgação</h3>
            <p className="text-xs text-torg-gray mt-0.5">{vaga.titulo} · {vaga.setor?.nome}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        <div className="grid md:grid-cols-2">
          {/* Controles */}
          <div className="p-5 space-y-4 md:border-r border-gray-100">
            <div>
              <label className="block text-xs font-medium text-torg-gray mb-1.5">Formato</label>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setFormato("feed")}
                  className={`px-3 py-2 text-sm rounded-lg border transition ${formato === "feed" ? "bg-torg-blue text-white border-torg-blue" : "bg-white text-torg-gray border-gray-200 hover:bg-gray-50"}`}>
                  Feed 1:1
                </button>
                <button onClick={() => setFormato("story")}
                  className={`px-3 py-2 text-sm rounded-lg border transition ${formato === "story" ? "bg-torg-blue text-white border-torg-blue" : "bg-white text-torg-gray border-gray-200 hover:bg-gray-50"}`}>
                  Story 9:16
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-torg-gray mb-1.5">Foto de obra</label>
              <div className="grid grid-cols-5 gap-2">
                {OBRAS_ARTE.map((o) => (
                  <button key={o.src} onClick={() => { setFotoSrc(o.src); setFotoLabel(o.nome); }} title={o.nome}
                    className={`h-14 rounded-lg bg-cover bg-center border-2 transition ${fotoSrc === o.src ? "border-torg-blue ring-2 ring-torg-blue/30" : "border-transparent hover:border-gray-300"}`}
                    style={{ backgroundImage: `url(${o.src})` }} />
                ))}
                <label className="h-14 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center cursor-pointer hover:bg-gray-50 text-gray-400" title="Enviar outra foto">
                  <input type="file" accept="image/*" className="hidden" onChange={onUpload} />
                  <ImageIcon size={16} />
                </label>
              </div>
              <p className="text-[11px] text-gray-400 mt-1 truncate">{fotoLabel}</p>
            </div>

            <Campo label="Chamada (topo)" value={headline} onChange={setHeadline} placeholder="ESTAMOS CONTRATANDO" />
            <Campo label="Cargo / título" value={titulo} onChange={setTitulo} placeholder="Ex: SOLDADOR MIG/MAG" />
            <div>
              <label className="block text-xs font-medium text-torg-gray mb-1">Mensagem</label>
              <textarea rows={2} value={mensagem} onChange={(e) => setMensagem(e.target.value)}
                placeholder="Ex: Venha fazer parte de uma equipe engajada em crescer."
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-torg-blue focus:border-torg-blue" />
            </div>
            <Campo label="Contato / chamada final" value={contato} onChange={setContato} placeholder="Envie seu currículo: rh@torg.com.br" />
          </div>

          {/* Preview */}
          <div className="p-5 bg-slate-50 flex flex-col items-center justify-center gap-4">
            <canvas ref={canvasRef} className="block rounded-xl shadow-lg" style={{ maxHeight: "52vh", maxWidth: "100%" }} />
            <button onClick={baixar}
              className="w-full px-4 py-2.5 bg-torg-orange text-white text-sm font-semibold rounded-lg hover:bg-torg-orange/90 inline-flex items-center justify-center gap-2">
              <Download size={16} /> Baixar PNG ({formato === "story" ? "Story 1080×1920" : "Feed 1080×1080"})
            </button>
            <p className="text-[11px] text-center text-gray-400 leading-relaxed">
              Serve para o feed e stories do Instagram, Facebook e LinkedIn.<br />Troque o formato e baixe as duas versões.
            </p>
            <div className="w-full">
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-torg-gray">Legenda para o post</label>
                <button onClick={copiarLegenda}
                  className="text-xs text-torg-blue hover:underline inline-flex items-center gap-1">
                  {copiado ? <><CheckCircle size={12} /> Copiado</> : <><Copy size={12} /> Copiar</>}
                </button>
              </div>
              <textarea rows={6} value={legenda} onChange={(e) => setLegenda(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:ring-2 focus:ring-torg-blue focus:border-torg-blue leading-relaxed" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
