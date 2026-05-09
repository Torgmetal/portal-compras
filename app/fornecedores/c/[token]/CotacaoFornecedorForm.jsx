"use client";
import { useState, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Loader2, AlertCircle, Send, AlertTriangle, Truck, RotateCcw, CheckCircle2, Upload, FileText, X, Sparkles } from "lucide-react";
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

export default function CotacaoFornecedorForm({ cotacao, vencida }) {
  const router = useRouter();
  const jaEnviou = cotacao.status === "RECEBIDA";
  const obsParsed = parseObservacao(cotacao.observacao);

  const [linhas, setLinhas] = useState(() =>
    cotacao.itens.map((it) => {
      const peso = Number(it.rmItem.peso) || 0;
      const usaKg = peso > 0;
      return {
        id: it.id,
        descricao: it.rmItem.descricao,
        material: it.rmItem.material,
        qtdRm: usaKg ? peso : it.rmItem.qtd,
        unidade: usaKg ? "KG" : it.rmItem.unidade,
        // Pre-popula com valores ja enviados se existirem
        precoUnit: it.precoUnit > 0 ? String(it.precoUnit) : "",
        qtdCotada: it.qtdCotada > 0 ? it.qtdCotada : (usaKg ? peso : it.qtdCotada),
        icmsPct: it.icmsPct != null ? String(it.icmsPct) : "",
        ipiPct: it.ipiPct != null ? String(it.ipiPct) : "",
        observacao: it.observacao || "",
      };
    })
  );
  const [cnpj, setCnpj] = useState(cotacao.cnpj || "");
  const [razaoSocial, setRazaoSocial] = useState(cotacao.fornecedorNome || "");
  const [prazoEntrega, setPrazoEntrega] = useState(jaEnviou ? obsParsed.prazoEntrega : "");
  const [condicaoPagamento, setCondicaoPagamento] = useState(jaEnviou ? obsParsed.condicaoPagamento : "");
  const [observacaoGeral, setObservacaoGeral] = useState(jaEnviou ? obsParsed.observacao : "");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [enviadoAgora, setEnviadoAgora] = useState(false);
  const [arquivoNome, setArquivoNome] = useState("");
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

  async function uploadPDF(file) {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setErro("Arquivo muito grande (limite 10MB).");
      return;
    }
    setErro("");
    setParseInfo(null);
    setParsing(true);
    try {
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

      // 1. Tenta IA (Claude — entende variacoes brasileiras + faz matching automatico)
      let usouIA = false;
      let data = null;
      try {
        const resIA = await fetch("/api/parse-cotacao-ai", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pdfBase64: base64, rmItens: rmItensCtx }),
        });
        if (resIA.ok) {
          data = await resIA.json();
          usouIA = true;
        }
      } catch (_) { /* cai no fallback */ }

      // 2. Fallback regex se IA falhou
      if (!usouIA) {
        const resFb = await fetch("/api/parse-pdf-cotacao", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ base64 }),
        });
        if (!resFb.ok) {
          const e = await resFb.json().catch(() => ({}));
          throw new Error(e.error || "Falha ao ler PDF");
        }
        data = await resFb.json();
      }

      const itensExtra = data.itens || [];
      const casados = usouIA ? aplicarItensIA(itensExtra) : aplicarItensFallback(itensExtra);
      setArquivoNome(file.name);
      setParseInfo({
        match: casados,
        total: itensExtra.length,
        fornecedor: data.fornecedor,
        prazo: data.prazoPagamento,
        usouIA,
      });
      // Pre-preenche identificacao se vier no PDF
      if (data.fornecedor && !razaoSocial) setRazaoSocial(data.fornecedor);
      if (data.prazoPagamento && !condicaoPagamento) setCondicaoPagamento(data.prazoPagamento);
    } catch (e) {
      setErro("Falha ao processar PDF: " + e.message);
    } finally {
      setParsing(false);
    }
  }

  // Total bruto: soma de preço × qtd de cada linha
  const total = useMemo(
    () =>
      linhas.reduce((s, l) => {
        const p = parseFloat(String(l.precoUnit).replace(",", ".")) || 0;
        const q = parseFloat(String(l.qtdCotada).replace(",", ".")) || 0;
        return s + p * q;
      }, 0),
    [linhas]
  );

  // Total líquido: ICMS por dentro (subtrai), IPI por fora (soma)
  // Fórmula: bruto × (1 − icms/100) × (1 + ipi/100)
  const totalLiquido = useMemo(
    () =>
      linhas.reduce((s, l) => {
        const p = parseFloat(String(l.precoUnit).replace(",", ".")) || 0;
        const q = parseFloat(String(l.qtdCotada).replace(",", ".")) || 0;
        const icms = parseFloat(String(l.icmsPct).replace(",", ".")) || 0;
        const ipi = parseFloat(String(l.ipiPct).replace(",", ".")) || 0;
        const bruto = p * q;
        return s + bruto * (1 - icms / 100) * (1 + ipi / 100);
      }, 0),
    [linhas]
  );

  const submit = async (e) => {
    e.preventDefault();
    setErro("");
    const itens = linhas
      .map((l) => ({
        cotacaoItemId: l.id,
        precoUnit: parseFloat(String(l.precoUnit).replace(",", ".")) || 0,
        qtdCotada: parseFloat(String(l.qtdCotada).replace(",", ".")) || 0,
        icmsPct: parseFloat(String(l.icmsPct).replace(",", ".")) || 0,
        ipiPct: parseFloat(String(l.ipiPct).replace(",", ".")) || 0,
        observacao: l.observacao || null,
      }))
      .filter((l) => l.precoUnit > 0);
    if (itens.length === 0) {
      return setErro("Preencha pelo menos um preço unitário maior que zero.");
    }
    const cnpjLimpo = cnpj.replace(/\D/g, "");
    if (cnpjLimpo.length !== 14) {
      return setErro("Informe o CNPJ da sua empresa (14 dígitos).");
    }
    setEnviando(true);
    setEnviadoAgora(false);
    try {
      const res = await fetch(`/api/cotacao/submeter/${cotacao.token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itens,
          cnpj: cnpjLimpo,
          razaoSocial: razaoSocial.trim() || null,
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
                  Anexe o PDF e a gente tenta preencher os preços automaticamente. Você revisa antes de enviar.
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
                  {parsing ? "Lendo PDF..." : arquivoNome ? "Trocar PDF" : "Anexar proposta (PDF)"}
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="application/pdf,.pdf"
                  className="hidden"
                  onChange={(e) => { uploadPDF(e.target.files?.[0]); e.target.value = ""; }}
                />
              </div>
            </div>

            {arquivoNome && (
              <div className="mt-4 flex items-center gap-2 bg-torg-blue-50/50 border border-torg-blue-100 rounded-lg px-3 py-2">
                <FileText size={16} className="text-torg-blue flex-shrink-0" />
                <p className="text-sm text-torg-dark flex-1 truncate">{arquivoNome}</p>
                <button
                  type="button"
                  onClick={() => { setArquivoNome(""); setParseInfo(null); }}
                  className="text-gray-400 hover:text-red-600 flex-shrink-0"
                  title="Remover"
                >
                  <X size={14} />
                </button>
              </div>
            )}

            {parseInfo && (
              <div className="mt-3 bg-torg-orange-50/40 border border-torg-orange-100 rounded-lg px-3 py-2 text-sm">
                {parseInfo.match > 0 ? (
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <p className="text-torg-dark">
                      ✓ <strong>{parseInfo.match}</strong> {parseInfo.match === 1 ? "item preenchido" : "itens preenchidos"} automaticamente
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
                Preencha o preço unitário e ajuste a quantidade se necessário. Itens sem preço serão ignorados.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase">#</th>
                    <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase">Descrição</th>
                    <th className="px-2 py-2 text-right text-xs font-medium text-gray-500 uppercase">Qtd RM</th>
                    <th className="px-2 py-2 text-right text-xs font-medium text-gray-500 uppercase">Qtd cotada *</th>
                    <th className="px-2 py-2 text-right text-xs font-medium text-gray-500 uppercase">Preço unit. *</th>
                    <th className="px-2 py-2 text-right text-xs font-medium text-gray-500 uppercase">ICMS %</th>
                    <th className="px-2 py-2 text-right text-xs font-medium text-gray-500 uppercase">IPI %</th>
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
                      <tr key={l.id} className={isAuto ? "bg-torg-orange-50/20" : ""}>
                        <td className="px-2 py-2 text-gray-400 align-top">{i + 1}</td>
                        <td className="px-2 py-2 align-top">
                          <p className="text-torg-dark font-medium text-xs">{l.descricao}</p>
                          {l.material && <p className="text-[10px] text-torg-gray">{l.material}</p>}
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
                        <td className="px-2 py-2 text-right text-torg-gray text-xs tabular-nums whitespace-nowrap align-top pt-3">
                          {l.qtdRm} {l.unidade}
                        </td>
                        <td className="px-2 py-2 text-right align-top">
                          <input
                            type="number" step="0.01" min="0"
                            value={l.qtdCotada}
                            onChange={(e) => setLinha(l.id, "qtdCotada", e.target.value)}
                            className={`w-20 border rounded px-1.5 py-1 text-xs text-right tabular-nums focus:ring-1 focus:ring-torg-blue ${inputCls}`}
                          />
                        </td>
                        <td className="px-2 py-2 text-right align-top">
                          <input
                            type="number" step="0.01" min="0"
                            value={l.precoUnit}
                            onChange={(e) => setLinha(l.id, "precoUnit", e.target.value)}
                            placeholder="0,00"
                            className={`w-24 border rounded px-1.5 py-1 text-xs text-right tabular-nums focus:ring-1 focus:ring-torg-blue ${inputCls}`}
                          />
                        </td>
                        <td className="px-2 py-2 text-right align-top">
                          <input
                            type="number" step="0.01" min="0" max="100"
                            value={l.icmsPct}
                            onChange={(e) => setLinha(l.id, "icmsPct", e.target.value)}
                            placeholder="0"
                            className={`w-16 border rounded px-1.5 py-1 text-xs text-right tabular-nums focus:ring-1 focus:ring-torg-blue ${inputCls}`}
                          />
                        </td>
                        <td className="px-2 py-2 text-right align-top">
                          <input
                            type="number" step="0.01" min="0" max="100"
                            value={l.ipiPct}
                            onChange={(e) => setLinha(l.id, "ipiPct", e.target.value)}
                            placeholder="0"
                            className={`w-16 border rounded px-1.5 py-1 text-xs text-right tabular-nums focus:ring-1 focus:ring-torg-blue ${inputCls}`}
                          />
                        </td>
                        <td className="px-2 py-2 text-right text-torg-dark font-medium tabular-nums text-xs align-top pt-3">
                          {totalBruto > 0 ? fmtMoeda(totalBruto) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-gray-50">
                  <tr>
                    <td colSpan={7} className="px-3 py-2 text-right text-xs text-torg-gray">Total bruto da proposta:</td>
                    <td className="px-3 py-2 text-right font-medium text-torg-dark tabular-nums text-sm">{fmtMoeda(total)}</td>
                  </tr>
                  <tr>
                    <td colSpan={7} className="px-3 py-3 text-right text-sm font-semibold text-torg-dark">
                      Total líquido (custo Torg, ICMS por dentro + IPI por fora):
                    </td>
                    <td className="px-3 py-3 text-right font-bold text-torg-orange-700 text-base tabular-nums">{fmtMoeda(totalLiquido)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Identificação fiscal */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
            <h2 className="text-lg font-semibold text-torg-dark">Identificação da empresa</h2>
            <p className="text-xs text-torg-gray -mt-2">
              Necessário pra emissão do pedido de compra. Preencha uma vez — fica salvo pras próximas cotações.
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
                <label className="block text-sm font-medium text-torg-dark mb-1">Razão Social</label>
                <input
                  type="text"
                  value={razaoSocial}
                  onChange={(e) => setRazaoSocial(e.target.value)}
                  placeholder="Nome completo da empresa"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue"
                />
              </div>
            </div>
          </div>

          {/* Condições gerais */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
            <h2 className="text-lg font-semibold text-torg-dark">Condições</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-torg-dark mb-1">Prazo de entrega</label>
                <input
                  type="text"
                  value={prazoEntrega}
                  onChange={(e) => setPrazoEntrega(e.target.value)}
                  placeholder="Ex: 15 dias úteis"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-torg-dark mb-1">Condição de pagamento</label>
                <input
                  type="text"
                  value={condicaoPagamento}
                  onChange={(e) => setCondicaoPagamento(e.target.value)}
                  placeholder="Ex: 30 dias / 28 dias com 2% desc."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue"
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
