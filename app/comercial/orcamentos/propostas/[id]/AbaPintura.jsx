"use client";
import { useState, useRef, useCallback, useEffect } from "react";
import {
  Plus, Trash2, Loader2, X, Sparkles, Upload, Edit3, Check,
  Paintbrush, ChevronDown, Pencil, Calculator, DollarSign, Percent,
  ChevronRight, Ruler,
} from "lucide-react";
import { calcularAreasTodosItens, TIPO_MATERIAL_LABEL } from "@/lib/perfil-perimetro";

const TIPOS_PINTURA = [
  { value: "PRIMER", label: "Primer" },
  { value: "ESMALTE", label: "Esmalte" },
  { value: "EPOXI", label: "Epoxi" },
  { value: "POLIURETANO", label: "Poliuretano" },
  { value: "GALVANIZACAO_FRIO", label: "Galv. a Frio" },
  { value: "INTUMESCENTE", label: "Intumescente" },
  { value: "ZARCAO", label: "Zarcao" },
  { value: "ALQUIDICA", label: "Alquidica" },
  { value: "OUTRO", label: "Outro" },
];

const TIPO_LABEL = Object.fromEntries(TIPOS_PINTURA.map((t) => [t.value, t.label]));

// ── Esquemas de pintura predefinidos ──
const ESQUEMAS = [
  {
    id: "TIPO_1",
    nome: "Tipo 1 — Mono-demao Epoxi Dupla Funcao",
    descricao: "Jateamento Sa 2½ · 1 demao · Epoxi dupla funcao (fosfato de zinco)",
    espessuraDefault: 120,
    demaos: 1,
  },
  {
    id: "TIPO_2",
    nome: "Tipo 2 — Mono-demao Dupla Funcao",
    descricao: "Jateamento Sa 2½ · 1 demao · Tinta dupla funcao (primer/acabamento)",
    espessuraDefault: 100,
    demaos: 1,
  },
  {
    id: "TIPO_3",
    nome: "Tipo 3 — Mono-demao Poliuretano Dupla Funcao",
    descricao: "Jateamento Sa 2½ · 1 demao · PU dupla funcao",
    espessuraDefault: 100,
    demaos: 1,
  },
  {
    id: "TIPO_4",
    nome: "Tipo 4 — Duplo: Fundo Epoxi + Acabamento PU Acrilico",
    descricao: "Jateamento Sa 2½ · 2 demaos · Fundo epoxi fosfato de zinco (120-140 µm) + PU acrilico alifatico (60-80 µm) + retoque (~30 µm)",
    espessuraDefault: 200,
    demaos: 2,
  },
  {
    id: "TIPO_5",
    nome: "Tipo 5 — Duplo: Fundo Epoxi + Acabamento PU Dupla Funcao",
    descricao: "Jateamento Sa 2½ · 2 demaos · Fundo epoxi poliamida dupla funcao fosfato de zinco (125 µm) + PU dupla funcao acrilico alifatico isocianato (100 µm) + retoque. Aplicacao: terminais/passarelas",
    espessuraDefault: 225,
    demaos: 2,
  },
  {
    id: "SEM_PINTURA",
    nome: "Sem Pintura",
    descricao: "Escopo de fabricacao/pre-montagem sem jateamento nem pintura",
    espessuraDefault: 0,
    demaos: 0,
  },
  {
    id: "CUSTOMIZADO",
    nome: "Customizado",
    descricao: "Esquema de pintura personalizado para esta obra",
    espessuraDefault: null,
    demaos: null,
  },
];

