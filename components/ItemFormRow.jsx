"use client";
import { Trash2 } from "lucide-react";
import {
  CATEGORIAS_MATERIAL, CATEGORIAS_ALUGUEL, CATEGORIA_OUTRO, LOCAIS_ESTOQUE, getCategoria,
} from "@/lib/op-categorias";

export function novoItem(categoria = "MATERIA_PRIMA") {
  const cat = getCategoria(categoria);
  return {
    categoria,
    tipo: cat.tipo,
    descricao: "",
    localEstoque: "FABRICA",
    unidade: cat.unidade || "",
    qtdContratada: 0,
    cmcMedio: 0,
    meses: 0,
    valorPorMes: 0,
    capacidade: "",
    valorVerba: 0,
    faturamentoDireto: false,
    observacao: "",
  };
}

// Centraliza efeitos colaterais ao mudar um campo:
// - categoria → reseta tipo, unidade
// - ESTRUTURA / AREA → valorVerba = qtdContratada × cmcMedio
// - ALUGUEL → valorVerba = meses × valorPorMes
export function ajustarItem(item, key, value) {
  const next = { ...item, [key]: value };
  if (key === "categoria") {
    const c = getCategoria(value);
    next.tipo = c.tipo;
    next.unidade = c.unidade || "";
    if (next.tipo !== "ALUGUEL") {
      next.meses = 0; next.valorPorMes = 0; next.capacidade = "";
    }
    if (next.tipo === "VERBA") {
      next.qtdContratada = 0; next.cmcMedio = 0; next.unidade = "";
    }
  }
  if (next.tipo === "ESTRUTURA" || next.tipo === "AREA") {
    const qtd = Number(next.qtdContratada) || 0;
    const cmc = Number(next.cmcMedio) || 0;
    if (qtd > 0 && cmc > 0) {
      next.valorVerba = qtd * cmc;
    }
  }
  if (next.tipo === "ALUGUEL") {
    next.valorVerba = (Number(next.meses) || 0) * (Number(next.valorPorMes) || 0);
  }
  return next;
}

