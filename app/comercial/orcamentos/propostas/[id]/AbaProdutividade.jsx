"use client";
import { useState, useMemo, useRef } from "react";
import { Save, Loader2, Info, ChevronDown, Upload, Sparkles, Trash2, FileText, X, AlertCircle } from "lucide-react";

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
  custoFolhaMes: 550000,
  custoVariaveisMes: 650000,
  custoAtivosMes: 230000,
  custoDividaMes: 180000,
};

PREMISSAS.custoTotalMes = PREMISSAS.custoFolhaMes + PREMISSAS.custoVariaveisMes + PREMISSAS.custoAtivosMes + PREMISSAS.custoDividaMes;
PREMISSAS.horasHomemMes = PREMISSAS.horasDia * PREMISSAS.diasMes * PREMISSAS.pessoasFabrica;
PREMISSAS.custoHh = PREMISSAS.custoFolhaMes / PREMISSAS.horasHomemMes;

// ── Detalhamento por tipo (exemplos e aplicações da planilha Manual) ──
const DETALHE_TIPOS = {
  TRELICADA_EXTRA_PESADA: [{ familia: "W360x122, W410x149, VS600", kgHh: 45, nota: "Treliças especiais, pontes rolantes" }],
  TRELICADA_PESADA: [{ familia: "W250x73, W310x79, HP310x79", kgHh: 35, nota: "Treliças principais, pórticos" }],
  TRELICADA_MEDIA: [{ familia: "L 4\"x1/2\", U 8\", W200x22.5", kgHh: 22, nota: "Treliças pipe rack, suportes grandes" }],
  TRELICADA_LEVE: [{ familia: "L 2\"x1/4\", L 3\"x3/8\", U 4\", W150x13", kgHh: 15, nota: "Treliças cobertura, travamentos" }],
  TRELICADA_EXTRA_LEVE: [{ familia: "L 1\"x1/8\", L 1.1/2\"x3/16\", Tubo Ø48", kgHh: 8, nota: "Treliças leves, suportes tubulares" }],
  ALMA_CHEIA_EXTRA_PESADA: [{ familia: "W530x85, W610x101, VS600", kgHh: 55, nota: "Colunas principais, vigas de rolamento" }],
  ALMA_CHEIA_PESADA: [{ familia: "W310x79, W360x72, W410x85", kgHh: 45, nota: "Colunas, vigas principais" }],
  ALMA_CHEIA_MEDIA: [{ familia: "W200x46.1(H), W250x44.8, W310x44.5", kgHh: 35, nota: "Vigas principais, tesouras" }],
  ALMA_CHEIA_LEVE: [{ familia: "W200x22.5, W200x31.3", kgHh: 25, nota: "Vigas secundárias, longarinas" }],
  ALMA_CHEIA_EXTRA_LEVE: [{ familia: "W150x13, W150x22.5(H)", kgHh: 15, nota: "Terças, travamentos leves" }],
  SUPORTE_EXTRA_PESADO: [{ familia: "Estruturas suporte pesadas", kgHh: 50, nota: "Bases de equipamentos pesados" }],
  SUPORTE_PESADO: [{ familia: "Pórticos grandes, treliças suporte", kgHh: 30, nota: "Suportes de vasos, caldeira" }],
  SUPORTE_MEDIO: [{ familia: "W200x46.1(H), pórticos", kgHh: 20, nota: "Suportes de equipamento, selas" }],
  SUPORTE_LEVE: [{ familia: "W150x13+chapas, consoles", kgHh: 15, nota: "Suportes de tubulação, berços" }],
  SUPORTE_EXTRA_LEVE: [{ familia: "Mísulas, cantoneiras, U pequeno", kgHh: 10, nota: "Suportes de tubulação simples" }],
  SPOOL_PESADO: [{ familia: "Tubulação 14\"–24\"", kgHh: 15, nota: "Processo principal, adutoras" }],
  SPOOL_MEDIO: [{ familia: "Tubulação 6\"–14\"", kgHh: 13, nota: "Processo, vapor" }],
  SPOOL_LEVE: [{ familia: "Tubulação até 6\"", kgHh: 10, nota: "Utilidades, instrumentação" }],
  GUARDA_CORPO: [{ familia: "Montantes, travessas, rodapé (Tubo Ø48+Ø27)", kgHh: 24, nota: "Plataformas, passarelas" }],
  ESCADA: [{ familia: "Longarinas, degraus (Chapa 9,5mm+grade piso)", kgHh: 22, nota: "Acesso entre níveis" }],
  CORRIMAO: [{ familia: "Corrimão superior, intermediário (Tubo Ø48+Ø27)", kgHh: 18, nota: "Escadas, rampas" }],
};