function fmtNum(v, dec = 2) {
  if (!v && v !== 0) return "—";
  return v.toLocaleString("pt-BR", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

// ── Modal novo item ──
function NovaPinturaModal({ onClose, onSalvar }) {
  const [tipoPintura, setTipoPintura] = useState("PRIMER");
  const [descricao, setDescricao] = useState("");
  const [especificacao, setEspecificacao] = useState("");
  const [areaM2, setAreaM2] = useState("");
  const [demaos, setDemaos] = useState("1");
  const [espessuraMicra, setEspessuraMicra] = useState("");
  const [cor, setCor] = useState("");
  const [norma, setNorma] = useState("");
  const [observacao, setObservacao] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const handleSalvar = async () => {
    if (!descricao.trim()) return setErro("Descricao e obrigatoria");
    setSalvando(true);
    setErro("");
    try {
      const area = parseFloat(areaM2) || 0;
      await onSalvar({
        tipoPintura,
        descricao: descricao.trim(),
        especificacao: especificacao.trim() || undefined,
        areaM2: area,
        demaos: parseInt(demaos) || 1,
        espessuraMicra: espessuraMicra ? parseFloat(espessuraMicra) : undefined,
        unidade: "m2",
        quantidade: area,
        cor: cor.trim() || undefined,
        norma: norma.trim() || undefined,
        observacao: observacao.trim() || undefined,
      });
      onClose();
    } catch (e) {
      setErro(e.message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-torg-dark">Novo Item de Pintura</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg"><X size={20} className="text-gray-400" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-torg-dark mb-1">Tipo de Tinta</label>
              <select value={tipoPintura} onChange={(e) => setTipoPintura(e.target.value)} className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue outline-none">
                {TIPOS_PINTURA.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-torg-dark mb-1">Demaos</label>
              <select value={demaos} onChange={(e) => setDemaos(e.target.value)} className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue outline-none">
                <option value="1">1 demao</option>
                <option value="2">2 demaos</option>
                <option value="3">3 demaos</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-torg-dark mb-1">Descricao <span className="text-red-400">*</span></label>
            <input type="text" value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Ex: Primer epoxi rico em zinco - 1a demao..." className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue outline-none" autoFocus />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-semibold text-torg-dark mb-1">Area (m²)</label>
              <input type="number" value={areaM2} onChange={(e) => setAreaM2(e.target.value)} placeholder="0" min="0" step="0.01" className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue outline-none" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-torg-dark mb-1">Espessura (µm)</label>
              <input type="number" value={espessuraMicra} onChange={(e) => setEspessuraMicra(e.target.value)} placeholder="75" min="0" className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue outline-none" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-torg-dark mb-1">Cor</label>
              <input type="text" value={cor} onChange={(e) => setCor(e.target.value)} placeholder="RAL 7035..." className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue outline-none" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-torg-dark mb-1">Especificacao</label>
              <input type="text" value={especificacao} onChange={(e) => setEspecificacao(e.target.value)} placeholder="WEG primer epoxi..." className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue outline-none" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-torg-dark mb-1">Norma</label>
              <input type="text" value={norma} onChange={(e) => setNorma(e.target.value)} placeholder="N-1550, SSPC-SP6..." className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue outline-none" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-torg-dark mb-1">Observacao</label>
            <input type="text" value={observacao} onChange={(e) => setObservacao(e.target.value)} placeholder="Opcional..." className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue outline-none" />
          </div>
          {erro && <p className="text-sm text-red-600">{erro}</p>}
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 text-sm text-torg-gray hover:text-torg-dark transition-colors">Cancelar</button>
          <button onClick={handleSalvar} disabled={salvando || !descricao.trim()} className="flex items-center gap-2 px-5 py-2.5 bg-torg-blue text-white rounded-xl text-sm font-semibold hover:bg-torg-dark transition-colors disabled:opacity-50">
            {salvando ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            Adicionar
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Modal resultado IA ──
function ResultadoIAModal({ resultado, onClose, onConfirmar, salvando }) {
  const [selecionados, setSelecionados] = useState(new Set(resultado.itens.map((_, i) => i)));
  const toggleItem = (idx) => setSelecionados((prev) => { const n = new Set(prev); n.has(idx) ? n.delete(idx) : n.add(idx); return n; });
  const toggleTodos = () => setSelecionados(selecionados.size === resultado.itens.length ? new Set() : new Set(resultado.itens.map((_, i) => i)));

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-5xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-torg-dark">Esquema de pintura identificado pela IA</h2>
            <p className="text-sm text-torg-gray mt-0.5">
              {resultado.itens.length} etapas de pintura
              {resultado.areaTotalEstimada && <span> — area estimada: {fmtNum(resultado.areaTotalEstimada, 0)} m²</span>}
            </p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg"><X size={20} className="text-gray-400" /></button>
        </div>
        <div className="flex-1 overflow-auto px-6 py-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-torg-gray border-b border-gray-100 whitespace-nowrap">
                <th className="pb-2 pr-2 w-8"><input type="checkbox" checked={selecionados.size === resultado.itens.length} onChange={toggleTodos} className="rounded border-gray-300 text-torg-blue focus:ring-torg-blue/30" /></th>
                <th className="pb-2 px-2">Tipo</th>
                <th className="pb-2 px-2">Descricao</th>
                <th className="pb-2 px-2 text-right">Area (m²)</th>
                <th className="pb-2 px-2 text-center">Demaos</th>
                <th className="pb-2 px-2 text-right">Esp. (µm)</th>
                <th className="pb-2 px-2">Cor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {resultado.itens.map((item, idx) => (
                <tr key={idx} className={`${selecionados.has(idx) ? "bg-torg-blue/5" : ""} hover:bg-gray-50/50 transition-colors`}>
                  <td className="py-2 pr-2"><input type="checkbox" checked={selecionados.has(idx)} onChange={() => toggleItem(idx)} className="rounded border-gray-300 text-torg-blue focus:ring-torg-blue/30" /></td>
                  <td className="py-2 px-2 text-xs"><span className="px-1.5 py-0.5 bg-gray-100 rounded">{TIPO_LABEL[item.tipoPintura] || item.tipoPintura}</span></td>
                  <td className="py-2 px-2 font-medium text-torg-dark">{item.descricao}</td>
                  <td className="py-2 px-2 text-right">{fmtNum(item.areaM2, 0)}</td>
                  <td className="py-2 px-2 text-center font-medium">{item.demaos}x</td>
                  <td className="py-2 px-2 text-right text-torg-gray">{item.espessuraMicra ? `${fmtNum(item.espessuraMicra, 0)}` : "—"}</td>
                  <td className="py-2 px-2 text-torg-gray text-xs">{item.cor || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {resultado.observacoes && <p className="text-xs text-torg-gray mt-4 italic">{resultado.observacoes}</p>}
        </div>
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-gray-50/50 rounded-b-2xl shrink-0">
          <span className="text-sm text-torg-gray"><strong className="text-torg-dark">{selecionados.size}</strong> de {resultado.itens.length} selecionados</span>
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="px-4 py-2 text-sm text-torg-gray hover:text-torg-dark transition-colors">Cancelar</button>
            <button onClick={() => onConfirmar(resultado.itens.filter((_, i) => selecionados.has(i)))} disabled={selecionados.size === 0 || salvando} className="flex items-center gap-2 px-5 py-2.5 bg-torg-blue text-white rounded-xl text-sm font-semibold hover:bg-torg-dark transition-colors disabled:opacity-50">
              {salvando ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
              {salvando ? "Salvando..." : `Adicionar ${selecionados.size} itens`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Componente principal ──
export default function AbaPintura({ estudo, estudoId, onEstudoUpdate }) {
  const [itens, setItens] = useState(estudo.itensPintura || []);
  const [showModal, setShowModal] = useState(false);
  const [excluindoId, setExcluindoId] = useState(null);
  const [editandoId, setEditandoId] = useState(null);
  const [editValores, setEditValores] = useState({});
  const [toast, setToast] = useState(null);
  const [analisandoIA, setAnalisandoIA] = useState(false);
  const [resultadoIA, setResultadoIA] = useState(null);
  const [salvandoIA, setSalvandoIA] = useState(false);
  const fileRef = useRef(null);
  const [importando, setImportando] = useState(false);

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

  // Calculos derivados — perda aplicada sobre o CUSTO, nao sobre a area
  const custoBase = pinturaMetodo === "M2"
    ? areaCalc.areaTotal * (parseFloat(custoM2) || 0)
    : pinturaMetodo === "LITRO"
      ? (parseFloat(rendimento) || 0) > 0
        ? (areaCalc.areaTotal / parseFloat(rendimento)) * (parseFloat(custoLitro) || 0)
        : 0
      : (parseFloat(custoKg) || 0) * pesoTotalKg; // KG
  const perdaDecimal = (parseFloat(pinturaPerda) || 0) / 100;
  const custoPinturaTotal = custoBase * (1 + perdaDecimal);
  const custoPinturaKgCalc = pinturaMetodo === "KG"
    ? (parseFloat(custoKg) || 0) * (1 + perdaDecimal)
    : pesoTotalKg > 0 ? custoPinturaTotal / pesoTotalKg : 0;

  const esquemaObj = ESQUEMAS.find((e) => e.id === esquema) || null;

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
      // Recalcular custoPinturaKg a partir dos valores atuais
      const perda = campos.pinturaPercPerda !== undefined ? parseFloat(campos.pinturaPercPerda) || 0 : pinturaPerda;
      const metodo = campos.pinturaMetodo || pinturaMetodo;
      const cm2 = campos.pinturaCustoM2 !== undefined ? parseFloat(String(campos.pinturaCustoM2).replace(",", ".")) || 0 : parseFloat(custoM2) || 0;
      const rend = campos.pinturaRendimento !== undefined ? parseFloat(String(campos.pinturaRendimento).replace(",", ".")) || 0 : parseFloat(rendimento) || 0;
      const cl = campos.pinturaCustoLitro !== undefined ? parseFloat(String(campos.pinturaCustoLitro).replace(",", ".")) || 0 : parseFloat(custoLitro) || 0;
      const ck = campos.custoPinturaKg !== undefined ? parseFloat(String(campos.custoPinturaKg).replace(",", ".")) || 0 : parseFloat(custoKg) || 0;

      // Perda aplicada sobre o custo total, nao sobre a area
      const perdaDec = perda / 100;
      let custoBaseCalc;
      if (metodo === "KG") {
        custoBaseCalc = ck * pesoTotalKg;
      } else if (metodo === "M2") {
        custoBaseCalc = areaCalc.areaTotal * cm2;
      } else {
        custoBaseCalc = rend > 0 ? (areaCalc.areaTotal / rend) * cl : 0;
      }
      const custoTotalComPerda = custoBaseCalc * (1 + perdaDec);
      const kgCalc = pesoTotalKg > 0 ? custoTotalComPerda / pesoTotalKg : 0;
      body.custoPinturaKg = Math.round(kgCalc * 100) / 100;
      body.areaTotal = Math.round(areaCalc.areaTotal * 100) / 100;

      await fetch(`/api/comercial/estudo/${estudoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      onEstudoUpdate?.({ custoPinturaKg: body.custoPinturaKg, areaTotal: body.areaTotal });
    } catch { /* silencioso */ } finally {
      setSalvandoCusto(false);
    }
  }, [estudoId, pinturaPerda, pinturaMetodo, custoM2, rendimento, custoLitro, custoKg, areaCalc.areaTotal, pesoTotalKg, onEstudoUpdate]);

  const debounceCusto = useCallback((campos) => {
    if (custoTimer.current) clearTimeout(custoTimer.current);
    custoTimer.current = setTimeout(() => salvarCustoPintura(campos), 800);
  }, [salvarCustoPintura]);

  // Salvar esquema com debounce
  const salvarEsquema = useCallback(async (esq, desc, esp) => {
    setSalvandoEsq(true);
    try {
      const espNum = parseFloat(String(esp).replace(",", "."));
      await fetch(`/api/comercial/estudo/${estudoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          esquemaPintura: esq || null,
          esquemaPinturaDesc: desc || null,
          esquemaPinturaEspessura: isNaN(espNum) ? null : espNum,
        }),
      });
    } catch { /* silencioso */ } finally {
      setSalvandoEsq(false);
    }
  }, [estudoId]);

  const handleEsquemaChange = (novoEsq) => {
    setEsquema(novoEsq);
    const obj = ESQUEMAS.find((e) => e.id === novoEsq);
    if (obj && obj.espessuraDefault !== null) {
      setEspessura(obj.espessuraDefault);
      salvarEsquema(novoEsq, descCustom, obj.espessuraDefault);
    } else if (novoEsq === "CUSTOMIZADO") {
      salvarEsquema(novoEsq, descCustom, espessura);
    } else {
      setEspessura("");
      salvarEsquema(novoEsq, descCustom, "");
    }
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

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (custoTimer.current) clearTimeout(custoTimer.current);
    };
  }, []);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  // Totais
  const areaTotalM2 = itens.reduce((s, i) => s + (i.areaM2 || 0), 0);

  const handleAdicionarItem = async (dados) => {
    const res = await fetch(`/api/comercial/estudo/${estudoId}/pintura`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(dados) });
    const json = await res.json();
    if (!json.success) throw new Error(json.error);
    setItens(json.data);
  };

  const handleExcluir = async (itemId) => {
    setExcluindoId(itemId);
    try {
      const res = await fetch(`/api/comercial/estudo/${estudoId}/pintura?itemId=${itemId}`, { method: "DELETE" });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setItens((prev) => prev.filter((i) => i.id !== itemId));
      showToast("Item removido");
    } catch (e) { showToast(`Erro: ${e.message}`); } finally { setExcluindoId(null); }
  };

  const startEdit = (item) => {
    setEditandoId(item.id);
    setEditValores({
      tipoPintura: item.tipoPintura || "OUTRO",
      descricao: item.descricao,
      areaM2: item.areaM2 || 0,
      demaos: item.demaos || 1,
      espessuraMicra: item.espessuraMicra || "",
      cor: item.cor || "",
      observacao: item.observacao || "",
    });
  };

  const saveEdit = async () => {
    try {
      const payload = { ...editValores, itemId: editandoId, quantidade: editValores.areaM2 };
      if (editValores.espessuraMicra === "") delete payload.espessuraMicra;
      else payload.espessuraMicra = parseFloat(editValores.espessuraMicra) || undefined;
      const res = await fetch(`/api/comercial/estudo/${estudoId}/pintura`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setItens((prev) => prev.map((i) => (i.id === editandoId ? json.data : i)));
      setEditandoId(null);
      showToast("Item atualizado");
    } catch (e) { showToast(`Erro: ${e.message}`); }
  };

  const handleAnalisarIA = async () => {
    setAnalisandoIA(true);
    try {
      const res = await fetch(`/api/comercial/estudo/${estudoId}/analisar-pintura`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      if (!json.data.itens?.length) { showToast("Nenhum item de pintura identificado"); return; }
      setResultadoIA(json.data);
    } catch (e) { showToast(`Erro: ${e.message}`); } finally { setAnalisandoIA(false); }
  };

  const handleConfirmarIA = async (itensSelecionados) => {
    setSalvandoIA(true);
    try {
      const res = await fetch(`/api/comercial/estudo/${estudoId}/pintura`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(itensSelecionados) });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setItens(json.data);
      setResultadoIA(null);
      showToast(`${itensSelecionados.length} itens de pintura adicionados`);
    } catch (e) { showToast(`Erro: ${e.message}`); } finally { setSalvandoIA(false); }
  };

  const handleImportarPlanilha = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportando(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/comercial/estudo/${estudoId}/importar-pintura`, { method: "POST", body: formData });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setItens(json.data);
      showToast(`${json.importados} itens importados`);
    } catch (e) { showToast(`Erro: ${e.message}`); } finally { setImportando(false); if (fileRef.current) fileRef.current.value = ""; }
  };

  const docsDisponiveis = (estudo.documentos || []).length;

  return (
    <div className="space-y-4">
      {/* Seletor de Esquema de Pintura */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-torg-blue/10 flex items-center justify-center shrink-0 mt-0.5">
            <Paintbrush size={18} className="text-torg-blue" />
          </div>
          <div className="flex-1">
            <h4 className="text-sm font-bold text-torg-dark">Esquema de Pintura</h4>
            <p className="text-xs text-torg-gray mt-0.5 mb-3">
              Selecione o tipo de pintura para este projeto. A espessura pode ser ajustada conforme a obra.
            </p>

            {/* Seletor */}
            <div className="space-y-3">
              <select
                value={esquema}
                onChange={(e) => handleEsquemaChange(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue outline-none"
              >
                <option value="">Selecione o esquema de pintura...</option>
                {ESQUEMAS.map((e) => (
                  <option key={e.id} value={e.id}>{e.nome}</option>
                ))}
              </select>

              {/* Descricao do esquema selecionado */}
              {esquemaObj && esquema !== "CUSTOMIZADO" && esquema !== "SEM_PINTURA" && (
                <div className="bg-white rounded-lg px-3 py-2.5 border border-gray-100">
                  <p className="text-xs text-torg-dark">{esquemaObj.descricao}</p>
                  <div className="flex items-center gap-4 mt-2">
                    <div className="flex items-center gap-2">
                      <label className="text-xs font-semibold text-torg-gray whitespace-nowrap">Espessura total:</label>
                      <div className="relative">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={espessura}
                          onChange={(e) => handleEspessuraChange(e.target.value)}
                          className="w-24 pl-2.5 pr-8 py-1.5 border border-gray-200 rounded-lg text-sm text-right focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue outline-none bg-white"
                        />
                        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-torg-gray pointer-events-none">µm</span>
                      </div>
                    </div>
                    {esquemaObj.demaos && (
                      <span className="text-xs text-torg-gray">
                        Demaos: <strong className="text-torg-dark">{esquemaObj.demaos}</strong>
                      </span>
                    )}
                    {salvandoEsq && <Loader2 size={14} className="animate-spin text-torg-blue" />}
                  </div>
                </div>
              )}

              {/* Sem pintura */}
              {esquema === "SEM_PINTURA" && (
                <div className="bg-gray-50 rounded-lg px-3 py-2.5 border border-gray-200">
                  <p className="text-xs text-torg-gray italic">Escopo de fabricacao/pre-montagem sem jateamento nem pintura.</p>
                </div>
              )}

              {/* Customizado */}
              {esquema === "CUSTOMIZADO" && (
                <div className="bg-white rounded-lg px-3 py-2.5 border border-gray-100 space-y-2">
                  <div>
                    <label className="text-xs font-semibold text-torg-gray block mb-1">Descricao do esquema</label>
                    <input
                      type="text"
                      value={descCustom}
                      onChange={(e) => handleDescCustomChange(e.target.value)}
                      placeholder="Descreva o esquema de pintura personalizado..."
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue outline-none bg-white"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-semibold text-torg-gray whitespace-nowrap">Espessura total:</label>
                    <div className="relative">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={espessura}
                        onChange={(e) => handleEspessuraChange(e.target.value)}
                        placeholder="µm"
                        className="w-24 pl-2.5 pr-8 py-1.5 border border-gray-200 rounded-lg text-sm text-right focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue outline-none bg-white"
                      />
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

      {/* Area de Pintura Calculada */}
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
                  <span>Peso total: <strong className="text-torg-dark">{fmtNum(pesoTotalKg / 1000, 2)} ton</strong></span>
                  <span>Fator: <strong className="text-torg-dark">{pesoTotalKg > 0 ? fmtNum(areaCalc.areaTotal / (pesoTotalKg / 1000), 1) : "—"} m²/ton</strong></span>
                </div>
              </div>

              <div className="flex items-center gap-6 mt-3">
                <div>
                  <p className="text-xs text-torg-gray">Area total dos perfis</p>
                  <p className="text-lg font-bold text-emerald-600">{fmtNum(areaCalc.areaTotal, 1)} <span className="text-xs font-normal text-torg-gray">m²</span></p>
                </div>
              </div>

              {/* Detalhes por perfil */}
              <button
                onClick={() => setShowDetalhesArea(!showDetalhesArea)}
                className="flex items-center gap-1 text-xs text-torg-blue hover:text-torg-dark mt-3 transition-colors"
              >
                <ChevronRight size={12} className={`transition-transform ${showDetalhesArea ? "rotate-90" : ""}`} />
                {showDetalhesArea ? "Ocultar" : "Ver"} detalhes por perfil ({areaCalc.detalhes.length} itens)
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
                            <span className={`px-1 py-0.5 rounded text-[10px] ${
                              d.metodo === "tabela" ? "bg-emerald-50 text-emerald-700" :
                              d.metodo === "calculado" ? "bg-blue-50 text-blue-700" :
                              "bg-amber-50 text-amber-700"
                            }`}>
                              {d.metodo}
                            </span>
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

      {/* Custo de Pintura */}
      {areaCalc.areaTotal > 0 && esquema && esquema !== "SEM_PINTURA" && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center shrink-0 mt-0.5">
              <DollarSign size={18} className="text-amber-600" />
            </div>
            <div className="flex-1">
              <h4 className="text-sm font-bold text-torg-dark">Custo de Pintura</h4>
              <p className="text-xs text-torg-gray mt-0.5 mb-3">
                Selecione o metodo de calculo do custo. O R$/kg sera atualizado automaticamente na aba Custos.
              </p>

              {/* Toggle metodo */}
              <div className="flex items-center gap-1 mb-3">
                <button
                  onClick={() => { setPinturaMetodo("M2"); salvarCustoPintura({ pinturaMetodo: "M2" }); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    pinturaMetodo === "M2"
                      ? "bg-torg-blue text-white"
                      : "bg-white border border-gray-200 text-torg-gray hover:text-torg-dark"
                  }`}
                >
                  R$/m²
                </button>
                <button
                  onClick={() => { setPinturaMetodo("LITRO"); salvarCustoPintura({ pinturaMetodo: "LITRO" }); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    pinturaMetodo === "LITRO"
                      ? "bg-torg-blue text-white"
                      : "bg-white border border-gray-200 text-torg-gray hover:text-torg-dark"
                  }`}
                >
                  R$/litro
                </button>
                <button
                  onClick={() => { setPinturaMetodo("KG"); salvarCustoPintura({ pinturaMetodo: "KG" }); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    pinturaMetodo === "KG"
                      ? "bg-torg-blue text-white"
                      : "bg-white border border-gray-200 text-torg-gray hover:text-torg-dark"
                  }`}
                >
                  R$/kg
                </button>
                {salvandoCusto && <Loader2 size={14} className="animate-spin text-torg-blue ml-2" />}
              </div>

              {/* Campos de custo */}
              <div className="bg-white rounded-lg px-3 py-3 border border-gray-100">
                {pinturaMetodo === "M2" ? (
                  <div className="flex items-center gap-4 flex-wrap">
                    <div>
                      <label className="text-xs font-semibold text-torg-gray block mb-1">Custo por m²</label>
                      <div className="relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-torg-gray pointer-events-none">R$</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={custoM2}
                          onChange={(e) => {
                            setCustoM2(e.target.value);
                            debounceCusto({ pinturaCustoM2: e.target.value });
                          }}
                          placeholder="0,00"
                          className="w-28 pl-8 pr-2.5 py-1.5 border border-gray-200 rounded-lg text-sm text-right focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue outline-none"
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-1 text-torg-gray pt-5">×</div>
                    <div className="pt-5">
                      <p className="text-sm text-torg-dark">{fmtNum(areaCalc.areaTotal, 1)} m²</p>
                    </div>
                    <div className="flex items-center gap-1 text-torg-gray pt-5">=</div>
                    <div>
                      <label className="text-xs font-semibold text-torg-gray block mb-1">Custo base</label>
                      <p className="text-sm font-semibold text-torg-dark">R$ {fmtNum(custoBase, 2)}</p>
                    </div>
                  </div>
                ) : pinturaMetodo === "LITRO" ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-4 flex-wrap">
                      <div>
                        <label className="text-xs font-semibold text-torg-gray block mb-1">Rendimento</label>
                        <div className="relative">
                          <input
                            type="text"
                            inputMode="decimal"
                            value={rendimento}
                            onChange={(e) => {
                              setRendimento(e.target.value);
                              debounceCusto({ pinturaRendimento: e.target.value });
                            }}
                            placeholder="7,0"
                            className="w-20 pl-2.5 pr-9 py-1.5 border border-gray-200 rounded-lg text-sm text-right focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue outline-none"
                          />
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-torg-gray pointer-events-none">m²/L</span>
                        </div>
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-torg-gray block mb-1">Preco da tinta</label>
                        <div className="relative">
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-torg-gray pointer-events-none">R$</span>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={custoLitro}
                            onChange={(e) => {
                              setCustoLitro(e.target.value);
                              debounceCusto({ pinturaCustoLitro: e.target.value });
                            }}
                            placeholder="0,00"
                            className="w-28 pl-8 pr-6 py-1.5 border border-gray-200 rounded-lg text-sm text-right focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue outline-none"
                          />
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-torg-gray pointer-events-none">/L</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 pt-1 border-t border-gray-50">
                      <div className="text-xs text-torg-gray">
                        Consumo: <strong className="text-torg-dark">{parseFloat(rendimento) > 0 ? fmtNum(areaCalc.areaTotal / parseFloat(rendimento), 1) : "—"} L</strong>
                      </div>
                      <div className="flex items-center gap-1 text-torg-gray">→</div>
                      <div>
                        <p className="text-xs text-torg-gray">Custo base</p>
                        <p className="text-sm font-semibold text-torg-dark">R$ {fmtNum(custoBase, 2)}</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Metodo KG */
                  <div className="flex items-center gap-4 flex-wrap">
                    <div>
                      <label className="text-xs font-semibold text-torg-gray block mb-1">Custo por kg</label>
                      <div className="relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-torg-gray pointer-events-none">R$</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={custoKg}
                          onChange={(e) => {
                            setCustoKg(e.target.value);
                            debounceCusto({ custoPinturaKg: e.target.value });
                          }}
                          placeholder="0,00"
                          className="w-28 pl-8 pr-8 py-1.5 border border-gray-200 rounded-lg text-sm text-right focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue outline-none"
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-torg-gray pointer-events-none">/kg</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 text-torg-gray pt-5">×</div>
                    <div className="pt-5">
                      <p className="text-sm text-torg-dark">{fmtNum(pesoTotalKg, 0)} kg</p>
                    </div>
                    <div className="flex items-center gap-1 text-torg-gray pt-5">=</div>
                    <div>
                      <label className="text-xs font-semibold text-torg-gray block mb-1">Custo base</label>
                      <p className="text-sm font-semibold text-torg-dark">R$ {fmtNum(custoBase, 2)}</p>
                    </div>
                  </div>
                )}

                {/* Perda + Total final — sempre visivel quando tem custo base */}
                {custoBase > 0 && (
                  <div className="flex items-center gap-4 flex-wrap mt-3 pt-3 border-t border-gray-100">
                    <div>
                      <label className="text-xs font-semibold text-torg-gray block mb-1">Custo base</label>
                      <p className="text-sm text-torg-dark">R$ {fmtNum(custoBase, 2)}</p>
                    </div>
                    <div className="flex items-center gap-1 text-torg-gray pt-5">+</div>
                    <div>
                      <label className="text-xs font-semibold text-torg-gray block mb-1">Perda</label>
                      <div className="relative">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={pinturaPerda}
                          onChange={(e) => {
                            const v = e.target.value;
                            setPinturaPerda(v);
                            debounceCusto({ pinturaPercPerda: v });
                          }}
                          className="w-16 pl-2 pr-5 py-1.5 border border-gray-200 rounded-lg text-sm text-right focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue outline-none bg-white"
                        />
                        <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-xs text-torg-gray pointer-events-none">%</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 text-torg-gray pt-5">=</div>
                    <div>
                      <label className="text-xs font-semibold text-amber-600 block mb-1">Custo total</label>
                      <p className="text-lg font-bold text-torg-dark">R$ {fmtNum(custoPinturaTotal, 2)}</p>
                    </div>
                    {perdaDecimal > 0 && (
                      <div className="pt-5 text-xs text-torg-gray">
                        (+R$ {fmtNum(custoPinturaTotal - custoBase, 2)} de perda)
                      </div>
                    )}
                  </div>
                )}

                {/* Equivalente R$/kg (metodos M2 e LITRO) */}
                {custoPinturaTotal > 0 && pinturaMetodo !== "KG" && (
                  <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-100">
                    <span className="text-xs text-torg-gray">Equivalente:</span>
                    <span className="text-xs font-bold text-torg-blue">R$ {fmtNum(custoPinturaKgCalc, 2)}/kg</span>
                    <span className="text-[10px] text-torg-gray">(atualizado automaticamente na aba Custos)</span>
                  </div>
                )}
                {/* Equivalente R$/m² (metodo KG) */}
                {custoPinturaTotal > 0 && pinturaMetodo === "KG" && areaCalc.areaTotal > 0 && (
                  <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-100">
                    <span className="text-xs text-torg-gray">Equivalente:</span>
                    <span className="text-xs font-bold text-torg-blue">R$ {fmtNum(custoPinturaTotal / areaCalc.areaTotal, 2)}/m²</span>
                    <span className="text-[10px] text-torg-gray">(atualizado automaticamente na aba Custos)</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-torg-dark">{itens.length} {itens.length === 1 ? "item" : "itens"}</h3>
          {areaTotalM2 > 0 && <span className="text-xs text-torg-gray">— {fmtNum(areaTotalM2, 0)} m² total</span>}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleAnalisarIA} disabled={analisandoIA || docsDisponiveis === 0} className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-sm text-torg-dark hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed" title={docsDisponiveis === 0 ? "Nenhum documento disponivel" : "Analisar esquema de pintura com IA"}>
            {analisandoIA ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            {analisandoIA ? "Analisando..." : "Analisar com IA"}
          </button>
          <button onClick={() => fileRef.current?.click()} disabled={importando} className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-sm text-torg-dark hover:bg-gray-50 transition-colors disabled:opacity-50">
            {importando ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            {importando ? "Importando..." : "Importar"}
          </button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleImportarPlanilha} className="hidden" />
          <button onClick={() => setShowModal(true)} className="flex items-center gap-1.5 px-3 py-2 bg-torg-blue text-white rounded-lg text-sm font-medium hover:bg-torg-dark transition-colors">
            <Plus size={14} />Adicionar
          </button>
        </div>
      </div>

      {/* Tabela */}
      {itens.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-sm text-torg-gray mb-1">Nenhum item de pintura cadastrado</p>
          <p className="text-xs text-gray-400">Use &quot;Analisar com IA&quot; para estimar o esquema de pintura com base nos materiais e documentos do projeto.</p>
        </div>
      ) : (
        <div className="overflow-x-auto border border-gray-100 rounded-xl">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-torg-gray bg-gray-50/60 border-b border-gray-100 whitespace-nowrap">
                <th className="py-2.5 px-2 w-8">#</th>
                <th className="py-2.5 px-2">Tipo</th>
                <th className="py-2.5 px-2">Descricao</th>
                <th className="py-2.5 px-2 text-right">Area (m²)</th>
                <th className="py-2.5 px-2 text-center">Demaos</th>
                <th className="py-2.5 px-2 text-right">Esp. (µm)</th>
                <th className="py-2.5 px-2">Cor</th>
                <th className="py-2.5 px-2">Obs.</th>
                <th className="py-2.5 px-2 w-16"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {itens.map((item, idx) => (
                <tr key={item.id} className="hover:bg-gray-50/50 transition-colors">
                  {editandoId === item.id ? (
                    <>
                      <td className="py-1.5 px-2 text-xs text-gray-400">{idx + 1}</td>
                      <td className="py-1.5 px-2">
                        <select value={editValores.tipoPintura} onChange={(e) => setEditValores((v) => ({ ...v, tipoPintura: e.target.value }))} className="w-full px-2 py-1 border border-gray-200 rounded text-xs outline-none">
                          {TIPOS_PINTURA.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                      </td>
                      <td className="py-1.5 px-2"><input type="text" value={editValores.descricao} onChange={(e) => setEditValores((v) => ({ ...v, descricao: e.target.value }))} className="w-full px-2 py-1 border border-gray-200 rounded text-xs outline-none" /></td>
                      <td className="py-1.5 px-2"><input type="number" value={editValores.areaM2} onChange={(e) => setEditValores((v) => ({ ...v, areaM2: parseFloat(e.target.value) || 0 }))} className="w-20 px-2 py-1 border border-gray-200 rounded text-xs text-right outline-none" /></td>
                      <td className="py-1.5 px-2">
                        <select value={editValores.demaos} onChange={(e) => setEditValores((v) => ({ ...v, demaos: parseInt(e.target.value) }))} className="w-16 px-2 py-1 border border-gray-200 rounded text-xs text-center outline-none">
                          <option value={1}>1</option><option value={2}>2</option><option value={3}>3</option>
                        </select>
                      </td>
                      <td className="py-1.5 px-2"><input type="number" value={editValores.espessuraMicra} onChange={(e) => setEditValores((v) => ({ ...v, espessuraMicra: e.target.value }))} className="w-16 px-2 py-1 border border-gray-200 rounded text-xs text-right outline-none" /></td>
                      <td className="py-1.5 px-2"><input type="text" value={editValores.cor} onChange={(e) => setEditValores((v) => ({ ...v, cor: e.target.value }))} className="w-20 px-2 py-1 border border-gray-200 rounded text-xs outline-none" /></td>
                      <td className="py-1.5 px-2"><input type="text" value={editValores.observacao} onChange={(e) => setEditValores((v) => ({ ...v, observacao: e.target.value }))} className="w-full px-2 py-1 border border-gray-200 rounded text-xs outline-none" /></td>
                      <td className="py-1.5 px-2"><div className="flex items-center gap-1"><button onClick={saveEdit} className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"><Check size={14} /></button><button onClick={() => setEditandoId(null)} className="p-1 text-gray-400 hover:bg-gray-100 rounded"><X size={14} /></button></div></td>
                    </>
                  ) : (
                    <>
                      <td className="py-2 px-2 text-xs text-gray-400">{idx + 1}</td>
                      <td className="py-2 px-2"><span className="text-xs px-1.5 py-0.5 bg-gray-100 rounded text-torg-dark">{TIPO_LABEL[item.tipoPintura] || "Outro"}</span></td>
                      <td className="py-2 px-2 font-medium text-torg-dark">{item.descricao}</td>
                      <td className="py-2 px-2 text-right">{fmtNum(item.areaM2, 0)}</td>
                      <td className="py-2 px-2 text-center font-medium">{item.demaos}x</td>
                      <td className="py-2 px-2 text-right text-torg-gray">{item.espessuraMicra ? fmtNum(item.espessuraMicra, 0) : "—"}</td>
                      <td className="py-2 px-2 text-xs text-torg-gray">{item.cor || "—"}</td>
                      <td className="py-2 px-2 text-xs text-torg-gray truncate max-w-[100px]" title={item.observacao || ""}>{item.observacao || "—"}</td>
                      <td className="py-2 px-2">
                        <div className="flex items-center gap-1">
                          <button onClick={() => startEdit(item)} className="p-1 text-gray-400 hover:text-torg-blue hover:bg-torg-blue/5 rounded transition-colors"><Edit3 size={13} /></button>
                          <button onClick={() => handleExcluir(item.id)} disabled={excluindoId === item.id} className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors disabled:opacity-50">
                            {excluindoId === item.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                          </button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50/60 border-t border-gray-200">
                <td colSpan={3} className="py-2.5 px-2 text-xs font-semibold text-torg-dark text-right">Total</td>
                <td className="py-2.5 px-2 text-right text-sm font-bold text-torg-dark">{fmtNum(areaTotalM2, 0)} m²</td>
                <td colSpan={5}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {toast && <div className="fixed bottom-6 right-6 bg-torg-dark text-white px-4 py-2.5 rounded-xl text-sm shadow-lg z-50">{toast}</div>}
      {showModal && <NovaPinturaModal onClose={() => setShowModal(false)} onSalvar={handleAdicionarItem} />}
      {resultadoIA && <ResultadoIAModal resultado={resultadoIA} onClose={() => setResultadoIA(null)} onConfirmar={handleConfirmarIA} salvando={salvandoIA} />}
    </div>
  );
}
