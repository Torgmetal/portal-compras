"use client";
import { useState } from "react";
import { Save, Loader2, AlertCircle, Info } from "lucide-react";

function fmtMoeda(v) {
  if (!v && v !== 0) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtNum(v, dec = 2) {
  if (!v && v !== 0) return "—";
  return v.toLocaleString("pt-BR", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function fmtPeso(v) {
  if (!v && v !== 0) return "—";
  return v.toLocaleString("pt-BR", { maximumFractionDigits: 0 }) + " kg";
}

// Agrupa tipos de material em familias
const FAMILIA_MAP = {
  PERFIL_W: "LAMINADOS", PERFIL_U: "DOBRADOS", PERFIL_L: "ESPECIAIS",
  TUBO_REDONDO: "ESPECIAIS", TUBO_QUADRADO: "ESPECIAIS", TUBO_RETANGULAR: "ESPECIAIS",
  CHAPA: "CHAPAS", BARRA_REDONDA: "ESPECIAIS", BARRA_CHATA: "ESPECIAIS",
  BARRA_QUADRADA: "ESPECIAIS", BARRA_ROSCADA: "ESPECIAIS", TELA: "ESPECIAIS",
  GRADE_PISO: "ESPECIAIS", DEGRAU: "ESPECIAIS", OUTRO: "ESPECIAIS",
};

const FAMILIA_LABELS = {
  LAMINADOS: "Laminados (Perfis W/HP)",
  DOBRADOS: "Dobrados (Perfis U/UE)",
  CHAPAS: "Chapas",
  ESPECIAIS: "Especiais (Tubos, Barras, L...)",
};

const FAMILIA_ORDEM = ["LAMINADOS", "DOBRADOS", "CHAPAS", "ESPECIAIS"];

// ── Input padronizado com label lateral ──
function InputCusto({ valor, onChange, sufixo = "/kg", prefixo = "R$", placeholder = "0,00", step = "0.01", className: extraClass = "" }) {
  return (
    <div className={`flex items-center bg-white border border-gray-200 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-torg-blue/20 focus-within:border-torg-blue transition-all ${extraClass}`}>
      <span className="px-2.5 py-1.5 bg-gray-50 text-xs text-torg-gray border-r border-gray-200 select-none">{prefixo}</span>
      <input
        type="number"
        value={valor || ""}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        placeholder={placeholder}
        min="0"
        step={step}
        className="w-full px-2.5 py-1.5 text-sm text-right text-torg-dark outline-none bg-transparent"
      />
      {sufixo && <span className="px-2.5 py-1.5 bg-gray-50 text-xs text-torg-gray border-l border-gray-200 select-none whitespace-nowrap">{sufixo}</span>}
    </div>
  );
}

function InputPerc({ valor, onChange, step = "0.5" }) {
  return (
    <div className="flex items-center bg-white border border-gray-200 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-torg-blue/20 focus-within:border-torg-blue transition-all">
      <input
        type="number"
        value={valor || ""}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        placeholder="0"
        min="0"
        max="100"
        step={step}
        className="w-full px-2.5 py-1.5 text-sm text-right text-torg-dark outline-none bg-transparent"
      />
      <span className="px-2.5 py-1.5 bg-gray-50 text-xs text-torg-gray border-l border-gray-200 select-none">%</span>
    </div>
  );
}

// ── Componente principal ──
export default function AbaCustos({ estudo, estudoId, onEstudoUpdate }) {
  // Valores puxados das abas (readonly aqui)
  const percParafusos = estudo.percParafusos ?? 0;
  const custoPinturaKg = estudo.custoPinturaKg ?? 0;
  const [custoAuxiliarKg, setCustoAuxiliarKg] = useState(estudo.custoAuxiliarKg ?? 0);
  const [custoFinanceiroKg, setCustoFinanceiroKg] = useState(estudo.custoFinanceiroKg ?? 0);
  const [custoDemaisKg, setCustoDemaisKg] = useState(estudo.custoDemaisKg ?? 0);
  const [percPerda, setPercPerda] = useState(estudo.percPerda ?? 12);

  // Créditos tributários
  const [percCreditoICMS, setPercCreditoICMS] = useState(estudo.percCreditoICMS ?? 12);
  const [percCreditoPIS, setPercCreditoPIS] = useState(estudo.percCreditoPIS ?? 1.65);
  const [percCreditoCOFINS, setPercCreditoCOFINS] = useState(estudo.percCreditoCOFINS ?? 7.60);
  const creditoConfirmado = estudo.creditoConfirmado ?? false;

  const [acessorios, setAcessorios] = useState(
    (estudo.itensAcessorio || []).map((a) => ({
      ...a,
      custoUnitario: a.custoUnitario ?? null,
      margemAdm: a.margemAdm ?? 15,
      faturamentoDireto: a.faturamentoDireto ?? false,
    }))
  );

  const [salvando, setSalvando] = useState(false);
  const [toast, setToast] = useState(null);
  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  // ══════════════════════════════════════════════════════════
  // CÁLCULOS DE MATERIAIS
  // ══════════════════════════════════════════════════════════
  const itensPerso = estudo.itensPerso || [];
  const pesoTotal = itensPerso.reduce((s, i) => s + (i.pesoTotal || 0), 0);

  const familias = {};
  for (const item of itensPerso) {
    const fam = FAMILIA_MAP[item.tipoMaterial] || "ESPECIAIS";
    if (!familias[fam]) familias[fam] = { peso: 0, custoTotal: 0, itensComCusto: 0, itensSemCusto: 0 };
    familias[fam].peso += item.pesoTotal || 0;
    if (item.custoUnitario && item.custoUnitario > 0) {
      familias[fam].custoTotal += (item.pesoTotal || 0) * item.custoUnitario;
      familias[fam].itensComCusto++;
    } else {
      familias[fam].itensSemCusto++;
    }
  }

  for (const fam of Object.keys(familias)) {
    const f = familias[fam];
    f.mediaKg = f.peso > 0 ? f.custoTotal / f.peso : 0;
  }

  const custoTotalMateriais = Object.values(familias).reduce((s, f) => s + f.custoTotal, 0);
  const pesoTotalMateriais = Object.values(familias).reduce((s, f) => s + f.peso, 0);
  const mediaGeralMateriais = pesoTotalMateriais > 0 ? custoTotalMateriais / pesoTotalMateriais : 0;

  const custoPerda = custoTotalMateriais * (percPerda / 100);
  const subtotalMateriaisComPerda = custoTotalMateriais + custoPerda;

  // ══════════════════════════════════════════════════════════
  // CRÉDITOS TRIBUTÁRIOS
  // Materiais comprados pela Torg geram crédito de ICMS/PIS/COFINS.
  // Faturamento direto = fornecedor fatura pro cliente, sem crédito.
  // ══════════════════════════════════════════════════════════
  const percCreditoTotal = percCreditoICMS + percCreditoPIS + percCreditoCOFINS;

  // Crédito sobre materiais (matéria prima sempre passa pela Torg)
  const creditoMateriais = subtotalMateriaisComPerda * (percCreditoTotal / 100);

  // Crédito sobre acessórios (apenas os que NÃO são faturamento direto)
  const custoAcessoriosTorg = acessorios.reduce((s, a) => {
    if (a.faturamentoDireto || !a.custoUnitario) return s;
    return s + (a.quantidade || 0) * a.custoUnitario;
  }, 0);
  const creditoAcessorios = custoAcessoriosTorg * (percCreditoTotal / 100);

  const creditoTotalEstimado = creditoMateriais + creditoAcessorios;

  // ══════════════════════════════════════════════════════════
  // CUSTOS POR KG
  // ══════════════════════════════════════════════════════════
  const custoMoKg = estudo.custoMoKg ?? 0;

  const linhasCustoKg = [
    { label: "Mao de obra (fabricacao)", valor: custoMoKg, set: null, readonly: true, fonte: "aba Produtividade" },
    { label: "Parafusos", valor: percParafusos, set: null, readonly: true, fonte: "aba Parafusos" },
    { label: "Pintura", valor: custoPinturaKg, set: null, readonly: true, fonte: "aba Pintura" },
    { label: "Material auxiliar de fabrica", valor: custoAuxiliarKg, set: setCustoAuxiliarKg },
    { label: "Despesas financeiras", valor: custoFinanceiroKg, set: setCustoFinanceiroKg },
    { label: "Demais custos", valor: custoDemaisKg, set: setCustoDemaisKg },
  ];

  const somaOutrosKg = custoMoKg + percParafusos + custoPinturaKg + custoAuxiliarKg + custoFinanceiroKg + custoDemaisKg;
  const somaOutrosTotal = somaOutrosKg * pesoTotal;

  const custoTotalKg = mediaGeralMateriais * (1 + percPerda / 100) + somaOutrosKg;
  const custoTotalEstrutura = subtotalMateriaisComPerda + somaOutrosTotal;

  // ══════════════════════════════════════════════════════════
  // ACESSÓRIOS
  // ══════════════════════════════════════════════════════════
  const custoTotalAcessorios = acessorios.reduce((s, a) => {
    if (!a.custoUnitario) return s;
    const custo = (a.quantidade || 0) * a.custoUnitario;
    return s + custo * (1 + (a.margemAdm || 0) / 100);
  }, 0);

  // ══════════════════════════════════════════════════════════
  // TOTAIS
  // ══════════════════════════════════════════════════════════
  const totalBruto = custoTotalEstrutura + custoTotalAcessorios;
  const totalLiquido = totalBruto - creditoTotalEstimado;

  // ══════════════════════════════════════════════════════════
  // SALVAR
  // ══════════════════════════════════════════════════════════
  const handleSalvar = async () => {
    setSalvando(true);
    try {
      const resEstudo = await fetch(`/api/comercial/estudo/${estudoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          custoAuxiliarKg, custoFinanceiroKg, custoDemaisKg, percPerda,
          percCreditoICMS, percCreditoPIS, percCreditoCOFINS,
          custoMaterial: totalLiquido,
        }),
      });
      const jsonEstudo = await resEstudo.json();
      if (!jsonEstudo.success) throw new Error(jsonEstudo.error);

      const promises = acessorios
        .filter((a) => a.id)
        .map((a) =>
          fetch(`/api/comercial/estudo/${estudoId}/acessorios`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              itemId: a.id,
              custoUnitario: a.custoUnitario,
              margemAdm: a.margemAdm,
              faturamentoDireto: a.faturamentoDireto,
            }),
          }).then((r) => r.json())
        );
      await Promise.all(promises);

      onEstudoUpdate?.({
        custoAuxiliarKg, custoFinanceiroKg, custoDemaisKg, percPerda,
        percCreditoICMS, percCreditoPIS, percCreditoCOFINS,
        custoMaterial: totalLiquido,
      });
      showToast("Custos salvos com sucesso");
    } catch (e) {
      showToast(`Erro: ${e.message}`);
    } finally {
      setSalvando(false);
    }
  };

  const totalItensSemCusto = Object.values(familias).reduce((s, f) => s + f.itensSemCusto, 0);

  return (
    <div className="space-y-6">
      {/* Aviso itens sem custo */}
      {totalItensSemCusto > 0 && (
        <div className="flex items-center gap-2 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
          <AlertCircle size={16} className="shrink-0" />
          <span>{totalItensSemCusto} {totalItensSemCusto === 1 ? "item" : "itens"} de material sem vinculo no cadastro Omie (sem custo R$/kg)</span>
        </div>
      )}

      {/* ═══ SEÇÃO 1: Matéria Prima ═══ */}
      <div>
        <h3 className="text-sm font-bold text-torg-dark mb-3">Materia Prima</h3>
        <div className="border border-gray-100 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="text-left text-xs text-torg-gray bg-gray-50/60 border-b border-gray-100">
                <th className="py-3 px-4 font-medium">Familia</th>
                <th className="py-3 px-4 font-medium text-right">Peso (kg)</th>
                <th className="py-3 px-4 font-medium text-right w-40">Media R$/kg</th>
                <th className="py-3 px-4 font-medium text-right">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {FAMILIA_ORDEM.map((fam) => {
                const f = familias[fam];
                if (!f) return null;
                return (
                  <tr key={fam} className="border-b border-gray-50 hover:bg-gray-50/30 transition-colors">
                    <td className="py-3 px-4 text-sm text-torg-dark">
                      {FAMILIA_LABELS[fam]}
                      {f.itensSemCusto > 0 && <span className="ml-1 text-xs text-amber-500" title={`${f.itensSemCusto} itens sem custo`}>*</span>}
                    </td>
                    <td className="py-3 px-4 text-right text-sm text-torg-gray tabular-nums">{fmtNum(f.peso, 0)}</td>
                    <td className="py-3 px-4 text-right text-sm text-torg-gray tabular-nums">{f.mediaKg > 0 ? fmtNum(f.mediaKg) : "—"}</td>
                    <td className="py-3 px-4 text-right text-sm font-medium text-torg-dark tabular-nums">{f.custoTotal > 0 ? fmtMoeda(f.custoTotal) : "—"}</td>
                  </tr>
                );
              })}
              {/* Perda */}
              <tr className="border-b border-gray-50 hover:bg-gray-50/30 transition-colors">
                <td className="py-3 px-4 text-sm text-torg-dark">Perda de materia prima</td>
                <td className="py-3 px-4 text-right text-sm text-torg-gray">—</td>
                <td className="py-2 px-4">
                  <div className="flex justify-end">
                    <InputPerc valor={percPerda} onChange={setPercPerda} />
                  </div>
                </td>
                <td className="py-3 px-4 text-right text-sm font-medium text-torg-dark tabular-nums">{custoPerda > 0 ? fmtMoeda(custoPerda) : "—"}</td>
              </tr>
              {/* Subtotal */}
              <tr className="bg-torg-blue/5">
                <td className="py-3 px-4 text-sm font-bold text-torg-dark">Subtotal Materiais</td>
                <td className="py-3 px-4 text-right text-sm font-bold text-torg-dark tabular-nums">{fmtNum(pesoTotalMateriais, 0)}</td>
                <td className="py-3 px-4 text-right text-sm font-bold text-torg-dark tabular-nums">{mediaGeralMateriais > 0 ? fmtNum(mediaGeralMateriais) : "—"}</td>
                <td className="py-3 px-4 text-right text-sm font-bold text-torg-dark tabular-nums">{subtotalMateriaisComPerda > 0 ? fmtMoeda(subtotalMateriaisComPerda) : "—"}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ═══ SEÇÃO 2: Custos por kg ═══ */}
      <div>
        <h3 className="text-sm font-bold text-torg-dark mb-3">Custos por kg</h3>
        <div className="border border-gray-100 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="text-left text-xs text-torg-gray bg-gray-50/60 border-b border-gray-100">
                <th className="py-3 px-4 font-medium">Item</th>
                <th className="py-3 px-4 font-medium text-right">Peso base (kg)</th>
                <th className="py-3 px-4 font-medium text-right w-40">Valor R$/kg</th>
                <th className="py-3 px-4 font-medium text-right">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {linhasCustoKg.map((linha) => {
                const subtotal = linha.valor * pesoTotal;
                return (
                  <tr key={linha.label} className="border-b border-gray-50 hover:bg-gray-50/30 transition-colors">
                    <td className="py-3 px-4 text-sm text-torg-dark">
                      {linha.label}
                      {linha.fonte && <span className="ml-1 text-xs text-torg-gray">({linha.fonte})</span>}
                    </td>
                    <td className="py-3 px-4 text-right text-sm text-torg-gray tabular-nums">{fmtNum(pesoTotal, 0)}</td>
                    <td className="py-2 px-4">
                      <div className="flex justify-end">
                        {linha.readonly ? (
                          <span className="px-3 py-1.5 text-sm text-right text-torg-dark tabular-nums">R$ {fmtNum(linha.valor)}/kg</span>
                        ) : (
                          <InputCusto valor={linha.valor} onChange={linha.set} />
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right text-sm font-medium text-torg-dark tabular-nums">{subtotal > 0 ? fmtMoeda(subtotal) : "—"}</td>
                  </tr>
                );
              })}
              <tr className="bg-torg-blue/5">
                <td className="py-3 px-4 text-sm font-bold text-torg-dark">Subtotal Custos por kg</td>
                <td className="py-3 px-4 text-right text-sm font-bold text-torg-dark tabular-nums">{fmtPeso(pesoTotal)}</td>
                <td className="py-3 px-4 text-right text-sm font-bold text-torg-blue tabular-nums">R$ {fmtNum(somaOutrosKg)}/kg</td>
                <td className="py-3 px-4 text-right text-sm font-bold text-torg-dark tabular-nums">{somaOutrosTotal > 0 ? fmtMoeda(somaOutrosTotal) : "—"}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ═══ SEÇÃO 3: Acessórios (revenda) ═══ */}
      <div>
        <h3 className="text-sm font-bold text-torg-dark mb-3">Acessorios (Revenda)</h3>
        {acessorios.length === 0 ? (
          <div className="border border-gray-100 rounded-xl py-8 text-center">
            <p className="text-sm text-torg-gray">Nenhum acessorio cadastrado.</p>
            <p className="text-xs text-gray-400 mt-1">Adicione itens na aba Acessorios para precifica-los aqui.</p>
          </div>
        ) : (
          <div className="border border-gray-100 rounded-xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs text-torg-gray bg-gray-50/60 border-b border-gray-100">
                  <th className="py-3 px-4 font-medium">Item</th>
                  <th className="py-3 px-4 font-medium text-center">Faturamento</th>
                  <th className="py-3 px-4 font-medium text-right">Qtd</th>
                  <th className="py-3 px-4 font-medium text-right w-36">Custo Unitario</th>
                  <th className="py-3 px-4 font-medium text-right w-28">Margem Adm</th>
                  <th className="py-3 px-4 font-medium text-right">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {acessorios.map((item, idx) => {
                  const subtotalSemMargem = (item.quantidade || 0) * (item.custoUnitario || 0);
                  const subtotalComMargem = subtotalSemMargem * (1 + (item.margemAdm || 0) / 100);
                  return (
                    <tr key={item.id || idx} className={`border-b border-gray-50 hover:bg-gray-50/30 transition-colors ${item.faturamentoDireto ? "bg-orange-50/30" : ""}`}>
                      <td className="py-3 px-4 text-sm text-torg-dark">{item.descricao}</td>
                      <td className="py-2 px-4 text-center">
                        <button
                          onClick={() => setAcessorios((prev) => prev.map((a, i) => (i === idx ? { ...a, faturamentoDireto: !a.faturamentoDireto } : a)))}
                          className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                            item.faturamentoDireto
                              ? "bg-torg-orange/10 text-torg-orange border border-torg-orange/30"
                              : "bg-torg-blue/10 text-torg-blue border border-torg-blue/20"
                          }`}
                        >
                          {item.faturamentoDireto ? "Direto" : "Torg"}
                        </button>
                      </td>
                      <td className="py-3 px-4 text-right text-sm tabular-nums">{fmtNum(item.quantidade, item.quantidade % 1 === 0 ? 0 : 2)}</td>
                      <td className="py-2 px-4">
                        <div className="flex justify-end">
                          <InputCusto
                            valor={item.custoUnitario}
                            onChange={(val) => setAcessorios((prev) => prev.map((a, i) => (i === idx ? { ...a, custoUnitario: val || null } : a)))}
                            sufixo={`/${item.unidade || "un"}`}
                          />
                        </div>
                      </td>
                      <td className="py-2 px-4">
                        <div className="flex justify-end">
                          <InputPerc
                            valor={item.margemAdm}
                            onChange={(val) => setAcessorios((prev) => prev.map((a, i) => (i === idx ? { ...a, margemAdm: val } : a)))}
                          />
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right text-sm font-medium text-torg-dark tabular-nums">
                        {subtotalComMargem > 0 ? fmtMoeda(subtotalComMargem) : "—"}
                      </td>
                    </tr>
                  );
                })}
                <tr className="bg-torg-blue/5">
                  <td colSpan={5} className="py-3 px-4 text-sm font-bold text-torg-dark text-right">Total Acessorios</td>
                  <td className="py-3 px-4 text-right text-sm font-bold text-torg-dark tabular-nums">{custoTotalAcessorios > 0 ? fmtMoeda(custoTotalAcessorios) : "—"}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ═══ SEÇÃO 4: Créditos Tributários ═══ */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-sm font-bold text-torg-dark">Creditos Tributarios</h3>
          {creditoConfirmado ? (
            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">Confirmado por Compras</span>
          ) : (
            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">Estimativa</span>
          )}
        </div>

        {!creditoConfirmado && (
          <div className="flex items-start gap-2 px-4 py-3 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-800 mb-3">
            <Info size={16} className="shrink-0 mt-0.5" />
            <span>
              Aliquotas estimadas (pior cenario). Apos consolidacao dos pedidos de compra, o setor de Compras atualizara com os creditos reais.
              Itens com faturamento direto nao geram credito.
            </span>
          </div>
        )}

        <div className="border border-gray-100 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="text-left text-xs text-torg-gray bg-gray-50/60 border-b border-gray-100">
                <th className="py-3 px-4 font-medium">Imposto</th>
                <th className="py-3 px-4 font-medium text-right w-32">Aliquota</th>
                <th className="py-3 px-4 font-medium text-right">Base (materiais)</th>
                <th className="py-3 px-4 font-medium text-right">Base (acessorios Torg)</th>
                <th className="py-3 px-4 font-medium text-right">Credito</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-gray-50 hover:bg-gray-50/30 transition-colors">
                <td className="py-3 px-4 text-sm text-torg-dark">ICMS</td>
                <td className="py-2 px-4">
                  <div className="flex justify-end">
                    <InputPerc valor={percCreditoICMS} onChange={setPercCreditoICMS} step="0.5" />
                  </div>
                </td>
                <td className="py-3 px-4 text-right text-sm text-torg-gray tabular-nums">{subtotalMateriaisComPerda > 0 ? fmtMoeda(subtotalMateriaisComPerda) : "—"}</td>
                <td className="py-3 px-4 text-right text-sm text-torg-gray tabular-nums">{custoAcessoriosTorg > 0 ? fmtMoeda(custoAcessoriosTorg) : "—"}</td>
                <td className="py-3 px-4 text-right text-sm font-medium text-emerald-600 tabular-nums">
                  {(subtotalMateriaisComPerda + custoAcessoriosTorg) * percCreditoICMS / 100 > 0
                    ? `- ${fmtMoeda((subtotalMateriaisComPerda + custoAcessoriosTorg) * percCreditoICMS / 100)}`
                    : "—"}
                </td>
              </tr>
              <tr className="border-b border-gray-50 hover:bg-gray-50/30 transition-colors">
                <td className="py-3 px-4 text-sm text-torg-dark">PIS</td>
                <td className="py-2 px-4">
                  <div className="flex justify-end">
                    <InputPerc valor={percCreditoPIS} onChange={setPercCreditoPIS} step="0.01" />
                  </div>
                </td>
                <td className="py-3 px-4 text-right text-sm text-torg-gray tabular-nums">{subtotalMateriaisComPerda > 0 ? fmtMoeda(subtotalMateriaisComPerda) : "—"}</td>
                <td className="py-3 px-4 text-right text-sm text-torg-gray tabular-nums">{custoAcessoriosTorg > 0 ? fmtMoeda(custoAcessoriosTorg) : "—"}</td>
                <td className="py-3 px-4 text-right text-sm font-medium text-emerald-600 tabular-nums">
                  {(subtotalMateriaisComPerda + custoAcessoriosTorg) * percCreditoPIS / 100 > 0
                    ? `- ${fmtMoeda((subtotalMateriaisComPerda + custoAcessoriosTorg) * percCreditoPIS / 100)}`
                    : "—"}
                </td>
              </tr>
              <tr className="border-b border-gray-50 hover:bg-gray-50/30 transition-colors">
                <td className="py-3 px-4 text-sm text-torg-dark">COFINS</td>
                <td className="py-2 px-4">
                  <div className="flex justify-end">
                    <InputPerc valor={percCreditoCOFINS} onChange={setPercCreditoCOFINS} step="0.01" />
                  </div>
                </td>
                <td className="py-3 px-4 text-right text-sm text-torg-gray tabular-nums">{subtotalMateriaisComPerda > 0 ? fmtMoeda(subtotalMateriaisComPerda) : "—"}</td>
                <td className="py-3 px-4 text-right text-sm text-torg-gray tabular-nums">{custoAcessoriosTorg > 0 ? fmtMoeda(custoAcessoriosTorg) : "—"}</td>
                <td className="py-3 px-4 text-right text-sm font-medium text-emerald-600 tabular-nums">
                  {(subtotalMateriaisComPerda + custoAcessoriosTorg) * percCreditoCOFINS / 100 > 0
                    ? `- ${fmtMoeda((subtotalMateriaisComPerda + custoAcessoriosTorg) * percCreditoCOFINS / 100)}`
                    : "—"}
                </td>
              </tr>
              <tr className="bg-emerald-50">
                <td className="py-3 px-4 text-sm font-bold text-torg-dark">Total Creditos</td>
                <td className="py-3 px-4 text-right text-sm font-bold text-torg-dark tabular-nums">{fmtNum(percCreditoTotal)}%</td>
                <td colSpan={2} className="py-3 px-4 text-right text-xs text-torg-gray">
                  {acessorios.some((a) => a.faturamentoDireto) && (
                    <span>Fat. direto excluido do credito</span>
                  )}
                </td>
                <td className="py-3 px-4 text-right text-sm font-bold text-emerald-600 tabular-nums">
                  {creditoTotalEstimado > 0 ? `- ${fmtMoeda(creditoTotalEstimado)}` : "—"}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ═══ SEÇÃO 5: Resumo total ═══ */}
      <div className="bg-torg-dark rounded-xl p-6">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-6">
          <div>
            <p className="text-xs text-gray-400 mb-1">Peso total</p>
            <p className="text-xl font-bold text-white">{fmtPeso(pesoTotal)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-1">Custo Bruto</p>
            <p className="text-xl font-bold text-white">{totalBruto > 0 ? fmtMoeda(totalBruto) : "—"}</p>
            {custoTotalKg > 0 && <p className="text-xs text-gray-400 mt-0.5">R$ {fmtNum(custoTotalKg)}/kg</p>}
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-1">Creditos Tributarios</p>
            <p className="text-xl font-bold text-emerald-400">{creditoTotalEstimado > 0 ? `- ${fmtMoeda(creditoTotalEstimado)}` : "—"}</p>
            {!creditoConfirmado && creditoTotalEstimado > 0 && <p className="text-xs text-amber-400 mt-0.5">estimativa</p>}
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-1">Acessorios</p>
            <p className="text-xl font-bold text-white">{custoTotalAcessorios > 0 ? fmtMoeda(custoTotalAcessorios) : "—"}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-1">Custo Liquido</p>
            <p className="text-xl font-bold text-torg-blue">{totalLiquido > 0 ? fmtMoeda(totalLiquido) : "—"}</p>
            {pesoTotal > 0 && totalLiquido > 0 && <p className="text-xs text-gray-400 mt-0.5">R$ {fmtNum(totalLiquido / pesoTotal)}/kg liquido</p>}
          </div>
        </div>
      </div>

      {/* Botão salvar */}
      <div className="flex justify-end">
        <button
          onClick={handleSalvar}
          disabled={salvando}
          className="flex items-center gap-2 px-6 py-2.5 bg-torg-blue text-white rounded-xl text-sm font-semibold hover:bg-torg-dark transition-colors disabled:opacity-50"
        >
          {salvando ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          Salvar Custos
        </button>
      </div>

      {toast && <div className="fixed bottom-6 right-6 bg-torg-dark text-white px-4 py-2.5 rounded-xl text-sm shadow-lg z-50">{toast}</div>}
    </div>
  );
}
