"use client";
import { useState, useMemo } from "react";
import { Save, Loader2, Info, ChevronDown } from "lucide-react";

// ── Tipos de obra com Hh/ton padrão (fonte: TORG_Modelo_Completo.xlsx — aba Manual) ──
const TIPOS_OBRA = [
  // 1. Estruturas Treliçadas
  { id: "TRELICADA_EXTRA_PESADA", label: "Treliçada Extra Pesada (100+ kg/m)", hhTon: 22.2, grupo: "Treliçada" },
  { id: "TRELICADA_PESADA",       label: "Treliçada Pesada (60–100 kg/m)",     hhTon: 28.6, grupo: "Treliçada" },
  { id: "TRELICADA_MEDIA",        label: "Treliçada Média (25–60 kg/m)",       hhTon: 45.5, grupo: "Treliçada" },
  { id: "TRELICADA_LEVE",         label: "Treliçada Leve (10–25 kg/m)",        hhTon: 66.7, grupo: "Treliçada" },
  { id: "TRELICADA_EXTRA_LEVE",   label: "Treliçada Extra Leve (0–10 kg/m)",   hhTon: 125,  grupo: "Treliçada" },
  // 2. Estruturas Alma Cheia
  { id: "ALMA_CHEIA_EXTRA_PESADA", label: "Alma Cheia Extra Pesada (100+ kg/m)", hhTon: 18.2, grupo: "Alma Cheia" },
  { id: "ALMA_CHEIA_PESADA",       label: "Alma Cheia Pesada (60–100 kg/m)",     hhTon: 22.2, grupo: "Alma Cheia" },
  { id: "ALMA_CHEIA_MEDIA",        label: "Alma Cheia Média (25–60 kg/m)",       hhTon: 28.6, grupo: "Alma Cheia" },
  { id: "ALMA_CHEIA_LEVE",         label: "Alma Cheia Leve (10–25 kg/m)",        hhTon: 40,   grupo: "Alma Cheia" },
  { id: "ALMA_CHEIA_EXTRA_LEVE",   label: "Alma Cheia Extra Leve (0–10 kg/m)",   hhTon: 66.7, grupo: "Alma Cheia" },
  // 3. Suportes
  { id: "SUPORTE_EXTRA_PESADO", label: "Suporte Extra Pesado (100+ kg/m)",  hhTon: 20,   grupo: "Suportes" },
  { id: "SUPORTE_PESADO",       label: "Suporte Pesado (60–100 kg/m)",      hhTon: 33.3, grupo: "Suportes" },
  { id: "SUPORTE_MEDIO",        label: "Suporte Médio (25–60 kg/m)",        hhTon: 50,   grupo: "Suportes" },
  { id: "SUPORTE_LEVE",         label: "Suporte Leve (10–25 kg/m)",         hhTon: 66.7, grupo: "Suportes" },
  { id: "SUPORTE_EXTRA_LEVE",   label: "Suporte Extra Leve (0–10 kg/m)",    hhTon: 100,  grupo: "Suportes" },
  // 4. Spools (Tubulação Industrial)
  { id: "SPOOL_PESADO", label: "Spool Pesado (14\"–24\")", hhTon: 66.7, grupo: "Spools" },
  { id: "SPOOL_MEDIO",  label: "Spool Médio (6\"–14\")",   hhTon: 76.9, grupo: "Spools" },
  { id: "SPOOL_LEVE",   label: "Spool Leve (até 6\")",     hhTon: 100,  grupo: "Spools" },
  // 5. Acessos Industriais
  { id: "GUARDA_CORPO", label: "Guarda-corpo",  hhTon: 41.7, grupo: "Acessos" },
  { id: "ESCADA",       label: "Escada",        hhTon: 45.5, grupo: "Acessos" },
  { id: "CORRIMAO",     label: "Corrimão",      hhTon: 55.6, grupo: "Acessos" },
];

// ── Premissas da fábrica (fixas, exibidas como referência) ──
const PREMISSAS = {
  horasDia: 8.5,
  diasMes: 22,
  pessoasFabrica: 25,
  custoFolhaMes: 550000,       // Apenas mão de obra direta (folha)
  custoVariaveisMes: 650000,   // Entra em "Material auxiliar" na aba Custos
  custoAtivosMes: 230000,      // Entra em "Demais custos" na aba Custos
  custoDividaMes: 180000,      // Entra em "Despesas financeiras" na aba Custos
};

