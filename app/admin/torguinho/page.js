"use client";

import { useState, useEffect } from "react";
import {
  Bot, Power, PowerOff, Save, Loader2, CheckCircle2,
  AlertCircle, ChevronDown, ChevronUp, Info, Cpu,
} from "lucide-react";

const MODULOS = [
  { value: "COMERCIAL",    label: "Comercial",    cor: "bg-blue-100 text-blue-700 border-blue-200" },
  { value: "ENGENHARIA",   label: "Engenharia",   cor: "bg-purple-100 text-purple-700 border-purple-200" },
  { value: "COMPRAS",      label: "Compras",      cor: "bg-orange-100 text-orange-700 border-orange-200" },
  { value: "PRODUCAO",     label: "Produção",     cor: "bg-green-100 text-green-700 border-green-200" },
  { value: "ALMOXARIFADO", label: "Almoxarifado", cor: "bg-yellow-100 text-yellow-700 border-yellow-200" },
  { value: "FINANCEIRO",   label: "Financeiro",   cor: "bg-red-100 text-red-700 border-red-200" },
  { value: "EXPEDICAO",    label: "Expedição",    cor: "bg-teal-100 text-teal-700 border-teal-200" },
];

const MODELOS = [
  {
    value: "claude-haiku-4-5",
    label: "Haiku (Rápido e econômico)",
    descricao: "Ideal para chat. Respostas em ~2s. Custo estimado: < R$20/mês para uso normal.",
    badge: "Recomendado",
    badgeCor: "bg-green-100 text-green-700",
  },
  {
    value: "claude-sonnet-4-5",
    label: "Sonnet (Mais inteligente)",
    descricao: "Raciocínio mais profundo, melhor para consultas complexas. ~4× mais caro que Haiku.",
    badge: "Premium",
    badgeCor: "bg-blue-100 text-blue-700",
  },
];

