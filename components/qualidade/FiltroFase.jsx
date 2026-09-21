"use client";
import { rotuloFase } from "@/lib/fase-peca";

// Chips de FASE na escolha de peça do relatório de inspeção — computador e celular.
//
// Vitor (14/09/2026): "precisamos que separe por fases, no caso da 89 temos A e C por hora, logo
// teremos a B, porém a engenharia não liberou; isso deve ter em todos os tipos de relatórios".
//
// ⚠ AS FASES VÊM DA API (`fases` de /api/campo/pecas), não da tela: a B aparece sozinha no dia em
// que a engenharia subir a lista dela. Com uma fase só o filtro não aparece — chip que não muda
// nada só faz duvidar se mudou.
//
// ⚠ `null` = todas. É o padrão em obra de fase única; em obra com mais de uma, quem chama começa
// pela PRIMEIRA fase, para o relatório nascer de uma fase só (o inspetor troca se quiser).
export default function FiltroFase({ fases, fase, onChange, grande = false }) {
  if (!fases || fases.length < 2) return null;
  const base = grande
    ? "min-h-11 px-4 text-[14px] font-semibold rounded-full border"
    : "text-[10px] font-semibold rounded-full px-2 py-0.5 border";
  const chip = (v, t) => (
    <button key={v ?? "todas"} type="button" onClick={() => onChange(v)}
      className={`${base} ${fase === v ? "border-torg-blue bg-torg-blue text-white" : "border-gray-200 text-torg-gray hover:bg-gray-50"}`}>
      {t}
    </button>
  );
  return (
    <div className={`flex flex-wrap items-center ${grande ? "gap-2 mb-2" : "gap-1.5 mb-1.5"}`}>
      {chip(null, "Todas as fases")}
      {fases.map((f) => chip(f, rotuloFase(f)))}
    </div>
  );
}
