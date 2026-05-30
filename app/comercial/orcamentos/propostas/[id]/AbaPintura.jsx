"use client";
import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import {
  Plus, Trash2, Loader2, X, Sparkles, Upload, Edit3, Check,
  Paintbrush, ChevronDown, Pencil, Calculator, DollarSign, Percent,
  ChevronRight, Ruler, Droplets, Package, Search, Beaker,
} from "lucide-react";
import { calcularAreasTodosItens, TIPO_MATERIAL_LABEL } from "@/lib/perfil-perimetro";
import { calcularQuantidadeTinta, RESINAS, METODOS_APLICACAO, ETAPAS, VOLUME_GALAO } from "@/lib/tinta-catalogo";

// ── Esquemas predefinidos (templates) ──
const ESQUEMAS = [
  {
    id: "TIPO_1", nome: "Tipo 1 — Mono-demao Epoxi Dupla Funcao",
    descricao: "Jateamento Sa 2½ · 1 demao · Epoxi dupla funcao (fosfato de zinco)",
    espessuraDefault: 120, demaos: 1,
  },
  {
    id: "TIPO_2", nome: "Tipo 2 — Mono-demao Dupla Funcao",
    descricao: "Jateamento Sa 2½ · 1 demao · Tinta dupla funcao (primer/acabamento)",
    espessuraDefault: 100, demaos: 1,
  },
  {
    id: "TIPO_3", nome: "Tipo 3 — Mono-demao Poliuretano Dupla Funcao",
    descricao: "Jateamento Sa 2½ · 1 demao · PU dupla funcao",
    espessuraDefault: 100, demaos: 1,
  },
  {
    id: "TIPO_4", nome: "Tipo 4 — Duplo: Fundo Epoxi + Acabamento PU Acrilico",
    descricao: "Jateamento Sa 2½ · Fundo epoxi fosfato de zinco + PU acrilico alifatico",
    espessuraDefault: 200, demaos: 2,
  },
  {
    id: "TIPO_5", nome: "Tipo 5 — Duplo: Fundo Epoxi + Acabamento PU Dupla Funcao",
    descricao: "Jateamento Sa 2½ · Fundo epoxi poliamida + PU dupla funcao acrilico",
    espessuraDefault: 225, demaos: 2,
  },
  { id: "SEM_PINTURA", nome: "Sem Pintura", descricao: "Sem jateamento nem pintura", espessuraDefault: 0, demaos: 0 },
  { id: "CUSTOMIZADO", nome: "Customizado", descricao: "Esquema personalizado", espessuraDefault: null, demaos: null },
];

