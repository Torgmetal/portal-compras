"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { upload } from "@vercel/blob/client";
import Link from "next/link";
import {
  Loader2, AlertCircle, ArrowLeft, Weight, ShieldAlert, Plus, X,
  FileText, CheckCircle2, Lock, BookCheck, FileDown, Upload, Send, Copy, Users,
  FolderOpen, RotateCcw, History, Download, Eye, ListChecks,
} from "lucide-react";
import NavegadorServidor from "./NavegadorServidor";
import Volumes from "./Volumes";
import { FONTE_LABEL, ESTADO_DATABOOK, secaoUsaEmpresa, secaoUsaProcedimentos, secaoUsaRelatoriosServidor, GRUPO_MATERIAL_LABEL, gruposDaSecao, SECAO_RELATORIOS_SERVIDOR, PIT_COLUNAS, PIT_PADRAO } from "@/lib/databook-secoes";
import { secaoNavega } from "@/lib/databook-pastas-web";
import { STATUS_COR } from "@/lib/qualidade-status";
import { TIPO_DATABOOK_LABEL } from "@/lib/op-opcoes";
import { fmtOP } from "@/lib/utils";

const fmtKg = (v) => (!v ? "—" : `${v.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} kg`);
const ESTADOS = ["PENDENTE", "ANEXADO", "NA"];
// quantos documentos a seção mostra antes de pedir "ver todos"
const LIMITE_LISTA = 40;

