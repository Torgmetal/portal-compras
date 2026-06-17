"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { upload } from "@vercel/blob/client";
import Link from "next/link";
import {
  Loader2, AlertCircle, ArrowLeft, Weight, ShieldAlert, Plus, X, Search,
  FileText, CheckCircle2, Lock, BookCheck, FileDown, Upload, Send, Copy, Users,
} from "lucide-react";
import { FONTE_LABEL, ESTADO_DATABOOK, secaoUsaEmpresa, secaoUsaProcedimentos, secaoUsaRelatoriosServidor, GRUPO_MATERIAL_LABEL, GRUPO_POR_SECAO, SECAO_RELATORIOS_SERVIDOR, PIT_COLUNAS, PIT_PADRAO } from "@/lib/databook-secoes";
import { STATUS_COR } from "@/lib/qualidade-status";
import { TIPO_DATABOOK_LABEL } from "@/lib/op-opcoes";

const fmtKg = (v) => (!v ? "—" : `${v.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} kg`);
const fmtOP = (n) => (n ? `OP-${String(n).padStart(3, "0")}` : "—");
const ESTADOS = ["PENDENTE", "ANEXADO", "NA"];

export default function DataBookDetalheClient({ id, userId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [acao, setAcao] = useState(null); // secaoId em ação
  const [emitindo, setEmitindo] = useState(false);
  const [rastr, setRastr] = useState(null);
  const [aprovando, setAprovando] = useState(false);
  const [emailCliente, setEmailCliente] = useState("");
  const [enviandoCliente, setEnviandoCliente] = useState(false);
  const [linkCliente, setLinkCliente] = useState("");

  const carregar = useCallback(async () => {
    setErro("");
    try {
      const res = await fetch(`/api/qualidade/data-books/${id}`);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Erro ao carregar");
      setData(json.data);
    } catch (e) {
      setErro(e.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => {
    fetch(`/api/qualidade/data-books/${id}/rastreabilidade`)
      .then((r) => r.json())
      .then((j) => { if (!j.error) setRastr(j); })
      .catch(() => {});
  }, [id]);

  async function setEstado(secao, estado) {
    setAcao(secao.id);
    try {
      const res = await fetch(`/api/qualidade/data-books/secao/${secao.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ estado }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Erro");
      await carregar();
    } catch (e) {
      alert(e.message);
    } finally {
      setAcao(null);
    }
  }

  async function vincular(secao, documentoId) {
    if (!documentoId) return;
    setAcao(secao.id);
    try {
      const res = await fetch(`/api/qualidade/data-books/secao/${secao.id}/doc`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ documentoId }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Erro");
      await carregar();
    } catch (e) {
      alert(e.message);
    } finally {
      setAcao(null);
    }
  }

  async function desvincular(secao, documentoId) {
    setAcao(secao.id);
    try {
      await fetch(`/api/qualidade/data-books/secao/${secao.id}/doc?documentoId=${encodeURIComponent(documentoId)}`, { method: "DELETE" });
      await carregar();
    } catch (e) {
      alert(e.message);
    } finally {
      setAcao(null);
    }
  }

  async function popularMaterial(secao) {
    setAcao(secao.id);
    try {
      const res = await fetch(`/api/qualidade/data-books/secao/${secao.id}/popular-material`, { method: "POST" });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Erro");
      if (json.semDocs) {
        alert("Nenhum certificado de material desta OP no Controle de Documentos. Importe o CMR (aba Rastreabilidade) e confira a OP dos certificados.");
      }
      await carregar();
    } catch (e) {
      alert(e.message);
    } finally {
      setAcao(null);
    }
  }

  async function popularEmpresa(secao) {
    setAcao(secao.id);
    try {
      const res = await fetch(`/api/qualidade/data-books/secao/${secao.id}/popular-empresa`, { method: "POST" });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Erro");
      if (json.semDocs) {
        alert("Nenhum documento desta categoria no Controle de Documentos. Importe pela aba “Importar do servidor”.");
      }
      await carregar();
    } catch (e) {
      alert(e.message);
    } finally {
      setAcao(null);
    }
  }

  async function popularProcedimentos(secao) {
    setAcao(secao.id);
    try {
      const res = await fetch(`/api/qualidade/data-books/secao/${secao.id}/popular-procedimentos`, { method: "POST" });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Erro");
      if (json.semDocs) {
        alert("Nenhum procedimento aplicável a esta seção no Controle de Documentos. Importe pela aba “Importar do servidor” (pasta Procedimentos).");
      }
      await carregar();
    } catch (e) {
      alert(e.message);
    } finally {
      setAcao(null);
    }
  }

  async function puxarRelatorios(secao) {
    setAcao(secao.id);
    try {
      const res = await fetch(`/api/qualidade/data-books/secao/${secao.id}/puxar-relatorios`, { method: "POST" });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Erro");
      if (json.semDocs) {
        alert("Nenhum relatório desta OP encontrado na pasta do servidor (SGQ). Confira se o relatório já foi salvo com o código da obra no nome.");
      }
      await carregar();
    } catch (e) {
      alert(e.message);
    } finally {
      setAcao(null);
    }
  }

  async function savePit(secao, itens) {
    setAcao(secao.id);
    try {
      const res = await fetch(`/api/qualidade/data-books/secao/${secao.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conteudoJson: { itens } }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Erro");
      await carregar();
    } catch (e) {
      alert(e.message);
    } finally {
      setAcao(null);
    }
  }

  async function emitir() {
    if (!confirm("Emitir o data book? (a geração do PDF entra na próxima fase)")) return;
    setEmitindo(true);
    try {
      const res = await fetch(`/api/qualidade/data-books/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "EMITIDO" }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Erro");
      setData(json.data);
    } catch (e) {
      alert(e.message);
    } finally {
      setEmitindo(false);
    }
  }

  async function aprovar(remover) {
    setAprovando(true);
    try {
      const res = await fetch(`/api/qualidade/data-books/${id}/aprovar`, { method: remover ? "DELETE" : "POST", headers: { "Content-Type": "application/json" }, body: remover ? undefined : JSON.stringify({}) });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Erro");
      await carregar();
    } catch (e) {
      alert(e.message);
    } finally {
      setAprovando(false);
    }
  }

  async function enviarCliente() {
    if (!/^\S+@\S+\.\S+$/.test(emailCliente.trim())) { alert("Informe um e-mail válido do cliente."); return; }
    setEnviandoCliente(true);
    try {
      const res = await fetch(`/api/qualidade/data-books/${id}/enviar-cliente`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: emailCliente.trim() }) });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Erro");
      setLinkCliente(json.link || "");
      if (!json.enviado) alert("Link gerado, mas o e-mail não pôde ser enviado agora. Copie o link e envie manualmente ao cliente.");
      await carregar();
    } catch (e) {
      alert(e.message);
    } finally {
      setEnviandoCliente(false);
    }
  }

  if (loading) return <div className="flex flex-col items-center justify-center py-24 text-torg-gray"><Loader2 size={26} className="animate-spin mb-3" /><p className="text-sm">Carregando data book…</p></div>;
  if (erro) return <div className="flex flex-col items-center justify-center py-20 text-center"><AlertCircle size={26} className="text-red-500 mb-3" /><p className="text-sm text-torg-dark mb-3">{erro}</p><button onClick={carregar} className="text-xs text-torg-blue hover:underline">Tentar novamente</button></div>;
  if (!data) return null;

  const r = data.resumo;
  const aprov = data.aprovacoes || [];
  const jaAprovei = aprov.some((a) => a.userId === userId);

  return (
    <div className="max-w-4xl mx-auto">
      <Link href="/qualidade/data-books" className="text-[11px] text-torg-gray hover:text-torg-dark inline-flex items-center gap-1 mb-2"><ArrowLeft size={12} /> Data Books</Link>

      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-torg-dark flex items-center gap-2">
              <BookCheck size={18} className="text-torg-blue" /> {fmtOP(data.opNumero)} <span className="text-torg-gray font-normal">· {data.cliente || "—"}</span>
            </h1>
            <p className="text-xs text-torg-gray mt-0.5">
              {data.obra ? `${data.obra} · ` : ""}<span className="inline-flex items-center gap-1"><Weight size={11} /> {fmtKg(data.pesoTotalKg)}</span>{data.pecas ? ` · ${data.pecas} peças` : ""}
            </p>
            {data.tipo && (
              <span className="inline-block mt-1.5 text-[10px] px-2 py-0.5 rounded-full bg-torg-blue-50 text-torg-blue font-medium">
                {TIPO_DATABOOK_LABEL[data.tipo] || data.tipo}
              </span>
            )}
          </div>
          <div className="text-right shrink-0 flex items-center gap-2">
            <a href={`/api/qualidade/data-books/${id}/pdf?inline=1`} target="_blank" rel="noreferrer"
              title="Gerar e baixar o PDF do data book (rascunho se ainda incompleto)"
              className="text-[12px] font-semibold text-torg-blue border border-torg-blue-300 rounded-lg px-3 py-1.5 hover:bg-torg-blue-50 inline-flex items-center gap-1.5">
              <FileDown size={13} /> Baixar PDF
            </a>
            {data.status === "EMITIDO" ? (
              <span className="text-[11px] px-2 py-1 rounded-full font-bold bg-emerald-100 text-emerald-700 inline-flex items-center gap-1"><CheckCircle2 size={12} /> Emitido</span>
            ) : (
              <button onClick={emitir} disabled={emitindo || !r.podeEmitir}
                title={r.podeEmitir ? "Emitir data book" : `Faltam ${r.pendentes} seção(ões) e ${r.bloqueadas} com documento vencido`}
                className="text-[12px] font-semibold text-white bg-torg-blue rounded-lg px-3 py-1.5 hover:bg-torg-dark disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5">
                {emitindo ? <Loader2 size={13} className="animate-spin" /> : r.podeEmitir ? <CheckCircle2 size={13} /> : <Lock size={13} />} Emitir data book
              </button>
            )}
          </div>
        </div>

        {/* Progresso */}
        <div className="mt-3">
          <div className="flex items-center justify-between text-[10px] text-torg-gray mb-1">
            <span>{r.anexadas} de {r.obrigatorias} seções obrigatórias · {r.na} N/A</span>
            <span className="font-semibold text-torg-dark">{r.progresso}%</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden"><div className="h-full bg-torg-blue rounded-full transition-all" style={{ width: `${r.progresso}%` }} /></div>
          {(r.pendentes > 0 || r.bloqueadas > 0) && data.status !== "EMITIDO" && (
            <p className="text-[11px] text-amber-700 mt-1.5 inline-flex items-center gap-1">
              <Lock size={11} /> Emissão travada: {r.pendentes} pendente(s){r.bloqueadas > 0 ? ` · ${r.bloqueadas} com documento vencido` : ""}.
            </p>
          )}
        </div>
      </div>

      {/* Aprovação interna + envio ao cliente para aceite */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-4">
        <div className="flex items-center justify-between gap-2 mb-2">
          <h2 className="text-sm font-bold text-torg-dark inline-flex items-center gap-1.5"><Users size={15} className="text-torg-blue" /> Aprovação e envio ao cliente</h2>
          {data.status === "ACEITO" ? <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Aceito pelo cliente</span>
            : data.status === "ENVIADO_CLIENTE" ? <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Enviado · aguardando aceite</span>
            : <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-torg-gray">{data.status === "EMITIDO" ? "Emitido" : "Em montagem"}</span>}
        </div>

        {data.status === "ACEITO" ? (
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-[12px] text-emerald-800">
            <CheckCircle2 size={14} className="inline mr-1 -mt-0.5" /> Recebimento e entrega confirmados por <strong>{data.aceiteNome}</strong> em {data.aceiteEm ? new Date(data.aceiteEm).toLocaleString("pt-BR") : "—"}.
          </div>
        ) : (
          <>
            <div className="mb-3">
              <p className="text-[11px] font-semibold text-torg-gray uppercase tracking-wide mb-1">Aprovações internas ({aprov.length})</p>
              {aprov.length ? (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {aprov.map((a) => <span key={a.id} className="text-[11px] bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-2 py-0.5 inline-flex items-center gap-1"><CheckCircle2 size={11} /> {a.nome}</span>)}
                </div>
              ) : <p className="text-[11px] text-torg-gray italic mb-2">Nenhuma aprovação ainda — inspetor e envolvidos devem aprovar antes do envio ao cliente.</p>}
              <button onClick={() => aprovar(jaAprovei)} disabled={aprovando}
                className={`text-[11px] font-medium rounded-lg px-2.5 py-1 inline-flex items-center gap-1 disabled:opacity-50 ${jaAprovei ? "text-torg-gray border border-gray-200 hover:bg-gray-50" : "text-white bg-emerald-600 hover:bg-emerald-700"}`}>
                {aprovando ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />} {jaAprovei ? "Remover minha aprovação" : "Aprovar este data book"}
              </button>
            </div>

            <div className="border-t border-gray-50 pt-3">
              <p className="text-[11px] font-semibold text-torg-gray uppercase tracking-wide mb-1.5">Enviar ao cliente para aceite</p>
              <div className="flex items-center gap-2 flex-wrap">
                <input type="email" value={emailCliente} onChange={(e) => setEmailCliente(e.target.value)} placeholder="e-mail do cliente"
                  className="flex-1 min-w-[180px] text-[12px] border border-gray-200 rounded-lg px-2 py-1.5 focus:border-torg-blue" />
                <button onClick={enviarCliente} disabled={enviandoCliente || aprov.length === 0}
                  title={aprov.length === 0 ? "Precisa de ao menos 1 aprovação interna" : "Gera o link e envia o e-mail ao cliente"}
                  className="text-[12px] font-semibold text-white bg-torg-blue rounded-lg px-3 py-1.5 hover:bg-torg-dark disabled:opacity-50 inline-flex items-center gap-1.5">
                  {enviandoCliente ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} {data.status === "ENVIADO_CLIENTE" ? "Reenviar" : "Enviar"}
                </button>
              </div>
              {(data.enviadoClienteEm || linkCliente) && (
                <p className="mt-2 text-[11px] text-torg-gray">
                  {data.enviadoClienteEm && <>Enviado {data.clienteEmail ? `para ${data.clienteEmail} ` : ""}em {new Date(data.enviadoClienteEm).toLocaleString("pt-BR")}. </>}
                  {linkCliente && <button onClick={() => navigator.clipboard?.writeText(linkCliente)} className="text-torg-blue hover:underline inline-flex items-center gap-1"><Copy size={11} /> copiar link</button>}
                </p>
              )}
              {aprov.length === 0 && <p className="text-[10px] text-amber-600 mt-1.5">O envio libera após ao menos uma aprovação interna.</p>}
            </div>
          </>
        )}
      </div>

      {/* Rastreabilidade da obra — casamento LPC × certificados de material (§04) */}
      {rastr && rastr.totalMateriais > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-4">
          <div className="flex items-center justify-between gap-2 mb-2">
            <h2 className="text-sm font-bold text-torg-dark">
              Rastreabilidade da obra <span className="text-torg-gray font-normal">· materiais da LPC × certificados</span>
            </h2>
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${rastr.comCertificado === rastr.totalMateriais ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
              {rastr.comCertificado}/{rastr.totalMateriais} com certificado
            </span>
          </div>
          <div className="divide-y divide-gray-50">
            {rastr.materiais.map((m) => (
              <div key={m.material} className="flex items-center justify-between gap-3 py-1.5 text-[12px]">
                <span className="inline-flex items-center gap-1.5 min-w-0">
                  {m.temCertificado
                    ? <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />
                    : <AlertCircle size={14} className="text-amber-500 shrink-0" />}
                  <span className="font-medium text-torg-dark truncate">{m.material}</span>
                  <span className="text-torg-gray shrink-0">· {m.pecas} peça{m.pecas !== 1 ? "s" : ""}</span>
                </span>
                <span className="text-[11px] text-torg-gray shrink-0">
                  {m.temCertificado ? `${m.certificados} certificado${m.certificados !== 1 ? "s" : ""}` : "sem certificado"}
                </span>
              </div>
            ))}
          </div>
          {rastr.totalCertificados === 0
            ? <p className="text-[11px] text-amber-700 mt-2 inline-flex items-center gap-1"><AlertCircle size={12} className="shrink-0" /> Nenhum certificado de material importado para a OP — importe o CMR na aba Rastreabilidade.</p>
            : rastr.comCertificado < rastr.totalMateriais && (
              <p className="text-[10px] text-torg-gray mt-2">
                ⚠ = material da obra sem certificado correspondente (confira no Controle de Documentos). Casamento feito pelo código do material na norma do certificado.
              </p>
            )}
        </div>
      )}

      {/* Seções */}
      <p className="text-[11px] text-torg-gray mb-2">
        Selecione as seções que <strong>compõem</strong> este data book — marque como <strong>N/A</strong> as que não se aplicam a esta obra/cliente (não entram no PDF).
      </p>
      <div className="space-y-2">
        {data.secoes.map((s) => (
          <SecaoCard key={s.id} secao={s} candidatos={data.candidatos} acaoLoading={acao === s.id}
            onEstado={(e) => setEstado(s, e)} onVincular={(docId) => vincular(s, docId)} onDesvincular={(docId) => desvincular(s, docId)}
            onPopularMaterial={() => popularMaterial(s)} onPopularEmpresa={() => popularEmpresa(s)} onPopularProcedimentos={() => popularProcedimentos(s)}
            onPuxarRelatorios={() => puxarRelatorios(s)} onSavePit={(itens) => savePit(s, itens)} onReload={carregar} />
        ))}
      </div>
    </div>
  );
}

function SecaoCard({ secao, candidatos, acaoLoading, onEstado, onVincular, onDesvincular, onPopularMaterial, onPopularEmpresa, onPopularProcedimentos, onPuxarRelatorios, onSavePit, onReload }) {
  const [picker, setPicker] = useState(false);
  const [codBusca, setCodBusca] = useState("");
  const [codResultados, setCodResultados] = useState(null);
  const [codBuscando, setCodBuscando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [progresso, setProgresso] = useState(""); // "2/5" durante o upload em lote
  const fileRef = useRef(null);
  const linkedIds = new Set(secao.documentos.map((d) => d.id));
  const disponiveis = candidatos.filter((c) => !linkedIds.has(c.id));

  // Anexa um OU VÁRIOS arquivos do computador direto à seção (Vercel Blob +
  // endpoint /anexar). Sobe em sequência, com progresso; uma falha num arquivo
  // não derruba os demais — no fim avisa só os que falharam.
  async function anexarArquivos(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setEnviando(true);
    const falhas = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setProgresso(files.length > 1 ? `${i + 1}/${files.length}` : "");
      try {
        const blob = await upload(file.name, file, { access: "public", handleUploadUrl: "/api/qualidade/documentos/upload-token" });
        const res = await fetch(`/api/qualidade/data-books/secao/${secao.id}/anexar`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ arquivoUrl: blob.url, arquivoNome: file.name, arquivoTipo: file.type || null, arquivoTamanho: file.size }),
        });
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.error || "erro ao anexar");
      } catch (err) {
        falhas.push(`• ${file.name}: ${err.message || "falha no upload"}`);
      }
    }
    setEnviando(false);
    setProgresso("");
    if (fileRef.current) fileRef.current.value = "";
    await onReload?.();
    if (falhas.length) alert(`${falhas.length} de ${files.length} arquivo(s) não foram anexados:\n\n${falhas.join("\n")}`);
  }

  // Busca um certificado pelo código de rastreabilidade (Índice R / importRef) em
  // todo o Controle de Documentos — não fica limitado aos candidatos da OP.
  async function buscarPorCodigo(e) {
    e?.preventDefault();
    const q = codBusca.trim();
    if (q.length < 2) return;
    setCodBuscando(true);
    try {
      const res = await fetch(`/api/qualidade/documentos?busca=${encodeURIComponent(q)}`);
      const j = await res.json();
      setCodResultados((j.data || []).filter((d) => !linkedIds.has(d.id)).slice(0, 15));
    } catch {
      setCodResultados([]);
    } finally {
      setCodBuscando(false);
    }
  }

  return (
    <div className={`bg-white rounded-xl border shadow-sm p-3 ${secao.bloqueada ? "border-red-200" : "border-gray-100"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-torg-dark">
            <span className="text-torg-gray font-mono">{secao.numero}</span> · {secao.titulo}
          </p>
          <p className="text-[11px] text-torg-gray mt-0.5">
            {secao.norma} · <span className="italic">{FONTE_LABEL[secao.fonte] || secao.fonte}</span>
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {acaoLoading && <Loader2 size={13} className="animate-spin text-torg-gray" />}
          {ESTADOS.map((e) => (
            <button key={e} onClick={() => onEstado(e)} disabled={acaoLoading}
              className={`text-[10px] px-2 py-1 rounded-lg font-medium border transition-colors disabled:opacity-50 ${
                secao.estado === e ? `${ESTADO_DATABOOK[e].cor} border-transparent` : "border-gray-200 text-torg-gray hover:bg-gray-50"
              }`}>{ESTADO_DATABOOK[e].label}</button>
          ))}
        </div>
      </div>

      {/* Documentos vinculados — TODA seção de conteúdo (exceto §01 lista mestra, que é
          gerada automaticamente). Além do que vem do portal, sempre permite anexar
          arquivo do computador — inclusive na §10 (PIT), que ainda mostra o editor abaixo. */}
      {secao.numero !== "01" && (
        <div className="mt-2 pt-2 border-t border-gray-50">
          {secao.documentos.length > 0 ? (
            <div className="divide-y divide-gray-50">
              {secao.documentos.map((d) => (
                <div key={d.id} className="flex items-center justify-between gap-3 py-1 text-[12px]">
                  <div className="min-w-0 flex items-center gap-2">
                    <FileText size={13} className="text-torg-blue shrink-0" />
                    <span className="text-torg-dark truncate">{d.nome}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {d.numeroCorrida && <span className="text-torg-gray font-mono text-[11px] whitespace-nowrap">corrida {d.numeroCorrida}</span>}
                    {d.status !== "SEM_VALIDADE" && <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap ${STATUS_COR[d.status]}`}>{d.statusLabel}</span>}
                    <button onClick={() => onDesvincular(d.id)} disabled={acaoLoading} className="text-torg-gray hover:text-red-600 disabled:opacity-50"><X size={14} /></button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-torg-gray italic">Nenhum documento vinculado.</p>
          )}

          {secao.bloqueada && (
            <p className="text-[11px] text-red-700 mt-1 inline-flex items-center gap-1"><ShieldAlert size={12} /> Documento vencido vinculado — renove no Controle de Documentos.</p>
          )}

          {!picker ? (
            <div className="flex items-center gap-3 mt-1.5 flex-wrap">
              <button onClick={() => setPicker(true)} className="text-[11px] text-torg-blue hover:text-torg-dark inline-flex items-center gap-1 font-medium"><Plus size={12} /> Vincular documento</button>
              <input ref={fileRef} type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx" className="hidden" onChange={anexarArquivos} />
              <button onClick={() => fileRef.current?.click()} disabled={enviando || acaoLoading}
                className="text-[11px] text-torg-blue hover:text-torg-dark inline-flex items-center gap-1 font-medium disabled:opacity-50">
                {enviando ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />} {enviando ? `Enviando${progresso ? " " + progresso : ""}…` : "Anexar arquivos"}
              </button>
              {GRUPO_POR_SECAO[secao.numero] && (
                <button onClick={onPopularMaterial} disabled={acaoLoading}
                  className="text-[11px] text-white bg-torg-blue hover:bg-torg-dark rounded-lg px-2 py-1 inline-flex items-center gap-1 font-medium disabled:opacity-50">
                  <FileText size={12} /> Trazer {GRUPO_MATERIAL_LABEL[secao.numero]} desta OP
                </button>
              )}
              {secaoUsaEmpresa(secao.numero) && (
                <button onClick={onPopularEmpresa} disabled={acaoLoading}
                  className="text-[11px] text-white bg-torg-blue hover:bg-torg-dark rounded-lg px-2 py-1 inline-flex items-center gap-1 font-medium disabled:opacity-50">
                  <FileText size={12} /> Trazer documentos da empresa
                </button>
              )}
              {secaoUsaProcedimentos(secao.numero) && (
                <button onClick={onPopularProcedimentos} disabled={acaoLoading}
                  className="text-[11px] text-torg-blue border border-torg-blue-300 hover:bg-torg-blue-50 rounded-lg px-2 py-1 inline-flex items-center gap-1 font-medium disabled:opacity-50">
                  <FileText size={12} /> Trazer procedimentos aplicáveis
                </button>
              )}
              {secaoUsaRelatoriosServidor(secao.numero) && (
                <button onClick={onPuxarRelatorios} disabled={acaoLoading}
                  className="text-[11px] text-white bg-torg-blue hover:bg-torg-dark rounded-lg px-2 py-1 inline-flex items-center gap-1 font-medium disabled:opacity-50">
                  <FileText size={12} /> Trazer {SECAO_RELATORIOS_SERVIDOR[secao.numero].label} da OP (servidor)
                </button>
              )}
            </div>
          ) : (
            <div className="mt-1.5 space-y-2">
              <div className="flex items-center gap-2">
                <select autoFocus onChange={(e) => { if (e.target.value) { onVincular(e.target.value); setPicker(false); } }} defaultValue=""
                  className="flex-1 text-[11px] border border-gray-200 rounded-lg px-2 py-1 focus:border-torg-blue">
                  <option value="" disabled>Selecione um documento da OP…</option>
                  {disponiveis.map((c) => (
                    <option key={c.id} value={c.id}>{c.nome}{c.numeroCorrida ? ` (corrida ${c.numeroCorrida})` : ""}{c.status !== "SEM_VALIDADE" ? ` — ${c.statusLabel}` : ""}</option>
                  ))}
                </select>
                <button onClick={() => { setPicker(false); setCodResultados(null); setCodBusca(""); }} className="text-torg-gray hover:text-torg-dark"><X size={14} /></button>
              </div>
              <form onSubmit={buscarPorCodigo} className="flex items-center gap-2">
                <input value={codBusca} onChange={(e) => setCodBusca(e.target.value)} placeholder="ou buscar por código de rastreabilidade (ex.: 260001, nº do certificado)…"
                  className="flex-1 text-[11px] border border-gray-200 rounded-lg px-2 py-1 focus:border-torg-blue" />
                <button type="submit" disabled={codBuscando} className="text-[11px] text-torg-blue hover:text-torg-dark inline-flex items-center gap-1 font-medium disabled:opacity-50">
                  {codBuscando ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />} Buscar
                </button>
              </form>
              {codResultados && (codResultados.length ? (
                <div className="border border-gray-100 rounded-lg divide-y divide-gray-50 max-h-52 overflow-y-auto">
                  {codResultados.map((d) => (
                    <button key={d.id} onClick={() => { onVincular(d.id); setPicker(false); setCodResultados(null); setCodBusca(""); }}
                      className="w-full text-left px-2 py-1.5 text-[11px] hover:bg-torg-blue-50 flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate"><span className="font-mono font-semibold text-torg-blue">{d.importRef || "s/ código"}</span> · <span className="text-torg-dark">{d.nome}</span></span>
                      <span className="text-torg-gray shrink-0 whitespace-nowrap">{d.numeroDocumento || ""}</span>
                    </button>
                  ))}
                </div>
              ) : <p className="text-[10px] text-torg-gray">Nenhum documento com esse código.</p>)}
            </div>
          )}
          {picker && disponiveis.length === 0 && <p className="text-[10px] text-torg-gray mt-1">Nenhum documento desta OP no Controle de Documentos. Cadastre na aba “Controle de Documentos” com a OP no campo correspondente.</p>}
        </div>
      )}

      {/* §10 PIT — editor de tabela montado no portal */}
      {secao.numero === "10" && <PitEditor secao={secao} acaoLoading={acaoLoading} onSave={onSavePit} />}
    </div>
  );
}

function PitEditor({ secao, acaoLoading, onSave }) {
  const inicial = Array.isArray(secao.conteudoJson?.itens) ? secao.conteudoJson.itens : [];
  const [itens, setItens] = useState(inicial.map((x) => ({ ...x })));
  const [dirty, setDirty] = useState(false);
  const upd = (i, key, val) => { setItens((arr) => arr.map((r, j) => (j === i ? { ...r, [key]: val } : r))); setDirty(true); };
  const add = () => { setItens((arr) => [...arr, Object.fromEntries(PIT_COLUNAS.map((c) => [c.key, ""]))]); setDirty(true); };
  const rm = (i) => { setItens((arr) => arr.filter((_, j) => j !== i)); setDirty(true); };
  const padrao = () => { setItens(PIT_PADRAO.map((x) => ({ ...x }))); setDirty(true); };

  return (
    <div className="mt-2 pt-2 border-t border-gray-50">
      <p className="text-[11px] text-torg-gray mb-1.5">Plano de Inspeção e Testes — monte a tabela; ela entra no PDF do data book.</p>
      {itens.length > 0 ? (
        <div className="overflow-x-auto -mx-1 px-1">
          <table className="w-full text-[10px] border-collapse">
            <thead>
              <tr>
                {PIT_COLUNAS.map((c) => <th key={c.key} className="text-left font-semibold text-torg-gray px-1 py-1 border-b border-gray-100 whitespace-nowrap">{c.label}</th>)}
                <th className="w-6 border-b border-gray-100" />
              </tr>
            </thead>
            <tbody>
              {itens.map((row, i) => (
                <tr key={i} className="align-top">
                  {PIT_COLUNAS.map((c) => (
                    <td key={c.key} className="px-0.5 py-0.5">
                      <textarea rows={2} value={row[c.key] || ""} onChange={(e) => upd(i, c.key, e.target.value)}
                        className="w-full min-w-[90px] text-[10px] border border-gray-200 rounded px-1 py-0.5 focus:border-torg-blue resize-y" />
                    </td>
                  ))}
                  <td className="px-0.5 py-1 text-center">
                    <button onClick={() => rm(i)} className="text-torg-gray hover:text-red-600" title="Remover linha"><X size={13} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-[11px] text-torg-gray italic">Nenhuma linha. Adicione manualmente ou carregue o modelo padrão da Torg.</p>
      )}
      <div className="flex items-center gap-3 mt-2 flex-wrap">
        <button onClick={add} className="text-[11px] text-torg-blue hover:text-torg-dark inline-flex items-center gap-1 font-medium"><Plus size={12} /> Adicionar linha</button>
        {itens.length === 0 && (
          <button onClick={padrao} className="text-[11px] text-torg-blue hover:text-torg-dark inline-flex items-center gap-1 font-medium">Carregar modelo padrão</button>
        )}
        <button onClick={() => { onSave(itens); setDirty(false); }} disabled={acaoLoading || !dirty}
          className="text-[11px] text-white bg-torg-blue hover:bg-torg-dark rounded-lg px-2 py-1 inline-flex items-center gap-1 font-medium disabled:opacity-50">
          {acaoLoading ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />} Salvar PIT
        </button>
        {dirty && <span className="text-[10px] text-amber-600">alterações não salvas</span>}
      </div>
    </div>
  );
}
