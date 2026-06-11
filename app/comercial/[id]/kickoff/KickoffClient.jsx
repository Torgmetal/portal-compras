"use client";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  ArrowLeft, Loader2, AlertCircle, Save, Send, Printer, Sparkles,
  UploadCloud, FileText, X, Building2, Truck, Paintbrush, SearchCheck,
  Receipt, ClipboardList, AlertTriangle, CheckCircle2, Rocket,
  CalendarRange, ListOrdered, Scale, Link2, Plus, Trash2, Wand2,
} from "lucide-react";
import { fmtOP } from "@/lib/utils";

const fmtData = (d) => (d ? new Date(d).toLocaleDateString("pt-BR") : "—");
const toInputDate = (d) => (d ? new Date(d).toISOString().slice(0, 10) : "");
const fmtKg = (v) => (v != null && v !== "" ? `${Number(v).toLocaleString("pt-BR")} kg` : "—");

// Fases padrão do fluxo da fábrica — % do prazo entre hoje e a entrega.
const FASES_PADRAO = [
  { fase: "Kick off com os setores", pct: 0.05 },
  { fase: "Engenharia — projetos liberados p/ fabricação", pct: 0.2 },
  { fase: "Compras — matéria-prima na fábrica", pct: 0.35 },
  { fase: "Fabricação concluída", pct: 0.7 },
  { fase: "Pintura concluída", pct: 0.8 },
  { fase: "Expedição — carga entregue na obra", pct: 0.9 },
  { fase: "Montagem / entrega final", pct: 1 },
];

