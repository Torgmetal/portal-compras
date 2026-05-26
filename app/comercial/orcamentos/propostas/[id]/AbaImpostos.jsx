"use client";
import { useState, useCallback, useRef, useEffect } from "react";
import {
  Save, Loader2, Info, Calculator, Percent, FileText, Plus, Trash2, X,
  TrendingUp, Shield, AlertTriangle, Banknote, Users, Receipt,
} from "lucide-react";

function fmtNum(v, dec = 2) {
  if (!v && v !== 0) return "—";
  return v.toLocaleString("pt-BR", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function fmtMoeda(v) {
  if (!v && v !== 0) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// ── Input % padronizado ──
function InputPerc({ valor, onChange, step = "0.01", disabled = false }) {
  return (
    <div className={`flex items-center bg-white border border-gray-200 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-torg-blue/20 focus-within:border-torg-blue transition-all ${disabled ? "opacity-50" : ""}`}>
      <input
        type="number"
        value={valor ?? ""}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        placeholder="0"
        min="0"
        max="100"
        step={step}
        disabled={disabled}
        className="w-full px-2.5 py-1.5 text-sm text-right text-torg-dark outline-none bg-transparent disabled:cursor-not-allowed"
      />
      <span className="px-2.5 py-1.5 bg-gray-50 text-xs text-torg-gray border-l border-gray-200 select-none">%</span>
    </div>
  );
}

// ── CFOPs NF-e (produto) ──
const CFOPS_NFE = [
  { value: "", label: "── Interna (SP) ──", disabled: true },
  { value: "5101", label: "5101 — Venda de estruturas fabricadas pela TORG (SP)" },
  { value: "5102", label: "5102 — Revenda de materiais/componentes comprados (SP)" },
  { value: "5111", label: "5111 — Faturamento antecipado c/ entrega futura (SP)" },
  { value: "5116", label: "5116 — Venda sob encomenda de pecas/estruturas (SP)" },
  { value: "5124", label: "5124 — Industrializacao para outra empresa (SP)" },
  { value: "5125", label: "5125 — Industrializacao s/ transito pelo estab. (SP)" },
  { value: "5401", label: "5401 — Venda com substituicao tributaria (SP)" },
  { value: "5949", label: "5949 — Outra saida nao especificada (SP)" },
  { value: "", label: "── Interestadual ──", disabled: true },
  { value: "6101", label: "6101 — Venda de estruturas fabricadas pela TORG (fora SP)" },
  { value: "6102", label: "6102 — Revenda de materiais/componentes (fora SP)" },
  { value: "6107", label: "6107 — Venda para nao contribuinte (fora SP)" },
  { value: "6111", label: "6111 — Faturamento antecipado interestadual" },
  { value: "6116", label: "6116 — Venda sob encomenda interestadual" },
  { value: "6124", label: "6124 — Industrializacao para outra empresa (fora SP)" },
  { value: "6125", label: "6125 — Industrializacao s/ transito pelo estab. (fora SP)" },
  { value: "6401", label: "6401 — Venda com substituicao tributaria (fora SP)" },
  { value: "6949", label: "6949 — Outra saida nao especificada (fora SP)" },
];

// ── Codigos de Servico NFS-e (LC 116/03) ──
const CODIGOS_SERVICO = [
  { value: "7.01", label: "7.01 — Projetos estruturais, laudos tecnicos, consultoria de engenharia" },
  { value: "7.02", label: "7.02 — Montagem e instalacao de estruturas metalicas em obra" },
  { value: "14.01", label: "14.01 — Manutencao preventiva de estruturas e equipamentos" },
  { value: "14.05", label: "14.05 — Tratamento superficial, pintura industrial, jateamento" },
  { value: "14.06", label: "14.06 — Instalacao de suportes, cable-racks, bandejas" },
  { value: "14.14", label: "14.14 — Movimentacao de cargas e icamento de estruturas" },
  { value: "17.01", label: "17.01 — Assessoria tecnica em metalurgia e processos" },
];

// ── Componente principal ──
export default function AbaImpostos({ estudo, estudoId, onEstudoUpdate }) {
  // Eventos de faturamento
  const [eventos, setEventos] = useState(estudo.itensFaturamento || []);
  const [adicionando, setAdicionando] = useState(false);
  const [novoEvento, setNovoEvento] = useState({ descricao: "", tipoNota: "NFE", cfop: "", codigoServico: "", percentual: "" });
  const [excluindoId, setExcluindoId] = useState(null);

  // Aliquotas de impostos sobre venda
  const [aliqPIS, setAliqPIS] = useState(estudo.aliqPIS ?? 1.65);
  const [aliqCOFINS, setAliqCOFINS] = useState(estudo.aliqCOFINS ?? 7.60);
  const [aliqCSLL, setAliqCSLL] = useState(estudo.aliqCSLL ?? 1.08);
  const [aliqIRPJ, setAliqIRPJ] = useState(estudo.aliqIRPJ ?? 3.00);
  const [aliqICMS, setAliqICMS] = useState(estudo.aliqICMS ?? 18.00);
  const [aliqISS, setAliqISS] = useState(estudo.aliqISS ?? 0);

  // BDI
  const [bdiAdmin, setBdiAdmin] = useState(estudo.bdiAdmin ?? 0);
  const [bdiSeguro, setBdiSeguro] = useState(estudo.bdiSeguro ?? 0);
  const [bdiRisco, setBdiRisco] = useState(estudo.bdiRisco ?? 0);
  const [bdiFactoring, setBdiFactoring] = useState(estudo.bdiFactoring ?? 1.6);
  const [bdiLucro, setBdiLucro] = useState(estudo.bdiLucro ?? 6.0);
  const [bdiComissao, setBdiComissao] = useState(estudo.bdiComissao ?? 0);

  const [salvando, setSalvando] = useState(false);
  const [toast, setToast] = useState(null);
  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  // ══════════════════════════════════════════════════════════
  // CUSTOS ACUMULADOS (base para os eventos)
  // ══════════════════════════════════════════════════════════
  const itensPerso = estudo.itensPerso || [];
  const pesoTotalKg = itensPerso.reduce((s, i) => s + (i.pesoTotal || 0), 0);
  const custoMaterialTotal = itensPerso.reduce((s, i) => {
    if (i.custoUnitario && i.custoUnitario > 0) return s + (i.pesoTotal || 0) * i.custoUnitario;
    return s;
  }, 0);
  const percPerda = estudo.percPerda ?? 12;
  const custoMatComPerda = custoMaterialTotal * (1 + percPerda / 100);
  const custoMoKg = estudo.custoMoKg ?? 0;
  const custoPinturaKg = estudo.custoPinturaKg ?? 0;
  const custoAuxiliarKg = estudo.custoAuxiliarKg ?? 0;
  const custoFinanceiroKg = estudo.custoFinanceiroKg ?? 0;
  const custoDemaisKg = estudo.custoDemaisKg ?? 0;
  const percParafusos = estudo.percParafusos ?? 0;
  const somaOutrosKg = custoMoKg + percParafusos + custoPinturaKg + custoAuxiliarKg + custoFinanceiroKg + custoDemaisKg;
  const custoTotalEstimado = custoMatComPerda + (somaOutrosKg * pesoTotalKg);

  // ══════════════════════════════════════════════════════════
  // CENARIO DE FATURAMENTO
  // ══════════════════════════════════════════════════════════
  const somaPercentuais = eventos.reduce((s, e) => s + (e.percentual || 0), 0);
  const percNFE = eventos.filter((e) => e.tipoNota === "NFE").reduce((s, e) => s + (e.percentual || 0), 0);
  const percNFSE = eventos.filter((e) => e.tipoNota === "NFSE").reduce((s, e) => s + (e.percentual || 0), 0);

  const handleAdicionarEvento = async () => {
    if (!novoEvento.descricao.trim() || !novoEvento.percentual) return;
    setAdicionando(true);
    try {
      const payload = {
        descricao: novoEvento.descricao.trim(),
        tipoNota: novoEvento.tipoNota,
        cfop: novoEvento.tipoNota === "NFE" ? (novoEvento.cfop || null) : null,
        codigoServico: novoEvento.tipoNota === "NFSE" ? (novoEvento.codigoServico || null) : null,
        percentual: parseFloat(novoEvento.percentual) || 0,
      };
      const res = await fetch(`/api/comercial/estudo/${estudoId}/faturamento`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setEventos(json.data);
      setNovoEvento({ descricao: "", tipoNota: "NFE", cfop: "", codigoServico: "", percentual: "" });
    } catch (e) {
      showToast(`Erro: ${e.message}`);
    } finally {
      setAdicionando(false);
    }
  };

  const handleExcluirEvento = async (itemId) => {
    setExcluindoId(itemId);
    try {
      const res = await fetch(`/api/comercial/estudo/${estudoId}/faturamento?itemId=${itemId}`, { method: "DELETE" });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setEventos(json.data);
    } catch (e) {
      showToast(`Erro: ${e.message}`);
    } finally {
      setExcluindoId(null);
    }
  };

  // ══════════════════════════════════════════════════════════
  // CALCULOS IMPOSTOS / BDI
  // ══════════════════════════════════════════════════════════
  const somaImpostos = aliqPIS + aliqCOFINS + aliqCSLL + aliqIRPJ + aliqICMS + aliqISS;
  const somaBdiComponentes = bdiAdmin + bdiSeguro + bdiRisco + bdiFactoring + bdiLucro + bdiComissao;

  const fatorBDI = somaImpostos < 100
    ? (1 + somaBdiComponentes / 100) / (1 - somaImpostos / 100) - 1
    : 0;
  const percBDI = fatorBDI * 100;

  const custoBase = custoTotalEstimado || estudo.custoMaterial || 0;
  const precoVenda = custoBase > 0 ? custoBase * (1 + fatorBDI) : 0;

  // ══════════════════════════════════════════════════════════
  // SALVAR IMPOSTOS/BDI
  // ══════════════════════════════════════════════════════════
  const handleSalvar = async () => {
    setSalvando(true);
    try {
      const body = {
        aliqPIS, aliqCOFINS, aliqCSLL, aliqIRPJ, aliqICMS, aliqISS,
        bdiAdmin, bdiSeguro, bdiRisco, bdiFactoring, bdiLucro, bdiComissao,
        bdiValor: Math.round(percBDI * 100) / 100,
      };

      const res = await fetch(`/api/comercial/estudo/${estudoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);

      onEstudoUpdate?.(body);
      showToast("Impostos e BDI salvos com sucesso");
    } catch (e) {
      showToast(`Erro: ${e.message}`);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="space-y-6">

      {/* ═══ SECAO 1: Cenário de Faturamento ═══ */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-lg bg-torg-blue/10 flex items-center justify-center">
            <Receipt size={16} className="text-torg-blue" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-torg-dark">Cenario de Faturamento</h3>
            <p className="text-xs text-torg-gray">Defina os eventos de pagamento e o tipo de nota fiscal para cada parcela</p>
          </div>
        </div>

        {/* Card de custo base */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5">
            <p className="text-[10px] text-torg-gray uppercase tracking-wide">Peso total</p>
            <p className="text-sm font-bold text-torg-dark">{fmtNum(pesoTotalKg, 0)} <span className="text-xs font-normal text-torg-gray">kg</span></p>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5">
            <p className="text-[10px] text-torg-gray uppercase tracking-wide">Custo base (acumulado)</p>
            <p className="text-sm font-bold text-torg-dark">{custoBase > 0 ? fmtMoeda(custoBase) : "—"}</p>
            {custoBase > 0 && pesoTotalKg > 0 && <p className="text-[10px] text-torg-gray">R$ {fmtNum(custoBase / pesoTotalKg)}/kg</p>}
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5">
            <p className="text-[10px] text-torg-gray uppercase tracking-wide">BDI</p>
            <p className="text-sm font-bold text-torg-dark">{fmtNum(percBDI)}% <span className="text-xs font-normal text-torg-gray">({fmtNum(1 + fatorBDI, 3)}x)</span></p>
          </div>
          <div className="bg-torg-blue/5 border border-torg-blue/20 rounded-lg px-3 py-2.5">
            <p className="text-[10px] text-torg-blue uppercase tracking-wide">Preco de venda</p>
            <p className="text-sm font-bold text-torg-blue">{precoVenda > 0 ? fmtMoeda(precoVenda) : "—"}</p>
            {precoVenda > 0 && pesoTotalKg > 0 && <p className="text-[10px] text-torg-gray">R$ {fmtNum(precoVenda / pesoTotalKg)}/kg</p>}
          </div>
        </div>

        {/* Resumo de composicao */}
        {eventos.length > 0 && (
          <div className="flex items-center gap-4 mb-3 px-3 py-2 bg-gray-50 rounded-lg">
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-torg-blue"></div>
              <span className="text-xs text-torg-dark font-medium">NF-e (produto): {fmtNum(percNFE, 0)}%</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500"></div>
              <span className="text-xs text-torg-dark font-medium">NFS-e (servico): {fmtNum(percNFSE, 0)}%</span>
            </div>
            {somaPercentuais !== 100 && somaPercentuais > 0 && (
              <span className={`text-xs font-medium ml-auto ${somaPercentuais > 100 ? "text-red-500" : "text-amber-500"}`}>
                Total: {fmtNum(somaPercentuais, 0)}% {somaPercentuais > 100 ? "(excede 100%)" : `(faltam ${fmtNum(100 - somaPercentuais, 0)}%)`}
              </span>
            )}
            {somaPercentuais === 100 && (
              <span className="text-xs font-medium text-emerald-600 ml-auto">100% distribuido</span>
            )}
          </div>
        )}

        {/* Tabela de eventos */}
        {eventos.length > 0 && (
          <div className="border border-gray-100 rounded-xl overflow-hidden mb-3">
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs text-torg-gray bg-gray-50/60 border-b border-gray-100">
                  <th className="py-2.5 px-4 font-medium">Evento</th>
                  <th className="py-2.5 px-4 font-medium text-center">Nota</th>
                  <th className="py-2.5 px-4 font-medium">CFOP / Cod. Servico</th>
                  <th className="py-2.5 px-4 font-medium text-right">%</th>
                  {precoVenda > 0 && <th className="py-2.5 px-4 font-medium text-right">Valor</th>}
                  <th className="py-2.5 px-4 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {eventos.map((ev) => (
                  <tr key={ev.id} className="border-b border-gray-50 hover:bg-gray-50/30 transition-colors">
                    <td className="py-2.5 px-4 text-sm font-medium text-torg-dark">{ev.descricao}</td>
                    <td className="py-2.5 px-4 text-center">
                      <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                        ev.tipoNota === "NFE"
                          ? "bg-torg-blue/10 text-torg-blue"
                          : "bg-emerald-50 text-emerald-700"
                      }`}>
                        {ev.tipoNota === "NFE" ? "NF-e" : "NFS-e"}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-xs text-torg-gray">
                      {ev.tipoNota === "NFE" && ev.cfop && <span>CFOP {ev.cfop}</span>}
                      {ev.tipoNota === "NFSE" && ev.codigoServico && <span>Cod. {ev.codigoServico}</span>}
                      {!ev.cfop && !ev.codigoServico && "—"}
                    </td>
                    <td className="py-2.5 px-4 text-right text-sm font-medium text-torg-dark tabular-nums">{fmtNum(ev.percentual, 0)}%</td>
                    {precoVenda > 0 && (
                      <td className="py-2.5 px-4 text-right text-sm text-torg-gray tabular-nums">{fmtMoeda(precoVenda * ev.percentual / 100)}</td>
                    )}
                    <td className="py-2.5 px-4">
                      <button
                        onClick={() => handleExcluirEvento(ev.id)}
                        disabled={excluindoId === ev.id}
                        className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
                      >
                        {excluindoId === ev.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                      </button>
                    </td>
                  </tr>
                ))}
                {/* Total */}
                {eventos.length > 1 && (
                  <tr className="bg-gray-50/60">
                    <td className="py-2.5 px-4 text-sm font-bold text-torg-dark">Total</td>
                    <td className="py-2.5 px-4"></td>
                    <td className="py-2.5 px-4"></td>
                    <td className="py-2.5 px-4 text-right text-sm font-bold text-torg-dark tabular-nums">{fmtNum(somaPercentuais, 0)}%</td>
                    {precoVenda > 0 && <td className="py-2.5 px-4 text-right text-sm font-bold text-torg-dark tabular-nums">{fmtMoeda(precoVenda * somaPercentuais / 100)}</td>}
                    <td className="py-2.5 px-4"></td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Form de adição */}
        <div className="bg-gray-50 border border-gray-200 border-dashed rounded-xl p-4">
          <p className="text-xs font-semibold text-torg-dark mb-3">Adicionar evento de pagamento</p>
          <div className="flex items-end gap-2">
            <div className="flex-1 min-w-0">
              <label className="block text-[10px] text-torg-gray uppercase tracking-wide mb-1">Descricao</label>
              <input
                type="text"
                value={novoEvento.descricao}
                onChange={(e) => setNovoEvento((p) => ({ ...p, descricao: e.target.value }))}
                placeholder="Ex: Sinal, Material, Montagem..."
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue outline-none bg-white"
              />
            </div>
            <div className="w-44 shrink-0">
              <label className="block text-[10px] text-torg-gray uppercase tracking-wide mb-1">Tipo de nota</label>
              <select
                value={novoEvento.tipoNota}
                onChange={(e) => setNovoEvento((p) => ({ ...p, tipoNota: e.target.value, cfop: "", codigoServico: "" }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue outline-none bg-white"
              >
                <option value="NFE">NF-e (produto)</option>
                <option value="NFSE">NFS-e (servico)</option>
              </select>
            </div>
            <div className="flex-1 min-w-0">
              <label className="block text-[10px] text-torg-gray uppercase tracking-wide mb-1">
                {novoEvento.tipoNota === "NFE" ? "CFOP" : "Codigo de servico"}
              </label>
              {novoEvento.tipoNota === "NFE" ? (
                <select
                  value={novoEvento.cfop}
                  onChange={(e) => setNovoEvento((p) => ({ ...p, cfop: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue outline-none bg-white"
                >
                  <option value="">Selecione o CFOP...</option>
                  {CFOPS_NFE.map((c, idx) => (
                    c.disabled
                      ? <option key={idx} disabled className="font-bold">{c.label}</option>
                      : <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              ) : (
                <select
                  value={novoEvento.codigoServico}
                  onChange={(e) => setNovoEvento((p) => ({ ...p, codigoServico: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue outline-none bg-white"
                >
                  <option value="">Selecione o codigo...</option>
                  {CODIGOS_SERVICO.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              )}
            </div>
            <div className="w-28 shrink-0">
              <label className="block text-[10px] text-torg-gray uppercase tracking-wide mb-1">%</label>
              <div className="flex items-center bg-white border border-gray-200 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-torg-blue/20 focus-within:border-torg-blue">
                <input
                  type="number"
                  value={novoEvento.percentual}
                  onChange={(e) => setNovoEvento((p) => ({ ...p, percentual: e.target.value }))}
                  placeholder="0"
                  min="0"
                  max="100"
                  step="1"
                  className="w-full px-2 py-2 text-sm text-right text-torg-dark outline-none bg-transparent"
                  onKeyDown={(e) => { if (e.key === "Enter") handleAdicionarEvento(); }}
                />
                <span className="px-2 py-2 bg-gray-50 text-xs text-torg-gray border-l border-gray-200 select-none">%</span>
              </div>
            </div>
            <div className="shrink-0">
              <button
                onClick={handleAdicionarEvento}
                disabled={adicionando || !novoEvento.descricao.trim() || !novoEvento.percentual}
                className="flex items-center justify-center w-10 h-[38px] bg-torg-blue text-white rounded-lg hover:bg-torg-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {adicionando ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              </button>
            </div>
          </div>
          {precoVenda > 0 && novoEvento.percentual && (
            <p className="text-xs text-torg-gray mt-2">
              Valor estimado deste evento: <strong className="text-torg-dark">{fmtMoeda(precoVenda * (parseFloat(novoEvento.percentual) || 0) / 100)}</strong>
            </p>
          )}
        </div>

        {/* Dica fiscal */}
        {eventos.some((e) => e.tipoNota === "NFSE" && e.codigoServico === "7.02") && (
          <p className="text-xs text-torg-blue mt-2 flex items-center gap-1">
            <Info size={12} />
            Servico 7.02: ISS devido no municipio da obra, nao no domicilio do prestador.
          </p>
        )}
        {eventos.some((e) => e.tipoNota === "NFE" && e.cfop?.startsWith("6")) && (
          <p className="text-xs text-torg-blue mt-2 flex items-center gap-1">
            <Info size={12} />
            Operacao interestadual — ICMS: 12% (Sul/Sudeste), 7% (N/NE/CO/ES), 4% (importados).
          </p>
        )}
      </div>

      {/* ═══ SECAO 2: Impostos sobre Venda ═══ */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center">
            <Percent size={16} className="text-red-500" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-torg-dark">Impostos sobre a Venda</h3>
            <p className="text-xs text-torg-gray">Aliquotas incidentes sobre o faturamento (preco de venda)</p>
          </div>
        </div>

        <div className="border border-gray-100 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="text-left text-xs text-torg-gray bg-gray-50/60 border-b border-gray-100">
                <th className="py-3 px-4 font-medium">Imposto</th>
                <th className="py-3 px-4 font-medium text-torg-gray">Descricao</th>
                <th className="py-3 px-4 font-medium text-right w-32">Aliquota</th>
                {precoVenda > 0 && <th className="py-3 px-4 font-medium text-right">Valor estimado</th>}
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-gray-50 hover:bg-gray-50/30 transition-colors">
                <td className="py-3 px-4 text-sm font-medium text-torg-dark">PIS</td>
                <td className="py-3 px-4 text-xs text-torg-gray">Programa de Integracao Social (nao cumulativo)</td>
                <td className="py-2 px-4">
                  <div className="flex justify-end"><InputPerc valor={aliqPIS} onChange={setAliqPIS} /></div>
                </td>
                {precoVenda > 0 && <td className="py-3 px-4 text-right text-sm text-torg-gray tabular-nums">{fmtMoeda(precoVenda * aliqPIS / 100)}</td>}
              </tr>
              <tr className="border-b border-gray-50 hover:bg-gray-50/30 transition-colors">
                <td className="py-3 px-4 text-sm font-medium text-torg-dark">COFINS</td>
                <td className="py-3 px-4 text-xs text-torg-gray">Contrib. Financiamento Seg. Social (nao cumulativo)</td>
                <td className="py-2 px-4">
                  <div className="flex justify-end"><InputPerc valor={aliqCOFINS} onChange={setAliqCOFINS} /></div>
                </td>
                {precoVenda > 0 && <td className="py-3 px-4 text-right text-sm text-torg-gray tabular-nums">{fmtMoeda(precoVenda * aliqCOFINS / 100)}</td>}
              </tr>
              <tr className="border-b border-gray-50 hover:bg-gray-50/30 transition-colors">
                <td className="py-3 px-4 text-sm font-medium text-torg-dark">CSLL</td>
                <td className="py-3 px-4 text-xs text-torg-gray">Contrib. Social sobre Lucro Liquido</td>
                <td className="py-2 px-4">
                  <div className="flex justify-end"><InputPerc valor={aliqCSLL} onChange={setAliqCSLL} /></div>
                </td>
                {precoVenda > 0 && <td className="py-3 px-4 text-right text-sm text-torg-gray tabular-nums">{fmtMoeda(precoVenda * aliqCSLL / 100)}</td>}
              </tr>
              <tr className="border-b border-gray-50 hover:bg-gray-50/30 transition-colors">
                <td className="py-3 px-4 text-sm font-medium text-torg-dark">IRPJ</td>
                <td className="py-3 px-4 text-xs text-torg-gray">Imposto de Renda PJ (15% + adic. 10%)</td>
                <td className="py-2 px-4">
                  <div className="flex justify-end"><InputPerc valor={aliqIRPJ} onChange={setAliqIRPJ} /></div>
                </td>
                {precoVenda > 0 && <td className="py-3 px-4 text-right text-sm text-torg-gray tabular-nums">{fmtMoeda(precoVenda * aliqIRPJ / 100)}</td>}
              </tr>
              <tr className="border-b border-gray-50 hover:bg-gray-50/30 transition-colors">
                <td className="py-3 px-4 text-sm font-medium text-torg-dark">ICMS</td>
                <td className="py-3 px-4 text-xs text-torg-gray">18% SP interno · 12%/7%/4% interestadual</td>
                <td className="py-2 px-4">
                  <div className="flex justify-end"><InputPerc valor={aliqICMS} onChange={setAliqICMS} step="0.5" /></div>
                </td>
                {precoVenda > 0 && <td className="py-3 px-4 text-right text-sm text-torg-gray tabular-nums">{fmtMoeda(precoVenda * aliqICMS / 100)}</td>}
              </tr>
              <tr className="border-b border-gray-50 hover:bg-gray-50/30 transition-colors">
                <td className="py-3 px-4 text-sm font-medium text-torg-dark">ISS</td>
                <td className="py-3 px-4 text-xs text-torg-gray">2% a 5% conforme municipio (NFS-e)</td>
                <td className="py-2 px-4">
                  <div className="flex justify-end"><InputPerc valor={aliqISS} onChange={setAliqISS} /></div>
                </td>
                {precoVenda > 0 && <td className="py-3 px-4 text-right text-sm text-torg-gray tabular-nums">{fmtMoeda(precoVenda * aliqISS / 100)}</td>}
              </tr>
              {/* Total */}
              <tr className="bg-red-50/50">
                <td className="py-3 px-4 text-sm font-bold text-torg-dark">Total Impostos</td>
                <td className="py-3 px-4"></td>
                <td className="py-3 px-4 text-right text-sm font-bold text-red-600 tabular-nums">{fmtNum(somaImpostos)}%</td>
                {precoVenda > 0 && <td className="py-3 px-4 text-right text-sm font-bold text-red-600 tabular-nums">{fmtMoeda(precoVenda * somaImpostos / 100)}</td>}
              </tr>
            </tbody>
          </table>
        </div>

        {somaImpostos >= 100 && (
          <div className="flex items-center gap-2 mt-2 px-4 py-2 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
            <AlertTriangle size={14} />
            Soma de impostos igual ou superior a 100% torna o BDI inviavel.
          </div>
        )}
      </div>

      {/* ═══ SECAO 3: BDI ═══ */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
            <TrendingUp size={16} className="text-amber-600" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-torg-dark">BDI — Beneficios e Despesas Indiretas</h3>
            <p className="text-xs text-torg-gray">Percentuais que compoem o markup sobre o custo direto</p>
          </div>
        </div>

        <div className="border border-gray-100 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="text-left text-xs text-torg-gray bg-gray-50/60 border-b border-gray-100">
                <th className="py-3 px-4 font-medium">Componente</th>
                <th className="py-3 px-4 font-medium text-torg-gray">Descricao</th>
                <th className="py-3 px-4 font-medium text-right w-32">Percentual</th>
                {custoBase > 0 && <th className="py-3 px-4 font-medium text-right">Valor estimado</th>}
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-gray-50 hover:bg-gray-50/30 transition-colors">
                <td className="py-3 px-4 text-sm text-torg-dark flex items-center gap-2">
                  <Shield size={14} className="text-gray-400" />
                  Administracao
                </td>
                <td className="py-3 px-4 text-xs text-torg-gray">Custos administrativos centrais</td>
                <td className="py-2 px-4">
                  <div className="flex justify-end"><InputPerc valor={bdiAdmin} onChange={setBdiAdmin} /></div>
                </td>
                {custoBase > 0 && <td className="py-3 px-4 text-right text-sm text-torg-gray tabular-nums">{fmtMoeda(custoBase * bdiAdmin / 100)}</td>}
              </tr>
              <tr className="border-b border-gray-50 hover:bg-gray-50/30 transition-colors">
                <td className="py-3 px-4 text-sm text-torg-dark flex items-center gap-2">
                  <Shield size={14} className="text-gray-400" />
                  Seguro
                </td>
                <td className="py-3 px-4 text-xs text-torg-gray">Seguro da obra / garantias</td>
                <td className="py-2 px-4">
                  <div className="flex justify-end"><InputPerc valor={bdiSeguro} onChange={setBdiSeguro} /></div>
                </td>
                {custoBase > 0 && <td className="py-3 px-4 text-right text-sm text-torg-gray tabular-nums">{fmtMoeda(custoBase * bdiSeguro / 100)}</td>}
              </tr>
              <tr className="border-b border-gray-50 hover:bg-gray-50/30 transition-colors">
                <td className="py-3 px-4 text-sm text-torg-dark flex items-center gap-2">
                  <AlertTriangle size={14} className="text-gray-400" />
                  Risco
                </td>
                <td className="py-3 px-4 text-xs text-torg-gray">Contingencia / imprevistos</td>
                <td className="py-2 px-4">
                  <div className="flex justify-end"><InputPerc valor={bdiRisco} onChange={setBdiRisco} /></div>
                </td>
                {custoBase > 0 && <td className="py-3 px-4 text-right text-sm text-torg-gray tabular-nums">{fmtMoeda(custoBase * bdiRisco / 100)}</td>}
              </tr>
              <tr className="border-b border-gray-50 hover:bg-gray-50/30 transition-colors">
                <td className="py-3 px-4 text-sm text-torg-dark flex items-center gap-2">
                  <Banknote size={14} className="text-gray-400" />
                  Desp. Financeiras
                </td>
                <td className="py-3 px-4 text-xs text-torg-gray">Factoring / desconto de recebiveis</td>
                <td className="py-2 px-4">
                  <div className="flex justify-end"><InputPerc valor={bdiFactoring} onChange={setBdiFactoring} /></div>
                </td>
                {custoBase > 0 && <td className="py-3 px-4 text-right text-sm text-torg-gray tabular-nums">{fmtMoeda(custoBase * bdiFactoring / 100)}</td>}
              </tr>
              <tr className="border-b border-gray-50 hover:bg-gray-50/30 transition-colors">
                <td className="py-3 px-4 text-sm text-torg-dark flex items-center gap-2">
                  <TrendingUp size={14} className="text-gray-400" />
                  Lucro
                </td>
                <td className="py-3 px-4 text-xs text-torg-gray">Margem de lucro desejada</td>
                <td className="py-2 px-4">
                  <div className="flex justify-end"><InputPerc valor={bdiLucro} onChange={setBdiLucro} /></div>
                </td>
                {custoBase > 0 && <td className="py-3 px-4 text-right text-sm text-torg-gray tabular-nums">{fmtMoeda(custoBase * bdiLucro / 100)}</td>}
              </tr>
              <tr className="border-b border-gray-50 hover:bg-gray-50/30 transition-colors">
                <td className="py-3 px-4 text-sm text-torg-dark flex items-center gap-2">
                  <Users size={14} className="text-gray-400" />
                  Comissao
                </td>
                <td className="py-3 px-4 text-xs text-torg-gray">Comissao de vendas</td>
                <td className="py-2 px-4">
                  <div className="flex justify-end"><InputPerc valor={bdiComissao} onChange={setBdiComissao} /></div>
                </td>
                {custoBase > 0 && <td className="py-3 px-4 text-right text-sm text-torg-gray tabular-nums">{fmtMoeda(custoBase * bdiComissao / 100)}</td>}
              </tr>
              {/* Subtotal componentes */}
              <tr className="bg-amber-50/50">
                <td className="py-3 px-4 text-sm font-bold text-torg-dark">Subtotal BDI (s/ impostos)</td>
                <td className="py-3 px-4"></td>
                <td className="py-3 px-4 text-right text-sm font-bold text-amber-600 tabular-nums">{fmtNum(somaBdiComponentes)}%</td>
                {custoBase > 0 && <td className="py-3 px-4 text-right text-sm font-bold text-amber-600 tabular-nums">{fmtMoeda(custoBase * somaBdiComponentes / 100)}</td>}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ═══ SECAO 4: Resultado BDI ═══ */}
      <div className="bg-torg-dark rounded-xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <Calculator size={18} className="text-torg-blue" />
          <h3 className="text-sm font-bold text-white">Resultado do BDI</h3>
        </div>

        {/* Formula */}
        <div className="bg-white/5 border border-white/10 rounded-lg px-4 py-3 mb-4">
          <p className="text-xs text-gray-400 mb-1">Formula:</p>
          <p className="text-sm text-gray-200 font-mono">
            BDI = (1 + {fmtNum(somaBdiComponentes)}%) / (1 - {fmtNum(somaImpostos)}%) - 1
          </p>
          <p className="text-sm text-gray-200 font-mono mt-1">
            BDI = {fmtNum(1 + somaBdiComponentes / 100, 4)} / {somaImpostos < 100 ? fmtNum(1 - somaImpostos / 100, 4) : "0"} - 1
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <div>
            <p className="text-xs text-gray-400 mb-1">BDI Calculado</p>
            <p className="text-2xl font-bold text-torg-blue">{fmtNum(percBDI)}%</p>
            <p className="text-xs text-gray-400 mt-0.5">Fator: {fmtNum(1 + fatorBDI, 4)}x</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-1">Impostos (sobre venda)</p>
            <p className="text-xl font-bold text-red-400">{fmtNum(somaImpostos)}%</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-1">Custos indiretos</p>
            <p className="text-xl font-bold text-amber-400">{fmtNum(somaBdiComponentes)}%</p>
          </div>
          {custoBase > 0 && (
            <div>
              <p className="text-xs text-gray-400 mb-1">Preco de Venda Estimado</p>
              <p className="text-xl font-bold text-white">{fmtMoeda(precoVenda)}</p>
              <p className="text-xs text-gray-400 mt-0.5">Custo base: {fmtMoeda(custoBase)}</p>
            </div>
          )}
        </div>
      </div>

      {/* Botao salvar */}
      <div className="flex justify-end">
        <button
          onClick={handleSalvar}
          disabled={salvando}
          className="flex items-center gap-2 px-6 py-2.5 bg-torg-blue text-white rounded-xl text-sm font-semibold hover:bg-torg-dark transition-colors disabled:opacity-50"
        >
          {salvando ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          Salvar Impostos e BDI
        </button>
      </div>

      {toast && <div className="fixed bottom-6 right-6 bg-torg-dark text-white px-4 py-2.5 rounded-xl text-sm shadow-lg z-50">{toast}</div>}
    </div>
  );
}
