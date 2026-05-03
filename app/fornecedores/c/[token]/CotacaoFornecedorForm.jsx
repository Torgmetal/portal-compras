"use client";
import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Loader2, AlertCircle, Send, AlertTriangle, Truck, RotateCcw, CheckCircle2 } from "lucide-react";
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

  const setLinha = (id, k, v) => {
    setLinhas((prev) => prev.map((l) => (l.id === id ? { ...l, [k]: v } : l)));
  };

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
                    return (
                      <tr key={l.id}>
                        <td className="px-2 py-2 text-gray-400">{i + 1}</td>
                        <td className="px-2 py-2">
                          <p className="text-torg-dark font-medium text-xs">{l.descricao}</p>
                          {l.material && <p className="text-[10px] text-torg-gray">{l.material}</p>}
                        </td>
                        <td className="px-2 py-2 text-right text-torg-gray text-xs tabular-nums whitespace-nowrap">
                          {l.qtdRm} {l.unidade}
                        </td>
                        <td className="px-2 py-2 text-right">
                          <input
                            type="number" step="0.01" min="0"
                            value={l.qtdCotada}
                            onChange={(e) => setLinha(l.id, "qtdCotada", e.target.value)}
                            className="w-20 border border-gray-300 rounded px-1.5 py-1 text-xs text-right tabular-nums focus:ring-1 focus:ring-torg-blue"
                          />
                        </td>
                        <td className="px-2 py-2 text-right">
                          <input
                            type="number" step="0.01" min="0"
                            value={l.precoUnit}
                            onChange={(e) => setLinha(l.id, "precoUnit", e.target.value)}
                            placeholder="0,00"
                            className="w-24 border border-gray-300 rounded px-1.5 py-1 text-xs text-right tabular-nums focus:ring-1 focus:ring-torg-blue"
                          />
                        </td>
                        <td className="px-2 py-2 text-right">
                          <input
                            type="number" step="0.01" min="0" max="100"
                            value={l.icmsPct}
                            onChange={(e) => setLinha(l.id, "icmsPct", e.target.value)}
                            placeholder="0"
                            className="w-16 border border-gray-300 rounded px-1.5 py-1 text-xs text-right tabular-nums focus:ring-1 focus:ring-torg-blue"
                          />
                        </td>
                        <td className="px-2 py-2 text-right">
                          <input
                            type="number" step="0.01" min="0" max="100"
                            value={l.ipiPct}
                            onChange={(e) => setLinha(l.id, "ipiPct", e.target.value)}
                            placeholder="0"
                            className="w-16 border border-gray-300 rounded px-1.5 py-1 text-xs text-right tabular-nums focus:ring-1 focus:ring-torg-blue"
                          />
                        </td>
                        <td className="px-2 py-2 text-right text-torg-dark font-medium tabular-nums text-xs">
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