const CORES_GRUPO = {
  "Treliçada": "bg-violet-100 text-violet-700",
  "Alma Cheia": "bg-blue-100 text-blue-700",
  "Suportes": "bg-amber-100 text-amber-700",
  "Spools": "bg-cyan-100 text-cyan-700",
  "Acessos": "bg-emerald-100 text-emerald-700",
};

function fmtMoeda(v) {
  if (!v && v !== 0) return "--";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtNum(v, dec = 2) {
  if (!v && v !== 0) return "--";
  return v.toLocaleString("pt-BR", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function fmtPeso(v) {
  if (!v) return "--";
  if (v >= 1000) return fmtNum(v / 1000, 1) + " ton";
  return fmtNum(v, 0) + " kg";
}

export default function AbaProdutividade({ estudo, estudoId, onEstudoUpdate }) {
  // Estado: modo manual (tipo unico) ou mix IA
  const [modo, setModo] = useState(estudo.produtividadeMix?.length > 0 ? "mix" : "manual");

  // Manual
  const [tipoObra, setTipoObra] = useState(estudo.tipoObra || "");
  const [hhPorTon, setHhPorTon] = useState(estudo.hhPorTon ?? "");

  // Mix IA
  const [mix, setMix] = useState(estudo.produtividadeMix || []);
  const [analisando, setAnalisando] = useState(false);
  const [erroIA, setErroIA] = useState("");
  const [observacoesIA, setObservacoesIA] = useState("");

  // Upload
  const [arquivos, setArquivos] = useState([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  const [salvando, setSalvando] = useState(false);
  const [toast, setToast] = useState(null);
  const [mostrarDetalhe, setMostrarDetalhe] = useState(false);
  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  // Peso total do estudo (dos itens de material)
  const pesoTotal = useMemo(() => {
    return (estudo.itensPerso || []).reduce((s, i) => s + (i.pesoTotal || 0), 0);
  }, [estudo.itensPerso]);

  // ── Calculos modo MANUAL ──
  const hhTonManual = parseFloat(hhPorTon) || 0;
  const custoHh = PREMISSAS.custoHh;

  // ── Calculos modo MIX ──
  const mixTotais = useMemo(() => {
    if (!mix.length) return { pesoTotal: 0, hhTonPonderado: 0 };
    const pesoTot = mix.reduce((s, m) => s + (m.pesoKg || 0), 0);
    const hhPond = pesoTot > 0
      ? mix.reduce((s, m) => s + ((m.hhTon || 0) * (m.pesoKg || 0)), 0) / pesoTot
      : 0;
    return { pesoTotal: pesoTot, hhTonPonderado: Math.round(hhPond * 10) / 10 };
  }, [mix]);

  // Hh/ton efetivo (depende do modo)
  const hhTonEfetivo = modo === "mix" ? mixTotais.hhTonPonderado : hhTonManual;
  const custoMoKg = hhTonEfetivo > 0 ? (hhTonEfetivo * custoHh) / 1000 : 0;
  const custoMoTotal = custoMoKg * pesoTotal;
  const capacidadeKgMes = hhTonEfetivo > 0 ? (PREMISSAS.horasHomemMes / hhTonEfetivo) * 1000 : 0;

  // ── Upload de arquivos ──
  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files || []);
    const validos = files.filter((f) => {
      const ext = f.name.split(".").pop()?.toLowerCase();
      return ["pdf", "png", "jpg", "jpeg"].includes(ext);
    });
    if (validos.length === 0) {
      showToast("Apenas PDF e imagens (PNG/JPG) sao suportados");
      return;
    }
    setArquivos((prev) => [...prev, ...validos]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleRemoverArquivo = (idx) => {
    setArquivos((prev) => prev.filter((_, i) => i !== idx));
  };

  // ── Analise IA ──
  const handleAnalisar = async () => {
    if (arquivos.length === 0) {
      showToast("Adicione pelo menos um documento para analisar");
      return;
    }

    setAnalisando(true);
    setErroIA("");

    try {
      // 1. Upload dos arquivos para Blob + registro como documento
      const docsIds = [];
      for (const file of arquivos) {
        const formData = new FormData();
        formData.append("file", file);

        const uploadRes = await fetch("/api/upload-blob", { method: "POST", body: formData });
        const uploadJson = await uploadRes.json();
        if (!uploadRes.ok) throw new Error(uploadJson.error || "Falha no upload");

        // Registrar como documento do estudo
        const ext = file.name.split(".").pop()?.toLowerCase() || "pdf";
        const regRes = await fetch(`/api/comercial/estudo/${estudoId}/documentos`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nome: file.name,
            tipo: ext,
            tamanho: file.size,
            blobUrl: uploadJson.url,
            categoria: "projeto",
          }),
        });
        const regJson = await regRes.json();
        if (regRes.ok && regJson.data?.id) docsIds.push(regJson.data.id);
      }

      // 2. Chamar endpoint de analise
      const res = await fetch(`/api/comercial/estudo/${estudoId}/analisar-produtividade`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ docIds: docsIds }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Falha na analise");

      // 3. Preencher mix
      setMix(json.data.composicao || []);
      setObservacoesIA(json.data.observacoes || "");
      setModo("mix");
      setArquivos([]);
      showToast(`Analise concluida: ${json.data.composicao?.length || 0} tipos identificados`);
    } catch (e) {
      setErroIA(e.message);
    } finally {
      setAnalisando(false);
    }
  };

  // ── Editar mix manualmente ──
  const handleMixPesoChange = (idx, novoValor) => {
    setMix((prev) => prev.map((m, i) => i === idx ? { ...m, pesoKg: Math.max(0, Number(novoValor) || 0) } : m));
  };

  const handleMixTipoChange = (idx, novoTipoId) => {
    const tipo = TIPOS_OBRA.find((t) => t.id === novoTipoId);
    if (!tipo) return;
    setMix((prev) => prev.map((m, i) => i === idx ? { ...m, tipoObraId: tipo.id, label: tipo.label, grupo: tipo.grupo, hhTon: tipo.hhTon } : m));
  };

  const handleMixRemover = (idx) => {
    setMix((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleMixAdicionar = () => {
    setMix((prev) => [...prev, { tipoObraId: "", label: "", grupo: "", pesoKg: 0, hhTon: 0, elementosIdentificados: "" }]);
  };

  // ── Tipo manual ──
  const handleTipoChange = (novoTipo) => {
    setTipoObra(novoTipo);
    const encontrado = TIPOS_OBRA.find((t) => t.id === novoTipo);
    if (encontrado) setHhPorTon(encontrado.hhTon);
  };

  // ── Salvar ──
  const handleSalvar = async () => {
    setSalvando(true);
    try {
      const payload = {
        custoMoKg: custoMoKg || null,
      };

      if (modo === "mix" && mix.length > 0) {
        payload.hhPorTon = mixTotais.hhTonPonderado || null;
        payload.tipoObra = "MIX_IA";
        payload.produtividadeMix = mix;
      } else {
        payload.tipoObra = tipoObra || null;
        payload.hhPorTon = hhTonManual || null;
        payload.produtividadeMix = null;
      }

      const res = await fetch(`/api/comercial/estudo/${estudoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      onEstudoUpdate?.({ ...payload });
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
      {/* ═══ Toggle modo ═══ */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setModo("manual")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            modo === "manual"
              ? "bg-torg-blue text-white"
              : "bg-white border border-gray-200 text-torg-gray hover:bg-gray-50"
          }`}
        >
          Tipo unico
        </button>
        <button
          onClick={() => setModo("mix")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 ${
            modo === "mix"
              ? "bg-torg-blue text-white"
              : "bg-white border border-gray-200 text-torg-gray hover:bg-gray-50"
          }`}
        >
          <Sparkles size={14} />
          Mix IA
        </button>
      </div>

      {/* ═══ MODO MIX: Upload + Analise IA ═══ */}
      {modo === "mix" && (
        <>
          {/* Upload zone */}
          <div className="border-2 border-dashed border-gray-200 rounded-xl p-6 bg-gray-50/50 hover:border-torg-blue/30 transition-colors">
            <div className="text-center">
              <Upload size={32} className="mx-auto text-gray-300 mb-2" />
              <p className="text-sm font-medium text-torg-dark mb-1">Anexar modelos de projeto</p>
              <p className="text-xs text-torg-gray mb-3">PDF ou imagens com lista de materiais, BOM, desenhos Tekla</p>
              <div className="flex items-center justify-center gap-2">
                <label className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-torg-dark hover:bg-gray-50 cursor-pointer transition-colors">
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept=".pdf,.png,.jpg,.jpeg"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  Escolher arquivos
                </label>
              </div>
            </div>

            {/* Lista de arquivos selecionados */}
            {arquivos.length > 0 && (
              <div className="mt-4 space-y-2">
                {arquivos.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 bg-white rounded-lg px-3 py-2 border border-gray-100">
                    <FileText size={14} className="text-torg-blue shrink-0" />
                    <span className="text-sm text-torg-dark truncate flex-1">{f.name}</span>
                    <span className="text-xs text-torg-gray shrink-0">
                      {(f.size / (1024 * 1024)).toFixed(1)} MB
                    </span>
                    <button onClick={() => handleRemoverArquivo(i)} className="text-gray-400 hover:text-red-500 shrink-0">
                      <X size={14} />
                    </button>
                  </div>
                ))}
                <button
                  onClick={handleAnalisar}
                  disabled={analisando}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-violet-600 to-torg-blue text-white rounded-xl text-sm font-semibold hover:from-violet-700 hover:to-torg-blue-700 transition-all disabled:opacity-60"
                >
                  {analisando ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Analisando com IA...
                    </>
                  ) : (
                    <>
                      <Sparkles size={16} />
                      Analisar tipos estruturais
                    </>
                  )}
                </button>
              </div>
            )}
          </div>

          {erroIA && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
              <AlertCircle size={16} className="text-red-500 mt-0.5 shrink-0" />
              <div className="text-sm text-red-700 flex-1">{erroIA}</div>
              <button onClick={() => setErroIA("")} className="text-red-400 hover:text-red-600 shrink-0"><X size={14} /></button>
            </div>
          )}

          {/* Tabela de mix */}
          {mix.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-torg-dark">Composicao estrutural</h3>
                <button
                  onClick={handleMixAdicionar}
                  className="text-xs text-torg-blue hover:text-torg-dark transition-colors font-medium"
                >
                  + Adicionar tipo
                </button>
              </div>
              <div className="border border-gray-100 rounded-xl overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="text-left text-xs text-torg-gray bg-gray-50/60 border-b border-gray-100">
                      <th className="py-2.5 px-4 font-medium">Tipo estrutural</th>
                      <th className="py-2.5 px-4 font-medium">Grupo</th>
                      <th className="py-2.5 px-4 font-medium text-right">Peso (kg)</th>
                      <th className="py-2.5 px-4 font-medium text-right">%</th>
                      <th className="py-2.5 px-4 font-medium text-right">Hh/ton</th>
                      <th className="py-2.5 px-4 font-medium text-right">R$/kg MO</th>
                      <th className="py-2.5 px-3 w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {mix.map((m, idx) => {
                      const pct = mixTotais.pesoTotal > 0 ? ((m.pesoKg / mixTotais.pesoTotal) * 100) : 0;
                      const custoKg = m.hhTon > 0 ? (m.hhTon * custoHh) / 1000 : 0;
                      const grupoClass = CORES_GRUPO[m.grupo] || "bg-gray-100 text-gray-600";
                      return (
                        <tr key={idx} className="hover:bg-gray-50/30 transition-colors">
                          <td className="py-2 px-4">
                            <select
                              value={m.tipoObraId}
                              onChange={(e) => handleMixTipoChange(idx, e.target.value)}
                              className="w-full text-sm bg-transparent border-0 outline-none text-torg-dark cursor-pointer p-0"
                            >
                              <option value="">Selecione...</option>
                              {["Treliçada", "Alma Cheia", "Suportes", "Spools", "Acessos"].map((grupo) => (
                                <optgroup key={grupo} label={`── ${grupo}`}>
                                  {TIPOS_OBRA.filter((t) => t.grupo === grupo).map((t) => (
                                    <option key={t.id} value={t.id}>{t.label}</option>
                                  ))}
                                </optgroup>
                              ))}
                            </select>
                          </td>
                          <td className="py-2 px-4">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${grupoClass}`}>
                              {m.grupo || "—"}
                            </span>
                          </td>
                          <td className="py-2 px-4 text-right">
                            <input
                              type="number"
                              value={m.pesoKg || ""}
                              onChange={(e) => handleMixPesoChange(idx, e.target.value)}
                              className="w-24 text-sm text-right bg-transparent border-0 outline-none text-torg-dark tabular-nums p-0"
                              min="0"
                              placeholder="0"
                            />
                          </td>
                          <td className="py-2 px-4 text-right text-sm tabular-nums text-torg-gray">
                            {fmtNum(pct, 1)}%
                          </td>
                          <td className="py-2 px-4 text-right text-sm tabular-nums font-medium">
                            {fmtNum(m.hhTon, 1)}
                          </td>
                          <td className="py-2 px-4 text-right text-sm tabular-nums text-torg-gray">
                            R$ {fmtNum(custoKg)}
                          </td>
                          <td className="py-2 px-3 text-right">
                            <button onClick={() => handleMixRemover(idx)} className="text-gray-300 hover:text-red-500 transition-colors">
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    {/* Totais */}
                    <tr className="bg-torg-blue/5 font-semibold">
                      <td className="py-3 px-4 text-sm text-torg-dark">Total ponderado</td>
                      <td className="py-3 px-4"></td>
                      <td className="py-3 px-4 text-right text-sm tabular-nums">{fmtPeso(mixTotais.pesoTotal)}</td>
                      <td className="py-3 px-4 text-right text-sm tabular-nums">100%</td>
                      <td className="py-3 px-4 text-right text-sm tabular-nums text-torg-blue">{fmtNum(mixTotais.hhTonPonderado, 1)}</td>
                      <td className="py-3 px-4 text-right text-sm tabular-nums text-torg-blue">R$ {fmtNum(custoMoKg)}</td>
                      <td className="py-3 px-3"></td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Observacoes da IA */}
              {observacoesIA && (
                <div className="mt-3 bg-violet-50/50 border border-violet-100 rounded-xl px-4 py-3">
                  <p className="text-xs font-medium text-violet-600 mb-1 flex items-center gap-1"><Sparkles size={12} /> Observacoes da IA</p>
                  <p className="text-sm text-torg-gray">{observacoesIA}</p>
                </div>
              )}
            </div>
          )}

          {/* Estado vazio do mix (sem analise ainda) */}
          {mix.length === 0 && !analisando && (
            <div className="text-center py-6">
              <Sparkles size={32} className="mx-auto text-gray-200 mb-2" />
              <p className="text-sm text-torg-gray">Envie documentos de projeto para a IA classificar os tipos estruturais</p>
              <p className="text-xs text-torg-gray mt-1">Ou adicione tipos manualmente:</p>
              <button
                onClick={handleMixAdicionar}
                className="mt-2 text-sm text-torg-blue hover:text-torg-dark transition-colors font-medium"
              >
                + Adicionar tipo manualmente
              </button>
            </div>
          )}
        </>
      )}

      {/* ═══ MODO MANUAL: Selecao de tipo unico ═══ */}
      {modo === "manual" && (
        <>
          <div>
            <h3 className="text-sm font-bold text-torg-dark mb-3">Tipo de Obra</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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

          {/* Detalhe por familia (modo manual) */}
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
                      <th className="py-2.5 px-4 font-medium">Aplicacao</th>
                      <th className="py-2.5 px-4 font-medium text-right">kg/Hh</th>
                      <th className="py-2.5 px-4 font-medium text-right">Hh/ton</th>
                      <th className="py-2.5 px-4 font-medium text-right">R$/kg</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {detalhes.map((d) => {
                      const hhTonEquiv = d.kgHh > 0 ? 1000 / d.kgHh : 0;
                      const cKg = d.kgHh > 0 ? custoHh / d.kgHh : 0;
                      return (
                        <tr key={d.familia} className="hover:bg-gray-50/30 transition-colors">
                          <td className="py-2.5 px-4 text-sm text-torg-dark">{d.familia}</td>
                          <td className="py-2.5 px-4 text-sm text-torg-gray">{d.nota}</td>
                          <td className="py-2.5 px-4 text-right text-sm tabular-nums">{fmtNum(d.kgHh, 1)}</td>
                          <td className="py-2.5 px-4 text-right text-sm tabular-nums text-torg-gray">{fmtNum(hhTonEquiv, 1)}</td>
                          <td className="py-2.5 px-4 text-right text-sm tabular-nums font-medium">R$ {fmtNum(cKg)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* ═══ Resultado: Custo MO/kg (ambos modos) ═══ */}
      {hhTonEfetivo > 0 && (
        <div className="bg-torg-blue/5 border border-torg-blue/10 rounded-xl p-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div>
              <p className="text-xs text-torg-gray mb-1">Custo Hh (fabrica)</p>
              <p className="text-lg font-bold text-torg-dark">{fmtMoeda(custoHh)}</p>
            </div>
            <div>
              <p className="text-xs text-torg-gray mb-1">Custo MO/kg {modo === "mix" && "(ponderado)"}</p>
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

      {/* ═══ Premissas da fabrica (expandivel) ═══ */}
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
                <tr><td className="py-2.5 px-4 text-sm text-torg-dark">Horas/dia</td><td className="py-2.5 px-4 text-right text-sm tabular-nums">{PREMISSAS.horasDia}h</td></tr>
                <tr><td className="py-2.5 px-4 text-sm text-torg-dark">Dias/mes</td><td className="py-2.5 px-4 text-right text-sm tabular-nums">{PREMISSAS.diasMes}</td></tr>
                <tr><td className="py-2.5 px-4 text-sm text-torg-dark">Pessoas na fabrica</td><td className="py-2.5 px-4 text-right text-sm tabular-nums">{PREMISSAS.pessoasFabrica}</td></tr>
                <tr><td className="py-2.5 px-4 text-sm text-torg-dark">Horas-homem/mes</td><td className="py-2.5 px-4 text-right text-sm tabular-nums font-medium">{fmtNum(PREMISSAS.horasHomemMes, 0)} Hh</td></tr>
                <tr className="bg-torg-blue/5"><td className="py-2.5 px-4 text-sm font-bold text-torg-dark">Folha (Mao de obra direta)</td><td className="py-2.5 px-4 text-right text-sm font-bold tabular-nums">{fmtMoeda(PREMISSAS.custoFolhaMes)}</td></tr>
                <tr className="bg-torg-blue/5"><td className="py-2.5 px-4 text-sm font-bold text-torg-dark">Custo por Hh (folha)</td><td className="py-2.5 px-4 text-right text-sm font-bold text-torg-blue tabular-nums">{fmtMoeda(PREMISSAS.custoHh)}</td></tr>
                <tr><td colSpan={2} className="py-2 px-4 text-xs text-torg-gray italic">Demais custos da fabrica (entram na aba Custos):</td></tr>
                <tr><td className="py-2 px-4 text-sm text-gray-400">Custos Variaveis</td><td className="py-2 px-4 text-right text-sm text-gray-400 tabular-nums">{fmtMoeda(PREMISSAS.custoVariaveisMes)}</td></tr>
                <tr><td className="py-2 px-4 text-sm text-gray-400">Ativos / Depreciacao</td><td className="py-2 px-4 text-right text-sm text-gray-400 tabular-nums">{fmtMoeda(PREMISSAS.custoAtivosMes)}</td></tr>
                <tr><td className="py-2 px-4 text-sm text-gray-400">Divida / Financiamento</td><td className="py-2 px-4 text-right text-sm text-gray-400 tabular-nums">{fmtMoeda(PREMISSAS.custoDividaMes)}</td></tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ═══ Capacidade produtiva ═══ */}
      {hhTonEfetivo > 0 && (
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