PREMISSAS.custoTotalMes = PREMISSAS.custoFolhaMes + PREMISSAS.custoVariaveisMes + PREMISSAS.custoAtivosMes + PREMISSAS.custoDividaMes;
PREMISSAS.horasHomemMes = PREMISSAS.horasDia * PREMISSAS.diasMes * PREMISSAS.pessoasFabrica;
// Custo Hh considera APENAS a folha (mão de obra direta)
PREMISSAS.custoHh = PREMISSAS.custoFolhaMes / PREMISSAS.horasHomemMes;

// ── Detalhamento por tipo (exemplos e aplicações da planilha Manual) ──
const DETALHE_TIPOS = {
  // Treliçadas
  TRELICADA_EXTRA_PESADA: [
    { familia: "W360x122, W410x149, VS600", kgHh: 45, nota: "Treliças especiais, pontes rolantes" },
  ],
  TRELICADA_PESADA: [
    { familia: "W250x73, W310x79, HP310x79", kgHh: 35, nota: "Treliças principais, pórticos" },
  ],
  TRELICADA_MEDIA: [
    { familia: "L 4\"x1/2\", U 8\", W200x22.5", kgHh: 22, nota: "Treliças pipe rack, suportes grandes" },
  ],
  TRELICADA_LEVE: [
    { familia: "L 2\"x1/4\", L 3\"x3/8\", U 4\", W150x13", kgHh: 15, nota: "Treliças cobertura, travamentos" },
  ],
  TRELICADA_EXTRA_LEVE: [
    { familia: "L 1\"x1/8\", L 1.1/2\"x3/16\", Tubo Ø48", kgHh: 8, nota: "Treliças leves, suportes tubulares" },
  ],
  // Alma Cheia
  ALMA_CHEIA_EXTRA_PESADA: [
    { familia: "W530x85, W610x101, VS600", kgHh: 55, nota: "Colunas principais, vigas de rolamento" },
  ],
  ALMA_CHEIA_PESADA: [
    { familia: "W310x79, W360x72, W410x85", kgHh: 45, nota: "Colunas, vigas principais" },
  ],
  ALMA_CHEIA_MEDIA: [
    { familia: "W200x46.1(H), W250x44.8, W310x44.5", kgHh: 35, nota: "Vigas principais, tesouras" },
  ],
  ALMA_CHEIA_LEVE: [
    { familia: "W200x22.5, W200x31.3", kgHh: 25, nota: "Vigas secundárias, longarinas" },
  ],
  ALMA_CHEIA_EXTRA_LEVE: [
    { familia: "W150x13, W150x22.5(H)", kgHh: 15, nota: "Terças, travamentos leves" },
  ],
  // Suportes
  SUPORTE_EXTRA_PESADO: [
    { familia: "Estruturas suporte pesadas", kgHh: 50, nota: "Bases de equipamentos pesados" },
  ],
  SUPORTE_PESADO: [
    { familia: "Pórticos grandes, treliças suporte", kgHh: 30, nota: "Suportes de vasos, caldeira" },
  ],
  SUPORTE_MEDIO: [
    { familia: "W200x46.1(H), pórticos", kgHh: 20, nota: "Suportes de equipamento, selas" },
  ],
  SUPORTE_LEVE: [
    { familia: "W150x13+chapas, consoles", kgHh: 15, nota: "Suportes de tubulação, berços" },
  ],
  SUPORTE_EXTRA_LEVE: [
    { familia: "Mísulas, cantoneiras, U pequeno", kgHh: 10, nota: "Suportes de tubulação simples" },
  ],
  // Spools
  SPOOL_PESADO: [
    { familia: "Tubulação 14\"–24\"", kgHh: 15, nota: "Processo principal, adutoras" },
  ],
  SPOOL_MEDIO: [
    { familia: "Tubulação 6\"–14\"", kgHh: 13, nota: "Processo, vapor" },
  ],
  SPOOL_LEVE: [
    { familia: "Tubulação até 6\"", kgHh: 10, nota: "Utilidades, instrumentação" },
  ],
  // Acessos
  GUARDA_CORPO: [
    { familia: "Montantes, travessas, rodapé (Tubo Ø48+Ø27)", kgHh: 24, nota: "Plataformas, passarelas" },
  ],
  ESCADA: [
    { familia: "Longarinas, degraus (Chapa 9,5mm+grade piso)", kgHh: 22, nota: "Acesso entre níveis" },
  ],
  CORRIMAO: [
    { familia: "Corrimão superior, intermediário (Tubo Ø48+Ø27)", kgHh: 18, nota: "Escadas, rampas" },
  ],
};

