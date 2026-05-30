"use client";
import { useState, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Loader2, AlertCircle, Send, AlertTriangle, Truck, RotateCcw, CheckCircle2, Upload, FileText, X, Sparkles, CalendarDays, PackageX } from "lucide-react";
import TorgLogo from "@/components/TorgLogo";

const fmtMoeda = (v) =>
  Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtData = (d) => (d ? new Date(d).toLocaleDateString("pt-BR") : "—");

// Extrai prazo/pagamento da observacao salva (formato "Prazo de entrega: X | Pagamento: Y | <obs>")
function parseObservacao(obs) {
  if (!obs) return { prazoEntrega: "", condicaoPagamento: "", observacao: "" };
  const partes = obs.split(" | ");
  let prazoEntrega = "";
  let condicaoPagamento = "";
  const restos = [];
  for (const p of partes) {
    const m1 = p.match(/^Prazo de entrega:\s*(.+)$/);
    const m2 = p.match(/^Pagamento:\s*(.+)$/);
    if (m1) prazoEntrega = m1[1];
    else if (m2) condicaoPagamento = m2[1];
    else restos.push(p);
  }
  return { prazoEntrega, condicaoPagamento, observacao: restos.join(" | ") };
}

export default function CotacaoFornecedorForm({ cotacao, anexos = [], anexosCotacao: anexosCotacaoInicial = [], vencida, faturamento = null, emRevisaoFinal = false }) {
  const router = useRouter();
  const jaEnviou = cotacao.status === "RECEBIDA";
  const obsParsed = parseObservacao(cotacao.observacao);
  // State local pra refletir uploads em tempo real (sem precisar de reload da pagina)
  const [anexosCotacao, setAnexosCotacao] = useState(anexosCotacaoInicial);

  const [linhas, setLinhas] = useState(() =>
    cotacao.itens.map((it) => {
      const peso = Number(it.rmItem.peso) || 0;
      const usaKg = peso > 0;
      return {
        id: it.id,
        descricao: it.rmItem.descricao,
        material: it.rmItem.material,
        comprimento: it.rmItem.comprimento,
        largura: it.rmItem.largura,
        tratamento: it.rmItem.tratamento,
        qtdRm: usaKg ? peso : it.rmItem.qtd,
        qtdPecas: it.rmItem.qtd, // qtd original em peças (chapas, barras, etc)
        unidadeOriginal: it.rmItem.unidade, // unidade original (UN, PÇ, etc)
        unidade: usaKg ? "KG" : it.rmItem.unidade,
        pesoTotal: peso,
        // Pre-popula com valores ja enviados se existirem
        precoUnit: it.precoUnit > 0 ? String(it.precoUnit) : "",
        qtdCotada: it.qtdCotada > 0 ? it.qtdCotada : (usaKg ? peso : it.qtdCotada),
        icmsPct: it.icmsPct != null ? String(it.icmsPct) : "",
        ipiPct: it.ipiPct != null ? String(it.ipiPct) : "",
        observacao: it.observacao || "",
        semEstoque: it.semEstoque || false,
        prazoEntrega: it.prazoEntrega ? new Date(it.prazoEntrega).toISOString().slice(0, 10) : "",
      };
    })
  );
  const [cnpj, setCnpj] = useState(cotacao.cnpj || "");
  const [razaoSocial, setRazaoSocial] = useState(cotacao.fornecedorNome || "");
  const [numeroProposta, setNumeroProposta] = useState(cotacao.numeroProposta || "");
  const [valorTotalProposta, setValorTotalProposta] = useState(
    cotacao.totalProposta ? String(cotacao.totalProposta) : ""
  );
  const [prazoEntrega, setPrazoEntrega] = useState(jaEnviou ? obsParsed.prazoEntrega : "");
  const [condicaoPagamento, setCondicaoPagamento] = useState(jaEnviou ? obsParsed.condicaoPagamento : "");
  const [observacaoGeral, setObservacaoGeral] = useState(jaEnviou ? obsParsed.observacao : "");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [enviadoAgora, setEnviadoAgora] = useState(false);
  // Nomes dos PDFs subidos nessa sessao (alem dos anexosCotacao que ja vem do servidor)
  const [arquivosSessao, setArquivosSessao] = useState([]);
  const [parsing, setParsing] = useState(false);
  const [parseInfo, setParseInfo] = useState(null); // { match: N, total: M, fornecedor, prazo }
  // IDs de linhas preenchidas automaticamente que o fornecedor ainda NÃO revisou
  const [autoFilled, setAutoFilled] = useState(new Set());
  // IDs de linhas que o fornecedor JÁ confirmou/revisou
  const [revisado, setRevisado] = useState(new Set());
  const fileRef = useRef(null);

  const setLinha = (id, k, v) => {
    setLinhas((prev) => prev.map((l) => (l.id === id ? { ...l, [k]: v } : l)));
    // Se o usuario editou, considera revisado e tira do auto-filled
    if (autoFilled.has(id)) {
      setAutoFilled((prev) => { const n = new Set(prev); n.delete(id); return n; });
      setRevisado((prev) => new Set(prev).add(id));
    }
  };

  const marcarRevisado = (id) => {
    setAutoFilled((prev) => { const n = new Set(prev); n.delete(id); return n; });
    setRevisado((prev) => new Set(prev).add(id));
  };

  // Aplica os itens vindos da IA usando rmIndex (que ja casa com a RM)
  function aplicarItensIA(itensIA) {
    const linhasNovas = [...linhas];
    const idsAuto = new Set();
    let casados = 0;
    for (const itPdf of itensIA) {
      const idx = itPdf.rmIndex;
      if (idx == null || idx < 0 || idx >= linhasNovas.length) continue;
      const l = linhasNovas[idx];
      if (itPdf.precoUnit) l.precoUnit = String(itPdf.precoUnit);
      if (itPdf.qtdCotada || itPdf.qtd) l.qtdCotada = itPdf.qtdCotada || itPdf.qtd;
      if (itPdf.icmsPct != null) l.icmsPct = String(itPdf.icmsPct);
      if (itPdf.ipiPct != null) l.ipiPct = String(itPdf.ipiPct);
      if (itPdf.observacao && !l.observacao) l.observacao = itPdf.observacao;
      idsAuto.add(l.id);
      casados++;
    }
    setLinhas(linhasNovas);
    setAutoFilled(idsAuto);
    setRevisado(new Set());
    return casados;
  }

  // Fallback: se IA falhar, usa parser regex e casa via score local
  function scoreMatchTokens(descPdf, descRm) {
    const norm = (s) => (s || "")
      .toString().toLowerCase().normalize("NFD")
      .replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, " ")
      .replace(/\s+/g, " ").trim();
    const a = norm(descPdf).split(" ").filter((t) => t.length >= 3);
    const b = norm(descRm);
    if (a.length === 0 || !b) return 0;
    return a.filter((tok) => b.includes(tok)).length / a.length;
  }
  function aplicarItensFallback(itensPdf) {
    const linhasNovas = [...linhas];
    const usados = new Set();
    const idsAuto = new Set();
    let casados = 0;
    for (const itPdf of itensPdf) {
      let melhorIdx = -1, melhorScore = 0.5;
      for (let i = 0; i < linhasNovas.length; i++) {
        if (usados.has(i)) continue;
        const sc = scoreMatchTokens(itPdf.descricao, linhasNovas[i].descricao);
        if (sc > melhorScore) { melhorScore = sc; melhorIdx = i; }
      }
      if (melhorIdx >= 0) {
        usados.add(melhorIdx); casados++;
        const l = linhasNovas[melhorIdx];
        if (itPdf.precoUnit) l.precoUnit = String(itPdf.precoUnit);
        if (itPdf.qtd) l.qtdCotada = itPdf.qtd;
        if (itPdf.icmsPct != null) l.icmsPct = String(itPdf.icmsPct);
        if (itPdf.ipiPct != null) l.ipiPct = String(itPdf.ipiPct);
        idsAuto.add(l.id);
      }
    }
    setLinhas(linhasNovas);
    setAutoFilled(idsAuto);
    setRevisado(new Set());
    return casados;
  }

  // Upload de um arquivo: salva no blob, retorna o anexo criado.
  async function uploadArquivo(file) {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`/api/cotacao/anexar/${cotacao.token}`, { method: "POST", body: fd });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error(e.error || "Falha no upload");
    }
    return res.json(); // { id, url, nomeArquivo, tamanho, tipo }
  }

  // Faz parse via IA (ou fallback regex) de um PDF. Retorna { itens, fornecedor, prazoPagamento, usouIA }.
  async function parsePDF(file) {
    const base64 = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(file);
    });

    // Contexto da RM pra IA fazer o matching
    const rmItensCtx = linhas.map((l) => ({
      descricao: l.descricao,
      material: l.material,
      qtd: l.qtdRm,
      unidade: l.unidade,
      pesoKg: l.unidade === "KG" ? l.qtdRm : null,
    }));

    // 1. Tenta IA
    try {
      const resIA = await fetch("/api/parse-cotacao-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pdfBase64: base64, rmItens: rmItensCtx }),
      });
      if (resIA.ok) {
        const data = await resIA.json();
        return { ...data, usouIA: true };
      }
    } catch (_) { /* cai no fallback */ }

    // 2. Fallback regex
    const resFb = await fetch("/api/parse-pdf-cotacao", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ base64 }),
    });
    if (!resFb.ok) {
      const e = await resFb.json().catch(() => ({}));
      throw new Error(e.error || "Falha ao ler PDF");
    }
    const data = await resFb.json();
    return { ...data, usouIA: false };
  }

  // Aceita 1 ou mais PDFs. Sobe todos pro blob, mas o parse via IA roda
  // apenas no primeiro (assume que e o principal — pra nao sobrescrever
  // valores ja preenchidos com o proximo).
  async function uploadPDFs(files) {
    const lista = Array.from(files || []).filter((f) => f && f.size > 0);
    if (lista.length === 0) return;
    const grandes = lista.filter((f) => f.size > 10 * 1024 * 1024);
    if (grandes.length > 0) {
      setErro(`Arquivo(s) muito grande(s) (limite 10MB): ${grandes.map((f) => f.name).join(", ")}`);
      return;
    }

    setErro("");
    setParseInfo(null);
    setParsing(true);

    try {
      // Sobe TODOS em paralelo
      const resultados = await Promise.allSettled(lista.map((f) => uploadArquivo(f)));
      const ok = [];
      const falhas = [];
      resultados.forEach((r, i) => {
        if (r.status === "fulfilled") ok.push(r.value);
        else falhas.push(`${lista[i].name}: ${r.reason?.message || "erro"}`);
      });

      // Adiciona os anexos novos no state (vao aparecer na secao "Sua proposta anexada")
      if (ok.length > 0) {
        setAnexosCotacao((prev) => [
          ...prev,
          ...ok.map((a) => ({
            id: a.id,
            nomeArquivo: a.nomeArquivo,
            blobUrl: a.url,
            tamanho: a.tamanho,
            tipo: a.tipo,
          })),
        ]);
        setArquivosSessao((prev) => [...prev, ...ok.map((a) => a.nomeArquivo)]);
      }

      if (falhas.length > 0) {
        setErro("Falha em alguns arquivos: " + falhas.join(" · "));
      }

      // Parse via IA so no PRIMEIRO arquivo (pra autopreencher).
      // Os outros sao apenas anexados.
      if (lista.length > 0) {
        try {
          const data = await parsePDF(lista[0]);
          const itensExtra = data.itens || [];
          const casados = data.usouIA ? aplicarItensIA(itensExtra) : aplicarItensFallback(itensExtra);
          setParseInfo({
            match: casados,
            total: itensExtra.length,
            fornecedor: data.fornecedor,
            prazo: data.prazoPagamento,
            usouIA: data.usouIA,
            nomeArquivo: lista[0].name,
            multiPdf: lista.length > 1,
          });
          if (data.fornecedor && !razaoSocial) setRazaoSocial(data.fornecedor);
          if (data.prazoPagamento && !condicaoPagamento) setCondicaoPagamento(data.prazoPagamento);
        } catch (e) {
          // Parse falhou mas anexos podem ter sido salvos — nao bloqueia
          setErro("PDFs anexados, mas falha na leitura automatica: " + e.message);
        }
      }
    } finally {
      setParsing(false);
    }
  }

  // Total bruto: soma de preço × qtd de cada linha (exclui semEstoque)
  const total = useMemo(
    () =>
      linhas.reduce((s, l) => {
        if (l.semEstoque) return s;
        const p = parseFloat(String(l.precoUnit).replace(",", ".")) || 0;
        const q = parseFloat(String(l.qtdCotada).replace(",", ".")) || 0;
        return s + p * q;
      }, 0),
    [linhas]
  );

  // Total com IPI: bruto + IPI (IPI eh imposto por fora, soma na NF)
  const totalComIPI = useMemo(
    () =>
      linhas.reduce((s, l) => {
        if (l.semEstoque) return s;
        const p = parseFloat(String(l.precoUnit).replace(",", ".")) || 0;
        const q = parseFloat(String(l.qtdCotada).replace(",", ".")) || 0;
        const ipi = parseFloat(String(l.ipiPct).replace(",", ".")) || 0;
        const bruto = p * q;
        return s + bruto * (1 + ipi / 100);
      }, 0),
    [linhas]
  );

  const submit = async (e) => {
    e.preventDefault();
    setErro("");
    const itens = linhas
      .map((l) => ({
        cotacaoItemId: l.id,
        precoUnit: l.semEstoque ? 0 : (parseFloat(String(l.precoUnit).replace(",", ".")) || 0),
        qtdCotada: l.semEstoque ? 0 : (parseFloat(String(l.qtdCotada).replace(",", ".")) || 0),
        icmsPct: l.semEstoque ? 0 : (parseFloat(String(l.icmsPct).replace(",", ".")) || 0),
        ipiPct: l.semEstoque ? 0 : (parseFloat(String(l.ipiPct).replace(",", ".")) || 0),
        observacao: l.observacao || null,
        semEstoque: l.semEstoque || false,
        prazoEntrega: l.semEstoque ? null : (l.prazoEntrega || null),
      }))
      .filter((l) => l.precoUnit > 0 || l.semEstoque);
    const itensComPreco = itens.filter((l) => l.precoUnit > 0);
    if (itensComPreco.length === 0) {
      return setErro("Preencha pelo menos um preco unitario maior que zero.");
    }
    const cnpjLimpo = cnpj.replace(/\D/g, "");
    if (cnpjLimpo.length !== 14) {
      return setErro("Informe o CNPJ da sua empresa (14 digitos).");
    }
    if (!numeroProposta.trim()) {
      return setErro("Informe o numero da proposta.");
    }
    if (!prazoEntrega.trim()) {
      return setErro("Informe o prazo de entrega.");
    }
    if (!condicaoPagamento.trim()) {
      return setErro("Informe a condicao de pagamento.");
    }
    setEnviando(true);
    setEnviadoAgora(false);
    try {
      const totalPropostaNum = parseFloat(String(valorTotalProposta).replace(",", ".")) || null;
      const res = await fetch(`/api/cotacao/submeter/${cotacao.token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itens,
          cnpj: cnpjLimpo,
          razaoSocial: razaoSocial.trim() || null,
          numeroProposta: numeroProposta.trim(),
          totalProposta: totalPropostaNum,
          prazoEntrega: prazoEntrega || null,
          condicaoPagamento: condicaoPagamento || null,
          observacao: observacaoGeral || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao enviar");
      setEnviadoAgora(true);
      setEnviando(false);
      // Refresh em segundo plano pra sincronizar com novo numero de revisao
      router.refresh();
    } catch (e) {
      setErro(e.message);
      setEnviando(false);
    }
  };

  return (
    <div className="min-h-screen bg-torg-blue-50/30">
      {/* Header */}
      <header className="bg-white border-b border-torg-blue-100 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <TorgLogo size="sm" />
            <span className="text-xs text-torg-gray hidden sm:inline">Portal de Cotações</span>
          </Link>
          <span className="text-xs text-torg-gray">RM {cotacao.rm.numero}</span>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        {/* Boas-vindas + dados da RM */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <p className="text-sm text-torg-gray">Olá, <strong className="text-torg-dark">{cotacao.fornecedorNome}</strong></p>
          <h1 className="text-2xl font-extrabold text-torg-dark tracking-tight mt-1">
            Solicitação de Cotação — RM {cotacao.rm.numero}
          </h1>
          <p className="text-sm text-torg-gray mt-2">{cotacao.rm.descricao}</p>
          {cotacao.rm.observacao && (
            <p className="text-sm text-torg-gray mt-1">Observação: {cotacao.rm.observacao}</p>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4 pt-4 border-t border-gray-100 text-sm">
            <div>
              <p className="text-xs text-torg-gray">Itens pra cotar</p>
              <p className="font-medium text-torg-dark">{cotacao.itens.length}</p>
            </div>
            <div>
              <p className="text-xs text-torg-gray">Prazo de resposta</p>
              <p className={`font-medium ${vencida ? "text-red-600" : "text-torg-dark"}`}>
                {fmtData(cotacao.prazoResposta)}
                {vencida && " (vencido)"}
              </p>
            </div>
            <div>
              <p className="text-xs text-torg-gray">Status</p>
              <p className="font-medium text-torg-blue">Aguardando proposta</p>
            </div>
          </div>
        </div>

        {/* Anexos: desenhos, especificacoes, etc — enviados pelo comprador junto com a RM */}
        {anexos.length > 0 && (
          <div className="bg-white rounded-2xl border border-torg-blue-100 p-5 sm:p-6">
            <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
              <div>
                <h2 className="text-base font-semibold text-torg-dark inline-flex items-center gap-2">
                  <FileText size={18} className="text-torg-blue" /> Anexos da solicitação
                </h2>
                <p className="text-xs text-torg-gray mt-0.5">
                  Desenhos, especificações e materiais de referência. Clique pra abrir/baixar.
                </p>
              </div>
              <span className="text-xs text-torg-gray font-medium">{anexos.length} arquivo(s)</span>
            </div>
            <ul className="divide-y divide-gray-100 border border-gray-200 rounded-lg">
              {anexos.map((a) => {
                const tamMb = a.tamanho ? (a.tamanho / (1024 * 1024)).toFixed(2) : null;
                return (
                  <li key={a.id} className="px-3 py-2 flex items-center gap-3 hover:bg-torg-blue-50/40">
                    <FileText size={16} className="text-torg-blue flex-shrink-0" />
                    <a
                      href={a.blobUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 min-w-0 truncate text-sm text-torg-dark hover:text-torg-blue hover:underline"
                      title={a.nomeArquivo}
                    >
                      {a.nomeArquivo}
                    </a>
                    {a.rm?.numero && (
                      <span className="text-[10px] font-mono text-torg-gray bg-gray-100 px-1.5 py-0.5 rounded">
                        RM {a.rm.numero}
                      </span>
                    )}
                    {tamMb && (
                      <span className="text-xs text-torg-gray tabular-nums whitespace-nowrap">{tamMb} MB</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* Anexos da PROPRIA cotacao (PDFs subidos pelo fornecedor) — pode remover */}
        {anexosCotacao.length > 0 && (
          <div className="bg-amber-50/40 rounded-2xl border border-amber-200 p-5 sm:p-6">
            <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
              <div>
                <h2 className="text-base font-semibold text-amber-800 inline-flex items-center gap-2">
                  <FileText size={18} className="text-amber-700" /> Sua proposta anexada
                </h2>
                <p className="text-xs text-amber-700/80 mt-0.5">
                  PDFs/imagens que você enviou pra essa cotação. Pode remover se quiser substituir.
                </p>
              </div>
              <span className="text-xs text-amber-700 font-medium">{anexosCotacao.length} arquivo(s)</span>
            </div>
            <ul className="divide-y divide-amber-100 border border-amber-200 rounded-lg bg-white">
              {anexosCotacao.map((a) => (
                <AnexoCotacaoLinha
                  key={a.id}
                  anexo={a}
                  token={cotacao.token}
                  onRemoved={(id) => {
                    setAnexosCotacao((prev) => prev.filter((x) => x.id !== id));
                    setArquivosSessao((prev) => prev.filter((nome) => nome !== a.nomeArquivo));
                  }}
                />
              ))}
            </ul>
          </div>
        )}

        {/* Dados de FATURAMENTO — quem o fornecedor deve emitir a NF para */}
        {faturamento && (
          <PainelFaturamento faturamento={faturamento} />
        )}

        {emRevisaoFinal && (
          <div className="bg-emerald-50 border-2 border-emerald-300 rounded-lg p-4 text-sm text-emerald-900 flex items-start gap-3">
            <CheckCircle2 size={22} className="mt-0.5 flex-shrink-0 text-emerald-700" />
            <div>
              <p className="font-semibold text-base">📋 Revisão final dos itens vencedores</p>
              <p className="text-xs mt-1 leading-relaxed">
                A Torg analisou sua proposta e a partir das melhores condições, <strong>essa é a lista de itens em que você foi escolhido como fornecedor</strong>. Confira os valores abaixo e <strong>confirme</strong> (ou ajuste se necessário) antes de enviar — essa será a proposta final usada na geração do pedido de compra.
              </p>
            </div>
          </div>
        )}

        {vencida && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700 flex items-start gap-2">
            <AlertTriangle size={18} className="mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium">Esse pedido está fora do prazo</p>
              <p className="text-xs">Você ainda pode enviar a proposta, mas talvez o comprador já tenha decidido com outros fornecedores. Sugerimos contatar o comprador antes.</p>
            </div>
          </div>
        )}

        {jaEnviou && !enviadoAgora && (
          <div className="bg-torg-blue-50 border border-torg-blue-200 rounded-lg p-4 text-sm text-torg-dark flex items-start gap-2">
            <RotateCcw size={18} className="mt-0.5 flex-shrink-0 text-torg-blue" />
            <div>
              <p className="font-medium">
                Você já enviou esta proposta em {fmtData(cotacao.recebidaEm)}
                {cotacao.numeroRevisao > 0 && ` (revisão ${cotacao.numeroRevisao})`}
              </p>
              <p className="text-xs text-torg-gray">
                Os valores abaixo são os que você nos enviou. Pode editar e reenviar — a Torg vai considerar a versão mais recente.
              </p>
            </div>
          </div>
        )}

        {enviadoAgora && (
          <div className="bg-torg-orange-50 border border-torg-orange-200 rounded-lg p-4 text-sm text-torg-dark flex items-start gap-2">
            <CheckCircle2 size={18} className="mt-0.5 flex-shrink-0 text-torg-orange" />
            <div>
              <p className="font-medium">Proposta {jaEnviou ? "atualizada" : "enviada"} com sucesso</p>
              <p className="text-xs text-torg-gray">
                Total: <strong>{fmtMoeda(linhas.reduce((s, l) => s + (parseFloat(String(l.precoUnit).replace(",", ".")) || 0) * (parseFloat(String(l.qtdCotada).replace(",", ".")) || 0), 0))}</strong>.
                Você pode revisar novamente se precisar — basta editar e clicar em "Atualizar proposta".
              </p>
            </div>
          </div>
        )}

        {erro && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2 flex items-start gap-2">
            <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
            <span>{erro}</span>
          </div>
        )}

        <form onSubmit={submit} className="space-y-6">
          {/* Anexar proposta (PDF) */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-start justify-between flex-wrap gap-3">
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-semibold text-torg-dark flex items-center gap-2">
                  <Sparkles size={18} className="text-torg-orange" />
                  Tem a proposta em PDF?
                </h2>
                <p className="text-xs text-torg-gray mt-1">
                  Anexe o(s) PDF(s) e a gente tenta preencher os preços automaticamente. Você pode anexar <strong>mais de um arquivo</strong> (ex: faturamento por CNPJs diferentes).
                </p>
              </div>
              <div className="flex gap-2 items-center flex-wrap">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={parsing}
                  className="px-4 py-2 bg-torg-blue text-white text-sm rounded-lg hover:bg-torg-blue-700 font-medium flex items-center gap-2 disabled:opacity-50"
                >
                  {parsing ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                  {parsing
                    ? "Lendo PDF(s)..."
                    : anexosCotacao.length > 0
                      ? "Adicionar mais PDFs"
                      : "Anexar proposta(s) (PDF)"}
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="application/pdf,.pdf"
                  multiple
                  className="hidden"
                  onChange={(e) => { uploadPDFs(e.target.files); e.target.value = ""; }}
                />
              </div>
            </div>

            {arquivosSessao.length > 0 && (
              <div className="mt-4 space-y-1.5">
                {arquivosSessao.map((nome, i) => (
                  <div key={`${nome}-${i}`} className="flex items-center gap-2 bg-emerald-50/60 border border-emerald-200 rounded-lg px-3 py-2">
                    <FileText size={16} className="text-emerald-700 flex-shrink-0" />
                    <p className="text-sm text-torg-dark flex-1 truncate">{nome}</p>
                    <span className="text-[10px] text-emerald-700 font-medium uppercase">enviado</span>
                  </div>
                ))}
              </div>
            )}

            {parseInfo && (
              <div className="mt-3 bg-torg-orange-50/40 border border-torg-orange-100 rounded-lg px-3 py-2 text-sm">
                {parseInfo.match > 0 ? (
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <p className="text-torg-dark">
                      ✓ <strong>{parseInfo.match}</strong> {parseInfo.match === 1 ? "item preenchido" : "itens preenchidos"} automaticamente
                      {parseInfo.nomeArquivo && parseInfo.multiPdf && (
                        <span className="text-torg-gray"> (lido de <strong>{parseInfo.nomeArquivo}</strong>; os outros PDFs ficaram apenas como anexo)</span>
                      )}
                      {parseInfo.total > parseInfo.match && (
                        <span className="text-torg-gray"> ({parseInfo.total - parseInfo.match} item(s) do PDF não casaram com a RM — preencha manualmente)</span>
                      )}.
                      {parseInfo.usouIA && <span className="text-[10px] text-torg-blue ml-1">via IA</span>}
                    </p>
                    {autoFilled.size > 0 && (
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-torg-orange-700 font-medium">
                          {autoFilled.size} pendente{autoFilled.size !== 1 ? "s" : ""} de revisão
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            // Marca todas como revisadas de uma vez
                            const ids = Array.from(autoFilled);
                            setRevisado((prev) => {
                              const n = new Set(prev);
                              ids.forEach((id) => n.add(id));
                              return n;
                            });
                            setAutoFilled(new Set());
                          }}
                          className="px-2 py-1 bg-torg-blue text-white text-xs rounded hover:bg-torg-blue-700 font-medium"
                        >
                          ✓ Conferi todos
                        </button>
                      </div>
                    )}
                    {autoFilled.size === 0 && parseInfo.match > 0 && (
                      <span className="text-xs text-torg-blue font-medium">✓ Tudo conferido</span>
                    )}
                  </div>
                ) : (
                  <p className="text-torg-orange-700">
                    ⚠ O PDF foi lido mas não conseguimos casar os itens automaticamente. Pode preencher os preços abaixo manualmente.
                  </p>
                )}
                {parseInfo.match > 0 && autoFilled.size > 0 && (
                  <p className="text-[11px] text-torg-gray mt-1">
                    💡 Linhas em laranja = preenchidas pela IA. Clique no aviso da linha pra confirmar, edite o valor pra ajustar, ou clique &quot;Conferi todos&quot; se está tudo certo.
                  </p>
                )}
              </div>
            )}

            <p className="text-[11px] text-torg-gray mt-3">
              Aceita PDF de até 10MB. Por enquanto o arquivo não é armazenado — apenas usado pra ler os valores. Se preferir, preencha direto na tabela abaixo.
            </p>
          </div>

          {/* Itens */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-torg-dark">Itens solicitados</h2>
              <p className="text-xs text-torg-gray mt-1">
                Preencha o preço unitário e ajuste a quantidade se necessário. Itens sem preço serão ignorados. Se não tiver algum item, marque <strong>&quot;Não tenho&quot;</strong>.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase">#</th>
                    <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase">Descrição</th>
                    <th className="px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase w-[70px]">Não tenho</th>
                    <th className="px-2 py-2 text-right text-xs font-medium text-gray-500 uppercase">Qtd RM</th>
                    <th className="px-2 py-2 text-right text-xs font-medium text-gray-500 uppercase">Qtd cotada *</th>
                    <th className="px-2 py-2 text-right text-xs font-medium text-gray-500 uppercase">Preço unit. *</th>
                    <th className="px-2 py-2 text-right text-xs font-medium text-gray-500 uppercase">ICMS %</th>
                    <th className="px-2 py-2 text-right text-xs font-medium text-gray-500 uppercase">IPI %</th>
                    <th className="px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase">Prazo entrega</th>
                    <th className="px-2 py-2 text-right text-xs font-medium text-gray-500 uppercase">Total bruto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {linhas.map((l, i) => {
                    const totalBruto = (parseFloat(String(l.precoUnit).replace(",", ".")) || 0) * (parseFloat(String(l.qtdCotada).replace(",", ".")) || 0);
                    const isAuto = autoFilled.has(l.id);
                    const isRevisado = revisado.has(l.id);
                    const inputCls = isAuto
                      ? "border-torg-orange-300 bg-torg-orange-50/40"
                      : isRevisado
                      ? "border-torg-blue-200 bg-torg-blue-50/30"
                      : "border-gray-300";
                    return (
                      <tr key={l.id} className={`${isAuto ? "bg-torg-orange-50/20" : ""} ${l.semEstoque ? "opacity-50" : ""}`}>
                        <td className="px-2 py-2 text-gray-400 align-top">{i + 1}</td>
                        <td className="px-2 py-2 align-top">
                          <p className={`font-medium text-xs ${l.semEstoque ? "line-through text-gray-400" : "text-torg-dark"}`}>{l.descricao}</p>
                          {/* Detalhes técnicos — material, dimensões, peso, qtd em peças.
                              Importante pra chapas/perfis: fornecedor precisa entregar
                              QTD de peças com as dimensões especificadas */}
                          <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-0.5">
                            {l.material && (
                              <span className="text-[10px] text-torg-gray">{l.material}</span>
                            )}
                            {(l.comprimento || l.largura) && (
                              <span className="text-[10px] text-torg-blue-700 font-medium" title="Dimensões da peça">
                                {l.comprimento && l.largura
                                  ? `${l.comprimento} × ${l.largura}`
                                  : l.comprimento || l.largura}
                              </span>
                            )}
                            {l.tratamento && (
                              <span className="text-[10px] text-torg-gray">· {l.tratamento}</span>
                            )}
                            {l.qtdPecas > 0 && l.unidadeOriginal && l.unidadeOriginal !== "KG" && (
                              <span className="text-[10px] bg-amber-50 text-amber-800 px-1 rounded font-semibold" title="Quantidade de peças que o fornecedor deve entregar">
                                {l.qtdPecas} {l.unidadeOriginal}
                              </span>
                            )}
                            {l.pesoTotal > 0 && (
                              <span className="text-[10px] text-torg-gray" title="Peso total estimado">
                                ≈ {l.pesoTotal.toFixed(2)} KG
                              </span>
                            )}
                          </div>
                          {isAuto && (
                            <button
                              type="button"
                              onClick={() => marcarRevisado(l.id)}
                              className="mt-1 text-[10px] text-torg-orange-700 hover:text-torg-orange-700 font-medium inline-flex items-center gap-1"
                              title="Marcar como conferido"
                            >
                              ⚠ preenchido pelo PDF — clique pra confirmar
                            </button>
                          )}
                          {isRevisado && (
                            <p className="mt-1 text-[10px] text-torg-blue font-medium">✓ conferido</p>
                          )}
                        </td>
                        {/* Toggle "Não tenho" */}
                        <td className="px-2 py-2 text-center align-top pt-2.5">
                          <button
                            type="button"
                            onClick={() => setLinha(l.id, "semEstoque", !l.semEstoque)}
                            className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-colors ${
                              l.semEstoque
                                ? "bg-red-100 text-red-700 border border-red-200 hover:bg-red-50"
                                : "bg-gray-100 text-gray-400 border border-gray-200 hover:bg-gray-200 hover:text-gray-600"
                            }`}
                            title={l.semEstoque ? "Clique pra desmarcar" : "Marcar que não tem este item"}
                          >
                            <PackageX size={11} />
                            {l.semEstoque ? "Sem" : "—"}
                          </button>
                        </td>
                        <td className="px-2 py-2 text-right text-torg-gray text-xs tabular-nums whitespace-nowrap align-top pt-3">
                          {l.qtdRm} {l.unidade}
                        </td>
                        <td className="px-2 py-2 text-right align-top">
                          <input
                            type="number" step="0.01" min="0"
                            value={l.semEstoque ? "" : l.qtdCotada}
                            onChange={(e) => setLinha(l.id, "qtdCotada", e.target.value)}
                            disabled={l.semEstoque}
                            className={`w-20 border rounded px-1.5 py-1 text-xs text-right tabular-nums focus:ring-1 focus:ring-torg-blue ${l.semEstoque ? "bg-gray-100 border-gray-200 cursor-not-allowed" : inputCls}`}
                          />
                        </td>
                        <td className="px-2 py-2 text-right align-top">
                          <input
                            type="number" step="0.01" min="0"
                            value={l.semEstoque ? "" : l.precoUnit}
                            onChange={(e) => setLinha(l.id, "precoUnit", e.target.value)}
                            placeholder="0,00"
                            disabled={l.semEstoque}
                            className={`w-24 border rounded px-1.5 py-1 text-xs text-right tabular-nums focus:ring-1 focus:ring-torg-blue ${l.semEstoque ? "bg-gray-100 border-gray-200 cursor-not-allowed" : inputCls}`}
                          />
                        </td>
                        <td className="px-2 py-2 text-right align-top">
                          <input
                            type="number" step="0.01" min="0" max="100"
                            value={l.semEstoque ? "" : l.icmsPct}
                            onChange={(e) => setLinha(l.id, "icmsPct", e.target.value)}
                            placeholder="0"
                            disabled={l.semEstoque}
                            className={`w-16 border rounded px-1.5 py-1 text-xs text-right tabular-nums focus:ring-1 focus:ring-torg-blue ${l.semEstoque ? "bg-gray-100 border-gray-200 cursor-not-allowed" : inputCls}`}
                          />
                        </td>
                        <td className="px-2 py-2 text-right align-top">
                          <input
                            type="number" step="0.01" min="0" max="100"
                            value={l.semEstoque ? "" : l.ipiPct}
                            onChange={(e) => setLinha(l.id, "ipiPct", e.target.value)}
                            placeholder="0"
                            disabled={l.semEstoque}
                            className={`w-16 border rounded px-1.5 py-1 text-xs text-right tabular-nums focus:ring-1 focus:ring-torg-blue ${l.semEstoque ? "bg-gray-100 border-gray-200 cursor-not-allowed" : inputCls}`}
                          />
                        </td>
                        <td className="px-2 py-2 text-center align-top">
                          <input
                            type="date"
                            value={l.semEstoque ? "" : l.prazoEntrega}
                            onChange={(e) => setLinha(l.id, "prazoEntrega", e.target.value)}
                            disabled={l.semEstoque}
                            className={`w-[130px] border rounded px-1.5 py-1 text-xs tabular-nums focus:ring-1 focus:ring-torg-blue ${l.semEstoque ? "bg-gray-100 border-gray-200 cursor-not-allowed" : inputCls}`}
                          />
                        </td>
                        <td className="px-2 py-2 text-right font-medium tabular-nums text-xs align-top pt-3">
                          {l.semEstoque
                            ? <span className="text-red-400 text-[10px]">s/ estoque</span>
                            : totalBruto > 0 ? fmtMoeda(totalBruto) : "—"
                          }
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-gray-50">
                  <tr>
                    <td colSpan={9} className="px-3 py-2 text-right text-xs text-torg-gray">Subtotal (preco x qtd):</td>
                    <td className="px-3 py-2 text-right font-medium text-torg-dark tabular-nums text-sm">{fmtMoeda(total)}</td>
                  </tr>
                  {totalComIPI !== total && (
                    <tr>
                      <td colSpan={9} className="px-3 py-2 text-right text-xs text-torg-gray">Total com IPI:</td>
                      <td className="px-3 py-2 text-right font-medium text-torg-dark tabular-nums text-sm">{fmtMoeda(totalComIPI)}</td>
                    </tr>
                  )}
                  {linhas.some((l) => l.semEstoque) && (
                    <tr>
                      <td colSpan={10} className="px-3 py-2 text-right text-xs text-red-500">
                        {linhas.filter((l) => l.semEstoque).length} item(s) marcado(s) como &quot;sem estoque&quot;
                      </td>
                    </tr>
                  )}
                </tfoot>
              </table>
            </div>
          </div>

          {/* Identificação fiscal */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
            <h2 className="text-lg font-semibold text-torg-dark">Identificacao da empresa e proposta</h2>
            <p className="text-xs text-torg-gray -mt-2">
              Campos obrigatorios (*) para emissao do pedido de compra.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-torg-dark mb-1">CNPJ *</label>
                <input
                  type="text"
                  value={cnpj}
                  onChange={(e) => setCnpj(e.target.value)}
                  placeholder="00.000.000/0001-00"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-torg-blue"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-torg-dark mb-1">Razao Social</label>
                <input
                  type="text"
                  value={razaoSocial}
                  onChange={(e) => setRazaoSocial(e.target.value)}
                  placeholder="Nome completo da empresa"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-torg-dark mb-1">N da proposta *</label>
                <input
                  type="text"
                  value={numeroProposta}
                  onChange={(e) => setNumeroProposta(e.target.value)}
                  placeholder="Ex: PROP-2026-001"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-torg-blue"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-torg-dark mb-1">Valor total da proposta (R$)</label>
                <input
                  type="text"
                  value={valorTotalProposta}
                  onChange={(e) => setValorTotalProposta(e.target.value)}
                  placeholder={totalComIPI > 0 ? fmtMoeda(totalComIPI) : "0,00"}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-torg-blue"
                />
                <p className="text-[10px] text-torg-gray mt-1">
                  Valor final conforme sua proposta (com impostos). Se deixar em branco, usamos a soma dos itens.
                </p>
              </div>
            </div>
          </div>

          {/* Condições gerais */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
            <h2 className="text-lg font-semibold text-torg-dark">Condicoes</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-torg-dark mb-1">Prazo de entrega *</label>
                <input
                  type="text"
                  value={prazoEntrega}
                  onChange={(e) => setPrazoEntrega(e.target.value)}
                  placeholder="Ex: 15 dias uteis"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-torg-dark mb-1">Condicao de pagamento *</label>
                <input
                  type="text"
                  value={condicaoPagamento}
                  onChange={(e) => setCondicaoPagamento(e.target.value)}
                  placeholder="Ex: 30 dias / 28 dias com 2% desc."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue"
                  required
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-torg-dark mb-1">Observação geral</label>
              <textarea
                value={observacaoGeral}
                onChange={(e) => setObservacaoGeral(e.target.value)}
                rows={3}
                placeholder="Frete, embalagem, validade da proposta, restrições, etc."
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={enviando}
              className="px-6 py-2.5 bg-torg-orange text-white rounded-lg hover:bg-torg-orange-600 font-semibold flex items-center gap-2 disabled:opacity-50"
            >
              {enviando ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              {enviando
                ? "Enviando..."
                : jaEnviou
                ? "Atualizar proposta"
                : "Enviar proposta"}
            </button>
          </div>
        </form>

        <footer className="text-center text-xs text-torg-gray pt-4">
          Esse link é exclusivo da sua empresa. Não compartilhe — você não vê propostas de outros fornecedores e eles não veem a sua.
        </footer>
      </div>
    </div>
  );
}

// Linha de anexo da cotacao com botao remover (so o fornecedor ve e remove).
// Painel de dados de faturamento — mostra pra quem o fornecedor deve emitir
// a NF (Torg quando faturamento padrao, ou cliente da OP quando faturamento direto).
function PainelFaturamento({ faturamento }) {
  const [copiado, setCopiado] = useState(null);
  const isCliente = faturamento.tipo === "Cliente";

  const copiar = async (label, valor) => {
    if (!valor) return;
    try {
      await navigator.clipboard.writeText(valor);
      setCopiado(label);
      setTimeout(() => setCopiado(null), 1500);
    } catch { /* sem feedback */ }
  };

  const Linha = ({ label, valor }) => {
    if (!valor) return null;
    return (
      <button
        type="button"
        onClick={() => copiar(label, valor)}
        className="w-full flex items-start gap-2 py-1.5 px-2 -mx-2 rounded hover:bg-white/60 text-left transition-colors group"
        title={`Clique pra copiar: ${valor}`}
      >
        <span className={`text-xs flex-shrink-0 w-32 ${isCliente ? "text-amber-700" : "text-torg-blue"} font-medium`}>
          {label}
        </span>
        <span className="text-sm text-torg-dark flex-1 break-words font-medium">{valor}</span>
        <span className="text-[10px] text-torg-gray opacity-0 group-hover:opacity-100 flex-shrink-0 mt-0.5">
          {copiado === label ? "✓ copiado" : "copiar"}
        </span>
      </button>
    );
  };

  return (
    <div className={`rounded-2xl border p-5 sm:p-6 ${
      isCliente
        ? "bg-amber-50/60 border-amber-300"
        : "bg-torg-blue-50/40 border-torg-blue-200"
    }`}>
      <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
        <div>
          <h2 className={`text-base font-semibold inline-flex items-center gap-2 ${
            isCliente ? "text-amber-800" : "text-torg-blue"
          }`}>
            <FileText size={18} /> Dados de Faturamento
          </h2>
          <p className={`text-xs mt-0.5 ${isCliente ? "text-amber-700/90" : "text-torg-blue/80"}`}>
            {isCliente
              ? `Faturamento DIRETO pelo cliente final da obra. A nota fiscal deve ser emitida em nome do cliente abaixo, NÃO em nome da Torg.`
              : `A nota fiscal deve ser emitida em nome da Torg Metal (dados abaixo).`}
          </p>
        </div>
        <span className={`text-xs px-3 py-1 rounded-full font-semibold ${
          isCliente
            ? "bg-amber-200 text-amber-900"
            : "bg-torg-blue-100 text-torg-blue"
        }`}>
          {isCliente ? "Faturamento Direto" : "Faturamento Torg"}
        </span>
      </div>

      {isCliente && faturamento.opNumero && (
        <p className="text-xs text-amber-700 bg-amber-100/70 border border-amber-200 rounded px-3 py-2 mb-3">
          Referente à <strong>OP {faturamento.opNumero}</strong>
          {faturamento.opObra ? ` — obra "${faturamento.opObra}"` : ""}
        </p>
      )}

      <div className="bg-white border border-gray-200 rounded-lg p-3 divide-y divide-gray-100">
        <Linha label="Razão Social" valor={faturamento.razaoSocial} />
        <Linha label="CNPJ" valor={faturamento.cnpj} />
        <Linha label="Inscrição Estadual" valor={faturamento.inscricaoEstadual} />
        <Linha label="Endereço" valor={[
          faturamento.endereco,
          faturamento.bairro,
        ].filter(Boolean).join(", ")} />
        <Linha label="Cidade/UF" valor={[
          faturamento.cidade,
          faturamento.uf,
        ].filter(Boolean).join(" / ")} />
        <Linha label="CEP" valor={faturamento.cep} />
        {isCliente && <Linha label="Contato" valor={faturamento.contato} />}
        <Linha label="E-mail" valor={faturamento.email} />
        <Linha label="Telefone" valor={faturamento.telefone} />
      </div>

      {isCliente && !faturamento.razaoSocial && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2 mt-3">
          ⚠️ Faturamento direto, mas o cliente desta OP ainda não tem dados fiscais cadastrados.
          Contate o comprador da Torg pra confirmar antes de emitir a nota.
        </p>
      )}
    </div>
  );
}

function AnexoCotacaoLinha({ anexo, token, onRemoved }) {
  const [removendo, setRemovendo] = useState(false);
  const tamMb = anexo.tamanho ? (anexo.tamanho / (1024 * 1024)).toFixed(2) : null;
  const remover = async () => {
    if (!window.confirm(`Remover "${anexo.nomeArquivo}"?`)) return;
    setRemovendo(true);
    try {
      const res = await fetch(`/api/cotacao/anexar/${token}/${anexo.id}`, { method: "DELETE" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Erro");
      }
      onRemoved?.(anexo.id);
    } catch (e) {
      alert("Falha ao remover: " + e.message);
      setRemovendo(false);
    }
  };
  return (
    <li className="px-3 py-2 flex items-center gap-3 hover:bg-amber-50/40">
      <FileText size={16} className="text-amber-700 flex-shrink-0" />
      <a
        href={anexo.blobUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex-1 min-w-0 truncate text-sm text-torg-dark hover:text-torg-blue hover:underline"
        title={anexo.nomeArquivo}
      >
        {anexo.nomeArquivo}
      </a>
      {tamMb && (
        <span className="text-xs text-torg-gray tabular-nums whitespace-nowrap">{tamMb} MB</span>
      )}
      <button
        type="button"
        onClick={remover}
        disabled={removendo}
        className="text-xs text-red-600 hover:text-white hover:bg-red-600 font-medium px-2 py-1 rounded border border-red-200 hover:border-red-600 inline-flex items-center gap-1 disabled:opacity-50"
        title="Remover esse anexo"
      >
        {removendo ? <Loader2 size={12} className="animate-spin" /> : "Remover"}
      </button>
    </li>
  );
}
