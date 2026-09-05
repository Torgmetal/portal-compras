"use client";
import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Loader2, AlertCircle, X, Edit3, Upload } from "lucide-react";
import { numeroBR } from "@/lib/numero-br";
import { PropostaUploadIA } from "./PropostaUploadIA";
import { TabelaLinhasProposta } from "./TabelaLinhasProposta";

export function ModalLancarManual({ cotacao, rm, onClose }) {
  const router = useRouter();
  const [cnpj, setCnpj] = useState(cotacao.cnpj || "");
  const [razaoSocial, setRazaoSocial] = useState(cotacao.fornecedorNome || "");
  // Se a cotacao tem itensCotaveis (vem do server enriquecido), usa eles —
  // assim o modal mostra TODOS os itens da cotacao consolidada (de varias RMs).
  // Fallback: itens da RM atual (compatibilidade).
  const [linhas, setLinhas] = useState(() => {
    if (cotacao.itensCotaveis && cotacao.itensCotaveis.length > 0) {
      return cotacao.itensCotaveis.map((it) => ({
        rmItemId: it.rmItemId,
        descricao: it.descricao,
        unidade: it.unidade,
        qtdRm: it.qtdRm,
        precoUnit: it.precoUnit || "",
        qtdCotada: it.qtdCotada,
        icmsPct: it.icmsPct || "",
        ipiPct: it.ipiPct || "",
        _rmNumero: it._rmNumero,
        _ehDestaRM: it._ehDestaRM,
      }));
    }
    return rm.itens
      .filter((it) => it.status === "PENDENTE" || it.status === "EM_COTACAO" || it.status === "COTADO")
      .map((it) => {
        const peso = Number(it.peso) || 0;
        const usaKg = peso > 0;
        return {
          rmItemId: it.id,
          descricao: it.descricao,
          unidade: usaKg ? "KG" : it.unidade,
          qtdRm: usaKg ? peso : it.qtd,
          precoUnit: "",
          qtdCotada: usaKg ? peso : it.qtd,
          icmsPct: "",
          ipiPct: "",
        };
      });
  });
  const [prazoEntrega, setPrazoEntrega] = useState("");
  const [condicaoPagamento, setCondicaoPagamento] = useState("");
  const [observacao, setObservacao] = useState("");
  // Total da nota declarado pelo fornecedor (PDF). Quando preenchido, vira
  // a "fonte da verdade" do total — gerar-pedidos vai escalar precos pra bater.
  const [totalPropostaInput, setTotalPropostaInput] = useState(
    cotacao.totalProposta ? String(cotacao.totalProposta) : ""
  );
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [arquivoNome, setArquivoNome] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parseInfo, setParseInfo] = useState(null);
  const [autoFilled, setAutoFilled] = useState(new Set());
  const [revisado, setRevisado] = useState(new Set());
  // Anexo pendente: arquivo ja uploaded pro blob, aguardando vinculo a
  // cotacao quando o usuario salvar. { url, nomeArquivo, tamanho, tipo }
  const [anexoPendente, setAnexoPendente] = useState(null);
  const fileRef = useRef(null);

  const setLinha = (id, k, v) => {
    setLinhas((p) => p.map((l) => (l.rmItemId === id ? { ...l, [k]: v } : l)));
    if (autoFilled.has(id)) {
      setAutoFilled((prev) => { const n = new Set(prev); n.delete(id); return n; });
      setRevisado((prev) => new Set(prev).add(id));
    }
  };
  const marcarRevisado = (id) => {
    setAutoFilled((prev) => { const n = new Set(prev); n.delete(id); return n; });
    setRevisado((prev) => new Set(prev).add(id));
  };

  // Upload de PDF/imagem do fornecedor — usa mesmo endpoint /api/parse-cotacao-ai
  async function uploadProposta(file) {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setErro("Arquivo muito grande (limite 10MB).");
      return;
    }
    setErro("");
    setParseInfo(null);
    setParsing(true);
    setArquivoNome(file.name);
    setAnexoPendente(null);
    try {
      const base64 = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result);
        r.onerror = rej;
        r.readAsDataURL(file);
      });
      const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
      const isImg = (file.type || "").startsWith("image/");
      if (!isPdf && !isImg) {
        throw new Error("Formato não suportado. Use PDF ou imagem.");
      }

      // Em paralelo: sobe o arquivo pro Vercel Blob (vira anexo da cotacao
      // quando o usuario salvar). Best-effort — se falhar, segue sem anexo.
      try {
        const fd = new FormData();
        fd.append("file", file);
        const upRes = await fetch("/api/upload-blob", { method: "POST", body: fd });
        const upData = await upRes.json();
        if (upRes.ok) {
          setAnexoPendente({
            url: upData.url,
            nomeArquivo: upData.nomeArquivo,
            tamanho: upData.tamanho,
            tipo: upData.tipo,
          });
        }
      } catch {
        // Sem blob — segue mesmo assim. Usuario ainda vê os dados parseados.
      }

      const body = isPdf
        ? { pdfBase64: base64, rmItens: linhas.map((l) => ({
            descricao: l.descricao, qtd: l.qtdRm, unidade: l.unidade,
            pesoKg: l.unidade === "KG" ? l.qtdRm : null,
          })) }
        : { imageBase64: base64, imageType: file.type, rmItens: linhas.map((l) => ({
            descricao: l.descricao, qtd: l.qtdRm, unidade: l.unidade,
            pesoKg: l.unidade === "KG" ? l.qtdRm : null,
          })) };

      const res = await fetch("/api/parse-cotacao-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao processar");

      // Aplica os itens via rmIndex (a IA ja casou com a RM)
      const itensIA = data.itens || [];
      const linhasNovas = [...linhas];
      const idsAuto = new Set();
      let casados = 0;
      for (const it of itensIA) {
        const idx = it.rmIndex;
        if (idx == null || idx < 0 || idx >= linhasNovas.length) continue;
        const l = linhasNovas[idx];
        if (it.precoUnit) l.precoUnit = String(it.precoUnit);
        if (it.qtdCotada || it.qtd) l.qtdCotada = it.qtdCotada || it.qtd;
        if (it.icmsPct != null) l.icmsPct = String(it.icmsPct);
        if (it.ipiPct != null) l.ipiPct = String(it.ipiPct);
        idsAuto.add(l.rmItemId);
        casados++;
      }
      setLinhas(linhasNovas);
      setAutoFilled(idsAuto);
      setRevisado(new Set());
      setParseInfo({ match: casados, total: itensIA.length, fornecedor: data.fornecedor, prazo: data.prazoPagamento });

      // Pre-popula identificacao se vier no PDF
      if (data.fornecedor && !razaoSocial) setRazaoSocial(data.fornecedor);
      if (data.prazoPagamento && !condicaoPagamento) setCondicaoPagamento(data.prazoPagamento);
    } catch (e) {
      setErro("Falha ao processar: " + e.message);
    } finally {
      setParsing(false);
    }
  }

  // Total da nota: bruto × qtd × (1 + IPI%). Bate com "Valor total" do PDF.
  // ICMS nao entra (credito Torg, nao soma na NF).
  const total = linhas.reduce((s, l) => {
    const p = numeroBR(l.precoUnit);
    const q = numeroBR(l.qtdCotada);
    const ipi = numeroBR(l.ipiPct);
    return s + p * q * (1 + ipi / 100);
  }, 0);
  // Subtotais pra mostrar separados embaixo
  const totalBrutoSemIPI = linhas.reduce((s, l) => {
    const p = numeroBR(l.precoUnit);
    const q = numeroBR(l.qtdCotada);
    return s + p * q;
  }, 0);
  const totalIPI = total - totalBrutoSemIPI;

  const submit = async () => {
    setErro("");
    const cnpjLimpo = cnpj.replace(/\D/g, "");
    if (cnpjLimpo.length !== 14 && cnpjLimpo.length !== 11) return setErro("Informe o CNPJ (14 dígitos) ou o CPF (11 dígitos).");
    // Itens: o cotacaoItem precisa ser identificado. Como o admin pode lancar pra
    // RMItens que talvez nao estejam na cotacao original, mapeamos pelo rmItemId
    // → busca/cria cotacaoItem correspondente no submit (API ja faz match).
    const itens = linhas
      .map((l) => ({
        rmItemId: l.rmItemId,
        precoUnit: numeroBR(l.precoUnit),
        qtdCotada: numeroBR(l.qtdCotada),
        icmsPct: numeroBR(l.icmsPct),
        ipiPct: numeroBR(l.ipiPct),
      }))
      .filter((l) => l.precoUnit > 0);
    if (itens.length === 0) return setErro("Preencha ao menos um preço unitário.");

    setSalvando(true);
    try {
      const totalPropostaNum = numeroBR(totalPropostaInput);
      const res = await fetch(`/api/cotacao/${cotacao.id}/lancar-manual`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cnpj: cnpjLimpo,
          razaoSocial: razaoSocial.trim() || null,
          itens,
          prazoEntrega: prazoEntrega || null,
          condicaoPagamento: condicaoPagamento || null,
          observacao: observacao || null,
          totalProposta: !isNaN(totalPropostaNum) && totalPropostaNum > 0 ? totalPropostaNum : null,
          anexo: anexoPendente,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro");
      router.refresh();
      onClose();
    } catch (e) {
      setErro(e.message);
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-auto">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white">
          <h3 className="text-lg font-semibold text-torg-dark flex items-center gap-2">
            <Edit3 size={20} className="text-torg-orange" /> Lançar proposta manualmente
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <p className="text-xs text-torg-gray">
            Use quando o fornecedor mandou a proposta por email/telefone e você está digitando manualmente.
            Os valores vão pro Mapa Comparativo igual aos lançados pelo portal.
          </p>

          {erro && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded px-3 py-2 flex items-start gap-2">
              <AlertCircle size={14} className="mt-0.5" /> <span>{erro}</span>
            </div>
          )}

          {/* Upload de PDF/imagem do fornecedor (auto-preenchimento via IA) */}
          <PropostaUploadIA
            anexoPendente={anexoPendente}
            arquivoNome={arquivoNome}
            autoFilled={autoFilled}
            fileRef={fileRef}
            parseInfo={parseInfo}
            parsing={parsing}
            setArquivoNome={setArquivoNome}
            setAutoFilled={setAutoFilled}
            setParseInfo={setParseInfo}
            setRevisado={setRevisado}
            uploadProposta={uploadProposta}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-torg-gray mb-1">CNPJ ou CPF *</label>
              <input
                type="text" value={cnpj} onChange={(e) => setCnpj(e.target.value)}
                placeholder="00.000.000/0001-00"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-torg-blue"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-torg-gray mb-1">Razão Social</label>
              <input
                type="text" value={razaoSocial} onChange={(e) => setRazaoSocial(e.target.value)}
                placeholder="Nome do fornecedor"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue"
              />
            </div>
          </div>

          <TabelaLinhasProposta
            autoFilled={autoFilled}
            linhas={linhas}
            marcarRevisado={marcarRevisado}
            revisado={revisado}
            setLinha={setLinha}
            setTotalPropostaInput={setTotalPropostaInput}
            total={total}
            totalBrutoSemIPI={totalBrutoSemIPI}
            totalIPI={totalIPI}
            totalPropostaInput={totalPropostaInput}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-torg-gray mb-1">Prazo de entrega</label>
              <input type="text" value={prazoEntrega} onChange={(e) => setPrazoEntrega(e.target.value)}
                placeholder="Ex: 15 dias úteis"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue" />
            </div>
            <div>
              <label className="block text-xs font-medium text-torg-gray mb-1">Condição de pagamento</label>
              <input type="text" value={condicaoPagamento} onChange={(e) => setCondicaoPagamento(e.target.value)}
                placeholder="Ex: 30 dias"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-torg-gray mb-1">Observação</label>
            <textarea value={observacao} onChange={(e) => setObservacao(e.target.value)} rows={2}
              placeholder="Observações da proposta"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue" />
          </div>
        </div>
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-torg-gray border border-gray-300 rounded-lg hover:bg-gray-100 text-sm">
            Cancelar
          </button>
          <button onClick={submit} disabled={salvando}
            className="px-5 py-2 bg-torg-orange text-white rounded-lg hover:bg-torg-orange-600 text-sm font-medium flex items-center gap-2 disabled:opacity-50">
            {salvando && <Loader2 size={14} className="animate-spin" />}
            Salvar proposta
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── MODAIS ─────────────────────────────────────────