export default function KickoffClient({ opId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [aba, setAba] = useState("geral"); // "geral" | "fiscal"
  const [form, setForm] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [salvoEm, setSalvoEm] = useState(null);
  const [extraindo, setExtraindo] = useState(false);
  const [avisoIA, setAvisoIA] = useState("");
  const [pdfSubindo, setPdfSubindo] = useState(false);
  const [vinculando, setVinculando] = useState(false);
  const [orcSelecionado, setOrcSelecionado] = useState("");
  const [modalEnviar, setModalEnviar] = useState(null); // null | "GERAL" | "FISCAL"
  const fileComercialRef = useRef(null);
  const fileTecnicaRef = useRef(null);
  const plpRef = useRef(null);
  const itpRef = useRef(null);
  const [anexoSubindo, setAnexoSubindo] = useState(""); // "" | "plp" | "itp"

  const set = (campo, valor) => setForm((p) => ({ ...p, [campo]: valor }));

  const carregar = async () => {
    setLoading(true); setErro("");
    try {
      const res = await fetch(`/api/comercial/op/${opId}/kickoff`);
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Erro");
      setData(j);
      const k = j.kickoff || {};
      setForm({
        pedidoCompraCliente: k.pedidoCompraCliente || "",
        entregaEndereco: k.entregaEndereco || "",
        frete: k.frete || "",
        padraoPintura: k.padraoPintura || j.sugestoes?.pintura || "",
        inspecao: k.inspecao || "",
        notaRetorno: k.notaRetorno || false,
        notaRetornoObs: k.notaRetornoObs || "",
        fiscalObservacao: k.fiscalObservacao || "",
        escopo: k.escopo || "",
        escopoIncluso: k.escopoIncluso || "",
        escopoExcluso: k.escopoExcluso || "",
        pontosAtencao: k.pontosAtencao || "",
        observacoes: k.observacoes || "",
        dataEntregaAcordada: toInputDate(k.dataEntregaAcordada) || toInputDate(j.op?.dataFimPrevista),
        cronograma: Array.isArray(k.cronograma) ? k.cronograma : [],
        prioridades: Array.isArray(k.prioridades) ? k.prioridades : [],
        temPrioridades: Array.isArray(k.prioridades) && k.prioridades.length > 0,
        pesoResumo: Array.isArray(k.pesoResumo) && k.pesoResumo.length ? k.pesoResumo : (j.sugestoes?.pesoResumo || []),
        propostaPdfUrl: k.propostaPdfUrl || null,
        propostaPdfNome: k.propostaPdfNome || null,
        propostaTecnicaPdfUrl: k.propostaTecnicaPdfUrl || null,
        propostaTecnicaPdfNome: k.propostaTecnicaPdfNome || null,
        pinturaPlpUrl: k.pinturaPlpUrl || null,
        pinturaPlpNome: k.pinturaPlpNome || null,
        inspecaoArquivoUrl: k.inspecaoArquivoUrl || null,
        inspecaoArquivoNome: k.inspecaoArquivoNome || null,
        tipoFaturamento: k.tipoFaturamento || "",
        faturamentoEventos: Array.isArray(k.faturamentoEventos) ? k.faturamentoEventos : [],
        retencaoContratual: k.retencaoContratual || "",
        segurosObrigatorios: k.segurosObrigatorios || "",
        kickoffComercialEm: toInputDate(k.kickoffComercialEm),
        kickoffSetoresEm: toInputDate(k.kickoffSetoresEm),
      });
    } catch (e) { setErro(e.message); } finally { setLoading(false); }
  };
  useEffect(() => { carregar(); /* eslint-disable-next-line */ }, [opId]);

  const salvar = async () => {
    setSalvando(true);
    try {
      const body = {
        ...form,
        frete: form.frete || null,
        cronograma: form.cronograma.filter((c) => c.fase?.trim()),
        prioridades: form.temPrioridades ? form.prioridades.filter((p) => p.descricao?.trim()).map((p, i) => ({ ...p, ordem: i + 1 })) : [],
        pesoResumo: form.pesoResumo.filter((p) => p.descricao?.trim()).map((p) => ({ descricao: p.descricao, qtd: p.qtd === "" || p.qtd == null ? null : Number(p.qtd), pesoKg: p.pesoKg === "" || p.pesoKg == null ? null : Number(p.pesoKg) })),
        faturamentoEventos: (form.faturamentoEventos || []).filter((ev) => ev.descricao?.trim()).map((ev) => ({
          descricao: ev.descricao,
          percentual: ev.percentual === "" || ev.percentual == null ? null : Number(ev.percentual),
          valor: ev.valor === "" || ev.valor == null ? null : Number(ev.valor),
          prazoPagamento: ev.prazoPagamento || null,
          medicao: ev.medicao || null,
          obsNF: ev.obsNF || null,
        })),
      };
      delete body.temPrioridades;
      const res = await fetch(`/api/comercial/op/${opId}/kickoff`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Erro ao salvar");
      setSalvoEm(new Date());
      return true;
    } catch (e) { alert("Falha ao salvar: " + e.message); return false; }
    finally { setSalvando(false); }
  };

  // ── Cronograma: gerar prévia distribuindo as fases até a entrega ─────────
  // Prioridades com data definida entram como marcos (★) no cronograma.
  const gerarCronograma = () => {
    if (!form.dataEntregaAcordada) { alert("Defina a data de entrega acordada primeiro."); return; }
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const fim = new Date(form.dataEntregaAcordada + "T12:00:00");
    const totalMs = fim.getTime() - hoje.getTime();
    if (totalMs <= 0) { alert("A data de entrega precisa ser futura."); return; }
    const linhas = FASES_PADRAO.map(({ fase, pct }) => {
      const d = new Date(hoje.getTime() + totalMs * pct);
      return { fase, data: d.toISOString().slice(0, 10), obs: "" };
    });
    if (form.temPrioridades) {
      for (const p of form.prioridades.filter((x) => x.descricao?.trim() && x.data)) {
        linhas.push({ fase: `★ Prioridade: ${p.descricao}`, data: p.data, obs: "" });
      }
    }
    linhas.sort((a, b) => (a.data || "").localeCompare(b.data || ""));
    if (form.cronograma.length && !confirm("Substituir o cronograma atual pela prévia gerada?")) return;
    set("cronograma", linhas);
  };
  const setCron = (i, campo, v) => set("cronograma", form.cronograma.map((c, idx) => (idx === i ? { ...c, [campo]: v } : c)));
  const addCron = () => set("cronograma", [...form.cronograma, { fase: "", data: "", obs: "" }]);
  const rmCron = (i) => set("cronograma", form.cronograma.filter((_, idx) => idx !== i));

  // ── Prioridades ──────────────────────────────────────────────────────────
  const setPrio = (i, campo, v) => set("prioridades", form.prioridades.map((p, idx) => (idx === i ? { ...p, [campo]: v } : p)));
  const addPrio = () => set("prioridades", [...form.prioridades, { ordem: form.prioridades.length + 1, descricao: "", data: "" }]);
  const rmPrio = (i) => set("prioridades", form.prioridades.filter((_, idx) => idx !== i));

  // ── Eventos de faturamento (aba fiscal) ──────────────────────────────────
  const setEvento = (i, campo, v) => set("faturamentoEventos", (form.faturamentoEventos || []).map((ev, idx) => (idx === i ? { ...ev, [campo]: v } : ev)));
  const addEvento = () => set("faturamentoEventos", [...(form.faturamentoEventos || []), { descricao: "", percentual: "", valor: "", prazoPagamento: "", medicao: "", obsNF: "" }]);
  const rmEvento = (i) => set("faturamentoEventos", (form.faturamentoEventos || []).filter((_, idx) => idx !== i));

  // ── Resumo de pesos ──────────────────────────────────────────────────────
  const setPeso = (i, campo, v) => set("pesoResumo", form.pesoResumo.map((p, idx) => (idx === i ? { ...p, [campo]: v } : p)));
  const addPeso = () => set("pesoResumo", [...form.pesoResumo, { descricao: "", qtd: "", pesoKg: "" }]);
  const rmPeso = (i) => set("pesoResumo", form.pesoResumo.filter((_, idx) => idx !== i));
  // Ignora linhas "TOTAL/SUBTOTAL" no somatório (evita duplicar o peso orçado)
  const pesoTotal = (form?.pesoResumo || [])
    .filter((p) => !/^(sub)?\s*total/i.test(String(p.descricao || "").trim()))
    .reduce((s, p) => s + (Number(p.pesoKg) || 0), 0);

  // ── Vincular orçamento (habilita pintura + pesos do estudo) ──────────────
  const vincularOrcamento = async () => {
    if (!orcSelecionado) return;
    setVinculando(true);
    try {
      const res = await fetch(`/api/comercial/orcamento/${orcSelecionado}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opId }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "Erro ao vincular");
      await carregar(); // recarrega com as sugestões do estudo
    } catch (e) { alert("Falha ao vincular: " + e.message); }
    finally { setVinculando(false); }
  };

  // ── Upload simples de anexo (PLP / documento de inspeção) ────────────────
  const onAnexo = async (file, campoUrl, campoNome, slot) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { alert("Arquivo acima de 10MB — reduza."); return; }
    setAnexoSubindo(slot);
    try {
      const fd = new FormData(); fd.append("file", file);
      const up = await fetch("/api/upload-blob", { method: "POST", body: fd });
      const upJ = await up.json();
      if (!up.ok) throw new Error(upJ.error || "Falha no upload");
      setForm((p) => ({ ...p, [campoUrl]: upJ.url, [campoNome]: upJ.nomeArquivo }));
    } catch (e) { alert("Falha no upload: " + e.message); }
    finally { setAnexoSubindo(""); }
  };

  // ── PDF da proposta (comercial ou técnica) + IA ──────────────────────────
  const onPdf = async (file, slot = "comercial") => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { alert("PDF acima de 10MB — reduza o arquivo."); return; }
    setAvisoIA(""); setPdfSubindo(true);
    try {
      const fd = new FormData(); fd.append("file", file);
      const up = await fetch("/api/upload-blob", { method: "POST", body: fd });
      const upJ = await up.json();
      if (!up.ok) throw new Error(upJ.error || "Falha no upload");
      setForm((p) => slot === "tecnica"
        ? ({ ...p, propostaTecnicaPdfUrl: upJ.url, propostaTecnicaPdfNome: upJ.nomeArquivo })
        : ({ ...p, propostaPdfUrl: upJ.url, propostaPdfNome: upJ.nomeArquivo }));
      setPdfSubindo(false);

      setExtraindo(true);
      const base64 = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = reject;
        r.readAsDataURL(file);
      });
      const res = await fetch(`/api/comercial/op/${opId}/kickoff/extrair`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pdfBase64: base64 }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Falha na extração");
      aplicarExtracao(j.dados);
    } catch (e) {
      setAvisoIA("Extração indisponível: " + e.message + " — preencha manualmente.");
    } finally {
      setPdfSubindo(false); setExtraindo(false);
    }
  };

  const aplicarExtracao = (d) => {
    const preenchidos = [];
    setForm((p) => {
      const n = { ...p, extraidoIA: d };
      const fill = (campo, valor) => {
        if (valor && !String(p[campo] || "").trim()) { n[campo] = valor; preenchidos.push(campo); }
      };
      fill("escopo", d.escopo);
      fill("padraoPintura", d.padraoPintura);
      fill("inspecao", d.inspecao);
      fill("entregaEndereco", d.entregaEndereco);
      fill("pedidoCompraCliente", d.pedidoCompraCliente);
      fill("fiscalObservacao", d.faturamentoObs);
      fill("tipoFaturamento", d.tipoFaturamento);
      fill("retencaoContratual", d.retencaoContratual);
      fill("segurosObrigatorios", d.segurosObrigatorios);
      if (d.escopoIncluso?.length && !String(p.escopoIncluso || "").trim()) { n.escopoIncluso = d.escopoIncluso.join("\n"); preenchidos.push("escopo incluído"); }
      if (d.escopoExcluso?.length && !String(p.escopoExcluso || "").trim()) { n.escopoExcluso = d.escopoExcluso.join("\n"); preenchidos.push("escopo excluído"); }
      if (d.resumoPesos?.length && !(p.pesoResumo || []).some((x) => x.descricao?.trim())) { n.pesoResumo = d.resumoPesos; preenchidos.push("resumo de pesos"); }
      if (d.faturamentoEventos?.length && !(p.faturamentoEventos || []).some((x) => x.descricao?.trim())) { n.faturamentoEventos = d.faturamentoEventos; preenchidos.push("eventos de faturamento"); }
      if (d.dataEntregaAcordada && !p.dataEntregaAcordada) { n.dataEntregaAcordada = d.dataEntregaAcordada; preenchidos.push("data de entrega"); }
      if (d.frete && !p.frete) { n.frete = d.frete; preenchidos.push("frete"); }
      if (d.notaRetorno === true && !p.notaRetorno) { n.notaRetorno = true; preenchidos.push("notaRetorno"); }
      // Pontos de atenção: nota livre do comercial — a IA não preenche.
      return n;
    });
    setAvisoIA(preenchidos.length
      ? `IA preencheu: ${preenchidos.join(", ")}. Revise antes de salvar — campos já digitados não foram alterados.`
      : "IA não encontrou nada novo para preencher.");
  };

  if (loading) return <div className="flex items-center justify-center py-20 gap-3 text-torg-gray"><Loader2 size={22} className="animate-spin" /> Carregando kick off…</div>;
  if (erro) return (
    <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center max-w-2xl">
      <AlertCircle size={32} className="mx-auto text-red-400 mb-3" />
      <p className="text-red-700 font-medium">{erro}</p>
      <button onClick={carregar} className="mt-3 px-4 py-2 bg-red-100 text-red-700 rounded-lg text-sm hover:bg-red-200">Tentar novamente</button>
    </div>
  );

  const { op } = data;
  const todosItens = [...(op.itens || []), ...(op.aditivos || []).flatMap((a) => a.itens)];
  const pontosList = String(form.pontosAtencao || "").split("\n").map((s) => s.trim()).filter(Boolean);
  const inclusoList = String(form.escopoIncluso || "").split("\n").map((s) => s.trim()).filter(Boolean);
  const exclusoList = String(form.escopoExcluso || "").split("\n").map((s) => s.trim()).filter(Boolean);

  return (
    <div className="space-y-5 max-w-5xl print:max-w-none">
      {/* Cabeçalho */}
      <div className="flex items-start justify-between flex-wrap gap-3 print:hidden">
        <div>
          <Link href={`/comercial/${opId}`} className="inline-flex items-center gap-1.5 text-sm text-torg-gray hover:text-torg-blue mb-1">
            <ArrowLeft size={14} /> Voltar para a OP
          </Link>
          <h2 className="text-3xl font-extrabold text-torg-dark tracking-tight flex items-center gap-2">
            <Rocket size={26} className="text-torg-orange" /> Kick Off — {fmtOP(op.numero)}
          </h2>
          <p className="text-sm text-torg-gray mt-1">{op.cliente}{op.obra ? ` · ${op.obra}` : ""} — alinhamento para divulgação aos setores.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-200 rounded-lg text-torg-gray hover:bg-gray-50">
            <Printer size={15} /> Imprimir
          </button>
          <button onClick={() => salvar()} disabled={salvando}
            className="inline-flex items-center gap-2 px-4 py-2 bg-torg-blue text-white rounded-lg hover:bg-torg-blue-700 text-sm font-medium disabled:opacity-50">
            {salvando ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
            {salvando ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </div>
      {salvoEm && <p className="text-xs text-emerald-600 -mt-3 print:hidden">✓ Salvo às {salvoEm.toLocaleTimeString("pt-BR")}</p>}

      {/* Cabeçalho de impressão */}
      <div className="hidden print:block border-b-2 border-gray-800 pb-2 mb-4">
        <h1 className="text-2xl font-extrabold">KICK OFF — OP {fmtOP(op.numero)}</h1>
        <p className="text-sm">{op.cliente}{op.obra ? ` · ${op.obra}` : ""} — emitido em {new Date().toLocaleDateString("pt-BR")}</p>
      </div>

      {/* Abas */}
      <div className="flex items-center justify-between flex-wrap gap-2 print:hidden">
        <div className="inline-flex bg-gray-100 rounded-lg p-1">
          {[["geral", "Kick Off"], ["fiscal", "Fiscal & Financeiro"]].map(([v, l]) => (
            <button key={v} onClick={() => setAba(v)}
              className={`inline-flex items-center px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                aba === v ? "bg-white text-torg-blue shadow-sm" : "text-torg-gray hover:text-torg-dark"
              }`}>
              {l}
            </button>
          ))}
        </div>
        <button onClick={() => setModalEnviar(aba === "fiscal" ? "FISCAL" : "GERAL")}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-torg-orange text-white rounded-lg hover:bg-orange-600 text-sm font-medium">
          <Send size={15} /> {aba === "fiscal" ? "Enviar ao fiscal/financeiro" : "Divulgar aos setores"}
        </button>
      </div>

      {/* ═══════ ABA GERAL ═══════ */}
      <div className={aba === "geral" ? "space-y-5" : "hidden print:block print:space-y-5"}>

        {/* Vincular orçamento (habilita pintura/pesos do estudo) */}
        {data.orcamentosCandidatos?.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 print:hidden">
            <p className="text-sm font-semibold text-amber-900 flex items-center gap-2 mb-1"><Link2 size={15} /> Esta OP não está vinculada a nenhum orçamento</p>
            <p className="text-xs text-amber-800 mb-2">Vinculando, o padrão de pintura e o resumo de pesos vêm automaticamente da planilha comercial (estudo da proposta).</p>
            <div className="flex items-center gap-2 flex-wrap">
              <select value={orcSelecionado} onChange={(e) => setOrcSelecionado(e.target.value)}
                className="px-3 py-1.5 text-sm border border-amber-300 rounded-lg bg-white max-w-md">
                <option value="">Selecione o orçamento…</option>
                {data.orcamentosCandidatos.map((o) => (
                  <option key={o.id} value={o.id}>{o.numero} — {o.cliente}{o.obra ? ` (${o.obra})` : ""} [{o.status}]</option>
                ))}
              </select>
              <button onClick={vincularOrcamento} disabled={!orcSelecionado || vinculando}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50">
                {vinculando ? <Loader2 size={13} className="animate-spin" /> : <Link2 size={13} />} Vincular
              </button>
            </div>
          </div>
        )}

        {/* Propostas PDF (comercial + técnica) + IA */}
        <div className="bg-white rounded-xl shadow-sm border border-torg-blue-100 p-4 print:hidden">
          <p className="text-sm font-semibold text-torg-dark flex items-center gap-2 mb-3">
            <Sparkles size={15} className="text-torg-orange" /> Propostas (PDF) + extração automática
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { slot: "comercial", titulo: "Proposta comercial", url: form.propostaPdfUrl, nome: form.propostaPdfNome, ref: fileComercialRef },
              { slot: "tecnica", titulo: "Proposta técnica", url: form.propostaTecnicaPdfUrl, nome: form.propostaTecnicaPdfNome, ref: fileTecnicaRef },
            ].map((s) => (
              <div key={s.slot} className="border border-gray-100 rounded-lg p-3">
                <p className="text-xs font-semibold text-torg-gray uppercase tracking-wide mb-1.5">{s.titulo}</p>
                <div className="flex items-center gap-2 flex-wrap">
                  {s.url ? (
                    <a href={s.url} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm text-torg-blue hover:underline min-w-0">
                      <FileText size={14} className="shrink-0" /> <span className="truncate max-w-[180px]">{s.nome || "proposta.pdf"}</span>
                    </a>
                  ) : (
                    <span className="text-xs text-torg-gray">Não anexada.</span>
                  )}
                  <button onClick={() => s.ref.current?.click()} disabled={pdfSubindo || extraindo}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs border border-torg-blue-100 text-torg-blue rounded-lg hover:bg-torg-blue-50 disabled:opacity-50">
                    {pdfSubindo ? <Loader2 size={13} className="animate-spin" /> : <UploadCloud size={13} />}
                    {s.url ? "Trocar" : "Subir PDF"}
                  </button>
                  <input ref={s.ref} type="file" accept=".pdf,application/pdf" className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) onPdf(f, s.slot); e.target.value = ""; }} />
                </div>
              </div>
            ))}
          </div>
          {extraindo && <p className="inline-flex items-center gap-1.5 text-sm text-torg-orange mt-2"><Loader2 size={14} className="animate-spin" /> Lendo a proposta com IA…</p>}
          {avisoIA && <p className="text-xs text-torg-gray mt-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{avisoIA}</p>}
          <p className="text-[11px] text-torg-gray mt-2">Cada PDF subido passa pela IA e preenche só os campos ainda vazios — sempre revise.</p>
        </div>

        {/* Dados do cliente */}
        <Secao icone={Building2} titulo="Dados do cliente" subtitulo="Do cadastro fiscal da OP.">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
            <Campo label="Razão social" valor={op.clienteRazaoSocial || op.cliente} />
            <Campo label="CNPJ" valor={op.clienteCnpj} />
            <Campo label="Contato" valor={op.clienteContato} />
            <Campo label="E-mail" valor={op.clienteEmail} />
          </div>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-torg-gray mb-1">Nº do pedido de compra / contrato do cliente</label>
              <input type="text" value={form.pedidoCompraCliente} onChange={(e) => set("pedidoCompraCliente", e.target.value)}
                placeholder="Ex.: PC-2026-00123" className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-torg-blue/20 focus:border-torg-blue outline-none" />
              <p className="text-[10px] text-torg-gray mt-0.5">Nem sempre existe no ato do kick off — pode preencher depois e reenviar a divulgação.</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-torg-gray mb-1">Data de entrega acordada com o cliente</label>
              <input type="date" value={form.dataEntregaAcordada} onChange={(e) => set("dataEntregaAcordada", e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg" />
            </div>
          </div>
        </Secao>

        {/* Escopo estruturado */}
        <Secao icone={ClipboardList} titulo="Escopo" subtitulo="Resumo curto + listas claras do que entra e do que não entra.">
          <label className="block text-xs font-medium text-torg-gray mb-1">Resumo do fornecimento (2-4 frases)</label>
          <textarea value={form.escopo} onChange={(e) => set("escopo", e.target.value)} rows={3}
            placeholder="O que é a obra e o que a Torg vai entregar…"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-torg-blue/20 focus:border-torg-blue outline-none mb-3" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-emerald-700 mb-1">✅ Incluído no fornecimento (um por linha)</label>
              <textarea value={form.escopoIncluso} onChange={(e) => set("escopoIncluso", e.target.value)} rows={6}
                placeholder={"Fabricação da estrutura\nPintura conforme esquema\nTransporte até a obra"}
                className="w-full px-3 py-2 text-sm border border-emerald-200 rounded-lg focus:ring-2 focus:ring-emerald-200 outline-none" />
            </div>
            <div>
              <label className="block text-xs font-medium text-red-700 mb-1">🚫 Excluído / por conta do cliente (um por linha)</label>
              <textarea value={form.escopoExcluso} onChange={(e) => set("escopoExcluso", e.target.value)} rows={6}
                placeholder={"Fundações e chumbadores\nEnergia no canteiro\nAndaimes"}
                className="w-full px-3 py-2 text-sm border border-red-200 rounded-lg focus:ring-2 focus:ring-red-200 outline-none" />
            </div>
          </div>
          {(inclusoList.length > 0 || exclusoList.length > 0) && (
            <div className="hidden print:grid grid-cols-2 gap-4 mt-2">
              <ul className="text-sm space-y-0.5">{inclusoList.map((i, x) => <li key={x}>✅ {i}</li>)}</ul>
              <ul className="text-sm space-y-0.5">{exclusoList.map((i, x) => <li key={x}>🚫 {i}</li>)}</ul>
            </div>
          )}
        </Secao>

        {/* Resumo de pesos */}
        <Secao icone={Scale} titulo="Resumo de pesos (planilha comercial)" subtitulo="Quantidades e pesos — sem valores em R$.">
          <table className="w-full text-sm mb-2">
            <thead>
              <tr className="text-left text-xs text-torg-gray border-b border-gray-100">
                <th className="pb-1.5">Grupo / item</th>
                <th className="pb-1.5 w-24 text-right">Qtd</th>
                <th className="pb-1.5 w-32 text-right">Peso (kg)</th>
                <th className="pb-1.5 w-8 print:hidden"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {form.pesoResumo.map((p, i) => (
                <tr key={i}>
                  <td className="py-1 pr-2">
                    <input type="text" value={p.descricao} onChange={(e) => setPeso(i, "descricao", e.target.value)}
                      placeholder="Ex.: Estrutura principal, telhas…"
                      className="w-full px-2 py-1 text-sm border border-gray-200 rounded print:border-0" />
                  </td>
                  <td className="py-1 pr-2">
                    <input type="number" value={p.qtd ?? ""} onChange={(e) => setPeso(i, "qtd", e.target.value)}
                      className="w-full px-2 py-1 text-sm border border-gray-200 rounded text-right print:border-0" />
                  </td>
                  <td className="py-1 pr-2">
                    <input type="number" value={p.pesoKg ?? ""} onChange={(e) => setPeso(i, "pesoKg", e.target.value)}
                      className="w-full px-2 py-1 text-sm border border-gray-200 rounded text-right print:border-0" />
                  </td>
                  <td className="py-1 print:hidden">
                    <button onClick={() => rmPeso(i)} className="text-gray-300 hover:text-red-500"><Trash2 size={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-center justify-between">
            <button onClick={addPeso} className="inline-flex items-center gap-1 text-xs text-torg-blue hover:underline print:hidden"><Plus size={13} /> Adicionar linha</button>
            {pesoTotal > 0 && <span className="text-sm font-bold text-torg-dark">Total: {fmtKg(Math.round(pesoTotal))}</span>}
          </div>
        </Secao>

        {/* Cronograma prévio */}
        <Secao icone={CalendarRange} titulo="Cronograma prévio" subtitulo="Datas-limite por fase/setor para garantir a entrega acordada.">
          <div className="flex items-center gap-2 mb-3 print:hidden">
            <button onClick={gerarCronograma}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-torg-blue-50 text-torg-blue border border-torg-blue-100 rounded-lg hover:bg-torg-blue-100">
              <Wand2 size={14} /> Gerar prévia a partir da entrega {form.dataEntregaAcordada ? `(${fmtData(form.dataEntregaAcordada + "T12:00")})` : ""}
            </button>
            <span className="text-[11px] text-torg-gray">Distribui as fases padrão até a data de entrega — ajuste depois.</span>
          </div>
          {form.cronograma.length === 0 ? (
            <p className="text-sm text-torg-gray">Nenhuma fase ainda — gere a prévia ou adicione manualmente.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-torg-gray border-b border-gray-100">
                  <th className="pb-1.5">Fase / setor</th>
                  <th className="pb-1.5 w-36">Data limite</th>
                  <th className="pb-1.5">Obs.</th>
                  <th className="pb-1.5 w-8 print:hidden"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {form.cronograma.map((c, i) => (
                  <tr key={i}>
                    <td className="py-1 pr-2">
                      <input type="text" value={c.fase} onChange={(e) => setCron(i, "fase", e.target.value)}
                        className="w-full px-2 py-1 text-sm border border-gray-200 rounded font-medium print:border-0" />
                    </td>
                    <td className="py-1 pr-2">
                      <input type="date" value={c.data || ""} onChange={(e) => setCron(i, "data", e.target.value)}
                        className="w-full px-2 py-1 text-sm border border-gray-200 rounded print:border-0" />
                    </td>
                    <td className="py-1 pr-2">
                      <input type="text" value={c.obs || ""} onChange={(e) => setCron(i, "obs", e.target.value)}
                        className="w-full px-2 py-1 text-sm border border-gray-200 rounded print:border-0" />
                    </td>
                    <td className="py-1 print:hidden">
                      <button onClick={() => rmCron(i)} className="text-gray-300 hover:text-red-500"><Trash2 size={14} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <button onClick={addCron} className="inline-flex items-center gap-1 text-xs text-torg-blue hover:underline mt-2 print:hidden"><Plus size={13} /> Adicionar fase</button>

          {/* Gantt — visão das fases na linha do tempo */}
          <Gantt cronograma={form.cronograma} entrega={form.dataEntregaAcordada} />
        </Secao>

        {/* Prioridades (opcional) */}
        <Secao icone={ListOrdered} titulo="Prioridades de fase, peça ou entrega" subtitulo="Opcional — só para obras com prioridades definidas pelo cliente.">
          <label className="inline-flex items-center gap-2 text-sm text-torg-dark cursor-pointer mb-2 print:hidden">
            <input type="checkbox" checked={form.temPrioridades} onChange={(e) => set("temPrioridades", e.target.checked)}
              className="rounded border-gray-300 text-torg-blue focus:ring-torg-blue" />
            Esta obra tem prioridades
          </label>
          {form.temPrioridades && (
            <>
              {form.prioridades.map((p, i) => (
                <div key={i} className="flex items-center gap-2 mb-1.5">
                  <span className="w-7 h-7 rounded-full bg-torg-blue-50 text-torg-blue text-xs font-bold flex items-center justify-center shrink-0">{i + 1}º</span>
                  <input type="text" value={p.descricao} onChange={(e) => setPrio(i, "descricao", e.target.value)}
                    placeholder="Fase, peça ou entrega prioritária…"
                    className="flex-1 px-2 py-1.5 text-sm border border-gray-200 rounded-lg print:border-0" />
                  <input type="date" value={p.data || ""} onChange={(e) => setPrio(i, "data", e.target.value)}
                    className="w-40 px-2 py-1.5 text-sm border border-gray-200 rounded-lg print:border-0" />
                  <button onClick={() => rmPrio(i)} className="text-gray-300 hover:text-red-500 print:hidden"><Trash2 size={14} /></button>
                </div>
              ))}
              <button onClick={addPrio} className="inline-flex items-center gap-1 text-xs text-torg-blue hover:underline print:hidden"><Plus size={13} /> Adicionar prioridade</button>
            </>
          )}
        </Secao>

        {/* Entrega e frete */}
        <Secao icone={Truck} titulo="Entrega e frete">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-medium text-torg-gray">Frete:</span>
            {[["TORG", "Por conta da Torg (CIF)"], ["CLIENTE", "Por conta do cliente (FOB)"]].map(([v, l]) => (
              <button key={v} onClick={() => set("frete", form.frete === v ? "" : v)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border-2 transition-colors ${
                  form.frete === v ? "border-torg-blue bg-torg-blue-50 text-torg-blue" : "border-gray-200 text-torg-gray hover:border-gray-300"
                }`}>
                {l}
              </button>
            ))}
          </div>
          <label className="block text-xs font-medium text-torg-gray mb-1">Endereço de entrega (obrigatório mesmo quando o frete não é nosso)</label>
          <textarea value={form.entregaEndereco} onChange={(e) => set("entregaEndereco", e.target.value)} rows={2}
            placeholder="Endereço completo da obra/local de entrega…"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-torg-blue/20 focus:border-torg-blue outline-none" />
        </Secao>

        {/* Pintura */}
        <Secao icone={Paintbrush} titulo="Padrão de pintura" subtitulo={data.sugestoes?.pintura ? "Pré-preenchido do estudo da proposta — confirme." : "Sem estudo vinculado — preencha, vincule o orçamento acima ou use a extração do PDF."}>
          <textarea value={form.padraoPintura} onChange={(e) => set("padraoPintura", e.target.value)} rows={4}
            placeholder="Esquema (primer/acabamento), produtos, demãos, espessuras (µm), cor, norma…"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-torg-blue/20 focus:border-torg-blue outline-none font-mono" />
          <AnexoRow label="PLP (Plano de Pintura)" url={form.pinturaPlpUrl} nome={form.pinturaPlpNome}
            subindo={anexoSubindo === "plp"} inputRef={plpRef}
            onPick={(f) => onAnexo(f, "pinturaPlpUrl", "pinturaPlpNome", "plp")} />
        </Secao>

        {/* Inspeção */}
        <Secao icone={SearchCheck} titulo="Inspeção" subtitulo="Resumo curto + documento completo anexado (ITP/plano de inspeção).">
          <textarea value={form.inspecao} onChange={(e) => set("inspecao", e.target.value)} rows={3}
            placeholder="Resumo dos requisitos (ensaios, inspetor do cliente, liberações)…"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-torg-blue/20 focus:border-torg-blue outline-none" />
          <AnexoRow label="Documento de inspeção (ITP)" url={form.inspecaoArquivoUrl} nome={form.inspecaoArquivoNome}
            subindo={anexoSubindo === "itp"} inputRef={itpRef}
            onPick={(f) => onAnexo(f, "inspecaoArquivoUrl", "inspecaoArquivoNome", "itp")} />
        </Secao>

        {/* Pontos de atenção — nota livre do comercial (a IA não preenche) */}
        <Secao icone={AlertTriangle} titulo="Pontos de atenção" subtitulo="Nota livre do comercial — um ponto por linha (a extração da proposta não mexe aqui).">
          <textarea value={form.pontosAtencao} onChange={(e) => set("pontosAtencao", e.target.value)} rows={4}
            placeholder={"Multa por atraso de 0,5%/dia\nCliente fornece os chumbadores\nMontagem só aos fins de semana…"}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-torg-blue/20 focus:border-torg-blue outline-none" />
          {pontosList.length > 0 && (
            <ul className="mt-2 space-y-1">
              {pontosList.map((p, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-red-800 bg-red-50 border border-red-100 rounded-lg px-3 py-1.5">
                  <AlertTriangle size={13} className="mt-0.5 shrink-0 text-red-500" /> {p}
                </li>
              ))}
            </ul>
          )}
        </Secao>

        {/* Reuniões + observações */}
        <Secao icone={CheckCircle2} titulo="Reuniões e observações">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-3">
            <div>
              <label className="block text-xs font-medium text-torg-gray mb-1">Kick off com o comercial (data)</label>
              <input type="date" value={form.kickoffComercialEm} onChange={(e) => set("kickoffComercialEm", e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg" />
            </div>
            <div>
              <label className="block text-xs font-medium text-torg-gray mb-1">Kick off com os setores (data)</label>
              <input type="date" value={form.kickoffSetoresEm} onChange={(e) => set("kickoffSetoresEm", e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg" />
            </div>
          </div>
          <textarea value={form.observacoes} onChange={(e) => set("observacoes", e.target.value)} rows={3}
            placeholder="Outras observações…"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-torg-blue/20 focus:border-torg-blue outline-none" />
        </Secao>
      </div>

      {/* ═══════ ABA FISCAL & FINANCEIRO ═══════ */}
      <div className={aba === "fiscal" ? "space-y-5" : "hidden print:block print:space-y-5"}>
        <Secao icone={Building2} titulo="Dados fiscais do cliente" subtitulo="Do cadastro fiscal da OP — edite lá se algo estiver errado.">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
            <Campo label="Razão social" valor={op.clienteRazaoSocial || op.cliente} />
            <Campo label="CNPJ" valor={op.clienteCnpj} />
            <Campo label="IE" valor={op.clienteIE} />
            <Campo label="Pedido de compra do cliente" valor={form.pedidoCompraCliente} />
            <Campo label="Endereço fiscal" valor={[op.clienteEndereco, op.clienteCidade && `${op.clienteCidade}/${op.clienteUF || ""}`, op.clienteCep].filter(Boolean).join(" — ")} span />
            <Campo label="Local de entrega" valor={form.entregaEndereco} span />
          </div>
        </Secao>

        <Secao icone={Receipt} titulo="Faturamento por linha do pedido" subtitulo="A flag Torg/Direto vem do contrato (sem valores neste documento).">
          <div className="overflow-x-auto mb-3">
            <table className="w-full text-sm border border-gray-100 rounded-lg overflow-hidden">
              <thead className="bg-gray-50/60">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Item</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Categoria</th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">Faturamento</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {todosItens.map((it, i) => (
                  <tr key={it.id || i}>
                    <td className="px-3 py-2 text-torg-dark">{it.descricao}</td>
                    <td className="px-3 py-2 text-torg-gray text-xs">{it.categoria || "—"}</td>
                    <td className="px-3 py-2 text-center">
                      <span className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold ${it.faturamentoDireto ? "bg-amber-100 text-amber-800" : "bg-torg-blue-50 text-torg-blue"}`}>
                        {it.faturamentoDireto ? "Direto (cliente)" : "Torg"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center gap-3 mb-3">
            <label className="inline-flex items-center gap-2 text-sm text-torg-dark cursor-pointer">
              <input type="checkbox" checked={form.notaRetorno} onChange={(e) => set("notaRetorno", e.target.checked)}
                className="rounded border-gray-300 text-torg-blue focus:ring-torg-blue" />
              Há necessidade de <strong>nota de retorno</strong>
            </label>
            {form.notaRetorno && (
              <input type="text" value={form.notaRetornoObs} onChange={(e) => set("notaRetornoObs", e.target.value)}
                placeholder="Detalhe (material do cliente, remessa p/ industrialização…)"
                className="flex-1 px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-torg-blue/20 outline-none" />
            )}
          </div>
        </Secao>

        <Secao icone={Receipt} titulo="Como será o faturamento" subtitulo="Em linhas, não em texto — eventos com %, valor, prazo de pagamento, medição e observação da NF.">
          <div className="mb-3">
            <label className="block text-xs font-medium text-torg-gray mb-1">Tipo de faturamento (definido na proposta)</label>
            <input type="text" value={form.tipoFaturamento} onChange={(e) => set("tipoFaturamento", e.target.value)}
              placeholder="Ex.: por medições mensais · por eventos · 30/60/90…"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-torg-blue/20 outline-none" />
          </div>

          <p className="text-xs font-medium text-torg-gray mb-1.5">Eventos de faturamento</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[760px]">
              <thead>
                <tr className="text-left text-xs text-torg-gray border-b border-gray-100">
                  <th className="pb-1.5">Evento</th>
                  <th className="pb-1.5 w-16 text-right">%</th>
                  <th className="pb-1.5 w-32 text-right">Valor (R$)</th>
                  <th className="pb-1.5 w-36">Prazo pgto.</th>
                  <th className="pb-1.5 w-28">Medição (Omie)</th>
                  <th className="pb-1.5">Obs. na NF</th>
                  <th className="pb-1.5 w-8 print:hidden"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {(form.faturamentoEventos || []).map((ev, i) => (
                  <tr key={i}>
                    <td className="py-1 pr-2"><input type="text" value={ev.descricao || ""} onChange={(e) => setEvento(i, "descricao", e.target.value)} placeholder="Entrada, Medição 1…" className="w-full px-2 py-1 text-sm border border-gray-200 rounded font-medium print:border-0" /></td>
                    <td className="py-1 pr-2"><input type="number" value={ev.percentual ?? ""} onChange={(e) => setEvento(i, "percentual", e.target.value)} className="w-full px-2 py-1 text-sm border border-gray-200 rounded text-right print:border-0" /></td>
                    <td className="py-1 pr-2"><input type="number" value={ev.valor ?? ""} onChange={(e) => setEvento(i, "valor", e.target.value)} className="w-full px-2 py-1 text-sm border border-gray-200 rounded text-right print:border-0" /></td>
                    <td className="py-1 pr-2"><input type="text" value={ev.prazoPagamento || ""} onChange={(e) => setEvento(i, "prazoPagamento", e.target.value)} placeholder="28 dias após NF" className="w-full px-2 py-1 text-sm border border-gray-200 rounded print:border-0" /></td>
                    <td className="py-1 pr-2"><input type="text" value={ev.medicao || ""} onChange={(e) => setEvento(i, "medicao", e.target.value)} placeholder="233/1" className="w-full px-2 py-1 text-sm border border-gray-200 rounded text-center print:border-0" /></td>
                    <td className="py-1 pr-2"><input type="text" value={ev.obsNF || ""} onChange={(e) => setEvento(i, "obsNF", e.target.value)} className="w-full px-2 py-1 text-sm border border-gray-200 rounded print:border-0" /></td>
                    <td className="py-1 print:hidden"><button onClick={() => rmEvento(i)} className="text-gray-300 hover:text-red-500"><Trash2 size={14} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button onClick={addEvento} className="inline-flex items-center gap-1 text-xs text-torg-blue hover:underline mt-1.5 print:hidden"><Plus size={13} /> Adicionar evento</button>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
            <div>
              <label className="block text-xs font-medium text-torg-gray mb-1">Retenção contratual</label>
              <input type="text" value={form.retencaoContratual} onChange={(e) => set("retencaoContratual", e.target.value)}
                placeholder="Ex.: 5% — liberação após entrega/CND (vazio = sem retenção)"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-torg-blue/20 outline-none" />
            </div>
            <div>
              <label className="block text-xs font-medium text-torg-gray mb-1">Seguros obrigatórios</label>
              <input type="text" value={form.segurosObrigatorios} onChange={(e) => set("segurosObrigatorios", e.target.value)}
                placeholder="Ex.: seguro garantia 10%, RC, riscos de engenharia…"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-torg-blue/20 outline-none" />
            </div>
          </div>

          <label className="block text-xs font-medium text-torg-gray mb-1 mt-3">Observações complementares</label>
          <textarea value={form.fiscalObservacao} onChange={(e) => set("fiscalObservacao", e.target.value)} rows={2}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-torg-blue/20 focus:border-torg-blue outline-none" />
        </Secao>
      </div>

      {/* Aceites dos setores */}
      {data.kickoff?.aceites?.length > 0 && (
        <Secao icone={CheckCircle2} titulo="Registro de aceites" subtitulo="Quem confirmou estar de acordo com as informações divulgadas.">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {data.kickoff.aceites.map((a) => (
              <div key={a.id} className={`flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg border ${
                a.aceitoEm ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-gray-50 border-gray-200 text-torg-gray"
              }`}>
                {a.aceitoEm ? <CheckCircle2 size={14} className="text-emerald-600 shrink-0" /> : <Loader2 size={14} className="shrink-0 text-gray-400" />}
                <span className="flex-1 truncate" title={a.email}>{a.email}</span>
                <span className="text-[10px] shrink-0 uppercase">{a.tipo === "FISCAL" ? "fiscal" : "geral"}</span>
                <span className="text-[11px] shrink-0">{a.aceitoEm ? new Date(a.aceitoEm).toLocaleDateString("pt-BR") : "pendente"}</span>
              </div>
            ))}
          </div>
        </Secao>
      )}

      {/* Rodapé salvar */}
      <div className="flex items-center justify-end gap-2 print:hidden">
        <button onClick={() => salvar()} disabled={salvando}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-torg-blue text-white rounded-lg hover:bg-torg-blue-700 text-sm font-semibold disabled:opacity-50">
          {salvando ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Salvar Kick Off
        </button>
      </div>

      {modalEnviar && (
        <ModalEnviarSetores
          opId={opId}
          tipo={modalEnviar}
          enviadoPara={data.kickoff?.enviadoPara || ""}
          onSalvarAntes={salvar}
          onClose={() => setModalEnviar(null)}
        />
      )}
    </div>
  );
}

/* ─── Modal: enviar por e-mail com seleção de setores ───────────────────── */
function ModalEnviarSetores({ opId, tipo, enviadoPara, onSalvarAntes, onClose }) {
  const [setores, setSetores] = useState(null);
  const [marcados, setMarcados] = useState(() => new Set(tipo === "FISCAL" ? ["FINANCEIRO"] : []));
  const [extras, setExtras] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    fetch("/api/comercial/kickoff-destinatarios")
      .then((r) => r.json())
      .then((j) => setSetores(j.setores || []))
      .catch(() => setSetores([]));
  }, []);

  const toggle = (m) => setMarcados((p) => {
    const n = new Set(p);
    if (n.has(m)) n.delete(m); else n.add(m);
    return n;
  });

  const emailsSelecionados = () => {
    const out = new Set();
    for (const s of setores || []) {
      if (marcados.has(s.modulo)) s.emails.forEach((e) => out.add(e.email));
    }
    extras.split(/[,;]/).map((s) => s.trim()).filter(Boolean).forEach((e) => out.add(e));
    return [...out];
  };
  const totalEmails = emailsSelecionados().length;

  const enviar = async () => {
    setEnviando(true);
    try {
      const salvou = await onSalvarAntes();
      if (!salvou) return;
      const res = await fetch(`/api/comercial/op/${opId}/kickoff/enviar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ para: emailsSelecionados().join(", "), mensagem: mensagem.trim() || null, tipo }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Erro ao enviar");
      setOk(true);
      setTimeout(onClose, 1500);
    } catch (e) { alert("Falha ao enviar: " + e.message); }
    finally { setEnviando(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => !enviando && onClose()}>
      <div className="bg-white rounded-2xl shadow-xl max-w-xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-torg-dark flex items-center gap-2">
            <Send size={16} className="text-torg-blue" />
            {tipo === "FISCAL" ? "Enviar ao fiscal/financeiro" : "Divulgar a nova obra aos setores 🚀"}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        {ok ? (
          <p className="text-emerald-700 text-sm flex items-center gap-2"><CheckCircle2 size={16} /> Enviado para {totalEmails} destinatário(s)!</p>
        ) : (
          <>
            <div>
              <p className="text-xs font-medium text-torg-gray mb-2">Selecione os setores (e-mails dos usuários de cada módulo):</p>
              {!setores ? (
                <p className="text-sm text-torg-gray flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Carregando setores…</p>
              ) : setores.length === 0 ? (
                <p className="text-sm text-torg-gray">Nenhum setor com e-mail — use o campo de e-mails abaixo.</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {setores.map((s) => (
                    <label key={s.modulo} className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border text-sm cursor-pointer transition-colors ${
                      marcados.has(s.modulo) ? "border-torg-blue bg-torg-blue-50 text-torg-blue font-medium" : "border-gray-200 text-torg-dark hover:bg-gray-50"
                    }`}>
                      <input type="checkbox" checked={marcados.has(s.modulo)} onChange={() => toggle(s.modulo)}
                        className="rounded border-gray-300 text-torg-blue focus:ring-torg-blue" />
                      <span className="flex-1 truncate">{s.label}</span>
                      <span className="text-[10px] text-torg-gray">{s.emails.length}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-torg-gray mb-1">Outros e-mails (opcional, separe por vírgula)</label>
              <input type="text" value={extras} onChange={(e) => setExtras(e.target.value)}
                placeholder={enviadoPara || "fulano@torg.com.br…"}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-torg-blue/20 outline-none" />
            </div>
            <div>
              <label className="block text-xs font-medium text-torg-gray mb-1">Mensagem de abertura (opcional)</label>
              <textarea value={mensagem} onChange={(e) => setMensagem(e.target.value)} rows={2}
                placeholder={tipo === "FISCAL" ? "Observações para o fiscal/financeiro…" : "Bora, time! Mais uma obra confirmada…"}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-torg-blue/20 outline-none" />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-torg-gray">{totalEmails} destinatário(s) selecionado(s)</span>
              <div className="flex gap-2">
                <button onClick={onClose} disabled={enviando} className="px-4 py-2 text-sm text-torg-gray border border-gray-200 rounded-lg hover:bg-gray-50">Cancelar</button>
                <button onClick={enviar} disabled={enviando || totalEmails === 0}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-torg-blue text-white text-sm font-medium rounded-lg hover:bg-torg-blue-700 disabled:opacity-50">
                  {enviando ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Enviar
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* Gantt simples: barras na linha do tempo entre a primeira fase e a entrega. */
function Gantt({ cronograma, entrega }) {
  const fases = (cronograma || []).filter((c) => c.fase?.trim() && c.data).sort((a, b) => a.data.localeCompare(b.data));
  if (fases.length < 2) return null;
  const inicio = new Date().toISOString().slice(0, 10) < fases[0].data ? new Date().toISOString().slice(0, 10) : fases[0].data;
  const fim = entrega && entrega > fases[fases.length - 1].data ? entrega : fases[fases.length - 1].data;
  const t0 = new Date(inicio + "T00:00:00").getTime();
  const t1 = new Date(fim + "T23:59:59").getTime();
  const span = Math.max(t1 - t0, 1);
  const pct = (d) => Math.min(100, Math.max(0, ((new Date(d + "T12:00:00").getTime() - t0) / span) * 100));
  const fmtCurta = (s) => { const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? `${m[3]}/${m[2]}` : s; };

  return (
    <div className="mt-4 border-t border-gray-100 pt-3 print:break-inside-avoid">
      <p className="text-xs font-semibold text-torg-gray uppercase tracking-wide mb-2">Gantt — linha do tempo</p>
      <div className="space-y-1">
        {fases.map((f, i) => {
          const inicioBarra = i === 0 ? 0 : pct(fases[i - 1].data);
          const fimBarra = pct(f.data);
          const prio = f.fase.startsWith("★");
          return (
            <div key={i} className="flex items-center gap-2 text-[11px]">
              <span className="w-56 truncate text-torg-dark shrink-0 text-right pr-1" title={f.fase}>{f.fase}</span>
              <div className="flex-1 h-5 bg-gray-50 rounded relative overflow-hidden">
                <div
                  className={`absolute top-0.5 bottom-0.5 rounded ${prio ? "bg-amber-400" : "bg-torg-blue/70"}`}
                  style={{ left: `${Math.min(inicioBarra, fimBarra)}%`, width: `${Math.max(Math.abs(fimBarra - inicioBarra), 1.5)}%` }}
                />
                <span className="absolute top-0 bottom-0 flex items-center text-[10px] text-torg-gray font-medium tabular-nums"
                  style={{ left: `${Math.min(fimBarra + 1, 88)}%` }}>
                  {fmtCurta(f.data)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex justify-between text-[10px] text-torg-gray mt-1 pl-58" style={{ paddingLeft: "14.5rem" }}>
        <span>{fmtCurta(inicio)}</span>
        <span>{fmtCurta(fim)}{entrega ? " (entrega)" : ""}</span>
      </div>
    </div>
  );
}

/* Linha de anexo (PLP / ITP): link + botão subir/trocar. */
function AnexoRow({ label, url, nome, subindo, inputRef, onPick }) {
  return (
    <div className="flex items-center gap-2 flex-wrap mt-2 pt-2 border-t border-gray-50">
      <span className="text-xs font-medium text-torg-gray">{label}:</span>
      {url ? (
        <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm text-torg-blue hover:underline min-w-0">
          <FileText size={14} className="shrink-0" /> <span className="truncate max-w-[220px]">{nome || "arquivo"}</span>
        </a>
      ) : (
        <span className="text-xs text-torg-gray">não anexado</span>
      )}
      <button onClick={() => inputRef.current?.click()} disabled={subindo}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs border border-torg-blue-100 text-torg-blue rounded-lg hover:bg-torg-blue-50 disabled:opacity-50 print:hidden">
        {subindo ? <Loader2 size={12} className="animate-spin" /> : <UploadCloud size={12} />}
        {url ? "Trocar" : "Subir arquivo"}
      </button>
      <input ref={inputRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx,application/pdf" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onPick(f); e.target.value = ""; }} />
    </div>
  );
}

function Secao({ icone: Icon, titulo, subtitulo, children }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 print:border-gray-300 print:shadow-none print:break-inside-avoid">
      <p className="text-sm font-bold text-torg-dark flex items-center gap-2">{Icon && <Icon size={15} className="text-torg-blue print:hidden" />} {titulo}</p>
      {subtitulo && <p className="text-[11px] text-torg-gray mb-3 mt-0.5">{subtitulo}</p>}
      {!subtitulo && <div className="mb-3" />}
      {children}
    </div>
  );
}

function Campo({ label, valor, span }) {
  return (
    <div className={span ? "sm:col-span-2" : ""}>
      <span className="text-torg-gray text-xs">{label}: </span>
      <span className="text-torg-dark font-medium">{valor || "—"}</span>
    </div>
  );
}