export default function DataBookDetalheClient({ id, userId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [acao, setAcao] = useState(null); // secaoId em ação
  const [emitindo, setEmitindo] = useState(false);
  const [revisando, setRevisando] = useState(false);
  const [enviandoAval, setEnviandoAval] = useState(false);
  const [emailAval, setEmailAval] = useState("");
  const [nomeAval, setNomeAval] = useState("");
  const [revisoes, setRevisoes] = useState(null);
  const [verHistorico, setVerHistorico] = useState(false);
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

  // ─── MANDAR O CLIENTE CONFERIR ANTES DA ASSINATURA ──────────────────────────────────────────
  // Vitor (31/08/2026): "antes de enviar para assinatura, teria como disponibilizar no portal do
  // cliente o PDF para ele avaliar as informações? (…) depois do ok dele aí sim subimos para
  // assinatura".
  async function enviarParaAvaliacao() {
    if (!confirm(
      "Publicar o RASCUNHO deste data book no portal do cliente para conferência?\n\n" +
      "Ele passa a ver e baixar os volumes — a capa já diz STATUS: RASCUNHO e o arquivo baixa como " +
      "“(rascunho)” — e responde no próprio portal. As assinaturas só podem começar depois do ok."
    )) return;
    setEnviandoAval(true);
    try {
      const res = await fetch(`/api/qualidade/data-books/${id}/avaliacao-cliente`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clienteEmail: emailAval.trim() || null, clienteNome: nomeAval.trim() || null }),
      });
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j.error || "Erro");
      alert(j.enviado
        ? `Rascunho publicado no portal e link enviado para ${j.destino}.`
        : "Rascunho publicado no portal do cliente. O e-mail não saiu — copie o link e mande por fora:\n\n" + j.link);
      await carregar();
    } catch (e) { alert(e.message); } finally { setEnviandoAval(false); }
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

  async function gerarLpc(secao) {
    setAcao(secao.id);
    try {
      const res = await fetch(`/api/qualidade/data-books/secao/${secao.id}/gerar-lpc`, { method: "POST" });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Erro");
      if (json.semLpc) alert("Nenhuma peça da LPC encontrada para esta OP. Importe a LPC (Tekla) desta OP antes de gerar a Seção 02.");
      await carregar();
    } catch (e) {
      alert(e.message);
    } finally {
      setAcao(null);
    }
  }

  async function puxarProjetos(secao) {
    setAcao(secao.id);
    try {
      const res = await fetch(`/api/qualidade/data-books/secao/${secao.id}/puxar-projetos`, { method: "POST" });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Erro");
      if (json.semDesenhos) alert("Nenhum desenho (Montagem/Conjunto) encontrado na pasta da OP no servidor. Confira a estrutura /Ordem de Serviço/01. OP/OP-XXX/2. Engenharia/2.5 Projetos.");
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

  // ⚠⚠ ESCOLHER À MÃO — o caminho das obras ANTIGAS. Vitor (28/08/2026): "para as obras antigas
  // que estão antes do portal, você deixa a permissão para podermos selecionar os instrumentos".
  // A regra automática (só o que os relatórios registraram) devolve vazio para a obra cujos
  // relatórios foram feitos no papel; sem esta porta, essas obras não fecham o dossiê.
  async function escolherEmpresa(secao, documentoIds) {
    setAcao(secao.id);
    try {
      const res = await fetch(`/api/qualidade/data-books/secao/${secao.id}/popular-empresa`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentoIds }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Erro");
      await carregar();
    } catch (e) { alert(e.message); } finally { setAcao(null); }
  }

  async function popularProcedimentos(secao) {
    setAcao(secao.id);
    try {
      const res = await fetch(`/api/qualidade/data-books/secao/${secao.id}/popular-procedimentos`, { method: "POST" });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Erro");
      // Diz o MOTIVO em vez de um "nenhum aplicável" genérico — o botão não está quebrado, a
      // origem é que está vazia. (Vitor 19/08.)
      if (json.semDocs) alert(json.motivo || "Nenhum procedimento aplicável a esta seção no Controle de Documentos.");
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

  // ── REVISÃO ────────────────────────────────────────────────────────────────────────────────
  // Vitor (19/08/2026): "sempre depois de emitido você não deve permitir salvar sem gerar uma
  // revisão; e se for revisão, fazer o histórico da revisão e enviar para assinatura de todos
  // novamente". O aviso é explícito porque abrir revisão DERRUBA as assinaturas — inclusive a do
  // cliente. É uma ação cara e a pessoa precisa saber disso antes, não depois.
  async function abrirRevisao() {
    const motivo = window.prompt(
      "Gerar nova revisão deste data book.\n\n" +
      "O que muda:\n" +
      "· o documento volta para montagem e passa a ser " + proximaRev + "\n" +
      "· TODAS as assinaturas são zeradas e precisam ser colhidas de novo\n" +
      "· o aceite do cliente (se houver) deixa de valer\n\n" +
      "Descreva o motivo (fica no histórico):"
    );
    if (motivo === null) return;
    setRevisando(true);
    try {
      const res = await fetch(`/api/qualidade/data-books/${id}/revisao`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ motivo }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Erro");
      alert(`Revisão ${j.rotulo} aberta. ${j.assinaturasZeradas} assinatura(s) voltaram a pendente.`);
      carregar();
      carregarRevisoes();
    } catch (e) { alert(e.message); } finally { setRevisando(false); }
  }

  const carregarRevisoes = useCallback(() => {
    fetch(`/api/qualidade/data-books/${id}/revisao`)
      .then((r) => r.json()).then((j) => { if (!j.error) setRevisoes(j); }).catch(() => {});
  }, [id]);
  // ⚠ ESTE useEffect FICA DEPOIS DO useCallback. `carregarRevisoes` é um `const`: chamá-lo de um
  // efeito declarado ACIMA da definição estoura em "Cannot access before initialization" durante o
  // render — tela branca com "Application error". `next build` não pega, porque não renderiza o
  // componente; só aparece no navegador.
  useEffect(() => { carregarRevisoes(); }, [carregarRevisoes]);

  async function emitir() {
    // ⚠ EMITIR É O ATO QUE FECHA O LIVRO: carimba a revisão e trava as seções. Se o cliente foi
    // chamado a conferir o rascunho e ainda não respondeu, emitir agora significa que qualquer
    // apontamento dele passa a custar uma revisão. Aviso, não bloqueio — a decisão continua sendo
    // de quem monta, que às vezes precisa emitir com o cliente em silêncio.
    if (data?.avaliacaoEnviadaEm && !data?.avaliacaoOkEm) {
      if (!confirm(
        "O cliente está com o rascunho para conferir e ainda não respondeu.\n\n" +
        "Emitir agora fecha o documento: se ele apontar algo depois, a correção vai exigir uma " +
        "revisão (R01) e as assinaturas serão colhidas de novo.\n\nEmitir mesmo assim?"
      )) return;
    }
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
  // R00 é a primeira emissão; cada mudança depois de emitido vira R01, R02…
  const rev = data.revisao || 0;
  const rotuloRev = `R${String(rev).padStart(2, "0")}`;
  const proximaRev = `R${String(rev + 1).padStart(2, "0")}`;
  // "fechado" = já é documento, não rascunho. Emitido, enviado ao cliente ou aceito.
  const fechado = !!data.emitidoEm || ["EMITIDO", "ENVIADO_CLIENTE", "ACEITO"].includes(data.status);
  const aprov = data.aprovacoes || [];
  const jaAprovei = aprov.some((a) => a.userId === userId);
  // quantos anexos o livro carrega — é o que decide se ainda cabe em arquivo único
  const totalAnexos = (data.secoes || []).reduce((acc, s2) => acc + (s2.documentos?.length || 0), 0);

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
            {/* ⚠ Arquivo único só até certo tamanho. Acima disso a rota devolve 409 e o
                caminho é o card de Volumes — mostrar um botão que só falha é pior que
                não mostrar. */}
            {totalAnexos <= 300 && (
              <a href={`/api/qualidade/data-books/${id}/pdf?inline=1`} target="_blank" rel="noreferrer"
                title="Gerar e baixar o PDF do data book em arquivo único (rascunho se ainda incompleto)"
                className="text-[12px] font-semibold text-torg-blue border border-torg-blue-300 rounded-lg px-3 py-1.5 hover:bg-torg-blue-50 inline-flex items-center gap-1.5">
                <FileDown size={13} /> Baixar PDF
              </a>
            )}
            {/* A revisão fica sempre à vista: é ela que diz QUAL documento é este. */}
            <span className="text-[11px] px-2 py-1 rounded-full font-bold bg-gray-100 text-torg-dark" title="Revisão do data book">
              {rotuloRev}
            </span>
            {fechado ? (
              <>
                <span className="text-[11px] px-2 py-1 rounded-full font-bold bg-emerald-100 text-emerald-700 inline-flex items-center gap-1">
                  <CheckCircle2 size={12} /> {data.status === "EMITIDO" ? "Emitido" : data.status === "ACEITO" ? "Aceito" : "Enviado"}
                </span>
                <button onClick={abrirRevisao} disabled={revisando}
                  title="Alterar um data book emitido exige nova revisão: o histórico fica registrado e as assinaturas são colhidas de novo"
                  className="text-[12px] font-semibold text-amber-700 border border-amber-300 rounded-lg px-3 py-1.5 hover:bg-amber-50 disabled:opacity-50 inline-flex items-center gap-1.5">
                  {revisando ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />} Gerar {proximaRev}
                </button>
              </>
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
          {/* HISTÓRICO DE REVISÃO — por que o documento mudou depois de emitido. Só aparece quando
              existe: data book em R00 não tem história pra contar. */}
          {revisoes?.revisoes?.length > 0 && (
            <div className="mt-2">
              <button onClick={() => setVerHistorico((v) => !v)}
                className="text-[11px] text-torg-blue hover:underline inline-flex items-center gap-1">
                <History size={11} /> {revisoes.revisoes.length} revisão(ões) — {verHistorico ? "ocultar" : "ver histórico"}
              </button>
              {verHistorico && (
                <div className="mt-1.5 border border-gray-100 rounded-lg divide-y divide-gray-50">
                  {revisoes.revisoes.map((x) => (
                    <div key={x.id} className="px-3 py-2 text-[11px]">
                      <p className="font-semibold text-torg-dark">
                        {x.rotuloAnterior} → {x.rotulo}
                        <span className="font-normal text-torg-gray">
                          {" · "}{new Date(x.createdAt).toLocaleDateString("pt-BR")}
                          {x.criadoPorNome ? ` · ${x.criadoPorNome}` : ""}
                          {x.assinaturasZeradas > 0 ? ` · ${x.assinaturasZeradas} assinatura(s) recolhida(s)` : ""}
                        </span>
                      </p>
                      <p className="text-torg-gray mt-0.5">{x.motivo}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {(r.pendentes > 0 || r.bloqueadas > 0) && !fechado && (
            <p className="text-[11px] text-amber-700 mt-1.5 inline-flex items-center gap-1">
              <Lock size={11} /> Emissão travada: {r.pendentes} pendente(s){r.bloqueadas > 0 ? ` · ${r.bloqueadas} com documento vencido` : ""}.
            </p>
          )}
        </div>
      </div>


      {/* Volumes — a entrega de verdade quando o data book é grande */}
      <Volumes id={id} />

      {/* ─── CONFERÊNCIA DO CLIENTE ────────────────────────────────────────────────────────────
          Fica ACIMA do fluxo de assinaturas porque é o que vem antes dele: o cliente lê, aprova, e
          só então as quatro assinaturas começam. Ler antes custa um clique; ler depois custa três
          assinaturas e uma revisão. */}
      {data.status !== "ACEITO" && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-sm font-bold text-torg-dark">
                Conferência do cliente <span className="font-normal text-torg-gray">· com o rascunho, antes de emitir</span>
              </h2>
              <p className="text-[12px] text-torg-gray mt-0.5">
                Publica o <strong>rascunho</strong> no portal do cliente para ele conferir as
                informações. Depois do ok, emitimos e o livro segue para as assinaturas — a versão
                emitida só volta para ele no fim, assinada.
              </p>
            </div>
            {/* ⚠ O E-MAIL RESOLVE O PORTAL. Vitor (31/08/2026): "fui enviar para o cliente e diz que
                a obra não tem cliente definido (…) cria um campo para informar o e-mail do cliente e,
                de acordo com o cadastro de e-mail, já enviar para o portal dele". Antes eu mandava a
                Qualidade sair daqui, publicar o portal no Comercial e voltar. Agora este campo
                publica o portal (só com o Data Book), cadastra o destinatário e dispara o link.
                Em branco: reaproveita quem já está cadastrado no portal da obra. */}
            {!data.avaliacaoOkEm && (
              <div className="flex flex-wrap items-end gap-2 shrink-0">
                <label className="text-[11px] text-torg-gray">
                  Nome de quem confere
                  <input value={nomeAval} onChange={(e) => setNomeAval(e.target.value)} placeholder="ex.: Davi"
                    className="mt-0.5 block w-36 rounded-lg border border-gray-300 px-2 py-1.5 text-[12px] focus:border-torg-blue focus:ring-1 focus:ring-torg-blue" />
                </label>
                <label className="text-[11px] text-torg-gray">
                  E-mail do cliente
                  <input type="email" value={emailAval} onChange={(e) => setEmailAval(e.target.value)} placeholder="davi@cliente.com.br"
                    className="mt-0.5 block w-56 rounded-lg border border-gray-300 px-2 py-1.5 text-[12px] focus:border-torg-blue focus:ring-1 focus:ring-torg-blue" />
                </label>
                <button onClick={enviarParaAvaliacao} disabled={enviandoAval}
                  className="text-[12px] font-semibold text-white bg-torg-blue rounded-lg px-3 py-2 hover:bg-torg-dark disabled:opacity-50 inline-flex items-center gap-1.5">
                  {enviandoAval ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                  {data.avaliacaoEnviadaEm ? "Mandar de novo" : "Enviar rascunho"}
                </button>
              </div>
            )}
          </div>

          {data.avaliacaoOkEm ? (
            <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] text-emerald-900">
              <strong>Aprovado pelo cliente</strong>
              {data.avaliacaoOkNome ? ` — ${data.avaliacaoOkNome}` : ""}
              {` em ${new Date(data.avaliacaoOkEm).toLocaleString("pt-BR")}`}. Pode emitir e seguir para as assinaturas.
              {data.avaliacaoObs ? <span className="block mt-1 text-emerald-800">Observação: “{data.avaliacaoObs}”</span> : null}
            </p>
          ) : data.avaliacaoObs ? (
            <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
              <strong>O cliente pediu ajuste:</strong> “{data.avaliacaoObs}”
              <span className="block mt-1">
                Corrija o rascunho e mande conferir de novo — as assinaturas continuam travadas até o ok.
              </span>
            </p>
          ) : data.avaliacaoEnviadaEm ? (
            <p className="mt-3 rounded-lg border border-torg-blue-100 bg-torg-blue-50/40 px-3 py-2 text-[12px] text-torg-dark">
              Rascunho no portal do cliente desde {new Date(data.avaliacaoEnviadaEm).toLocaleString("pt-BR")} —
              aguardando o retorno dele. As assinaturas só liberam depois do ok.
            </p>
          ) : (
            <p className="mt-3 text-[12px] text-torg-gray">
              Ainda não foi enviado para conferência. Esta etapa é opcional — sem ela, o fluxo segue
              como sempre: emitir e colher as assinaturas.
            </p>
          )}
        </div>
      )}

      {/* Fluxo de assinaturas — Elaborador → Inspetor → Resp. Técnico → Cliente (por e-mail/link) */}
      <FluxoAssinaturas id={id} cliente={data.cliente} clienteEmail={data.clienteEmail} onChange={carregar} />

      {/* Rastreabilidade da obra — casamento LPC × certificados de material (seção 04) */}
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
                  {m.comCert === m.pecas
                    ? <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />
                    : <AlertCircle size={14} className="text-amber-500 shrink-0" />}
                  <span className="font-medium text-torg-dark truncate">{m.material}</span>
                  <span className="text-torg-gray shrink-0">· {m.pecas} posiç{m.pecas !== 1 ? "ões" : "ão"}</span>
                </span>
                <span className="text-[11px] text-torg-gray shrink-0">
                  {m.comCert > 0 ? `${m.comCert}/${m.pecas} com certificado${m.certificados ? ` · ${m.certificados} cert.` : ""}` : "sem certificado"}
                </span>
              </div>
            ))}
          </div>
          {rastr.totalCertificados === 0
            ? <p className="text-[11px] text-amber-700 mt-2 inline-flex items-center gap-1"><AlertCircle size={12} className="shrink-0" /> Nenhum certificado de material importado para a OP — importe o CMR na aba Rastreabilidade.</p>
            : rastr.comCertificado < rastr.totalMateriais && (
              <p className="text-[10px] text-torg-gray mt-2">
                ⚠ = posição sem certificado específico (confira no Controle de Documentos). Casamento por grau + forma + espessura/bitola de cada material.
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
          <SecaoCard key={s.id} secao={s} acaoLoading={acao === s.id}
            onEstado={(e) => setEstado(s, e)} onDesvincular={(docId) => desvincular(s, docId)}
            onPopularMaterial={() => popularMaterial(s)} onPopularEmpresa={() => popularEmpresa(s)} onEscolherEmpresa={(ids) => escolherEmpresa(s, ids)} onPopularProcedimentos={() => popularProcedimentos(s)}
            onPuxarRelatorios={() => puxarRelatorios(s)} onSavePit={(itens) => savePit(s, itens)} onGerarLpc={() => gerarLpc(s)} onPuxarProjetos={() => puxarProjetos(s)} onReload={carregar} fechado={fechado} />
        ))}
      </div>
    </div>
  );
}

const PAPEL_LABEL_UI = { ELABORADOR: "Elaborador", INSPETOR: "Inspetor responsável", RESP_TECNICO: "Resp. Técnico · Guilherme A. Corte Campos", CLIENTE: "Cliente (aceite)" };

function FluxoAssinaturas({ id, cliente, clienteEmail, onChange }) {
  const [chain, setChain] = useState(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ elaboradorNome: "", elaboradorEmail: "", inspetorNome: "", inspetorEmail: "", rtEmail: "", clienteNome: cliente || "", clienteEmail: clienteEmail || "" });
  const [iniciando, setIniciando] = useState(false);
  const [reenviando, setReenviando] = useState(0);

  const carregarChain = useCallback(async () => {
    try {
      const r = await fetch(`/api/qualidade/data-books/${id}/assinaturas`);
      const j = await r.json();
      if (j.success) setChain(j.assinaturas);
    } catch { /* silencioso */ } finally { setLoading(false); }
  }, [id]);
  useEffect(() => { carregarChain(); }, [carregarChain]);

  const upd = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const fmtDH = (d) => (d ? new Date(d).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—");

  async function iniciar() {
    for (const k of ["elaboradorEmail", "inspetorEmail", "rtEmail", "clienteEmail"]) {
      if (!/^\S+@\S+\.\S+$/.test((form[k] || "").trim())) { alert("Preencha os 4 e-mails: elaborador, inspetor, responsável técnico e cliente."); return; }
    }
    if (!confirm("Iniciar o fluxo de assinaturas? O elaborador recebe o link por e-mail; ao assinar, o próximo é acionado automaticamente, até o cliente.")) return;
    setIniciando(true);
    try {
      const r = await fetch(`/api/qualidade/data-books/${id}/assinaturas`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error || "Erro");
      setChain(j.assinaturas);
      if (!j.enviado) alert("Fluxo iniciado, mas o e-mail ao elaborador falhou agora — use 'reenviar'.");
      onChange?.();
    } catch (e) { alert(e.message); } finally { setIniciando(false); }
  }
  async function reenviar(ordem) {
    setReenviando(ordem);
    try {
      const r = await fetch(`/api/qualidade/data-books/${id}/assinaturas`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ordem }) });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error || "Erro");
      alert(j.enviado ? "E-mail reenviado." : "Não foi possível enviar o e-mail agora.");
      await carregarChain();
    } catch (e) { alert(e.message); } finally { setReenviando(0); }
  }

  const temChain = chain && chain.length > 0;
  const atualOrdem = temChain ? (chain.find((a) => a.status !== "ASSINADO")?.ordem ?? 0) : 0;

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-4">
      <h2 className="text-sm font-bold text-torg-dark inline-flex items-center gap-1.5 mb-2"><Users size={15} className="text-torg-blue" /> Fluxo de assinaturas</h2>
      {loading ? (
        <p className="text-[12px] text-torg-gray inline-flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> carregando…</p>
      ) : temChain ? (
        <div className="space-y-1.5">
          <p className="text-[11px] text-torg-gray mb-1">Sequência: Elaborador → Inspetor → Responsável Técnico → Cliente. Cada um assina por link (e-mail); o próximo é acionado ao assinar. Ao fim, o cliente recebe o link de download.</p>
          {chain.map((a) => {
            const assinado = a.status === "ASSINADO";
            const atual = a.ordem === atualOrdem;
            return (
              <div key={a.ordem} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-[12px] border ${atual ? "border-torg-blue bg-torg-blue-50/40" : "border-gray-100"}`}>
                {assinado ? <CheckCircle2 size={15} className="text-emerald-600 shrink-0" /> : <span className="w-[15px] text-center text-torg-gray shrink-0 font-mono">{a.ordem}</span>}
                <div className="min-w-0 flex-1">
                  <span className="font-medium text-torg-dark">{PAPEL_LABEL_UI[a.papel] || a.papel}</span>
                  <span className="text-torg-gray"> · {assinado ? a.assinadoNome : (a.email || a.nome || "—")}</span>
                </div>
                <span className="text-[11px] text-torg-gray whitespace-nowrap">{assinado ? `assinou ${fmtDH(a.assinadoEm)}` : atual ? (a.status === "ENVIADO" ? "enviado · aguardando" : "a enviar") : "aguardando"}</span>
                {!assinado && atual && (
                  <button onClick={() => reenviar(a.ordem)} disabled={reenviando === a.ordem} className="text-[11px] text-torg-blue hover:underline inline-flex items-center gap-1 disabled:opacity-50">
                    {reenviando === a.ordem ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />} reenviar
                  </button>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-[11px] text-torg-gray">Informe os e-mails de cada responsável. O fluxo dispara na ordem e o data book final (com todas as assinaturas) é enviado ao cliente para download após o aceite.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Campo label="Elaborador — e-mail" v={form.elaboradorEmail} onChange={(v) => upd("elaboradorEmail", v)} type="email" />
            <Campo label="Elaborador — nome (opcional)" v={form.elaboradorNome} onChange={(v) => upd("elaboradorNome", v)} />
            <Campo label="Inspetor responsável — e-mail" v={form.inspetorEmail} onChange={(v) => upd("inspetorEmail", v)} type="email" />
            <Campo label="Inspetor — nome (opcional)" v={form.inspetorNome} onChange={(v) => upd("inspetorNome", v)} />
            <Campo label="Responsável Técnico — e-mail (Guilherme)" v={form.rtEmail} onChange={(v) => upd("rtEmail", v)} type="email" />
            <div className="hidden sm:block" />
            <Campo label="Cliente — e-mail" v={form.clienteEmail} onChange={(v) => upd("clienteEmail", v)} type="email" />
            <Campo label="Cliente — nome (opcional)" v={form.clienteNome} onChange={(v) => upd("clienteNome", v)} />
          </div>
          <button onClick={iniciar} disabled={iniciando} className="text-[12px] font-semibold text-white bg-torg-blue rounded-lg px-3 py-1.5 hover:bg-torg-dark disabled:opacity-50 inline-flex items-center gap-1.5">
            {iniciando ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Iniciar fluxo de assinaturas
          </button>
        </div>
      )}
    </div>
  );
}

function Campo({ label, v, onChange, type = "text" }) {
  return (
    <label className="block">
      <span className="block text-[10px] font-medium text-torg-gray mb-0.5">{label}</span>
      <input type={type} value={v} onChange={(e) => onChange(e.target.value)} className="w-full text-[12px] border border-gray-200 rounded-lg px-2 py-1.5 focus:border-torg-blue outline-none" />
    </label>
  );
}

function SecaoCard({ secao, acaoLoading, onEstado, onDesvincular, onPopularMaterial, onPopularEmpresa, onEscolherEmpresa, onPopularProcedimentos, onPuxarRelatorios, onSavePit, onGerarLpc, onPuxarProjetos, onReload, fechado }) {
  const [navegador, setNavegador] = useState(false);
  const [escolher, setEscolher] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [progresso, setProgresso] = useState(""); // "2/5" durante o upload em lote
  // ⚠ A seção 02 de uma obra grande tem MILHARES de desenhos. Jogar tudo no DOM trava a
  // tela — e ninguém lê 1.336 linhas de uma vez; quem procura um desenho específico
  // usa o índice do livro. Mostra as primeiras e abre sob demanda. (22/08/2026)
  const [verTodos, setVerTodos] = useState(false);
  const fileRef = useRef(null);
  const navegavel = secaoNavega(secao.numero);
  // ── SEÇÃO DE CERTIFICADO TEM OS DOIS CAMINHOS ───────────────────────────────────────────────
  //
  // Vitor, na especificação por seção: seção 04 "vincular com a planilha CMR e trazer os certificados
  // correspondentes a essa OP"; seção 05 "trazer as peças que estão na planilha e anexar os
  // certificados que estão na pasta"; seção 06 "mesmo caso dos parafusos e materiais"; seção 15 "trazer as
  // informações da planilha CMR e anexar os certificados das tintas que estão nessa pasta".
  //
  // O "deixar apenas dois botões" era sobre as seções que ele listou PRA NAVEGAR (seção 02, seção 03, seção 07…),
  // onde o conteúdo é uma pasta. Nestas quatro o conteúdo vem do CMR e a pasta é só onde mora o
  // PDF — então trazer e navegar convivem, que é o que ele pediu desde o começo.
  const secaoDeCertificado = gruposDaSecao(secao.numero).length > 0;
  // Documentos que a API apontou como sendo de OUTRA seção (ex.: tinta na seção 04 de matéria-prima).
  const foraDoGrupo = secao.documentos.filter((d) => d.secaoCerta);
  // ⚠⚠ Vitor (05/09/2026): "telha, cumeeira e silicone não possuem certificado, e não devem ser
  // listados no data book". Não é "seção errada" — é item que não entra no livro. O portal parou de
  // trazer, mas o que já está vinculado continua aqui até alguém tirar: sumir sozinho com vínculo
  // que outra pessoa fez é o tipo de silêncio que faz o livro mentir.
  const naoEntram = secao.documentos.filter((d) => d.foraDoLivro);
  async function removerNaoEntram() {
    if (!confirm(
      `Remover ${naoEntram.length} item(ns) desta seção?\n\nCobertura e vedação não têm certificado de matéria-prima e não entram no data book:\n` +
      naoEntram.slice(0, 8).map((d) => `· ${d.nome}`).join("\n") + (naoEntram.length > 8 ? `\n· … e mais ${naoEntram.length - 8}` : "")
    )) return;
    for (const d of naoEntram) await onDesvincular(d.id);
  }
  // Move os certificados que estão na seção errada pra seção certa deste mesmo data book.
  async function moverForaDoGrupo() {
    const destinos = [...new Set(foraDoGrupo.map((d) => d.secaoCerta))].sort();
    if (!confirm(
      `Mover ${foraDoGrupo.length} certificado(s) desta seção para a seção ${destinos.join(" / ")}?\n\n` +
      foraDoGrupo.slice(0, 8).map((d) => `· ${d.nome} → seção ${d.secaoCerta}`).join("\n") +
      (foraDoGrupo.length > 8 ? `\n· … e mais ${foraDoGrupo.length - 8}` : "")
    )) return;
    try {
      const res = await fetch(`/api/qualidade/data-books/secao/${secao.id}/mover`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentoIds: foraDoGrupo.map((d) => d.id) }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Erro");
      if (j.semSecao?.length) {
        alert(`${j.total} movido(s).\n\nNão movi ${j.semSecao.map((x) => `${x.quantos} para a seção ${x.numero}`).join(", ")}: essa seção não existe neste data book (ficaria sem lugar nenhum).`);
      }
      onReload?.();
    } catch (e) { alert(e.message); }
  }

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

      {/* Documentos vinculados — TODA seção de conteúdo (exceto seção 01 lista mestra, que é
          gerada automaticamente). Além do que vem do portal, sempre permite anexar
          arquivo do computador — inclusive na seção 10 (PIT), que ainda mostra o editor abaixo. */}
      {secao.numero !== "01" && (
        <div className="mt-2 pt-2 border-t border-gray-50">
          {secao.documentos.length > 0 ? (
            <div className="divide-y divide-gray-50">
              {(verTodos ? secao.documentos : secao.documentos.slice(0, LIMITE_LISTA)).map((d) => (
                <div key={d.id} className="flex items-center justify-between gap-3 py-1 text-[12px]">
                  <div className="min-w-0 flex items-center gap-2">
                    <FileText size={13} className="text-torg-blue shrink-0" />
                    {(d.importRef || d.indiceR) && <span className="font-mono text-[11px] font-semibold text-torg-blue shrink-0 whitespace-nowrap" title="Rastreabilidade (Índice R)">R {d.importRef || d.indiceR}</span>}
                    <span className="text-torg-dark truncate" title={d.nome}>{d.nome}</span>
                    {d.foraDoLivro && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-torg-gray border border-gray-200 font-medium shrink-0 whitespace-nowrap"
                        title="Cobertura/vedação: não tem certificado de matéria-prima e não entra no data book">
                        não entra no livro
                      </span>
                    )}
                    {d.secaoCerta && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-medium shrink-0 whitespace-nowrap"
                        title={`Este certificado é de outro grupo — o lugar dele é a seção ${d.secaoCerta}`}>
                        é da §{d.secaoCerta}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {d.numeroDocumento && <span className="text-torg-gray font-mono text-[11px] whitespace-nowrap" title="Nº do certificado">cert {d.numeroDocumento}</span>}
                    {d.numeroCorrida && <span className="text-torg-gray font-mono text-[11px] whitespace-nowrap" title="Corrida">corrida {d.numeroCorrida}</span>}
                    {d.status !== "SEM_VALIDADE" && <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap ${STATUS_COR[d.status]}`}>{d.statusLabel}</span>}
                    {/* ⚠ O CERTIFICADO AVULSO É PEDIDO O TEMPO TODO. Vitor (23/08/2026): "deixar os
                        relatórios e certificados que importarmos possíveis de baixarmos os arquivos
                        individuais para podermos mandar para o cliente caso queira". O cliente pede
                        UM certificado — o de uma corrida, o de um lote — e sem isto a única saída
                        era gerar o data book inteiro e recortar o PDF, ou ir procurar no SharePoint.
                        Passa pelo mesmo proxy autenticado dos documentos: o link do Blob nunca sai. */}
                    {d.temArquivo && (<>
                      <a href={`/api/qualidade/documentos/${d.id}/download?inline=1`} target="_blank" rel="noreferrer"
                        title="Abrir o arquivo" className="text-torg-gray hover:text-torg-blue"><Eye size={14} /></a>
                      <a href={`/api/qualidade/documentos/${d.id}/download`} download
                        title={`Baixar ${d.nome}`} className="text-torg-gray hover:text-torg-blue"><Download size={14} /></a>
                    </>)}
                    <button onClick={() => onDesvincular(d.id)} disabled={acaoLoading} className="text-torg-gray hover:text-red-600 disabled:opacity-50"><X size={14} /></button>
                  </div>
                </div>
              ))}
              {secao.documentos.length > LIMITE_LISTA && (
                <button onClick={() => setVerTodos((v) => !v)}
                  className="w-full text-[11px] font-semibold text-torg-blue py-1.5 hover:bg-torg-blue-50 rounded">
                  {verTodos
                    ? `Mostrar só os primeiros ${LIMITE_LISTA}`
                    : `Ver todos os ${secao.documentos.length.toLocaleString("pt-BR")} documentos`}
                </button>
              )}
              {/* Vitor (20/08): "você está trazendo certificados de tinta na aba de certificados de
                  materiais". O portal não erra mais ao vincular, mas o que já está gravado continua
                  ali — então aponta e deixa mover, em vez de sumir com o vínculo sem avisar. */}
              {naoEntram.length > 0 && (
                <div className="mt-2 flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5">
                  <span className="text-[11px] text-torg-gray">
                    {naoEntram.length === 1 ? "1 item é" : `${naoEntram.length} itens são`} de cobertura/vedação — sem certificado de matéria-prima, não entram no data book.
                  </span>
                  {!fechado && (
                    <button onClick={removerNaoEntram} disabled={acaoLoading}
                      className="text-[11px] font-medium text-torg-dark border border-gray-300 hover:bg-gray-100 rounded-lg px-2 py-0.5 shrink-0 disabled:opacity-50">
                      Remover da seção
                    </button>
                  )}
                </div>
              )}
              {foraDoGrupo.length > 0 && (
                <div className="mt-2 flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5">
                  <span className="text-[11px] text-amber-800">
                    {foraDoGrupo.length === 1 ? "1 certificado é" : `${foraDoGrupo.length} certificados são`} de outro grupo (seção {[...new Set(foraDoGrupo.map((d) => d.secaoCerta))].sort().join(", ")}).
                  </span>
                  {/* Livro fechado não se mexe — o botão só levaria ao erro de "gere uma revisão".
                      O aviso continua: quem for revisar precisa saber que isto está aqui. */}
                  {!fechado && (
                    <button onClick={moverForaDoGrupo} disabled={acaoLoading}
                      className="text-[11px] font-medium text-amber-900 border border-amber-300 hover:bg-amber-100 rounded-lg px-2 py-0.5 shrink-0 disabled:opacity-50">
                      Mover para a seção certa
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : (
            <p className="text-[11px] text-torg-gray italic">Nenhum documento vinculado.</p>
          )}

          {secao.bloqueada && (
            <p className="text-[11px] text-red-700 mt-1 inline-flex items-center gap-1"><ShieldAlert size={12} /> Documento vencido vinculado — renove no Controle de Documentos.</p>
          )}

            <div className="flex items-center gap-3 mt-1.5 flex-wrap">
              {/* ── SEÇÃO NAVEGÁVEL = DOIS BOTÕES, SÓ ─────────────────────────────────────────
                  Vitor (20/08/2026): "deixar apenas o de vincular documento e o de navegar nas
                  pastas, igual o do portal da qualidade — estou dizendo das partes que mencionei
                  para navegar".

                  Os "Trazer X" eram varredura cega: puxavam o lote inteiro sem deixar escolher, que
                  é justamente o que ele reprovou ("esses botões estão totalmente fora de
                  funcionamento... precisa ser funcional"). Onde dá pra navegar, navegar substitui
                  os dois — e "Anexar arquivos" sai junto de propósito: nessas seções o arquivo mora
                  no servidor, e subir cópia do computador cria uma segunda verdade que a revisão da
                  pasta nunca alcança. */}
              {secaoDeCertificado && (
                <button onClick={onPopularMaterial} disabled={acaoLoading}
                  className="text-[11px] text-white bg-torg-blue hover:bg-torg-dark rounded-lg px-2 py-1 inline-flex items-center gap-1 font-medium disabled:opacity-50">
                  <FileText size={12} /> Trazer {GRUPO_MATERIAL_LABEL[secao.numero]} desta OP
                </button>
              )}
              {/* Navegar a pasta do servidor e ESCOLHER — Vitor (19/08): "deixar navegar na
                  pasta e selecionar os arquivos que quero colocar". */}
              {navegavel && (
                <button onClick={() => setNavegador(true)} disabled={acaoLoading}
                  className="text-[11px] text-torg-blue border border-torg-blue-200 hover:bg-torg-blue-50 rounded-lg px-2 py-1 inline-flex items-center gap-1 font-medium disabled:opacity-50">
                  <FolderOpen size={12} /> Buscar no servidor
                </button>
              )}
              {/* ── PROCEDIMENTO NÃO MORA NA PASTA DA SEÇÃO ────────────────────────────────
                  Vitor (31/08/2026): "preciso ajustar sobre a importação dos Procedimentos para as
                  áreas de ensaios e relatórios, você consegue trazer isso pra o data book".

                  ⚠ ESTE BOTÃO ESTAVA DENTRO DO BLOCO `!navegavel`, e por isso não aparecia em 9 das
                  11 seções que TÊM procedimento mapeado — entre elas a 11 (dimensional), a 12 (END)
                  e a 14 (pintura), que são exatamente as de ensaios e relatórios. Só sobravam a 16 e
                  a 20, as duas sem pasta no servidor. Quem montava o livro não tinha como trazer o
                  PO, e o dossiê ia sem o procedimento que rege o ensaio.

                  ⚠⚠ ELE NÃO É UM "TRAZER X" DE VARREDURA CEGA — que é o que o navegar substituiu, e
                  com razão. O procedimento vem do Controle de Documentos do SGQ, casado por código
                  (PO-04 na 11, PO-06 e PO-15 na 12, PO-05 na 14): são dois ou três PDFs escolhidos
                  por regra, não o lote inteiro de uma pasta. Por isso convive com o navegar em vez
                  de ser substituído por ele.

                  O "Trazer relatórios da OP (servidor)" continua só onde não há navegação, de
                  propósito: aquele SIM varre a pasta inteira. */}
              {secaoUsaProcedimentos(secao.numero) && (
                <button onClick={onPopularProcedimentos} disabled={acaoLoading}
                  title="Traz do SGQ os procedimentos que regem esta seção (PDF apenas)"
                  className="text-[11px] text-torg-blue border border-torg-blue-300 hover:bg-torg-blue-50 rounded-lg px-2 py-1 inline-flex items-center gap-1 font-medium disabled:opacity-50">
                  <FileText size={12} /> Trazer procedimentos aplicáveis
                </button>
              )}
              {!navegavel && <>
              <input ref={fileRef} type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx" className="hidden" onChange={anexarArquivos} />
              <button onClick={() => fileRef.current?.click()} disabled={enviando || acaoLoading}
                className="text-[11px] text-torg-blue hover:text-torg-dark inline-flex items-center gap-1 font-medium disabled:opacity-50">
                {enviando ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />} {enviando ? `Enviando${progresso ? " " + progresso : ""}…` : "Anexar arquivos"}
              </button>
              {secaoUsaEmpresa(secao.numero) && (
                <button onClick={onPopularEmpresa} disabled={acaoLoading}
                  className="text-[11px] text-white bg-torg-blue hover:bg-torg-dark rounded-lg px-2 py-1 inline-flex items-center gap-1 font-medium disabled:opacity-50">
                  <FileText size={12} /> Trazer documentos da empresa
                </button>
              )}
              {/* ⚠ a escolha à mão é o caminho da OBRA ANTIGA, cujos relatórios foram em papel e
                  por isso não registram instrumento nenhum no portal. */}
              {secaoUsaEmpresa(secao.numero) && (
                <button onClick={() => setEscolher(true)} disabled={acaoLoading}
                  className="text-[11px] text-torg-blue border border-torg-blue-300 hover:bg-torg-blue-50 rounded-lg px-2 py-1 inline-flex items-center gap-1 font-medium disabled:opacity-50">
                  <ListChecks size={12} /> {secao.numero === "19" ? "Escolher instrumentos" : "Escolher documentos"}
                </button>
              )}
              {secaoUsaRelatoriosServidor(secao.numero) && (
                <button onClick={onPuxarRelatorios} disabled={acaoLoading}
                  className="text-[11px] text-white bg-torg-blue hover:bg-torg-dark rounded-lg px-2 py-1 inline-flex items-center gap-1 font-medium disabled:opacity-50">
                  <FileText size={12} /> Trazer {SECAO_RELATORIOS_SERVIDOR[secao.numero].label} da OP (servidor)
                </button>
              )}
              </>}
            </div>
          {escolher && (
            <EscolherDocsEmpresa secao={secao} onClose={() => setEscolher(false)}
              onConfirmar={(ids) => { setEscolher(false); onEscolherEmpresa?.(ids); }} />
          )}
          {navegador && (
            <NavegadorServidor
              secaoId={secao.id}
              titulo={`Seção ${secao.numero} · ${secao.titulo}`}
              onFechar={() => setNavegador(false)}
              onAnexado={(j) => {
                onReload?.();
                if (j?.vinculados === 0) alert("Esses arquivos já estavam nesta seção.");
              }}
            />
          )}
        </div>
      )}

      {/* seção 10 PIT — editor de tabela montado no portal */}
      {secao.numero === "10" && <PitEditor secao={secao} acaoLoading={acaoLoading} onSave={onSavePit} />}

      {/* seção 02 Desenhos as-built — tabela LPC (conjunto → posições) + certificado por material */}
      {secao.numero === "02" && <LpcSecao secao={secao} acaoLoading={acaoLoading} onGerar={onGerarLpc} onPuxarProjetos={onPuxarProjetos} />}
    </div>
  );
}

function LpcSecao({ secao, acaoLoading, onGerar, onPuxarProjetos }) {
  const c = secao.conteudoJson?.tipo === "lpc" ? secao.conteudoJson : null;
  const [aberto, setAberto] = useState(false);
  const conjuntos = c?.conjuntos || [];
  const MAX = 20;
  return (
    <div className="mt-3 pt-3 border-t border-gray-100">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="text-[11px] text-torg-gray">
          {c
            ? <>Tabela gerada da LPC · <b className="text-torg-dark">{conjuntos.length} conjuntos</b> · {c.totalPosicoes} posições{c.semCertificado > 0 ? <> · <span className="text-amber-600 font-medium">{c.semCertificado} sem certificado</span></> : <> · <span className="text-emerald-600 font-medium">todas com certificado</span></>}</>
            : <>Monte a seção 02 a partir da LPC: cada conjunto → suas posições, com material, corrida (rastreabilidade) e nº do certificado.</>}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={onGerar} disabled={acaoLoading}
            className="text-[11px] text-white bg-torg-blue hover:bg-torg-dark rounded-lg px-2 py-1 inline-flex items-center gap-1 font-medium disabled:opacity-50">
            {acaoLoading ? <Loader2 size={12} className="animate-spin" /> : <FileText size={12} />} {c ? "Atualizar tabela LPC" : "Gerar tabela LPC"}
          </button>
          <button onClick={onPuxarProjetos} disabled={acaoLoading}
            className="text-[11px] text-torg-blue border border-torg-blue-300 hover:bg-torg-blue-50 rounded-lg px-2 py-1 inline-flex items-center gap-1 font-medium disabled:opacity-50">
            <FileText size={12} /> Trazer desenhos da OP (servidor)
          </button>
        </div>
      </div>
      {c && conjuntos.length > 0 && (
        <div className="mt-2">
          <button onClick={() => setAberto((v) => !v)} className="text-[11px] text-torg-blue hover:text-torg-dark font-medium">{aberto ? "ocultar prévia" : "ver prévia"}</button>
          {aberto && (
            <div className="mt-2 border border-gray-100 rounded-lg divide-y divide-gray-100 max-h-96 overflow-y-auto">
              {conjuntos.slice(0, MAX).map((cj, i) => (
                <div key={i} className="px-2.5 py-2">
                  <p className="text-[11px] font-semibold text-torg-dark">Conjunto {cj.marca}{cj.descricao ? ` — ${cj.descricao}` : ""} <span className="text-torg-gray font-normal">· {cj.qte}x</span></p>
                  <table className="w-full text-[10px] mt-1">
                    <thead className="text-torg-gray">
                      <tr>
                        <th className="text-left font-medium py-0.5">Posição</th>
                        <th className="text-left font-medium">Material</th>
                        <th className="text-right font-medium">Qtd</th>
                        <th className="text-left font-medium pl-2">Rastreab. (R)</th>
                        <th className="text-left font-medium pl-2">Nº Certificado</th>
                        <th className="text-left font-medium pl-2">Corrida</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cj.posicoes.map((p, j) => (
                        <tr key={j} className="align-top border-t border-gray-50">
                          <td className="py-0.5 text-torg-dark font-medium">{p.marca}</td>
                          <td className="text-torg-dark">{p.perfil || p.material || "—"}{p.perfil && p.material && <span className="block text-[9px] text-torg-gray">{p.material}</span>}</td>
                          <td className="text-right text-torg-gray">{p.qtd}</td>
                          <td className="pl-2 text-torg-blue font-medium">{p.certificados.length ? p.certificados.map((x) => (x.indiceR ? `R ${x.indiceR}` : "—")).join(", ") : <span className="text-amber-600">—</span>}</td>
                          <td className="pl-2 text-torg-gray">{p.certificados.length ? p.certificados.map((x) => x.certificado || "—").join(", ") : <span className="text-amber-600">sem certificado</span>}</td>
                          <td className="pl-2 text-torg-gray">{p.certificados.length ? p.certificados.map((x) => x.corrida || "—").join(", ") : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
              {conjuntos.length > MAX && <p className="px-2.5 py-2 text-[10px] text-torg-gray">+ {conjuntos.length - MAX} conjuntos (todos entram no PDF).</p>}
            </div>
          )}
        </div>
      )}
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

/**
 * ESCOLHER À MÃO os documentos da empresa de uma seção — na §19, os instrumentos.
 *
 * ⚠ Vem com os USADOS já marcados quando a obra tem relatório emitido: o caminho normal continua
 * sendo o automático, e a escolha existe para a obra antiga (relatório em papel) e para o
 * instrumento que o relatório não registrou. Quem escolheu fica no AuditLog.
 */
function EscolherDocsEmpresa({ secao, onClose, onConfirmar }) {
  const [docs, setDocs] = useState(null);
  const [sel, setSel] = useState(() => new Set());
  const [erro, setErro] = useState("");
  const [temUso, setTemUso] = useState(false);

  useEffect(() => {
    fetch(`/api/qualidade/data-books/secao/${secao.id}/popular-empresa`)
      .then((r) => r.json())
      .then((j) => {
        if (!j.success) throw new Error(j.error || "Erro ao carregar");
        setDocs(j.docs || []);
        setTemUso(!!j.temUso);
        setSel(new Set((j.docs || []).filter((d) => d.vinculado || d.usado).map((d) => d.id)));
      })
      .catch((e) => setErro(e.message));
  }, [secao.id]);

  const alternar = (id) => setSel((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 overflow-y-auto" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-xl my-8">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-torg-dark">
              {secao.numero === "19" ? "Escolher instrumentos" : "Escolher documentos"} · §{secao.numero}
            </p>
            <p className="text-[11px] text-torg-gray mt-0.5">
              {secao.numero === "19"
                ? (temUso
                    ? "Os marcados são os que os relatórios desta obra registraram. Ajuste se precisar."
                    : "Esta obra não tem relatório no portal que registre instrumento — marque os que foram usados.")
                : "Marque os documentos que entram nesta seção."}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <div className="px-4 py-3 max-h-[55vh] overflow-y-auto">
          {erro && <p className="text-[12px] text-red-600">{erro}</p>}
          {!docs && !erro && <p className="text-[12px] text-torg-gray inline-flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> carregando…</p>}
          {docs?.length === 0 && <p className="text-[12px] text-torg-gray">Nenhum documento em PDF nesta categoria do Controle de Documentos.</p>}
          <div className="space-y-1">
            {(docs || []).map((d) => (
              <label key={d.id} className="flex items-start gap-2 text-[12.5px] px-2 py-1.5 rounded-lg hover:bg-gray-50 cursor-pointer">
                <input type="checkbox" className="mt-0.5 accent-torg-blue" checked={sel.has(d.id)} onChange={() => alternar(d.id)} />
                <span className="min-w-0 flex-1">
                  <span className="text-torg-dark">{d.nome}</span>
                  {d.usado && <span className="ml-2 text-[10px] font-semibold text-emerald-700 bg-emerald-50 rounded-full px-1.5 py-0.5">usado nos relatórios</span>}
                  {d.vinculado && !d.usado && <span className="ml-2 text-[10px] text-torg-gray">já vinculado</span>}
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between gap-2">
          <span className="text-[11px] text-torg-gray">{sel.size} selecionado(s)</span>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-3 py-1.5 text-[12px] text-torg-gray hover:text-torg-dark rounded-lg hover:bg-gray-100">Cancelar</button>
            <button onClick={() => onConfirmar([...sel])} disabled={!sel.size}
              className="px-3 py-1.5 text-[12px] font-semibold text-white bg-torg-blue rounded-lg hover:bg-torg-dark disabled:opacity-50">
              Vincular
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
