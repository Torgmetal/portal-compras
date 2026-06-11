"use client";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  ArrowLeft, Loader2, AlertCircle, Save, Send, Printer, Sparkles,
  UploadCloud, FileText, X, Building2, Truck, Paintbrush, SearchCheck,
  Receipt, ClipboardList, AlertTriangle, CheckCircle2, Rocket,
} from "lucide-react";
import { fmtOP } from "@/lib/utils";

const fmtMoeda = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtData = (d) => (d ? new Date(d).toLocaleDateString("pt-BR") : "—");
const toInputDate = (d) => (d ? new Date(d).toISOString().slice(0, 10) : "");

export default function KickoffClient({ opId }) {
  const [data, setData] = useState(null); // { op, kickoff, sugestoes }
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [form, setForm] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [salvoEm, setSalvoEm] = useState(null);
  const [extraindo, setExtraindo] = useState(false);
  const [avisoIA, setAvisoIA] = useState("");
  const [modalEnviar, setModalEnviar] = useState(false);
  const [enviarPara, setEnviarPara] = useState("");
  const [enviarMsg, setEnviarMsg] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [enviadoOk, setEnviadoOk] = useState(false);
  const [pdfSubindo, setPdfSubindo] = useState(false);
  const fileRef = useRef(null);

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
        escopo: k.escopo || j.sugestoes?.orcamento?.escopoObs || "",
        pontosAtencao: k.pontosAtencao || "",
        observacoes: k.observacoes || "",
        propostaPdfUrl: k.propostaPdfUrl || null,
        propostaPdfNome: k.propostaPdfNome || null,
        kickoffComercialEm: toInputDate(k.kickoffComercialEm),
        kickoffSetoresEm: toInputDate(k.kickoffSetoresEm),
      });
      if (k.enviadoPara) setEnviarPara(k.enviadoPara);
    } catch (e) { setErro(e.message); } finally { setLoading(false); }
  };
  useEffect(() => { carregar(); /* eslint-disable-next-line */ }, [opId]);

  const salvar = async (extra = {}) => {
    setSalvando(true);
    try {
      const body = { ...form, ...extra, frete: (extra.frete ?? form.frete) || null };
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

  // Upload do PDF da proposta (anexo) + extração via IA
  const onPdf = async (file) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { alert("PDF acima de 10MB — reduza o arquivo."); return; }
    setAvisoIA(""); setPdfSubindo(true);
    try {
      // 1. Sobe pro Blob (anexo permanente do kick off)
      const fd = new FormData(); fd.append("file", file);
      const up = await fetch("/api/upload-blob", { method: "POST", body: fd });
      const upJ = await up.json();
      if (!up.ok) throw new Error(upJ.error || "Falha no upload");
      setForm((p) => ({ ...p, propostaPdfUrl: upJ.url, propostaPdfNome: upJ.nomeArquivo }));
      setPdfSubindo(false);

      // 2. Extrai com IA (base64)
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

  // Aplica o que a IA extraiu SEM sobrescrever o que já foi digitado:
  // campos vazios são preenchidos; pontos de atenção novos são anexados.
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
      if (d.frete && !p.frete) { n.frete = d.frete; preenchidos.push("frete"); }
      if (d.notaRetorno === true && !p.notaRetorno) { n.notaRetorno = true; preenchidos.push("notaRetorno"); }
      if (d.pontosAtencao?.length) {
        const atuais = new Set(String(p.pontosAtencao || "").split("\n").map((s) => s.trim()).filter(Boolean));
        const novos = d.pontosAtencao.filter((pt) => !atuais.has(pt));
        if (novos.length) {
          n.pontosAtencao = [...atuais, ...novos].join("\n");
          preenchidos.push(`${novos.length} ponto(s) de atenção`);
        }
      }
      return n;
    });
    setAvisoIA(preenchidos.length
      ? `IA preencheu: ${preenchidos.join(", ")}. Revise antes de salvar — campos já digitados não foram alterados.`
      : "IA não encontrou nada novo para preencher (campos já estavam completos ou o PDF não traz esses dados).");
  };

  const enviar = async () => {
    setEnviando(true);
    try {
      const ok = await salvar();
      if (!ok) return;
      const res = await fetch(`/api/comercial/op/${opId}/kickoff/enviar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ para: enviarPara, mensagem: enviarMsg.trim() || null }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Erro ao enviar");
      setEnviadoOk(true);
      setTimeout(() => { setModalEnviar(false); setEnviadoOk(false); }, 1500);
    } catch (e) { alert("Falha ao enviar: " + e.message); }
    finally { setEnviando(false); }
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
          <button onClick={() => setModalEnviar(true)} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-200 rounded-lg text-torg-dark hover:bg-gray-50">
            <Send size={15} /> Enviar aos setores
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

      {/* Proposta PDF + IA */}
      <div className="bg-white rounded-xl shadow-sm border border-torg-blue-100 p-4 print:hidden">
        <p className="text-sm font-semibold text-torg-dark flex items-center gap-2 mb-2">
          <Sparkles size={15} className="text-torg-orange" /> Proposta comercial (PDF) + extração automática
        </p>
        <div className="flex items-center gap-3 flex-wrap">
          {form.propostaPdfUrl ? (
            <a href={form.propostaPdfUrl} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-torg-blue hover:underline">
              <FileText size={15} /> {form.propostaPdfNome || "proposta.pdf"}
            </a>
          ) : (
            <span className="text-sm text-torg-gray">Nenhuma proposta anexada ainda.</span>
          )}
          <button onClick={() => fileRef.current?.click()} disabled={pdfSubindo || extraindo}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-torg-blue-100 text-torg-blue rounded-lg hover:bg-torg-blue-50 disabled:opacity-50">
            {pdfSubindo ? <Loader2 size={14} className="animate-spin" /> : <UploadCloud size={14} />}
            {form.propostaPdfUrl ? "Trocar PDF" : "Subir PDF da proposta"}
          </button>
          {extraindo && <span className="inline-flex items-center gap-1.5 text-sm text-torg-orange"><Loader2 size={14} className="animate-spin" /> Lendo a proposta com IA…</span>}
          <input ref={fileRef} type="file" accept=".pdf,application/pdf" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onPdf(f); e.target.value = ""; }} />
        </div>
        {avisoIA && <p className="text-xs text-torg-gray mt-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{avisoIA}</p>}
        <p className="text-[11px] text-torg-gray mt-2">A IA preenche só os campos vazios (escopo, pintura, inspeção, entrega, frete, pedido do cliente, pontos de atenção) — sempre revise.</p>
      </div>

      {/* Dados do cliente (da OP) */}
      <Secao icone={Building2} titulo="Dados do cliente" subtitulo="Vêm do cadastro fiscal da OP — edite lá se algo estiver errado.">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
          <Campo label="Razão social" valor={op.clienteRazaoSocial || op.cliente} />
          <Campo label="CNPJ" valor={op.clienteCnpj} />
          <Campo label="IE" valor={op.clienteIE} />
          <Campo label="Contato" valor={op.clienteContato} />
          <Campo label="E-mail" valor={op.clienteEmail} />
          <Campo label="Telefone" valor={op.clienteTelefone} />
          <Campo label="Endereço fiscal" valor={[op.clienteEndereco, op.clienteCidade && `${op.clienteCidade}/${op.clienteUF || ""}`, op.clienteCep].filter(Boolean).join(" — ")} span />
        </div>
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-torg-gray mb-1">Nº do pedido de compra do cliente</label>
            <input type="text" value={form.pedidoCompraCliente} onChange={(e) => set("pedidoCompraCliente", e.target.value)}
              placeholder="Ex.: PC-2026-00123" className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-torg-blue/20 focus:border-torg-blue outline-none" />
          </div>
        </div>
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
      <Secao icone={Paintbrush} titulo="Padrão de pintura" subtitulo={data.sugestoes?.pintura ? "Pré-preenchido do estudo da proposta — confirme." : "A OP não tem estudo vinculado — preencha ou use a extração do PDF."}>
        <textarea value={form.padraoPintura} onChange={(e) => set("padraoPintura", e.target.value)} rows={4}
          placeholder="Esquema (primer/acabamento), produtos, demãos, espessuras (µm), cor, norma…"
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-torg-blue/20 focus:border-torg-blue outline-none font-mono" />
      </Secao>

      {/* Inspeção */}
      <Secao icone={SearchCheck} titulo="Inspeção">
        <textarea value={form.inspecao} onChange={(e) => set("inspecao", e.target.value)} rows={3}
          placeholder="Requisitos de inspeção/ensaios, ITP, inspetor do cliente, liberações…"
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-torg-blue/20 focus:border-torg-blue outline-none" />
      </Secao>

      {/* Fiscal / faturamento */}
      <Secao icone={Receipt} titulo="Faturamento e fiscal" subtitulo="A tabela vem dos itens da OP (flag de faturamento direto definida no contrato).">
        <div className="overflow-x-auto mb-3">
          <table className="w-full text-sm border border-gray-100 rounded-lg overflow-hidden">
            <thead className="bg-gray-50/60">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Item</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Categoria</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Verba</th>
                <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">Faturamento</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {todosItens.map((it, i) => (
                <tr key={it.id || i}>
                  <td className="px-3 py-2 text-torg-dark">{it.descricao}</td>
                  <td className="px-3 py-2 text-torg-gray text-xs">{it.categoria || "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtMoeda(it.valorVerba)}</td>
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
        <label className="block text-xs font-medium text-torg-gray mb-1">Como será o faturamento (medições, eventos, impostos, condição de pagamento…)</label>
        <textarea value={form.fiscalObservacao} onChange={(e) => set("fiscalObservacao", e.target.value)} rows={3}
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-torg-blue/20 focus:border-torg-blue outline-none" />
      </Secao>

      {/* Escopo */}
      <Secao icone={ClipboardList} titulo="Escopo">
        <textarea value={form.escopo} onChange={(e) => set("escopo", e.target.value)} rows={8}
          placeholder="O que está incluído e excluído do fornecimento: fabricação, montagem, pintura, transporte, projetos…"
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-torg-blue/20 focus:border-torg-blue outline-none" />
      </Secao>

      {/* Pontos de atenção */}
      <Secao icone={AlertTriangle} titulo="Pontos de atenção" subtitulo="Um por linha — é o que os setores PRECISAM saber.">
        <textarea value={form.pontosAtencao} onChange={(e) => set("pontosAtencao", e.target.value)} rows={5}
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

      {/* Observações + reuniões */}
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

      {/* Rodapé fixo de salvar (mobile-friendly) */}
      <div className="flex items-center justify-end gap-2 print:hidden">
        <button onClick={() => salvar()} disabled={salvando}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-torg-blue text-white rounded-lg hover:bg-torg-blue-700 text-sm font-semibold disabled:opacity-50">
          {salvando ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Salvar Kick Off
        </button>
      </div>

      {/* Modal enviar */}
      {modalEnviar && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => !enviando && setModalEnviar(false)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-torg-dark flex items-center gap-2"><Send size={16} className="text-torg-blue" /> Enviar Kick Off aos setores</h3>
              <button onClick={() => setModalEnviar(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            {enviadoOk ? (
              <p className="text-emerald-700 text-sm flex items-center gap-2"><CheckCircle2 size={16} /> Enviado!</p>
            ) : (
              <>
                <div>
                  <label className="block text-xs font-medium text-torg-gray mb-1">E-mails dos envolvidos (separe por vírgula)</label>
                  <input type="text" value={enviarPara} onChange={(e) => setEnviarPara(e.target.value)}
                    placeholder="engenharia@torg.com.br, pcp@torg.com.br…"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-torg-blue/20 outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-torg-gray mb-1">Mensagem (opcional)</label>
                  <textarea value={enviarMsg} onChange={(e) => setEnviarMsg(e.target.value)} rows={2}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-torg-blue/20 outline-none" />
                </div>
                <p className="text-[11px] text-torg-gray">O documento é salvo antes do envio. O e-mail leva todas as seções preenchidas + a tabela de faturamento por linha.</p>
                <div className="flex justify-end gap-2">
                  <button onClick={() => setModalEnviar(false)} disabled={enviando} className="px-4 py-2 text-sm text-torg-gray border border-gray-200 rounded-lg hover:bg-gray-50">Cancelar</button>
                  <button onClick={enviar} disabled={enviando || !enviarPara.trim()}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-torg-blue text-white text-sm font-medium rounded-lg hover:bg-torg-blue-700 disabled:opacity-50">
                    {enviando ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Enviar
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
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