function fmtNum(v, dec = 2) {
  if (!v && v !== 0) return "—";
  return v.toLocaleString("pt-BR", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

// ── Seletor de tinta do catálogo ──
function SeletorTinta({ catalogo, value, onChange, loading }) {
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setAberto(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtrados = useMemo(() => {
    if (!busca.trim()) return catalogo;
    const q = busca.toLowerCase();
    return catalogo.filter((t) =>
      t.nome.toLowerCase().includes(q) ||
      (t.fabricante || "").toLowerCase().includes(q) ||
      (t.norma || "").toLowerCase().includes(q) ||
      t.resinaTipo.toLowerCase().includes(q)
    );
  }, [catalogo, busca]);

  const selecionado = catalogo.find((t) => t.id === value);

  // Agrupar por resina
  const grupos = useMemo(() => {
    const map = {};
    for (const t of filtrados) {
      const grupo = RESINAS[t.resinaTipo]?.label || t.resinaTipo;
      if (!map[grupo]) map[grupo] = [];
      map[grupo].push(t);
    }
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtrados]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setAberto(!aberto)}
        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white text-left flex items-center justify-between gap-2 hover:border-torg-blue/40 transition-colors"
      >
        <span className={selecionado ? "text-torg-dark" : "text-gray-400"}>
          {selecionado ? (
            <span>
              <span className="font-medium">{selecionado.nome}</span>
              <span className="text-torg-gray ml-2">SV {selecionado.svPct}%</span>
            </span>
          ) : "Selecione uma tinta do catalogo..."}
        </span>
        <ChevronDown size={14} className="text-gray-400 shrink-0" />
      </button>

      {aberto && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-xl max-h-72 flex flex-col">
          <div className="px-3 py-2 border-b border-gray-100">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar por nome, fabricante, norma..."
                className="w-full pl-8 pr-2 py-1.5 text-sm border border-gray-100 rounded-lg outline-none focus:border-torg-blue/40"
                autoFocus
              />
            </div>
          </div>
          <div className="overflow-y-auto flex-1">
            {loading ? (
              <div className="flex items-center justify-center py-6 text-sm text-torg-gray">
                <Loader2 size={16} className="animate-spin mr-2" /> Carregando catalogo...
              </div>
            ) : grupos.length === 0 ? (
              <div className="py-4 text-center text-sm text-torg-gray">Nenhuma tinta encontrada</div>
            ) : (
              grupos.map(([grupo, tintas]) => (
                <div key={grupo}>
                  <div className="px-3 py-1.5 text-[10px] font-bold text-torg-gray uppercase tracking-wider bg-gray-50 sticky top-0">
                    {grupo}
                  </div>
                  {tintas.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => { onChange(t); setAberto(false); setBusca(""); }}
                      className={`w-full px-3 py-2 text-left text-sm hover:bg-torg-blue/5 transition-colors flex items-center justify-between ${
                        t.id === value ? "bg-torg-blue/10" : ""
                      }`}
                    >
                      <div>
                        <span className="text-torg-dark">{t.nome}</span>
                        {t.fabricante && <span className="text-xs text-torg-gray ml-1.5">({t.fabricante})</span>}
                        {t.norma && <span className="text-xs text-torg-blue ml-1.5">{t.norma}</span>}
                      </div>
                      <span className="text-xs font-semibold text-torg-dark whitespace-nowrap ml-2">
                        SV {t.svPct}%
                      </span>
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>
          {selecionado && (
            <button
              type="button"
              onClick={() => { onChange(null); setAberto(false); }}
              className="px-3 py-2 text-xs text-red-500 hover:bg-red-50 border-t border-gray-100 text-left"
            >
              Limpar seleção
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Modal para adicionar/editar camada ──
function CamadaModal({ onClose, onSalvar, catalogo, loadingCatalogo, camada, areaTotal }) {
  const isEdit = !!camada;
  const [etapa, setEtapa] = useState(camada?.etapa || "PRIMER");
  const [tintaProdutoId, setTintaProdutoId] = useState(camada?.tintaProdutoId || null);
  const [svPct, setSvPct] = useState(camada?.svPct ?? "");
  const [resinaTipo, setResinaTipo] = useState(camada?.resinaTipo || "");
  const [descricao, setDescricao] = useState(camada?.descricao || "");
  const [espessuraMicra, setEspessuraMicra] = useState(camada?.espessuraMicra ?? "");
  const [demaos, setDemaos] = useState(camada?.demaos || 1);
  const [metodoAplicacao, setMetodoAplicacao] = useState(camada?.metodoAplicacao || "AIRLESS");
  const [percPerdas, setPercPerdas] = useState(camada?.percPerdas ?? METODOS_APLICACAO.AIRLESS.perdaPadrao);
  const [cor, setCor] = useState(camada?.cor || "");
  const [norma, setNorma] = useState(camada?.norma || "");
  const [observacao, setObservacao] = useState(camada?.observacao || "");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const diluentePct = useMemo(() => {
    if (resinaTipo && RESINAS[resinaTipo]) return RESINAS[resinaTipo].diluentePct;
    return 10;
  }, [resinaTipo]);

  // Calculo em tempo real
  const calc = useMemo(() => {
    return calcularQuantidadeTinta({
      svPct: parseFloat(svPct) || 0,
      espessuraMicra: parseFloat(espessuraMicra) || 0,
      areaM2: areaTotal || 0,
      demaos,
      percPerdas: parseFloat(percPerdas) || 0,
      diluentePct,
    });
  }, [svPct, espessuraMicra, areaTotal, demaos, percPerdas, diluentePct]);

  const handleSelecionarTinta = (tinta) => {
    if (!tinta) {
      setTintaProdutoId(null);
      setSvPct("");
      setResinaTipo("");
      setDescricao(isEdit ? camada.descricao : "");
      return;
    }
    setTintaProdutoId(tinta.id);
    setSvPct(tinta.svPct);
    setResinaTipo(tinta.resinaTipo);
    if (!descricao.trim()) setDescricao(tinta.nome);
  };

  const handleMetodoChange = (metodo) => {
    setMetodoAplicacao(metodo);
    const m = METODOS_APLICACAO[metodo];
    if (m) setPercPerdas(m.perdaPadrao);
  };

  const handleSalvar = async () => {
    if (!descricao.trim()) return setErro("Descricao obrigatoria");
    if (!espessuraMicra || parseFloat(espessuraMicra) <= 0) return setErro("Espessura obrigatoria");
    setSalvando(true);
    setErro("");
    try {
      await onSalvar({
        etapa,
        tintaProdutoId: tintaProdutoId || null,
        svPct: parseFloat(svPct) || null,
        resinaTipo: resinaTipo || null,
        descricao: descricao.trim(),
        espessuraMicra: parseFloat(espessuraMicra) || null,
        demaos,
        metodoAplicacao,
        percPerdas: parseFloat(percPerdas) || 0,
        areaM2: areaTotal || 0,
        quantidade: areaTotal || 0,
        cor: cor.trim() || null,
        norma: norma.trim() || null,
        observacao: observacao.trim() || null,
        litrosNecessarios: calc.litros || null,
        galoesNecessarios: calc.galoes || null,
        diluenteLitros: calc.diluente || null,
        tipoPintura: etapa === "PRIMER" ? "PRIMER" : etapa === "ACABAMENTO" ? "POLIURETANO" : "EPOXI",
      });
      onClose();
    } catch (e) { setErro(e.message); } finally { setSalvando(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-torg-dark">{isEdit ? "Editar Camada" : "Nova Camada de Pintura"}</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg"><X size={20} className="text-gray-400" /></button>
        </div>
        <div className="p-6 space-y-4">
          {/* Etapa + Demãos */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-semibold text-torg-dark mb-1">Etapa</label>
              <select value={etapa} onChange={(e) => setEtapa(e.target.value)} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue outline-none">
                {Object.entries(ETAPAS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-torg-dark mb-1">Demaos</label>
              <select value={demaos} onChange={(e) => setDemaos(parseInt(e.target.value))} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue outline-none">
                {[1, 2, 3].map((n) => <option key={n} value={n}>{n} {n === 1 ? "demao" : "demaos"}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-torg-dark mb-1">Espessura (µm) <span className="text-red-400">*</span></label>
              <input type="number" value={espessuraMicra} onChange={(e) => setEspessuraMicra(e.target.value)} placeholder="75" min="1" className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue outline-none" />
            </div>
          </div>

          {/* Seletor de tinta do catálogo */}
          <div>
            <label className="block text-sm font-semibold text-torg-dark mb-1">Tinta do Catalogo</label>
            <SeletorTinta catalogo={catalogo} value={tintaProdutoId} onChange={handleSelecionarTinta} loading={loadingCatalogo} />
            <p className="text-[11px] text-torg-gray mt-1">Selecione para preencher SV% automaticamente, ou insira manualmente abaixo.</p>
          </div>

          {/* Descrição + SV% + Resina */}
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-1">
              <label className="block text-sm font-semibold text-torg-dark mb-1">SV% <span className="text-red-400">*</span></label>
              <div className="relative">
                <input type="number" value={svPct} onChange={(e) => setSvPct(e.target.value)} placeholder="75" min="1" max="100" className="w-full px-3 py-2.5 pr-7 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue outline-none" />
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-torg-gray">%</span>
              </div>
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-semibold text-torg-dark mb-1">Descricao <span className="text-red-400">*</span></label>
              <input type="text" value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Ex: Primer epoxi rico em zinco" className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue outline-none" />
            </div>
          </div>

          {/* Método de aplicação + Perdas */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-torg-dark mb-1">Metodo de Aplicacao</label>
              <select value={metodoAplicacao} onChange={(e) => handleMetodoChange(e.target.value)} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue outline-none">
                {Object.entries(METODOS_APLICACAO).map(([k, v]) => (
                  <option key={k} value={k}>{v.label} ({v.perdaMin}-{v.perdaMax}%)</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-torg-dark mb-1">Perda (%)</label>
              <div className="relative">
                <input type="number" value={percPerdas} onChange={(e) => setPercPerdas(e.target.value)} min="0" max="100" className="w-full px-3 py-2.5 pr-7 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue outline-none" />
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-torg-gray">%</span>
              </div>
            </div>
          </div>

          {/* Cor + Norma */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-torg-dark mb-1">Cor</label>
              <input type="text" value={cor} onChange={(e) => setCor(e.target.value)} placeholder="RAL 7035, Cinza N6.5..." className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue outline-none" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-torg-dark mb-1">Norma</label>
              <input type="text" value={norma} onChange={(e) => setNorma(e.target.value)} placeholder="N-1550, SSPC-SP6..." className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue outline-none" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-torg-dark mb-1">Observacao</label>
            <input type="text" value={observacao} onChange={(e) => setObservacao(e.target.value)} placeholder="Opcional..." className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue outline-none" />
          </div>

          {/* Card de cálculo em tempo real */}
          {parseFloat(svPct) > 0 && parseFloat(espessuraMicra) > 0 && areaTotal > 0 && (
            <div className="bg-gradient-to-r from-torg-blue/5 to-emerald-50 border border-torg-blue/20 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Calculator size={16} className="text-torg-blue" />
                <h4 className="text-sm font-bold text-torg-dark">Calculo Automatico</h4>
              </div>
              <div className="grid grid-cols-5 gap-3 text-center">
                <div>
                  <p className="text-[10px] text-torg-gray uppercase">Rt (m²/L)</p>
                  <p className="text-sm font-bold text-torg-dark">{fmtNum(calc.rendimentoTeorico, 2)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-torg-gray uppercase">Rp (m²/L)</p>
                  <p className="text-sm font-bold text-torg-dark">{fmtNum(calc.rendimentoPratico, 2)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-torg-gray uppercase">Litros</p>
                  <p className="text-sm font-bold text-torg-blue">{fmtNum(calc.litros, 1)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-torg-gray uppercase">Galoes ({VOLUME_GALAO}L)</p>
                  <p className="text-sm font-bold text-emerald-600">{calc.galoes}</p>
                </div>
                <div>
                  <p className="text-[10px] text-torg-gray uppercase">Diluente (L)</p>
                  <p className="text-sm font-bold text-amber-600">{fmtNum(calc.diluente, 1)}</p>
                </div>
              </div>
              <div className="mt-2 pt-2 border-t border-torg-blue/10 text-[10px] text-torg-gray">
                Rt = (SV {svPct}% × 10) / {espessuraMicra} µm = {fmtNum(calc.rendimentoTeorico, 2)} m²/L
                → Rp = {fmtNum(calc.rendimentoTeorico, 2)} × (1 - {percPerdas}%) = {fmtNum(calc.rendimentoPratico, 2)} m²/L
                → {fmtNum(areaTotal, 0)} m² / {fmtNum(calc.rendimentoPratico, 2)} × {demaos} demaos = {fmtNum(calc.litros, 1)} L
              </div>
            </div>
          )}

          {erro && <p className="text-sm text-red-600">{erro}</p>}
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 text-sm text-torg-gray hover:text-torg-dark transition-colors">Cancelar</button>
          <button onClick={handleSalvar} disabled={salvando || !descricao.trim()} className="flex items-center gap-2 px-5 py-2.5 bg-torg-blue text-white rounded-xl text-sm font-semibold hover:bg-torg-dark transition-colors disabled:opacity-50">
            {salvando ? <Loader2 size={16} className="animate-spin" /> : isEdit ? <Check size={16} /> : <Plus size={16} />}
            {isEdit ? "Salvar" : "Adicionar Camada"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Badge de etapa ──
function EtapaBadge({ etapa }) {
  const cores = {
    PRIMER: "bg-amber-100 text-amber-800",
    INTERMEDIARIO: "bg-blue-100 text-blue-800",
    ACABAMENTO: "bg-emerald-100 text-emerald-800",
  };
  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${cores[etapa] || "bg-gray-100 text-gray-700"}`}>
      {ETAPAS[etapa]?.label || etapa || "—"}
    </span>
  );
}

// ── Componente principal ──
export default function AbaPintura({ estudo, estudoId, onEstudoUpdate }) {
  const [itens, setItens] = useState(estudo.itensPintura || []);
  const [showModal, setShowModal] = useState(false);
  const [editando, setEditando] = useState(null);
  const [excluindoId, setExcluindoId] = useState(null);
  const [toast, setToast] = useState(null);

  // Catálogo de tintas
  const [catalogo, setCatalogo] = useState([]);
  const [loadingCatalogo, setLoadingCatalogo] = useState(false);

  // Esquema de pintura
  const [esquema, setEsquema] = useState(estudo.esquemaPintura || "");
  const [descCustom, setDescCustom] = useState(estudo.esquemaPinturaDesc || "");
  const [espessura, setEspessura] = useState(estudo.esquemaPinturaEspessura ?? "");
  const [salvandoEsq, setSalvandoEsq] = useState(false);
  const saveTimer = useRef(null);

  // Area calculada dos perfis
  const [showDetalhesArea, setShowDetalhesArea] = useState(false);
  const areaCalc = calcularAreasTodosItens(estudo.itensPerso || []);
  const pesoTotalKg = (estudo.itensPerso || []).reduce((s, i) => s + (i.pesoTotal || 0), 0);

  // Custo de pintura
  const [pinturaPerda, setPinturaPerda] = useState(estudo.pinturaPercPerda ?? 25);
  const [pinturaMetodo, setPinturaMetodo] = useState(estudo.pinturaMetodo || "M2");
  const [custoM2, setCustoM2] = useState(estudo.pinturaCustoM2 ?? "");
  const [rendimento, setRendimento] = useState(estudo.pinturaRendimento ?? "");
  const [custoLitro, setCustoLitro] = useState(estudo.pinturaCustoLitro ?? "");
  const [custoKg, setCustoKg] = useState(estudo.custoPinturaKg ?? "");
  const [salvandoCusto, setSalvandoCusto] = useState(false);
  const custoTimer = useRef(null);

  const esquemaObj = ESQUEMAS.find((e) => e.id === esquema) || null;

  // Carregar catálogo ao montar
  useEffect(() => {
    let cancelled = false;
    const loadCatalogo = async () => {
      setLoadingCatalogo(true);
      try {
        const res = await fetch("/api/comercial/tinta-catalogo");
        const json = await res.json();
        if (!cancelled && json.success) setCatalogo(json.data);
      } catch { /* silencioso */ }
      finally { if (!cancelled) setLoadingCatalogo(false); }
    };
    loadCatalogo();
    return () => { cancelled = true; };
  }, []);

  // Calculos derivados de custo (metodo simplificado legado)
  const custoBase = pinturaMetodo === "M2"
    ? areaCalc.areaTotal * (parseFloat(custoM2) || 0)
    : pinturaMetodo === "LITRO"
      ? (parseFloat(rendimento) || 0) > 0
        ? (areaCalc.areaTotal / parseFloat(rendimento)) * (parseFloat(custoLitro) || 0)
        : 0
      : (parseFloat(custoKg) || 0) * pesoTotalKg;
  const perdaDecimal = (parseFloat(pinturaPerda) || 0) / 100;
  const custoPinturaTotal = custoBase * (1 + perdaDecimal);
  const custoPinturaKgCalc = pinturaMetodo === "KG"
    ? (parseFloat(custoKg) || 0) * (1 + perdaDecimal)
    : pesoTotalKg > 0 ? custoPinturaTotal / pesoTotalKg : 0;

  // Resumo das camadas com cálculos
  const resumoCamadas = useMemo(() => {
    return itens.filter((i) => i.svPct && i.espessuraMicra).map((item) => {
      const dilPct = item.resinaTipo && RESINAS[item.resinaTipo]
        ? RESINAS[item.resinaTipo].diluentePct
        : 10;
      const calc = calcularQuantidadeTinta({
        svPct: item.svPct,
        espessuraMicra: item.espessuraMicra,
        areaM2: item.areaM2 || areaCalc.areaTotal,
        demaos: item.demaos || 1,
        percPerdas: item.percPerdas || 15,
        diluentePct: dilPct,
      });
      return { ...item, calc };
    });
  }, [itens, areaCalc.areaTotal]);

  const totalLitros = resumoCamadas.reduce((s, c) => s + c.calc.litros, 0);
  const totalGaloes = resumoCamadas.reduce((s, c) => s + c.calc.galoes, 0);
  const totalDiluente = resumoCamadas.reduce((s, c) => s + c.calc.diluente, 0);

  // Salvar campos de custo de pintura com debounce
  const salvarCustoPintura = useCallback(async (campos) => {
    setSalvandoCusto(true);
    try {
      const body = {};
      if (campos.pinturaPercPerda !== undefined) body.pinturaPercPerda = parseFloat(campos.pinturaPercPerda) || 0;
      if (campos.pinturaMetodo !== undefined) body.pinturaMetodo = campos.pinturaMetodo;
      if (campos.pinturaCustoM2 !== undefined) {
        const v = parseFloat(String(campos.pinturaCustoM2).replace(",", "."));
        body.pinturaCustoM2 = isNaN(v) ? null : v;
      }
      if (campos.pinturaRendimento !== undefined) {
        const v = parseFloat(String(campos.pinturaRendimento).replace(",", "."));
        body.pinturaRendimento = isNaN(v) ? null : v;
      }
      if (campos.pinturaCustoLitro !== undefined) {
        const v = parseFloat(String(campos.pinturaCustoLitro).replace(",", "."));
        body.pinturaCustoLitro = isNaN(v) ? null : v;
      }
      const perda = campos.pinturaPercPerda !== undefined ? parseFloat(campos.pinturaPercPerda) || 0 : pinturaPerda;
      const metodo = campos.pinturaMetodo || pinturaMetodo;
      const cm2 = campos.pinturaCustoM2 !== undefined ? parseFloat(String(campos.pinturaCustoM2).replace(",", ".")) || 0 : parseFloat(custoM2) || 0;
      const rend = campos.pinturaRendimento !== undefined ? parseFloat(String(campos.pinturaRendimento).replace(",", ".")) || 0 : parseFloat(rendimento) || 0;
      const cl = campos.pinturaCustoLitro !== undefined ? parseFloat(String(campos.pinturaCustoLitro).replace(",", ".")) || 0 : parseFloat(custoLitro) || 0;
      const ck = campos.custoPinturaKg !== undefined ? parseFloat(String(campos.custoPinturaKg).replace(",", ".")) || 0 : parseFloat(custoKg) || 0;
      const perdaDec = perda / 100;
      let custoBaseCalc;
      if (metodo === "KG") custoBaseCalc = ck * pesoTotalKg;
      else if (metodo === "M2") custoBaseCalc = areaCalc.areaTotal * cm2;
      else custoBaseCalc = rend > 0 ? (areaCalc.areaTotal / rend) * cl : 0;
      const custoTotalComPerda = custoBaseCalc * (1 + perdaDec);
      const kgCalc = pesoTotalKg > 0 ? custoTotalComPerda / pesoTotalKg : 0;
      body.custoPinturaKg = Math.round(kgCalc * 100) / 100;
      body.areaTotal = Math.round(areaCalc.areaTotal * 100) / 100;
      await fetch(`/api/comercial/estudo/${estudoId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      onEstudoUpdate?.({ custoPinturaKg: body.custoPinturaKg, areaTotal: body.areaTotal });
    } catch { /* silencioso */ } finally { setSalvandoCusto(false); }
  }, [estudoId, pinturaPerda, pinturaMetodo, custoM2, rendimento, custoLitro, custoKg, areaCalc.areaTotal, pesoTotalKg, onEstudoUpdate]);

  const debounceCusto = useCallback((campos) => {
    if (custoTimer.current) clearTimeout(custoTimer.current);
    custoTimer.current = setTimeout(() => salvarCustoPintura(campos), 800);
  }, [salvarCustoPintura]);

  // Salvar esquema
  const salvarEsquema = useCallback(async (esq, desc, esp) => {
    setSalvandoEsq(true);
    try {
      const espNum = parseFloat(String(esp).replace(",", "."));
      await fetch(`/api/comercial/estudo/${estudoId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ esquemaPintura: esq || null, esquemaPinturaDesc: desc || null, esquemaPinturaEspessura: isNaN(espNum) ? null : espNum }) });
    } catch { /* silencioso */ } finally { setSalvandoEsq(false); }
  }, [estudoId]);

  const handleEsquemaChange = (novoEsq) => {
    setEsquema(novoEsq);
    const obj = ESQUEMAS.find((e) => e.id === novoEsq);
    if (obj && obj.espessuraDefault !== null) { setEspessura(obj.espessuraDefault); salvarEsquema(novoEsq, descCustom, obj.espessuraDefault); }
    else if (novoEsq === "CUSTOMIZADO") salvarEsquema(novoEsq, descCustom, espessura);
    else { setEspessura(""); salvarEsquema(novoEsq, descCustom, ""); }
  };

  const handleEspessuraChange = (val) => {
    setEspessura(val);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => salvarEsquema(esquema, descCustom, val), 800);
  };

  const handleDescCustomChange = (val) => {
    setDescCustom(val);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => salvarEsquema(esquema, val, espessura), 800);
  };

  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); if (custoTimer.current) clearTimeout(custoTimer.current); }, []);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  // CRUD handlers
  const handleAdicionarItem = async (dados) => {
    const res = await fetch(`/api/comercial/estudo/${estudoId}/pintura`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(dados) });
    const json = await res.json();
    if (!json.success) throw new Error(json.error);
    setItens(json.data);
    showToast("Camada adicionada");
  };

  const handleEditarItem = async (dados) => {
    const res = await fetch(`/api/comercial/estudo/${estudoId}/pintura`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itemId: editando.id, ...dados }) });
    const json = await res.json();
    if (!json.success) throw new Error(json.error);
    setItens((prev) => prev.map((i) => i.id === editando.id ? json.data : i));
    showToast("Camada atualizada");
  };

  const handleExcluir = async (itemId) => {
    setExcluindoId(itemId);
    try {
      const res = await fetch(`/api/comercial/estudo/${estudoId}/pintura?itemId=${itemId}`, { method: "DELETE" });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setItens((prev) => prev.filter((i) => i.id !== itemId));
      showToast("Camada removida");
    } catch (e) { showToast(`Erro: ${e.message}`); } finally { setExcluindoId(null); }
  };

  return (
    <div className="space-y-4">
      {/* ═══ 1. ESQUEMA DE PINTURA ═══ */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-torg-blue/10 flex items-center justify-center shrink-0 mt-0.5">
            <Paintbrush size={18} className="text-torg-blue" />
          </div>
          <div className="flex-1">
            <h4 className="text-sm font-bold text-torg-dark">Esquema de Pintura</h4>
            <p className="text-xs text-torg-gray mt-0.5 mb-3">Selecione o tipo de pintura para este projeto.</p>
            <div className="space-y-3">
              <select value={esquema} onChange={(e) => handleEsquemaChange(e.target.value)} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue outline-none">
                <option value="">Selecione o esquema de pintura...</option>
                {ESQUEMAS.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
              </select>
              {esquemaObj && esquema !== "CUSTOMIZADO" && esquema !== "SEM_PINTURA" && (
                <div className="bg-white rounded-lg px-3 py-2.5 border border-gray-100">
                  <p className="text-xs text-torg-dark">{esquemaObj.descricao}</p>
                  <div className="flex items-center gap-4 mt-2">
                    <div className="flex items-center gap-2">
                      <label className="text-xs font-semibold text-torg-gray whitespace-nowrap">Espessura total:</label>
                      <div className="relative">
                        <input type="text" inputMode="decimal" value={espessura} onChange={(e) => handleEspessuraChange(e.target.value)} className="w-24 pl-2.5 pr-8 py-1.5 border border-gray-200 rounded-lg text-sm text-right focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue outline-none bg-white" />
                        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-torg-gray pointer-events-none">µm</span>
                      </div>
                    </div>
                    {esquemaObj.demaos && <span className="text-xs text-torg-gray">Demaos: <strong className="text-torg-dark">{esquemaObj.demaos}</strong></span>}
                    {salvandoEsq && <Loader2 size={14} className="animate-spin text-torg-blue" />}
                  </div>
                </div>
              )}
              {esquema === "SEM_PINTURA" && <div className="bg-gray-50 rounded-lg px-3 py-2.5 border border-gray-200"><p className="text-xs text-torg-gray italic">Sem jateamento nem pintura.</p></div>}
              {esquema === "CUSTOMIZADO" && (
                <div className="bg-white rounded-lg px-3 py-2.5 border border-gray-100 space-y-2">
                  <div>
                    <label className="text-xs font-semibold text-torg-gray block mb-1">Descricao do esquema</label>
                    <input type="text" value={descCustom} onChange={(e) => handleDescCustomChange(e.target.value)} placeholder="Descreva o esquema personalizado..." className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue outline-none bg-white" />
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-semibold text-torg-gray whitespace-nowrap">Espessura total:</label>
                    <div className="relative">
                      <input type="text" inputMode="decimal" value={espessura} onChange={(e) => handleEspessuraChange(e.target.value)} placeholder="µm" className="w-24 pl-2.5 pr-8 py-1.5 border border-gray-200 rounded-lg text-sm text-right focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue outline-none bg-white" />
                      <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-torg-gray pointer-events-none">µm</span>
                    </div>
                    {salvandoEsq && <Loader2 size={14} className="animate-spin text-torg-blue" />}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ═══ 2. AREA DE PINTURA ═══ */}
      {areaCalc.areaTotal > 0 && esquema && esquema !== "SEM_PINTURA" && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0 mt-0.5">
              <Ruler size={18} className="text-emerald-600" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-torg-dark">Area de Pintura</h4>
                <div className="flex items-center gap-3 text-xs text-torg-gray">
                  <span>Peso: <strong className="text-torg-dark">{fmtNum(pesoTotalKg / 1000, 2)} ton</strong></span>
                  <span>Fator: <strong className="text-torg-dark">{pesoTotalKg > 0 ? fmtNum(areaCalc.areaTotal / (pesoTotalKg / 1000), 1) : "—"} m²/ton</strong></span>
                </div>
              </div>
              <div className="flex items-center gap-6 mt-3">
                <div>
                  <p className="text-xs text-torg-gray">Area total dos perfis</p>
                  <p className="text-lg font-bold text-emerald-600">{fmtNum(areaCalc.areaTotal, 1)} <span className="text-xs font-normal text-torg-gray">m²</span></p>
                </div>
              </div>
              <button onClick={() => setShowDetalhesArea(!showDetalhesArea)} className="flex items-center gap-1 text-xs text-torg-blue hover:text-torg-dark mt-3 transition-colors">
                <ChevronRight size={12} className={`transition-transform ${showDetalhesArea ? "rotate-90" : ""}`} />
                {showDetalhesArea ? "Ocultar" : "Ver"} detalhes ({areaCalc.detalhes.length} itens)
              </button>
              {showDetalhesArea && (
                <div className="mt-2 overflow-x-auto max-h-60 overflow-y-auto border border-gray-100 rounded-lg">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-gray-50">
                      <tr className="text-left text-torg-gray border-b border-gray-100">
                        <th className="py-1.5 px-2">Perfil</th>
                        <th className="py-1.5 px-2">Tipo</th>
                        <th className="py-1.5 px-2 text-right">Comp.</th>
                        <th className="py-1.5 px-2 text-center">Qtd</th>
                        <th className="py-1.5 px-2 text-right">Perim. (m/m)</th>
                        <th className="py-1.5 px-2 text-right">Area (m²)</th>
                        <th className="py-1.5 px-2">Metodo</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {areaCalc.detalhes.map((d) => (
                        <tr key={d.id} className="hover:bg-gray-50/50">
                          <td className="py-1 px-2 font-medium text-torg-dark">{d.descricao}</td>
                          <td className="py-1 px-2 text-torg-gray">{TIPO_MATERIAL_LABEL[d.tipoMaterial] || d.tipoMaterial}</td>
                          <td className="py-1 px-2 text-right">{d.comprimento ? fmtNum(d.comprimento, 2) : "—"}</td>
                          <td className="py-1 px-2 text-center">{d.quantidade || 1}</td>
                          <td className="py-1 px-2 text-right">{d.perimetro ? fmtNum(d.perimetro, 3) : "—"}</td>
                          <td className="py-1 px-2 text-right font-medium">{fmtNum(d.areaPintura, 1)}</td>
                          <td className="py-1 px-2">
                            <span className={`px-1 py-0.5 rounded text-[10px] ${d.metodo === "tabela" ? "bg-emerald-50 text-emerald-700" : d.metodo === "calculado" ? "bg-blue-50 text-blue-700" : "bg-amber-50 text-amber-700"}`}>{d.metodo}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══ 3. CAMADAS DE PINTURA (v2 — cálculo engenharia) ═══ */}
      {esquema && esquema !== "SEM_PINTURA" && (
        <div className="bg-white border border-gray-200 rounded-xl">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <Beaker size={16} className="text-torg-blue" />
              <h4 className="text-sm font-bold text-torg-dark">Camadas de Pintura</h4>
              <span className="text-xs text-torg-gray">— {itens.length} {itens.length === 1 ? "camada" : "camadas"}</span>
            </div>
            <button onClick={() => { setEditando(null); setShowModal(true); }} className="flex items-center gap-1.5 px-3 py-2 bg-torg-blue text-white rounded-lg text-sm font-medium hover:bg-torg-dark transition-colors">
              <Plus size={14} />Adicionar Camada
            </button>
          </div>

          {itens.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Droplets size={32} className="text-gray-300 mb-2" />
              <p className="text-sm text-torg-gray mb-1">Nenhuma camada definida</p>
              <p className="text-xs text-gray-400">Adicione as camadas do esquema de pintura (Primer, Intermediario, Acabamento).</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-torg-gray bg-gray-50/60 border-b border-gray-100 whitespace-nowrap">
                    <th className="py-2.5 px-3">Etapa</th>
                    <th className="py-2.5 px-3">Tinta</th>
                    <th className="py-2.5 px-2 text-center">SV%</th>
                    <th className="py-2.5 px-2 text-center">Esp. (µm)</th>
                    <th className="py-2.5 px-2 text-center">Demaos</th>
                    <th className="py-2.5 px-2 text-center">Metodo</th>
                    <th className="py-2.5 px-2 text-center">Perda</th>
                    <th className="py-2.5 px-2 text-right">Rt (m²/L)</th>
                    <th className="py-2.5 px-2 text-right">Rp (m²/L)</th>
                    <th className="py-2.5 px-2 text-right text-torg-blue font-semibold">Litros</th>
                    <th className="py-2.5 px-2 text-right text-emerald-600 font-semibold">Galoes</th>
                    <th className="py-2.5 px-2 text-right">Diluente</th>
                    <th className="py-2.5 px-2 w-16"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {itens.map((item) => {
                    const dilPct = item.resinaTipo && RESINAS[item.resinaTipo] ? RESINAS[item.resinaTipo].diluentePct : 10;
                    const calc = (item.svPct && item.espessuraMicra)
                      ? calcularQuantidadeTinta({ svPct: item.svPct, espessuraMicra: item.espessuraMicra, areaM2: item.areaM2 || areaCalc.areaTotal, demaos: item.demaos || 1, percPerdas: item.percPerdas || 15, diluentePct: dilPct })
                      : null;
                    return (
                      <tr key={item.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="py-2 px-3"><EtapaBadge etapa={item.etapa} /></td>
                        <td className="py-2 px-3">
                          <div className="max-w-[200px]">
                            <p className="font-medium text-torg-dark text-xs truncate" title={item.descricao}>{item.descricao}</p>
                            {item.cor && <p className="text-[10px] text-torg-gray">{item.cor}</p>}
                          </div>
                        </td>
                        <td className="py-2 px-2 text-center font-semibold">{item.svPct || "—"}</td>
                        <td className="py-2 px-2 text-center">{item.espessuraMicra || "—"}</td>
                        <td className="py-2 px-2 text-center">{item.demaos || 1}x</td>
                        <td className="py-2 px-2 text-center text-xs">{METODOS_APLICACAO[item.metodoAplicacao]?.label || "—"}</td>
                        <td className="py-2 px-2 text-center text-xs">{item.percPerdas != null ? `${item.percPerdas}%` : "—"}</td>
                        <td className="py-2 px-2 text-right text-xs text-torg-gray whitespace-nowrap">{calc ? fmtNum(calc.rendimentoTeorico, 2) : "—"}</td>
                        <td className="py-2 px-2 text-right text-xs text-torg-gray whitespace-nowrap">{calc ? fmtNum(calc.rendimentoPratico, 2) : "—"}</td>
                        <td className="py-2 px-2 text-right font-semibold text-torg-blue whitespace-nowrap">{calc ? fmtNum(calc.litros, 1) : "—"}</td>
                        <td className="py-2 px-2 text-right font-bold text-emerald-600 whitespace-nowrap">{calc ? calc.galoes : "—"}</td>
                        <td className="py-2 px-2 text-right text-xs text-amber-600 whitespace-nowrap">{calc ? fmtNum(calc.diluente, 1) : "—"}</td>
                        <td className="py-2 px-2">
                          <div className="flex items-center gap-1">
                            <button onClick={() => { setEditando(item); setShowModal(true); }} className="p-1 text-gray-400 hover:text-torg-blue hover:bg-torg-blue/5 rounded transition-colors"><Edit3 size={13} /></button>
                            <button onClick={() => handleExcluir(item.id)} disabled={excluindoId === item.id} className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors disabled:opacity-50">
                              {excluindoId === item.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {resumoCamadas.length > 0 && (
                  <tfoot>
                    <tr className="bg-gray-50/80 border-t border-gray-200 whitespace-nowrap">
                      <td colSpan={9} className="py-2.5 px-3 text-xs font-semibold text-torg-dark text-right">Total</td>
                      <td className="py-2.5 px-2 text-right text-sm font-bold text-torg-blue whitespace-nowrap">{fmtNum(totalLitros, 1)} L</td>
                      <td className="py-2.5 px-2 text-right text-sm font-bold text-emerald-600 whitespace-nowrap">{totalGaloes} gl</td>
                      <td className="py-2.5 px-2 text-right text-xs font-semibold text-amber-600 whitespace-nowrap">{fmtNum(totalDiluente, 1)} L</td>
                      <td></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}

          {/* Resumo visual compacto */}
          {resumoCamadas.length > 0 && (
            <div className="px-4 py-3 border-t border-gray-100 bg-gradient-to-r from-torg-blue/5 to-emerald-50">
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <Package size={14} className="text-torg-blue" />
                  <span className="text-xs text-torg-gray">Compra:</span>
                  <span className="text-sm font-bold text-torg-dark">{totalGaloes} galoes ({fmtNum(totalLitros, 0)} L)</span>
                </div>
                <div className="flex items-center gap-2">
                  <Droplets size={14} className="text-amber-500" />
                  <span className="text-xs text-torg-gray">Diluente:</span>
                  <span className="text-sm font-bold text-torg-dark">{fmtNum(totalDiluente, 0)} L</span>
                </div>
                <div className="flex items-center gap-2">
                  <Ruler size={14} className="text-emerald-500" />
                  <span className="text-xs text-torg-gray">Area:</span>
                  <span className="text-sm font-bold text-torg-dark">{fmtNum(areaCalc.areaTotal, 0)} m²</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══ 4. CUSTO DE PINTURA ═══ */}
      {areaCalc.areaTotal > 0 && esquema && esquema !== "SEM_PINTURA" && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center shrink-0 mt-0.5">
              <DollarSign size={18} className="text-amber-600" />
            </div>
            <div className="flex-1">
              <h4 className="text-sm font-bold text-torg-dark">Custo de Pintura</h4>
              <p className="text-xs text-torg-gray mt-0.5 mb-3">Selecione o metodo de calculo do custo. O R$/kg sera atualizado na aba Custos.</p>
              <div className="flex items-center gap-1 mb-3">
                {["M2", "LITRO", "KG"].map((m) => (
                  <button key={m} onClick={() => { setPinturaMetodo(m); salvarCustoPintura({ pinturaMetodo: m }); }} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${pinturaMetodo === m ? "bg-torg-blue text-white" : "bg-white border border-gray-200 text-torg-gray hover:text-torg-dark"}`}>
                    {m === "M2" ? "R$/m²" : m === "LITRO" ? "R$/litro" : "R$/kg"}
                  </button>
                ))}
                {salvandoCusto && <Loader2 size={14} className="animate-spin text-torg-blue ml-2" />}
              </div>
              <div className="bg-white rounded-lg px-3 py-3 border border-gray-100">
                {pinturaMetodo === "M2" ? (
                  <div className="flex items-center gap-4 flex-wrap">
                    <div>
                      <label className="text-xs font-semibold text-torg-gray block mb-1">Custo por m²</label>
                      <div className="relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-torg-gray pointer-events-none">R$</span>
                        <input type="text" inputMode="decimal" value={custoM2} onChange={(e) => { setCustoM2(e.target.value); debounceCusto({ pinturaCustoM2: e.target.value }); }} placeholder="0,00" className="w-28 pl-8 pr-2.5 py-1.5 border border-gray-200 rounded-lg text-sm text-right focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue outline-none" />
                      </div>
                    </div>
                    <div className="flex items-center gap-1 text-torg-gray pt-5">×</div>
                    <div className="pt-5"><p className="text-sm text-torg-dark">{fmtNum(areaCalc.areaTotal, 1)} m²</p></div>
                    <div className="flex items-center gap-1 text-torg-gray pt-5">=</div>
                    <div><label className="text-xs font-semibold text-torg-gray block mb-1">Custo base</label><p className="text-sm font-semibold text-torg-dark">R$ {fmtNum(custoBase, 2)}</p></div>
                  </div>
                ) : pinturaMetodo === "LITRO" ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-4 flex-wrap">
                      <div>
                        <label className="text-xs font-semibold text-torg-gray block mb-1">Rendimento</label>
                        <div className="relative">
                          <input type="text" inputMode="decimal" value={rendimento} onChange={(e) => { setRendimento(e.target.value); debounceCusto({ pinturaRendimento: e.target.value }); }} placeholder="7,0" className="w-20 pl-2.5 pr-9 py-1.5 border border-gray-200 rounded-lg text-sm text-right focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue outline-none" />
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-torg-gray pointer-events-none">m²/L</span>
                        </div>
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-torg-gray block mb-1">Preco da tinta</label>
                        <div className="relative">
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-torg-gray pointer-events-none">R$</span>
                          <input type="text" inputMode="decimal" value={custoLitro} onChange={(e) => { setCustoLitro(e.target.value); debounceCusto({ pinturaCustoLitro: e.target.value }); }} placeholder="0,00" className="w-28 pl-8 pr-6 py-1.5 border border-gray-200 rounded-lg text-sm text-right focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue outline-none" />
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-torg-gray pointer-events-none">/L</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 pt-1 border-t border-gray-50">
                      <div className="text-xs text-torg-gray">Consumo: <strong className="text-torg-dark">{parseFloat(rendimento) > 0 ? fmtNum(areaCalc.areaTotal / parseFloat(rendimento), 1) : "—"} L</strong></div>
                      <div className="flex items-center gap-1 text-torg-gray">→</div>
                      <div><p className="text-xs text-torg-gray">Custo base</p><p className="text-sm font-semibold text-torg-dark">R$ {fmtNum(custoBase, 2)}</p></div>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-4 flex-wrap">
                    <div>
                      <label className="text-xs font-semibold text-torg-gray block mb-1">Custo por kg</label>
                      <div className="relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-torg-gray pointer-events-none">R$</span>
                        <input type="text" inputMode="decimal" value={custoKg} onChange={(e) => { setCustoKg(e.target.value); debounceCusto({ custoPinturaKg: e.target.value }); }} placeholder="0,00" className="w-28 pl-8 pr-8 py-1.5 border border-gray-200 rounded-lg text-sm text-right focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue outline-none" />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-torg-gray pointer-events-none">/kg</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 text-torg-gray pt-5">×</div>
                    <div className="pt-5"><p className="text-sm text-torg-dark">{fmtNum(pesoTotalKg, 0)} kg</p></div>
                    <div className="flex items-center gap-1 text-torg-gray pt-5">=</div>
                    <div><label className="text-xs font-semibold text-torg-gray block mb-1">Custo base</label><p className="text-sm font-semibold text-torg-dark">R$ {fmtNum(custoBase, 2)}</p></div>
                  </div>
                )}
                {custoBase > 0 && (
                  <div className="flex items-center gap-4 flex-wrap mt-3 pt-3 border-t border-gray-100">
                    <div><label className="text-xs font-semibold text-torg-gray block mb-1">Custo base</label><p className="text-sm text-torg-dark">R$ {fmtNum(custoBase, 2)}</p></div>
                    <div className="flex items-center gap-1 text-torg-gray pt-5">+</div>
                    <div>
                      <label className="text-xs font-semibold text-torg-gray block mb-1">Perda</label>
                      <div className="relative">
                        <input type="text" inputMode="decimal" value={pinturaPerda} onChange={(e) => { setPinturaPerda(e.target.value); debounceCusto({ pinturaPercPerda: e.target.value }); }} className="w-16 pl-2 pr-5 py-1.5 border border-gray-200 rounded-lg text-sm text-right focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue outline-none bg-white" />
                        <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-xs text-torg-gray pointer-events-none">%</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 text-torg-gray pt-5">=</div>
                    <div>
                      <label className="text-xs font-semibold text-amber-600 block mb-1">Custo total</label>
                      <p className="text-lg font-bold text-torg-dark">R$ {fmtNum(custoPinturaTotal, 2)}</p>
                    </div>
                    {perdaDecimal > 0 && <div className="pt-5 text-xs text-torg-gray">(+R$ {fmtNum(custoPinturaTotal - custoBase, 2)} de perda)</div>}
                  </div>
                )}
                {custoPinturaTotal > 0 && pinturaMetodo !== "KG" && (
                  <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-100">
                    <span className="text-xs text-torg-gray">Equivalente:</span>
                    <span className="text-xs font-bold text-torg-blue">R$ {fmtNum(custoPinturaKgCalc, 2)}/kg</span>
                    <span className="text-[10px] text-torg-gray">(atualizado na aba Custos)</span>
                  </div>
                )}
                {custoPinturaTotal > 0 && pinturaMetodo === "KG" && areaCalc.areaTotal > 0 && (
                  <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-100">
                    <span className="text-xs text-torg-gray">Equivalente:</span>
                    <span className="text-xs font-bold text-torg-blue">R$ {fmtNum(custoPinturaTotal / areaCalc.areaTotal, 2)}/m²</span>
                    <span className="text-[10px] text-torg-gray">(atualizado na aba Custos)</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="fixed bottom-6 right-6 bg-torg-dark text-white px-4 py-2.5 rounded-xl text-sm shadow-lg z-50">{toast}</div>}
      {showModal && (
        <CamadaModal
          onClose={() => { setShowModal(false); setEditando(null); }}
          onSalvar={editando ? handleEditarItem : handleAdicionarItem}
          catalogo={catalogo}
          loadingCatalogo={loadingCatalogo}
          camada={editando}
          areaTotal={areaCalc.areaTotal}
        />
      )}
    </div>
  );
}
