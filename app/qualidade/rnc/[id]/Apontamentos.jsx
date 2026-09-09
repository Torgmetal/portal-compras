"use client";
// O bloco de APONTAMENTOS da RNC — cada um com a sua procedência e a sua disposição.
//
// ⚠⚠ SUBSTITUI DOIS BLOCOS ANTIGOS: "Procedência" (um par de botões para a RNC inteira) e
// "Justificativa da procedência / da improcedência". Vitor (09/09/2026): "onde está escrito
// justificativa de procedência ou improcedência vamos usar o termo DISPOSIÇÃO para cada apontamento
// e deve ter esse campo para ser preenchido". A palavra "justificativa" saiu da tela e do PDF.
//
// ⚠ O SELETOR DE PRODUTO VIROU "DECISÃO". Retrabalhar/Refugar/Aprovar sob concessão/Devolver ao
// fornecedor continuam sendo os mesmos valores de `DISPOSICAO_NC` gravados no mesmo campo — só não
// podiam continuar rotulados "Disposição" ao lado do campo escrito, senão a tela teria dois.
import { Plus, Trash2, Check, X } from "lucide-react";
import { DISPOSICAO_NC } from "@/lib/nao-conformidade";
import { SETORES_RETRABALHO } from "@/lib/retrabalho";
import { contagemProcedencia, pesoRetrabalhoTotal, pesoRetrabalhoPorSetor } from "@/lib/rnc-apontamentos";

const SETOR_NOME = Object.fromEntries(SETORES_RETRABALHO.map((s) => [s.id, s.nome]));
const novoId = () => `ap${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export default function Apontamentos({ lista, onChange, cliente }) {
  const set = (i, k, v) => onChange(lista.map((a, j) => (j === i ? { ...a, [k]: v } : a)));
  const add = () => onChange([...lista, { id: novoId(), descricao: "", referencia: "", procedente: true, decisao: "", disposicao: "", pesoKg: null, setor: "" }]);
  const del = (i) => onChange(lista.filter((_, j) => j !== i));

  const { sim, total } = contagemProcedencia(lista);
  const kg = pesoRetrabalhoTotal(lista);
  const porSetor = pesoRetrabalhoPorSetor(lista);

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-torg-dark">Apontamentos</h3>
        <button type="button" onClick={add}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-torg-blue/30 text-torg-blue text-[12px] font-medium hover:bg-torg-blue-50">
          <Plus size={13} /> apontamento
        </button>
      </div>
      <p className="text-[12px] text-torg-gray -mt-1">
        {cliente
          ? "Uma reclamação pode trazer vários apontamentos, e eles não precisam concordar: julgue a procedência de cada um e escreva a disposição de cada um. A RNC conta uma vez no indicador, mesmo com apontamentos improcedentes."
          : "Separe a RNC em apontamentos quando houver mais de uma não conformidade. Cada um tem a sua disposição e o seu setor gerador."}
      </p>

      {lista.length === 0 ? (
        <p className="text-[13px] text-torg-gray">Nenhum apontamento ainda — clique em <b>apontamento</b> para começar.</p>
      ) : (
        <div className="space-y-3">
          {lista.map((a, i) => (
            <ItemApontamento key={a.id || i} a={a} i={i} cliente={cliente} set={set} del={del} podeApagar={lista.length > 1} />
          ))}
        </div>
      )}

      {total > 1 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-2.5 border-t border-gray-100 text-[12px] text-torg-gray">
          <span><b className="text-torg-dark">{sim} de {total}</b> procedentes</span>
          {kg > 0 && <span>retrabalho <b className="text-torg-dark">{kg.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} kg</b></span>}
          {porSetor.length > 1 && (
            <span>({porSetor.map((s) => `${SETOR_NOME[s.setor] || s.setor || "sem setor"} ${s.kg.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} kg`).join(" · ")})</span>
          )}
        </div>
      )}
    </div>
  );
}

function ItemApontamento({ a, i, cliente, set, del, podeApagar }) {
  const proc = a.procedente !== false;
  return (
    <div className="rounded-lg border border-gray-200 p-3 space-y-2.5">
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-bold text-torg-gray bg-gray-100 rounded px-1.5 py-0.5 tabular-nums">{i + 1}</span>
        {cliente && (
          <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden">
            {[{ v: true, l: "Procedente", I: Check }, { v: false, l: "Improcedente", I: X }].map((o) => {
              const on = proc === o.v;
              const cor = o.v ? "bg-red-50 text-red-700 border-red-200" : "bg-gray-100 text-gray-700 border-gray-300";
              return (
                <button key={String(o.v)} type="button" onClick={() => set(i, "procedente", o.v)}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 text-[12px] font-medium border-r last:border-r-0 ${on ? cor : "text-torg-gray border-gray-200 hover:bg-gray-50"}`}>
                  <o.I size={12} /> {o.l}
                </button>
              );
            })}
          </div>
        )}
        <input value={a.referencia || ""} onChange={(e) => set(i, "referencia", e.target.value)}
          placeholder="desenho / marca" className="ml-auto w-40 text-[12px] px-2 py-1 rounded border border-gray-200 focus:border-torg-blue outline-none" />
        {podeApagar && (
          <button type="button" onClick={() => del(i)} title="remover apontamento"
            className="text-gray-400 hover:text-red-600 p-1"><Trash2 size={14} /></button>
        )}
      </div>

      <textarea value={a.descricao || ""} onChange={(e) => set(i, "descricao", e.target.value)} rows={2}
        placeholder="O que foi apontado" className="inp" />

      <div className="border-t border-gray-100 pt-2.5">
        <p className="text-[13px] font-semibold text-torg-dark">Disposição</p>
        <p className="text-[11px] text-torg-gray mt-0.5 mb-2">
          {proc
            ? "O que foi decidido fazer com o produto e por quê. Este texto vai ao cliente e sai no PDF."
            : "Por que o apontamento não procede, com a referência técnica. Este texto vai ao cliente e sai no PDF."}
        </p>
        {/* ⚠ improcedente não pede decisão, peso nem setor: não há o que dispor de uma peça conforme. */}
        {proc && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-2">
            <label className="block">
              <span className="block text-[11px] text-torg-gray mb-1">Decisão</span>
              <select value={a.decisao || ""} onChange={(e) => set(i, "decisao", e.target.value)} className="inp">
                <option value="">—</option>
                {Object.entries(DISPOSICAO_NC).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="block text-[11px] text-torg-gray mb-1">Peso (kg)</span>
              <input type="number" step="0.01" min="0" value={a.pesoKg ?? ""} placeholder="0"
                onChange={(e) => set(i, "pesoKg", e.target.value === "" ? null : Number(e.target.value))}
                disabled={a.decisao !== "RETRABALHAR"} className="inp disabled:bg-gray-50 disabled:text-gray-400" />
            </label>
            <label className="block">
              <span className="block text-[11px] text-torg-gray mb-1">Setor gerador</span>
              <select value={a.setor || ""} onChange={(e) => set(i, "setor", e.target.value)} className="inp">
                <option value="">—</option>
                {SETORES_RETRABALHO.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
              </select>
            </label>
          </div>
        )}
        <textarea value={a.disposicao || ""} onChange={(e) => set(i, "disposicao", e.target.value)} rows={3}
          className="inp" placeholder={proc
            ? "Ex.: furação refeita em campo pela equipe Torg, com gabarito conferido contra a estrutura da plataforma."
            : "Ex.: montagem executada conforme desenho aprovado; a interferência decorre da cota de piso definida em projeto do cliente."} />
      </div>
    </div>
  );
}