function fmtMoeda(v) {
  if (!v && v !== 0) return "--";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtNum(v, dec = 2) {
  if (!v && v !== 0) return "--";
  return v.toLocaleString("pt-BR", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

export default function AbaProdutividade({ estudo, estudoId, onEstudoUpdate }) {
  const [tipoObra, setTipoObra] = useState(estudo.tipoObra || "");
  const [hhPorTon, setHhPorTon] = useState(estudo.hhPorTon ?? "");
  const [salvando, setSalvando] = useState(false);
  const [toast, setToast] = useState(null);
  const [mostrarDetalhe, setMostrarDetalhe] = useState(false);
  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  // Peso total do estudo (dos itens de material)
  const pesoTotal = useMemo(() => {
    return (estudo.itensPerso || []).reduce((s, i) => s + (i.pesoTotal || 0), 0);
  }, [estudo.itensPerso]);

  // Calculos
  const hhTonNum = parseFloat(hhPorTon) || 0;
  const custoHh = PREMISSAS.custoHh;
  // Formula: Preco MO/kg = Hh/ton x Custo_Hh / 1000
  const custoMoKg = hhTonNum > 0 ? (hhTonNum * custoHh) / 1000 : 0;
  const custoMoTotal = custoMoKg * pesoTotal;

  // Capacidade produtiva mensal estimada
  const capacidadeKgMes = hhTonNum > 0 ? (PREMISSAS.horasHomemMes / hhTonNum) * 1000 : 0;

  // Ao selecionar tipo, auto-preencher Hh/ton
  const handleTipoChange = (novoTipo) => {
    setTipoObra(novoTipo);
    const encontrado = TIPOS_OBRA.find((t) => t.id === novoTipo);
    if (encontrado) {
      setHhPorTon(encontrado.hhTon);
    }
  };

  // Salvar
  const handleSalvar = async () => {
    setSalvando(true);
    try {
      const res = await fetch(`/api/comercial/estudo/${estudoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipoObra: tipoObra || null,
          hhPorTon: hhTonNum || null,
          custoMoKg: custoMoKg || null,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      onEstudoUpdate?.({ tipoObra, hhPorTon: hhTonNum, custoMoKg });
      showToast("Produtividade salva com sucesso");
    } catch (e) {
      showToast(`Erro: ${e.message}`);
    } finally {
      setSalvando(false);
    }
  };

  const tipoSelecionado = TIPOS_OBRA.find((t) => t.id === tipoObra);
  const detalhes = tipoObra ? DETALHE_TIPOS[tipoObra] || [] : [];

  return (
    <div className="space-y-6">
      {/* ═══ Selecao de tipo de obra ═══ */}
      <div>
        <h3 className="text-sm font-bold text-torg-dark mb-3">Tipo de Obra</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Select */}
          <div className="md:col-span-2">
            <div className="relative">
              <select
                value={tipoObra}
                onChange={(e) => handleTipoChange(e.target.value)}
                className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm text-torg-dark appearance-none cursor-pointer focus:ring-2 focus:ring-torg-blue/20 focus:border-torg-blue transition-all"
              >
                <option value="">Selecione o tipo de obra...</option>
                {["Treliçada", "Alma Cheia", "Suportes", "Spools", "Acessos"].map((grupo) => (
                  <optgroup key={grupo} label={`── ${grupo}`}>
                    {TIPOS_OBRA.filter((t) => t.grupo === grupo).map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label} — {t.hhTon} Hh/ton
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-torg-gray pointer-events-none" />
            </div>
          </div>
          {/* Hh/ton editavel */}
          <div>
            <label className="block text-xs text-torg-gray mb-1">Hh/ton (editavel)</label>
            <div className="flex items-center bg-white border border-gray-200 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-torg-blue/20 focus-within:border-torg-blue transition-all">
              <input
                type="number"
                value={hhPorTon}
                onChange={(e) => setHhPorTon(e.target.value)}
                placeholder="0"
                min="0"
                step="0.1"
                className="w-full px-4 py-3 text-sm text-right text-torg-dark outline-none bg-transparent"
              />
              <span className="px-3 py-3 bg-gray-50 text-xs text-torg-gray border-l border-gray-200 select-none whitespace-nowrap">Hh/ton</span>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ Resultado: Custo MO/kg ═══ */}
      {hhTonNum > 0 && (
        <div className="bg-torg-blue/5 border border-torg-blue/10 rounded-xl p-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div>
              <p className="text-xs text-torg-gray mb-1">Custo Hh (fabrica)</p>
              <p className="text-lg font-bold text-torg-dark">{fmtMoeda(custoHh)}</p>
            </div>
            <div>
              <p className="text-xs text-torg-gray mb-1">Custo MO/kg</p>
              <p className="text-lg font-bold text-torg-blue">R$ {fmtNum(custoMoKg)}/kg</p>
            </div>
            <div>
              <p className="text-xs text-torg-gray mb-1">Peso do estudo</p>
              <p className="text-lg font-bold text-torg-dark">{pesoTotal > 0 ? fmtNum(pesoTotal, 0) + " kg" : "--"}</p>
            </div>
            <div>
              <p className="text-xs text-torg-gray mb-1">Custo MO total</p>
              <p className="text-lg font-bold text-torg-dark">{custoMoTotal > 0 ? fmtMoeda(custoMoTotal) : "--"}</p>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Premissas da fábrica (expandível) ═══ */}
      <div>
        <button
          onClick={() => setMostrarDetalhe(!mostrarDetalhe)}
          className="flex items-center gap-2 text-sm text-torg-gray hover:text-torg-dark transition-colors"
        >
          <Info size={14} />
          <span>Premissas da fabrica</span>
          <ChevronDown size={14} className={`transition-transform ${mostrarDetalhe ? "rotate-180" : ""}`} />
        </button>

        {mostrarDetalhe && (
          <div className="mt-3 border border-gray-100 rounded-xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs text-torg-gray bg-gray-50/60 border-b border-gray-100">
                  <th className="py-2.5 px-4 font-medium">Premissa</th>
                  <th className="py-2.5 px-4 font-medium text-right">Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                <tr>
                  <td className="py-2.5 px-4 text-sm text-torg-dark">Horas/dia</td>
                  <td className="py-2.5 px-4 text-right text-sm tabular-nums">{PREMISSAS.horasDia}h</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-4 text-sm text-torg-dark">Dias/mes</td>
                  <td className="py-2.5 px-4 text-right text-sm tabular-nums">{PREMISSAS.diasMes}</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-4 text-sm text-torg-dark">Pessoas na fabrica</td>
                  <td className="py-2.5 px-4 text-right text-sm tabular-nums">{PREMISSAS.pessoasFabrica}</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-4 text-sm text-torg-dark">Horas-homem/mes</td>
                  <td className="py-2.5 px-4 text-right text-sm tabular-nums font-medium">{fmtNum(PREMISSAS.horasHomemMes, 0)} Hh</td>
                </tr>
                <tr className="bg-torg-blue/5">
                  <td className="py-2.5 px-4 text-sm font-bold text-torg-dark">Folha (Mao de obra direta)</td>
                  <td className="py-2.5 px-4 text-right text-sm font-bold tabular-nums">{fmtMoeda(PREMISSAS.custoFolhaMes)}</td>
                </tr>
                <tr className="bg-torg-blue/5">
                  <td className="py-2.5 px-4 text-sm font-bold text-torg-dark">Custo por Hh (folha)</td>
                  <td className="py-2.5 px-4 text-right text-sm font-bold text-torg-blue tabular-nums">{fmtMoeda(PREMISSAS.custoHh)}</td>
                </tr>
                <tr>
                  <td colSpan={2} className="py-2 px-4 text-xs text-torg-gray italic">Demais custos da fabrica (entram na aba Custos):</td>
                </tr>
                <tr>
                  <td className="py-2 px-4 text-sm text-gray-400">Custos Variaveis</td>
                  <td className="py-2 px-4 text-right text-sm text-gray-400 tabular-nums">{fmtMoeda(PREMISSAS.custoVariaveisMes)}</td>
                </tr>
                <tr>
                  <td className="py-2 px-4 text-sm text-gray-400">Ativos / Depreciacao</td>
                  <td className="py-2 px-4 text-right text-sm text-gray-400 tabular-nums">{fmtMoeda(PREMISSAS.custoAtivosMes)}</td>
                </tr>
                <tr>
                  <td className="py-2 px-4 text-sm text-gray-400">Divida / Financiamento</td>
                  <td className="py-2 px-4 text-right text-sm text-gray-400 tabular-nums">{fmtMoeda(PREMISSAS.custoDividaMes)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ═══ Detalhe por família (se tipo selecionado) ═══ */}
      {tipoObra && detalhes.length > 0 && (
        <div>
          <h3 className="text-sm font-bold text-torg-dark mb-3">
            Produtividade por Familia — {tipoSelecionado?.label}
          </h3>
          <div className="border border-gray-100 rounded-xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs text-torg-gray bg-gray-50/60 border-b border-gray-100">
                  <th className="py-2.5 px-4 font-medium">Exemplos de Perfis</th>
                  <th className="py-2.5 px-4 font-medium">Aplicação</th>
                  <th className="py-2.5 px-4 font-medium text-right">kg/Hh</th>
                  <th className="py-2.5 px-4 font-medium text-right">Hh/ton</th>
                  <th className="py-2.5 px-4 font-medium text-right">R$/kg</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {detalhes.map((d) => {
                  const hhTonEquiv = d.kgHh > 0 ? 1000 / d.kgHh : 0;
                  const custoKg = d.kgHh > 0 ? custoHh / d.kgHh : 0;
                  return (
                    <tr key={d.familia} className="hover:bg-gray-50/30 transition-colors">
                      <td className="py-2.5 px-4 text-sm text-torg-dark">{d.familia}</td>
                      <td className="py-2.5 px-4 text-sm text-torg-gray">{d.nota}</td>
                      <td className="py-2.5 px-4 text-right text-sm tabular-nums">{fmtNum(d.kgHh, 1)}</td>
                      <td className="py-2.5 px-4 text-right text-sm tabular-nums text-torg-gray">{fmtNum(hhTonEquiv, 1)}</td>
                      <td className="py-2.5 px-4 text-right text-sm tabular-nums font-medium">R$ {fmtNum(custoKg)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═══ Capacidade produtiva ═══ */}
      {hhTonNum > 0 && (
        <div className="border border-gray-100 rounded-xl p-5">
          <h4 className="text-xs text-torg-gray mb-2">Capacidade produtiva mensal estimada</h4>
          <p className="text-xl font-bold text-torg-dark">
            {fmtNum(capacidadeKgMes / 1000, 1)} ton/mes
            <span className="text-sm font-normal text-torg-gray ml-2">({fmtNum(capacidadeKgMes, 0)} kg/mes)</span>
          </p>
          {pesoTotal > 0 && (
            <p className="text-sm text-torg-gray mt-1">
              Prazo estimado: {fmtNum(pesoTotal / (capacidadeKgMes || 1), 1)} meses para {fmtNum(pesoTotal, 0)} kg
            </p>
          )}
        </div>
      )}

      {/* Botao salvar */}
      <div className="flex justify-end">
        <button
          onClick={handleSalvar}
          disabled={salvando}
          className="flex items-center gap-2 px-6 py-2.5 bg-torg-blue text-white rounded-xl text-sm font-semibold hover:bg-torg-dark transition-colors disabled:opacity-50"
        >
          {salvando ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          Salvar Produtividade
        </button>
      </div>

      {toast && <div className="fixed bottom-6 right-6 bg-torg-dark text-white px-4 py-2.5 rounded-xl text-sm shadow-lg z-50">{toast}</div>}
    </div>
  );
}
