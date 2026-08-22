"use client";
import { PRESETS, TIPOS_ESCOPAVEIS, normalizarEscopo } from "@/lib/qualidade-escopo";

// Escolha do escopo de qualidade da obra — usado na abertura da OP e na aba Obra.
//
// Vitor (22/08/2026): "pode ser que em alguns casos não vamos fazer nada além de
// certificado de qualidade e relatório de pintura".
//
// Preset primeiro, caixinhas depois: a maioria das obras cai num dos quatro casos, e
// só quem tem contrato diferente precisa marcar item a item. Mexer nas caixinhas cai
// sozinho em "Personalizado" — nada de o rótulo dizer uma coisa e as marcas outra.
//
// ⚠ `valor` nulo = NÃO DEFINIDO, e não vazio. Obra sem definição continua com todos os
// relatórios disponíveis; vazio quer dizer "esta obra não tem relatório nenhum".
export default function EscopoQualidade({ valor, onChange, compacto = false }) {
  const tipos = Array.isArray(valor) ? valor : null;
  const presetAtual = tipos ? (normalizarEscopo(tipos)?.preset || "PERSONALIZADO") : "";

  const marcar = (id) => {
    const base = tipos || [];
    onChange(base.includes(id) ? base.filter((t) => t !== id) : [...base, id]);
  };

  return (
    <div>
      <label className="block text-sm font-medium text-torg-dark mb-1">Escopo de qualidade</label>
      <select
        value={presetAtual}
        onChange={(e) => {
          const v = e.target.value;
          if (!v) return onChange(null);
          const p = PRESETS.find((x) => x.id === v);
          if (p) onChange([...p.tipos]);
        }}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue bg-white"
      >
        <option value="">Não definido — todos os relatórios</option>
        {PRESETS.map((p) => <option key={p.id} value={p.id}>{p.nome} — {p.resumo}</option>)}
        {presetAtual === "PERSONALIZADO" && <option value="PERSONALIZADO">Personalizado</option>}
      </select>

      {tipos && (
        <div className={`mt-2 grid ${compacto ? "grid-cols-1" : "grid-cols-2"} gap-x-4 gap-y-1`}>
          {TIPOS_ESCOPAVEIS.map((t) => (
            <label key={t.id} className="flex items-center gap-2 text-[12px] text-torg-dark cursor-pointer">
              <input type="checkbox" checked={tipos.includes(t.id)} onChange={() => marcar(t.id)}
                className="rounded border-gray-300 text-torg-blue focus:ring-torg-blue" />
              <span className="font-mono text-[11px] text-torg-gray">{t.sigla}</span> {t.label}
            </label>
          ))}
        </div>
      )}

      <p className="text-[11px] text-torg-gray mt-1">
        {tipos
          ? tipos.length
            ? "Só estes relatórios aparecem para o inspetor; as seções do data book que sobram nascem como “não se aplica”."
            : "Nenhum relatório de inspeção — o data book fica só com os certificados."
          : "Deixe assim se a obra ainda não tem definição: todos os relatórios ficam disponíveis."}
      </p>
    </div>
  );
}
