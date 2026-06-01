"use client";
import { useMemo } from "react";
import {
  Scale, Wrench, Truck, Landmark, Package, TrendingUp,
  AlertCircle, CheckCircle2, Clock,
} from "lucide-react";

function fmtNum(v, dec = 2) {
  if (!v && v !== 0) return "—";
  return v.toLocaleString("pt-BR", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function fmtMoeda(v) {
  if (!v && v !== 0) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// ── Familia de materiais (mesma logica do AbaCustos) ──
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

export default function AbaResumo({ estudo }) {
  const calc = useMemo(() => {
    const itensPerso = estudo.itensPerso || [];
    const pesoTotal = itensPerso.reduce((s, i) => s + (i.pesoTotal || 0), 0);

    // ══ MATERIAIS ══
    const familias = {};
    for (const item of itensPerso) {
      const fam = FAMILIA_MAP[item.tipoMaterial] || "ESPECIAIS";
      if (!familias[fam]) familias[fam] = { peso: 0, custoTotal: 0 };
      familias[fam].peso += item.pesoTotal || 0;
      if (item.custoUnitario > 0) {
        familias[fam].custoTotal += (item.pesoTotal || 0) * item.custoUnitario;
      }
    }
    for (const fam of Object.keys(familias)) {
      familias[fam].mediaKg = familias[fam].peso > 0 ? familias[fam].custoTotal / familias[fam].peso : 0;
    }
    const custoTotalMateriais = Object.values(familias).reduce((s, f) => s + f.custoTotal, 0);
    const pesoTotalMateriais = Object.values(familias).reduce((s, f) => s + f.peso, 0);
    const mediaGeralMateriais = pesoTotalMateriais > 0 ? custoTotalMateriais / pesoTotalMateriais : 0;
    const percPerda = estudo.percPerda ?? 12;
    const custoPerda = custoTotalMateriais * (percPerda / 100);
    const subtotalMateriaisComPerda = custoTotalMateriais + custoPerda;
    const materialKg = mediaGeralMateriais * (1 + percPerda / 100);

    // ══ CUSTOS POR KG ══
    const custoMoKg = estudo.custoMoKg ?? 0;
    const percParafusos = estudo.percParafusos ?? 0;
    const custoPinturaKg = estudo.custoPinturaKg ?? 0;
    const custoAuxiliarKg = estudo.custoAuxiliarKg ?? 0;
    const custoFinanceiroKg = estudo.custoFinanceiroKg ?? 0;
    const custoDemaisKg = estudo.custoDemaisKg ?? 0;

    const linhasCustoKg = [
      { label: "Material (c/ perda)", valor: materialKg, total: subtotalMateriaisComPerda },
      { label: "Mao de obra", valor: custoMoKg, total: custoMoKg * pesoTotal },
      { label: "Pintura", valor: custoPinturaKg, total: custoPinturaKg * pesoTotal },
      { label: "Parafusos", valor: percParafusos, total: percParafusos * pesoTotal },
      { label: "Material auxiliar", valor: custoAuxiliarKg, total: custoAuxiliarKg * pesoTotal },
      { label: "Despesas financeiras", valor: custoFinanceiroKg, total: custoFinanceiroKg * pesoTotal },
      { label: "Demais custos", valor: custoDemaisKg, total: custoDemaisKg * pesoTotal },
    ];

    const custoTotalKg = linhasCustoKg.reduce((s, l) => s + l.valor, 0);
    const custoTotalEstrutura = linhasCustoKg.reduce((s, l) => s + l.total, 0);

    // ══ CREDITOS TRIBUTARIOS ══
    const percCreditoICMS = estudo.percCreditoICMS ?? 12;
    const percCreditoPIS = estudo.percCreditoPIS ?? 1.65;
    const percCreditoCOFINS = estudo.percCreditoCOFINS ?? 7.60;
    const percCreditoTotal = percCreditoICMS + percCreditoPIS + percCreditoCOFINS;

    const acessoriosData = (estudo.itensAcessorio || []).map((a) => ({
      ...a,
      custoUnitario: a.custoUnitario ?? 0,
      margemAdm: a.margemAdm ?? 15,
      faturamentoDireto: a.faturamentoDireto ?? false,
    }));

    const creditoMateriais = subtotalMateriaisComPerda * (percCreditoTotal / 100);
    const custoAcessoriosTorg = acessoriosData.reduce((s, a) => {
      if (a.faturamentoDireto || !a.custoUnitario) return s;
      return s + (a.quantidade || 0) * a.custoUnitario;
    }, 0);
    const creditoAcessorios = custoAcessoriosTorg * (percCreditoTotal / 100);
    const creditoTotal = creditoMateriais + creditoAcessorios;

    // Custo estrutura liquido (com credito)
    const custoEstruturaLiquido = custoTotalEstrutura - creditoMateriais;
    const custoEstruturaLiquidoKg = pesoTotal > 0 ? custoEstruturaLiquido / pesoTotal : 0;

    // ══ IMPOSTOS / BDI ══
    const aliqPIS = estudo.aliqPIS ?? 1.65;
    const aliqCOFINS = estudo.aliqCOFINS ?? 7.60;
    const aliqCSLL = estudo.aliqCSLL ?? 1.08;
    const aliqIRPJ = estudo.aliqIRPJ ?? 3.00;
    const aliqICMS = estudo.aliqICMS ?? 18.00;
    const aliqISS = estudo.aliqISS ?? 0;
    const somaImpostos = aliqPIS + aliqCOFINS + aliqCSLL + aliqIRPJ + aliqICMS + aliqISS;

    const bdiAdmin = estudo.bdiAdmin ?? 0;
    const bdiSeguro = estudo.bdiSeguro ?? 0;
    const bdiRisco = estudo.bdiRisco ?? 0;
    const bdiFactoring = estudo.bdiFactoring ?? 1.6;
    const bdiLucro = estudo.bdiLucro ?? 6.0;
    const bdiComissao = estudo.bdiComissao ?? 0;
    const somaBdiComponentes = bdiAdmin + bdiSeguro + bdiRisco + bdiFactoring + bdiLucro + bdiComissao;

    const fatorBDI = somaImpostos < 100
      ? (1 + somaBdiComponentes / 100) / (1 - somaImpostos / 100) - 1
      : 0;
    const percBDI = fatorBDI * 100;

    // Preco venda por kg (estrutura com BDI)
    const precoVendaKg = custoEstruturaLiquidoKg * (1 + fatorBDI);
    const precoVendaEstrutura = precoVendaKg * pesoTotal;

    // ══ ACESSORIOS (unitario + BDI = total) ══
    const acessoriosComBdi = acessoriosData
      .filter((a) => a.custoUnitario > 0)
      .map((a) => {
        const subtotal = (a.quantidade || 0) * a.custoUnitario;
        const comBdi = subtotal * (1 + (a.margemAdm || 0) / 100);
        const precoVenda = comBdi * (1 + fatorBDI);
        return {
          descricao: a.descricao,
          unidade: a.unidade || "un",
          quantidade: a.quantidade || 0,
          custoUnitario: a.custoUnitario,
          margemAdm: a.margemAdm || 0,
          subtotal,
          comBdi,
          precoVenda,
          faturamentoDireto: a.faturamentoDireto,
        };
      });
    const totalAcessoriosVenda = acessoriosComBdi.reduce((s, a) => s + a.precoVenda, 0);

    // ══ FRETE ══
    const itensFretes = estudo.itensFretes || [];
    const totalFrete = itensFretes.reduce((s, i) => s + (i.custoTotal || 0), 0);
    const cotacoes = estudo.cotacoesFretes || [];
    const cotacaoSelecionada = cotacoes.find((c) => c.status === "SELECIONADA");
    const freteParaProposta = cotacaoSelecionada?.valorCotado || totalFrete;
    const freteComBdi = freteParaProposta * (1 + fatorBDI);

    // ══ TOTAL DA PROPOSTA ══
    const totalProposta = precoVendaEstrutura + totalAcessoriosVenda + freteComBdi;
    const totalPropostaKg = pesoTotal > 0 ? totalProposta / pesoTotal : 0;

    return {
      pesoTotal, familias, materialKg, percPerda,
      subtotalMateriaisComPerda, linhasCustoKg,
      custoTotalKg, custoTotalEstrutura,
      creditoTotal, percCreditoTotal,
      custoEstruturaLiquido, custoEstruturaLiquidoKg,
      somaImpostos, somaBdiComponentes, percBDI, fatorBDI,
      precoVendaKg, precoVendaEstrutura,
      acessoriosComBdi, totalAcessoriosVenda,
      itensFretes, totalFrete, cotacaoSelecionada, freteParaProposta, freteComBdi,
      cotacoes,
      totalProposta, totalPropostaKg,
    };
  }, [estudo]);

  return (
    <div className="space-y-6">

      {/* ═══ CARD PRINCIPAL: Preco sugerido ═══ */}
      <div className="bg-torg-dark rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-5">
          <TrendingUp size={20} className="text-torg-blue" />
          <h2 className="text-lg font-bold text-white">Preco Sugerido para a Obra</h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <div>
            <p className="text-xs text-gray-400 mb-1">Peso total</p>
            <p className="text-2xl font-bold text-white">{fmtNum(calc.pesoTotal, 0)} <span className="text-sm font-normal text-gray-400">kg</span></p>
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-1">Preco/kg sugerido</p>
            <p className="text-2xl font-bold text-torg-blue">R$ {fmtNum(calc.totalPropostaKg)}/kg</p>
            <p className="text-xs text-gray-400 mt-0.5">estrutura + acessorios + frete</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-1">BDI aplicado</p>
            <p className="text-2xl font-bold text-amber-400">{fmtNum(calc.percBDI)}%</p>
            <p className="text-xs text-gray-400 mt-0.5">impostos: {fmtNum(calc.somaImpostos)}%</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-1">Total da Proposta</p>
            <p className="text-2xl font-bold text-emerald-400">{calc.totalProposta > 0 ? fmtMoeda(calc.totalProposta) : "—"}</p>
          </div>
        </div>
      </div>

      {/* ═══ SECAO 1: Estrutura (preco por kg) ═══ */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-lg bg-torg-blue/10 flex items-center justify-center">
            <Scale size={16} className="text-torg-blue" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-torg-dark">Estrutura Metalica — Preco por kg</h3>
            <p className="text-xs text-torg-gray">Material + Mao de obra + Pintura + Parafusos + Outros custos</p>
          </div>
        </div>

        <div className="border border-gray-100 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="text-left text-xs text-torg-gray bg-gray-50/60 border-b border-gray-100">
                <th className="py-3 px-4 font-medium">Componente</th>
                <th className="py-3 px-4 font-medium text-right">R$/kg</th>
                <th className="py-3 px-4 font-medium text-right">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {calc.linhasCustoKg.map((linha) => (
                <tr key={linha.label} className="border-b border-gray-50 hover:bg-gray-50/30 transition-colors">
                  <td className="py-3 px-4 text-sm text-torg-dark">{linha.label}</td>
                  <td className="py-3 px-4 text-right text-sm tabular-nums text-torg-gray">
                    {linha.valor > 0 ? `R$ ${fmtNum(linha.valor)}` : "—"}
                  </td>
                  <td className="py-3 px-4 text-right text-sm font-medium tabular-nums text-torg-dark">
                    {linha.total > 0 ? fmtMoeda(linha.total) : "—"}
                  </td>
                </tr>
              ))}
              {/* Subtotal custo */}
              <tr className="border-b border-gray-100 bg-gray-50/40">
                <td className="py-3 px-4 text-sm font-bold text-torg-dark">Custo bruto</td>
                <td className="py-3 px-4 text-right text-sm font-bold tabular-nums text-torg-dark">R$ {fmtNum(calc.custoTotalKg)}/kg</td>
                <td className="py-3 px-4 text-right text-sm font-bold tabular-nums text-torg-dark">{fmtMoeda(calc.custoTotalEstrutura)}</td>
              </tr>
              {/* Creditos tributarios */}
              {calc.creditoTotal > 0 && (
                <tr className="border-b border-gray-50 bg-emerald-50/30">
                  <td className="py-3 px-4 text-sm text-emerald-700">
                    Creditos tributarios ({fmtNum(calc.percCreditoTotal)}%)
                  </td>
                  <td className="py-3 px-4 text-right text-sm tabular-nums text-emerald-600">
                    - R$ {fmtNum(calc.creditoTotal / calc.pesoTotal)}/kg
                  </td>
                  <td className="py-3 px-4 text-right text-sm font-medium tabular-nums text-emerald-600">
                    - {fmtMoeda(calc.creditoTotal)}
                  </td>
                </tr>
              )}
              {/* Custo liquido */}
              <tr className="border-b border-gray-100 bg-gray-50/40">
                <td className="py-3 px-4 text-sm font-bold text-torg-dark">Custo liquido</td>
                <td className="py-3 px-4 text-right text-sm font-bold tabular-nums text-torg-dark">R$ {fmtNum(calc.custoEstruturaLiquidoKg)}/kg</td>
                <td className="py-3 px-4 text-right text-sm font-bold tabular-nums text-torg-dark">{fmtMoeda(calc.custoEstruturaLiquido)}</td>
              </tr>
              {/* BDI */}
              <tr className="border-b border-gray-50 bg-amber-50/30">
                <td className="py-3 px-4 text-sm text-amber-700">BDI ({fmtNum(calc.percBDI)}%)</td>
                <td className="py-3 px-4 text-right text-sm tabular-nums text-amber-600">
                  + R$ {fmtNum(calc.precoVendaKg - calc.custoEstruturaLiquidoKg)}/kg
                </td>
                <td className="py-3 px-4 text-right text-sm font-medium tabular-nums text-amber-600">
                  + {fmtMoeda(calc.precoVendaEstrutura - calc.custoEstruturaLiquido)}
                </td>
              </tr>
              {/* Preco de venda */}
              <tr className="bg-torg-blue/5">
                <td className="py-3 px-4 text-sm font-bold text-torg-blue">Preco de venda (estrutura)</td>
                <td className="py-3 px-4 text-right text-sm font-bold tabular-nums text-torg-blue">R$ {fmtNum(calc.precoVendaKg)}/kg</td>
                <td className="py-3 px-4 text-right text-sm font-bold tabular-nums text-torg-blue">{calc.precoVendaEstrutura > 0 ? fmtMoeda(calc.precoVendaEstrutura) : "—"}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ═══ SECAO 2: Acessorios (unitario + BDI) ═══ */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center">
            <Wrench size={16} className="text-purple-600" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-torg-dark">Acessorios</h3>
            <p className="text-xs text-torg-gray">Preco unitario + margem administrativa + BDI</p>
          </div>
        </div>

        {calc.acessoriosComBdi.length === 0 ? (
          <div className="border border-gray-100 rounded-xl py-8 text-center">
            <Wrench size={24} className="text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-torg-gray">Nenhum acessorio com preco definido</p>
            <p className="text-xs text-gray-400 mt-0.5">Preencha os custos na aba Custos</p>
          </div>
        ) : (
          <div className="border border-gray-100 rounded-xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs text-torg-gray bg-gray-50/60 border-b border-gray-100">
                  <th className="py-3 px-4 font-medium">Item</th>
                  <th className="py-3 px-4 font-medium text-right">Qtd</th>
                  <th className="py-3 px-4 font-medium text-right">Unit.</th>
                  <th className="py-3 px-4 font-medium text-right">Subtotal</th>
                  <th className="py-3 px-4 font-medium text-right">Margem</th>
                  <th className="py-3 px-4 font-medium text-right">+ BDI</th>
                  <th className="py-3 px-4 font-medium text-right">Total proposta</th>
                </tr>
              </thead>
              <tbody>
                {calc.acessoriosComBdi.map((a, idx) => (
                  <tr key={idx} className={`border-b border-gray-50 hover:bg-gray-50/30 transition-colors ${a.faturamentoDireto ? "bg-orange-50/20" : ""}`}>
                    <td className="py-3 px-4 text-sm text-torg-dark">
                      {a.descricao}
                      {a.faturamentoDireto && <span className="ml-1 text-[10px] text-torg-orange font-medium">(direto)</span>}
                    </td>
                    <td className="py-3 px-4 text-right text-sm tabular-nums">{fmtNum(a.quantidade, a.quantidade % 1 === 0 ? 0 : 2)}</td>
                    <td className="py-3 px-4 text-right text-sm tabular-nums text-torg-gray">{fmtMoeda(a.custoUnitario)}/{a.unidade}</td>
                    <td className="py-3 px-4 text-right text-sm tabular-nums">{fmtMoeda(a.subtotal)}</td>
                    <td className="py-3 px-4 text-right text-sm tabular-nums text-torg-gray">{fmtNum(a.margemAdm, 0)}%</td>
                    <td className="py-3 px-4 text-right text-sm tabular-nums text-amber-600">{fmtMoeda(a.comBdi)}</td>
                    <td className="py-3 px-4 text-right text-sm font-medium tabular-nums text-torg-dark">{fmtMoeda(a.precoVenda)}</td>
                  </tr>
                ))}
                <tr className="bg-purple-50/30">
                  <td colSpan={6} className="py-3 px-4 text-sm font-bold text-torg-dark text-right">Total Acessorios</td>
                  <td className="py-3 px-4 text-right text-sm font-bold tabular-nums text-purple-700">{fmtMoeda(calc.totalAcessoriosVenda)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ═══ SECAO 3: Frete ═══ */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-lg bg-teal-50 flex items-center justify-center">
            <Truck size={16} className="text-teal-600" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-torg-dark">Frete</h3>
            <p className="text-xs text-torg-gray">
              {calc.cotacaoSelecionada
                ? "Cotacao selecionada da transportadora"
                : "Estimativa dos itens de frete + BDI"
              }
            </p>
          </div>
        </div>

        {calc.itensFretes.length === 0 && !calc.cotacaoSelecionada ? (
          <div className="border border-gray-100 rounded-xl py-8 text-center">
            <Truck size={24} className="text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-torg-gray">Nenhum frete cadastrado</p>
            <p className="text-xs text-gray-400 mt-0.5">Adicione itens na aba Fretes</p>
          </div>
        ) : (
          <div className="border border-gray-100 rounded-xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs text-torg-gray bg-gray-50/60 border-b border-gray-100">
                  <th className="py-3 px-4 font-medium">Descricao</th>
                  <th className="py-3 px-4 font-medium">Rota</th>
                  <th className="py-3 px-4 font-medium text-right">Distancia</th>
                  <th className="py-3 px-4 font-medium text-right">Peso</th>
                  <th className="py-3 px-4 font-medium text-right">Viagens</th>
                  <th className="py-3 px-4 font-medium text-right">Custo</th>
                </tr>
              </thead>
              <tbody>
                {calc.itensFretes.map((item, idx) => (
                  <tr key={idx} className="border-b border-gray-50 hover:bg-gray-50/30 transition-colors">
                    <td className="py-3 px-4 text-sm text-torg-dark">{item.descricao}</td>
                    <td className="py-3 px-4 text-sm text-torg-gray text-xs">
                      {item.origem && item.destino ? `${item.origem} → ${item.destino}` : "—"}
                    </td>
                    <td className="py-3 px-4 text-right text-sm tabular-nums">{item.distanciaKm ? `${fmtNum(item.distanciaKm, 0)} km` : "—"}</td>
                    <td className="py-3 px-4 text-right text-sm tabular-nums">{item.pesoTon ? `${fmtNum(item.pesoTon)} ton` : "—"}</td>
                    <td className="py-3 px-4 text-right text-sm tabular-nums">{item.quantidadeViagens || "—"}</td>
                    <td className="py-3 px-4 text-right text-sm font-medium tabular-nums text-torg-dark">{item.custoTotal ? fmtMoeda(item.custoTotal) : "—"}</td>
                  </tr>
                ))}

                {/* Cotacoes recebidas */}
                {calc.cotacoes.filter((c) => c.status === "RECEBIDA" || c.status === "SELECIONADA").length > 0 && (
                  <>
                    <tr className="bg-gray-50/40">
                      <td colSpan={6} className="py-2 px-4 text-xs font-semibold text-torg-gray uppercase tracking-wide">Cotacoes recebidas</td>
                    </tr>
                    {calc.cotacoes
                      .filter((c) => c.status === "RECEBIDA" || c.status === "SELECIONADA")
                      .map((cot) => (
                        <tr key={cot.id} className={`border-b border-gray-50 ${cot.status === "SELECIONADA" ? "bg-emerald-50/30" : ""}`}>
                          <td className="py-3 px-4 text-sm text-torg-dark flex items-center gap-2">
                            {cot.fornecedorNome}
                            {cot.status === "SELECIONADA" && (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-emerald-100 text-emerald-700">
                                <CheckCircle2 size={10} /> Selecionada
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-xs text-torg-gray">{cot.prazoEntrega || "—"}</td>
                          <td colSpan={3} className="py-3 px-4"></td>
                          <td className="py-3 px-4 text-right text-sm font-medium tabular-nums text-torg-dark">
                            {cot.valorCotado ? fmtMoeda(cot.valorCotado) : "—"}
                          </td>
                        </tr>
                      ))}
                  </>
                )}

                {/* Total frete */}
                <tr className="border-b border-gray-100 bg-gray-50/40">
                  <td colSpan={5} className="py-3 px-4 text-sm font-bold text-torg-dark text-right">Frete base</td>
                  <td className="py-3 px-4 text-right text-sm font-bold tabular-nums text-torg-dark">{fmtMoeda(calc.freteParaProposta)}</td>
                </tr>
                <tr className="bg-amber-50/30">
                  <td colSpan={5} className="py-3 px-4 text-sm text-amber-700 text-right">+ BDI ({fmtNum(calc.percBDI)}%)</td>
                  <td className="py-3 px-4 text-right text-sm font-medium tabular-nums text-amber-600">+ {fmtMoeda(calc.freteComBdi - calc.freteParaProposta)}</td>
                </tr>
                <tr className="bg-teal-50/30">
                  <td colSpan={5} className="py-3 px-4 text-sm font-bold text-torg-dark text-right">Total Frete</td>
                  <td className="py-3 px-4 text-right text-sm font-bold tabular-nums text-teal-700">{fmtMoeda(calc.freteComBdi)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ═══ SECAO 4: Composicao final da proposta ═══ */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
            <Package size={16} className="text-emerald-600" />
          </div>
          <h3 className="text-sm font-bold text-torg-dark">Composicao da Proposta</h3>
        </div>

        <div className="border border-gray-100 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="text-left text-xs text-torg-gray bg-gray-50/60 border-b border-gray-100">
                <th className="py-3 px-4 font-medium">Componente</th>
                <th className="py-3 px-4 font-medium text-right">Valor</th>
                <th className="py-3 px-4 font-medium text-right">% do total</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-gray-50 hover:bg-gray-50/30 transition-colors">
                <td className="py-3 px-4 text-sm text-torg-dark flex items-center gap-2">
                  <Scale size={14} className="text-torg-blue" />
                  Estrutura metalica ({fmtNum(calc.pesoTotal, 0)} kg × R$ {fmtNum(calc.precoVendaKg)}/kg)
                </td>
                <td className="py-3 px-4 text-right text-sm font-medium tabular-nums text-torg-dark">{calc.precoVendaEstrutura > 0 ? fmtMoeda(calc.precoVendaEstrutura) : "—"}</td>
                <td className="py-3 px-4 text-right text-sm tabular-nums text-torg-gray">
                  {calc.totalProposta > 0 ? fmtNum(calc.precoVendaEstrutura / calc.totalProposta * 100, 1) + "%" : "—"}
                </td>
              </tr>
              <tr className="border-b border-gray-50 hover:bg-gray-50/30 transition-colors">
                <td className="py-3 px-4 text-sm text-torg-dark flex items-center gap-2">
                  <Wrench size={14} className="text-purple-600" />
                  Acessorios ({calc.acessoriosComBdi.length} itens)
                </td>
                <td className="py-3 px-4 text-right text-sm font-medium tabular-nums text-torg-dark">{calc.totalAcessoriosVenda > 0 ? fmtMoeda(calc.totalAcessoriosVenda) : "—"}</td>
                <td className="py-3 px-4 text-right text-sm tabular-nums text-torg-gray">
                  {calc.totalProposta > 0 && calc.totalAcessoriosVenda > 0 ? fmtNum(calc.totalAcessoriosVenda / calc.totalProposta * 100, 1) + "%" : "—"}
                </td>
              </tr>
              <tr className="border-b border-gray-50 hover:bg-gray-50/30 transition-colors">
                <td className="py-3 px-4 text-sm text-torg-dark flex items-center gap-2">
                  <Truck size={14} className="text-teal-600" />
                  Frete
                </td>
                <td className="py-3 px-4 text-right text-sm font-medium tabular-nums text-torg-dark">{calc.freteComBdi > 0 ? fmtMoeda(calc.freteComBdi) : "—"}</td>
                <td className="py-3 px-4 text-right text-sm tabular-nums text-torg-gray">
                  {calc.totalProposta > 0 && calc.freteComBdi > 0 ? fmtNum(calc.freteComBdi / calc.totalProposta * 100, 1) + "%" : "—"}
                </td>
              </tr>
              {/* Total */}
              <tr className="bg-emerald-50">
                <td className="py-4 px-4 text-sm font-bold text-torg-dark">TOTAL DA PROPOSTA</td>
                <td className="py-4 px-4 text-right text-lg font-bold tabular-nums text-emerald-700">{calc.totalProposta > 0 ? fmtMoeda(calc.totalProposta) : "—"}</td>
                <td className="py-4 px-4 text-right text-sm font-bold tabular-nums text-emerald-600">100%</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* KPI cards finais */}
        {calc.totalProposta > 0 && (
          <div className="grid grid-cols-3 gap-3 mt-4">
            <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-center">
              <p className="text-[10px] text-torg-gray uppercase tracking-wide mb-1">Preco medio/kg (total)</p>
              <p className="text-lg font-bold text-torg-dark">R$ {fmtNum(calc.totalPropostaKg)}<span className="text-xs font-normal text-torg-gray">/kg</span></p>
            </div>
            <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-center">
              <p className="text-[10px] text-torg-gray uppercase tracking-wide mb-1">Preco/kg (so estrutura)</p>
              <p className="text-lg font-bold text-torg-blue">R$ {fmtNum(calc.precoVendaKg)}<span className="text-xs font-normal text-torg-gray">/kg</span></p>
            </div>
            <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-center">
              <p className="text-[10px] text-torg-gray uppercase tracking-wide mb-1">Custo/kg (sem BDI)</p>
              <p className="text-lg font-bold text-torg-gray">R$ {fmtNum(calc.custoEstruturaLiquidoKg)}<span className="text-xs font-normal text-torg-gray">/kg</span></p>
            </div>
          </div>
        )}
      </div>

      {/* Avisos */}
      {calc.pesoTotal === 0 && (
        <div className="flex items-center gap-2 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
          <AlertCircle size={16} className="shrink-0" />
          Nenhum material cadastrado. Importe os perfis na aba Materiais para calcular o resumo.
        </div>
      )}
      {calc.percBDI === 0 && calc.pesoTotal > 0 && (
        <div className="flex items-center gap-2 px-4 py-3 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-800">
          <AlertCircle size={16} className="shrink-0" />
          BDI nao configurado. Defina impostos e margens na aba Impostos para calcular o preco de venda.
        </div>
      )}
    </div>
  );
}