export default function ItemFormRow({ item, onChange, onRemove, canRemove, compact = false }) {
  const tipo = item.tipo;
  const setKey = (k, v) => onChange(ajustarItem(item, k, v));
  const cmcAuto = tipo === "ESTRUTURA" || tipo === "AREA";
  const aluguelAuto = tipo === "ALUGUEL";
  const verbaReadonly = cmcAuto || aluguelAuto;

  return (
    <div className={`px-${compact ? "3" : "6"} py-${compact ? "3" : "4"} space-y-3`}>
      {/* Linha 1: Categoria + Descrição */}
      <div className="flex items-start gap-3 flex-wrap">
        <div className="flex-1 min-w-[180px]">
          <label className="block text-xs font-medium text-torg-gray mb-1">Categoria</label>
          <select
            value={item.categoria}
            onChange={(e) => setKey("categoria", e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue bg-white"
          >
            <optgroup label="Materiais">
              {CATEGORIAS_MATERIAL.map((c) => (
                <option key={c.codigo} value={c.codigo}>{c.label}</option>
              ))}
            </optgroup>
            <optgroup label="Aluguéis">
              {CATEGORIAS_ALUGUEL.map((c) => (
                <option key={c.codigo} value={c.codigo}>Aluguel — {c.label}</option>
              ))}
            </optgroup>
            <optgroup label="Outros">
              <option value={CATEGORIA_OUTRO.codigo}>{CATEGORIA_OUTRO.label}</option>
            </optgroup>
          </select>
        </div>

        <div className="flex-[2] min-w-[200px]">
          <label className="block text-xs font-medium text-torg-gray mb-1">Descrição</label>
          <input
            type="text" value={item.descricao}
            onChange={(e) => setKey("descricao", e.target.value)}
            placeholder={
              tipo === "ALUGUEL" ? "Ex: Plataforma 18m"
              : item.categoria === "OUTRO" ? "Ex: Detalhar item"
              : "Descrição"
            }
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue"
          />
        </div>

        {canRemove && (
          <button type="button" onClick={onRemove} className="text-red-400 hover:text-red-600 mt-6">
            <Trash2 size={18} />
          </button>
        )}
      </div>

      {/* Linha 2: campos por tipo */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {(tipo === "ESTRUTURA" || tipo === "AREA" || tipo === "GENERICO") && (
          <>
            <div>
              <label className="block text-xs font-medium text-torg-gray mb-1">
                {tipo === "ESTRUTURA" ? "Peso estimado" : tipo === "AREA" ? "Área" : "Quantidade"}
              </label>
              <input
                type="number" step="0.01" min="0"
                value={item.qtdContratada}
                onChange={(e) => setKey("qtdContratada", parseFloat(e.target.value) || 0)}
                className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm text-right tabular-nums focus:ring-1 focus:ring-torg-blue"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-torg-gray mb-1">Unidade</label>
              <input
                type="text" value={item.unidade || ""}
                onChange={(e) => setKey("unidade", e.target.value)}
                placeholder={tipo === "ESTRUTURA" ? "KG" : tipo === "AREA" ? "M²" : "UN"}
                className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:ring-1 focus:ring-torg-blue"
              />
            </div>
            {(tipo === "ESTRUTURA" || tipo === "AREA") && (
              <div>
                <label className="block text-xs font-medium text-torg-gray mb-1">
                  CMC médio (R$/{item.unidade || (tipo === "AREA" ? "m²" : "kg")})
                </label>
                <input
                  type="number" step="0.01" min="0"
                  value={item.cmcMedio}
                  onChange={(e) => setKey("cmcMedio", parseFloat(e.target.value) || 0)}
                  className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm text-right tabular-nums focus:ring-1 focus:ring-torg-blue"
                />
              </div>
            )}
          </>
        )}

        {tipo === "ALUGUEL" && (
          <>
            <div>
              <label className="block text-xs font-medium text-torg-gray mb-1">Meses</label>
              <input
                type="number" step="1" min="0" value={item.meses}
                onChange={(e) => setKey("meses", parseInt(e.target.value) || 0)}
                className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm text-right tabular-nums focus:ring-1 focus:ring-torg-blue"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-torg-gray mb-1">Valor / mês (R$)</label>
              <input
                type="number" step="0.01" min="0" value={item.valorPorMes}
                onChange={(e) => setKey("valorPorMes", parseFloat(e.target.value) || 0)}
                className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm text-right tabular-nums focus:ring-1 focus:ring-torg-blue"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-torg-gray mb-1">Capacidade do equipamento</label>
              <input
                type="text" value={item.capacidade || ""}
                onChange={(e) => setKey("capacidade", e.target.value)}
                placeholder="Ex: até 18m de altura, 250kg"
                className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:ring-1 focus:ring-torg-blue"
              />
            </div>
          </>
        )}

        {/* Verba — sempre aparece, readonly se for auto */}
        <div>
          <label className="block text-xs font-medium text-torg-gray mb-1">
            Verba (R$){" "}
            {verbaReadonly && (
              <span className="text-torg-blue text-[10px]">(auto)</span>
            )}
          </label>
          <input
            type="number" step="0.01" min="0" value={item.valorVerba}
            onChange={(e) => setKey("valorVerba", parseFloat(e.target.value) || 0)}
            readOnly={verbaReadonly}
            className={`w-full border rounded px-2 py-1.5 text-sm text-right font-medium tabular-nums focus:ring-1 focus:ring-torg-blue ${
              verbaReadonly ? "bg-gray-50 border-gray-200 cursor-not-allowed" : "border-gray-300"
            }`}
          />
        </div>

        {/* Local de estoque */}
        <div>
          <label className="block text-xs font-medium text-torg-gray mb-1">Local de estoque</label>
          <select
            value={item.localEstoque || ""}
            onChange={(e) => setKey("localEstoque", e.target.value)}
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:ring-1 focus:ring-torg-blue bg-white"
          >
            <option value="">—</option>
            {LOCAIS_ESTOQUE.map((l) => (
              <option key={l.codigo} value={l.codigo}>{l.label}</option>
            ))}
          </select>
        </div>

        {/* Faturamento direto */}
        <div>
          <label className="block text-xs font-medium text-torg-gray mb-1">Fat. direto</label>
          <div className="flex items-center h-[34px]">
            <input
              type="checkbox" checked={item.faturamentoDireto}
              onChange={(e) => setKey("faturamentoDireto", e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-torg-orange focus:ring-torg-orange"
            />
            <span className="ml-2 text-xs text-torg-gray">Fora Omie financeiro</span>
          </div>
        </div>
      </div>
    </div>
  );
}