export default function TorguinhoConfigPage() {
  const [config,    setConfig]    = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [salvando,  setSalvando]  = useState(false);
  const [feedback,  setFeedback]  = useState(null); // { tipo: "ok"|"erro", msg }
  const [avancado,  setAvancado]  = useState(false);

  // Campos editáveis
  const [ativo,              setAtivo]              = useState(true);
  const [modulosHabilitados, setModulosHabilitados] = useState([]);
  const [modelo,             setModelo]             = useState("claude-haiku-4-5");
  const [instrucaoExtra,     setInstrucaoExtra]     = useState("");

  // Carrega config
  useEffect(() => {
    fetch("/api/admin/assistente")
      .then(r => r.json())
      .then(d => {
        setConfig(d);
        setAtivo(d.ativo ?? true);
        setModulosHabilitados(d.modulosHabilitados ?? []);
        setModelo(d.modelo ?? "claude-haiku-4-5");
        setInstrucaoExtra(d.instrucaoExtra ?? "");
      })
      .catch(() => setFeedback({ tipo: "erro", msg: "Erro ao carregar configurações." }))
      .finally(() => setLoading(false));
  }, []);

  function toggleModulo(modulo) {
    setModulosHabilitados(prev =>
      prev.includes(modulo) ? prev.filter(m => m !== modulo) : [...prev, modulo]
    );
  }

  async function salvar() {
    setSalvando(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/admin/assistente", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ativo,
          modulosHabilitados,
          modelo,
          instrucaoExtra: instrucaoExtra.trim() || null,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Erro ao salvar");
      const data = await res.json();
      setConfig(data);
      setFeedback({ tipo: "ok", msg: "Configurações salvas com sucesso!" });
      setTimeout(() => setFeedback(null), 3000);
    } catch (e) {
      setFeedback({ tipo: "erro", msg: e.message });
    } finally {
      setSalvando(false);
    }
  }

  const todosModoulos = modulosHabilitados.length === 0;

  // ─── Render ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 gap-2 text-torg-gray">
        <Loader2 size={20} className="animate-spin" /> Carregando configurações...
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="w-16 h-16 rounded-2xl overflow-hidden border-2 border-torg-blue/20 shadow-sm shrink-0">
          <img src="/torguinho.png" alt="Torguinho"
            className="w-full h-full object-cover"
            onError={e => { e.target.style.display="none"; e.target.parentElement.innerHTML='<div class="w-full h-full bg-torg-blue/10 flex items-center justify-center text-2xl">🤖</div>'; }}
          />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-torg-dark flex items-center gap-2">
            <Bot size={22} className="text-torg-blue" />
            Torguinho — Assistente IA
          </h1>
          <p className="text-sm text-torg-gray mt-0.5">
            Configure o assistente inteligente da Torg Metal
          </p>
        </div>
      </div>

      {/* Feedback */}
      {feedback && (
        <div className={`flex items-center gap-2 p-3 rounded-xl text-sm border ${
          feedback.tipo === "ok"
            ? "bg-green-50 text-green-700 border-green-200"
            : "bg-red-50 text-red-700 border-red-200"
        }`}>
          {feedback.tipo === "ok" ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          {feedback.msg}
        </div>
      )}

      {/* Card: Ativar / Desativar */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-semibold text-torg-dark">Status do Torguinho</div>
            <div className="text-sm text-torg-gray mt-0.5">
              {ativo
                ? "Botão de chat visível para todos os usuários habilitados"
                : "Botão de chat oculto para todos os usuários"}
            </div>
          </div>
          <button
            onClick={() => setAtivo(v => !v)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium text-sm transition-all ${
              ativo
                ? "bg-green-500 hover:bg-green-600 text-white"
                : "bg-gray-200 hover:bg-gray-300 text-gray-600"
            }`}
          >
            {ativo ? <Power size={16} /> : <PowerOff size={16} />}
            {ativo ? "Ativo" : "Inativo"}
          </button>
        </div>
      </div>

      {/* Card: Módulos com acesso */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-4">
        <div>
          <div className="font-semibold text-torg-dark">Módulos com acesso</div>
          <div className="text-sm text-torg-gray mt-0.5">
            Defina quais setores podem usar o Torguinho
          </div>
        </div>

        {/* Toggle: todos ou específicos */}
        <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg border border-blue-100">
          <input
            type="checkbox"
            id="todos-modulos"
            checked={todosModoulos}
            onChange={() => setModulosHabilitados(todosModoulos ? ["COMERCIAL"] : [])}
            className="w-4 h-4 accent-torg-blue"
          />
          <label htmlFor="todos-modulos" className="text-sm font-medium text-torg-dark cursor-pointer">
            Todos os módulos (padrão)
          </label>
          {todosModoulos && (
            <span className="ml-auto text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
              Recomendado
            </span>
          )}
        </div>

        {/* Seleção individual */}
        {!todosModoulos && (
          <div className="grid grid-cols-2 gap-2">
            {MODULOS.map(m => (
              <button
                key={m.value}
                onClick={() => toggleModulo(m.value)}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium transition-all ${
                  modulosHabilitados.includes(m.value)
                    ? m.cor + " shadow-sm"
                    : "bg-gray-50 text-gray-400 border-gray-200 hover:bg-gray-100"
                }`}
              >
                <div className={`w-3.5 h-3.5 rounded border-2 flex items-center justify-center ${
                  modulosHabilitados.includes(m.value)
                    ? "border-current bg-current"
                    : "border-gray-300"
                }`}>
                  {modulosHabilitados.includes(m.value) && (
                    <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
                      <path d="M1 3l2 2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </div>
                {m.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Card: Modelo */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-3">
        <div>
          <div className="font-semibold text-torg-dark flex items-center gap-2">
            <Cpu size={16} className="text-torg-blue" /> Modelo de IA
          </div>
          <div className="text-sm text-torg-gray mt-0.5">
            Define a velocidade e qualidade das respostas
          </div>
        </div>
        <div className="space-y-2">
          {MODELOS.map(m => (
            <button
              key={m.value}
              onClick={() => setModelo(m.value)}
              className={`w-full flex items-start gap-3 p-3.5 rounded-xl border text-left transition-all ${
                modelo === m.value
                  ? "border-torg-blue bg-blue-50/50 shadow-sm"
                  : "border-gray-200 hover:border-gray-300 bg-white"
              }`}
            >
              <div className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                modelo === m.value ? "border-torg-blue" : "border-gray-300"
              }`}>
                {modelo === m.value && (
                  <div className="w-2 h-2 rounded-full bg-torg-blue" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`font-medium text-sm ${modelo === m.value ? "text-torg-dark" : "text-gray-600"}`}>
                    {m.label}
                  </span>
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${m.badgeCor}`}>
                    {m.badge}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">{m.descricao}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Card: Configurações avançadas */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <button
          onClick={() => setAvancado(v => !v)}
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
        >
          <span className="font-semibold text-torg-dark text-sm">Configurações avançadas</span>
          {avancado ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
        </button>
        {avancado && (
          <div className="px-5 pb-5 space-y-3 border-t border-gray-50">
            <div>
              <label className="block text-sm font-medium text-torg-gray mb-1">
                Instrução personalizada
              </label>
              <textarea
                value={instrucaoExtra}
                onChange={e => setInstrucaoExtra(e.target.value)}
                rows={4}
                placeholder="Ex: Sempre mencione que em caso de dúvidas sobre pedidos urgentes o contato é o João no ramal 201. Não discuta questões fora do âmbito da Torg Metal."
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-torg-blue resize-none"
              />
              <div className="flex items-start gap-1.5 mt-1.5 text-xs text-gray-400">
                <Info size={12} className="mt-0.5 shrink-0" />
                Esta instrução é adicionada ao final do prompt do Torguinho. Use para personalizar
                o comportamento para a realidade da Torg.
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Botão salvar */}
      <div className="flex justify-end">
        <button
          onClick={salvar}
          disabled={salvando}
          className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-torg-blue text-white font-medium text-sm hover:bg-torg-blue/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
        >
          {salvando ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          {salvando ? "Salvando..." : "Salvar configurações"}
        </button>
      </div>
    </div>
  );
}
