"use client";
import { Plus, Trash2, AlertTriangle } from "lucide-react";
import CampoDecimal from "@/components/CampoDecimal";
import { CATEGORIAS_RECEITA, UNIDADES_RECEITA, VALOR_FECHADO, unidadeInfo, linhaReceitaVazia, totalDaLinha, totalDasLinhas } from "@/lib/receita-aditivo";

// A receita do aditivo digitada à mão: descrição, peso e unitário — o total sai sozinho.
// Vitor (17/09/2026): "para o caso de ter que digitar na mão precisamos de algumas coisas,
// informar o peso, unitário e a descrição". A conta mora em lib/receita-aditivo (a rota usa a
// mesma); aqui é só o formulário.
const fmtMoeda = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const campo = "w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue";
const rot = "block text-[11px] font-medium text-torg-gray mb-1";

export default function ReceitasAditivoEditor({ linhas, onChange, valorPedido = null }) {
  const set = (i, k, v) => onChange(linhas.map((l, idx) => (idx === i ? { ...l, [k]: v } : l)));
  // a última linha não some: volta em branco, senão o bloco fica sem onde digitar
  const remover = (i) => onChange(linhas.length > 1 ? linhas.filter((_, idx) => idx !== i) : [linhaReceitaVazia()]);
  const total = totalDasLinhas(linhas);
  const pedido = Number(valorPedido) || 0;
  const difere = pedido > 0 && total > 0 && Math.abs(pedido - total) >= 0.01;

  return (
    <div className="space-y-3">
      {linhas.map((l, i) => {
        const u = unidadeInfo(l.unidade);
        const fechado = l.unidade === VALOR_FECHADO;
        const n = i + 1;
        return (
          <div key={i} className="rounded-lg border border-gray-200 bg-gray-50/40 p-3 space-y-2">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-2">
              <div className="md:col-span-5">
                <label className={rot}>Descrição</label>
                <input className={campo} value={l.descricao} onChange={(e) => set(i, "descricao", e.target.value)} placeholder="ex.: Estrutura metálica — passarela TC 8011" aria-label={`Descrição da receita ${n}`} />
              </div>
              <div className="md:col-span-3">
                <label className={rot}>Categoria</label>
                <select className={campo} value={l.categoria} onChange={(e) => set(i, "categoria", e.target.value)} aria-label={`Categoria da receita ${n}`}>
                  {CATEGORIAS_RECEITA.map((c) => <option key={c.codigo} value={c.codigo}>{c.rotulo}</option>)}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className={rot}>Cobrado por</label>
                <select className={campo} value={u.codigo} onChange={(e) => set(i, "unidade", e.target.value)} aria-label={`Unidade da receita ${n}`}>
                  {UNIDADES_RECEITA.map((x) => <option key={x.codigo} value={x.codigo}>{x.rotulo}</option>)}
                  {!UNIDADES_RECEITA.some((x) => x.codigo === u.codigo) && <option value={u.codigo}>{u.rotulo}</option>}
                </select>
              </div>
              <div className="md:col-span-2 flex items-end justify-end">
                <button type="button" onClick={() => remover(i)} className="text-xs text-red-500 hover:underline inline-flex items-center gap-1 pb-2" aria-label={`Remover receita ${n}`}><Trash2 size={12} /> remover</button>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-12 gap-2">
              {fechado ? (
                <div className="md:col-span-4">
                  <label className={rot}>Valor (R$)</label>
                  <CampoDecimal casas={2} className={campo} value={l.valor} onChange={(v) => set(i, "valor", v)} placeholder="0,00" aria-label={`Valor da receita ${n}`} />
                </div>
              ) : (
                <>
                  <div className="md:col-span-4">
                    <label className={rot}>{u.quantidade}</label>
                    <CampoDecimal casas={2} className={campo} value={l.quantidade} onChange={(v) => set(i, "quantidade", v)} placeholder="0,00" aria-label={`${u.quantidade} da receita ${n}`} />
                  </div>
                  <div className="md:col-span-4">
                    <label className={rot}>{u.unitario}</label>
                    <CampoDecimal casas={2} className={campo} value={l.valorUnitario} onChange={(v) => set(i, "valorUnitario", v)} placeholder="0,00" aria-label={`${u.unitario} da receita ${n}`} />
                  </div>
                </>
              )}
              <div className="md:col-span-4">
                <label className={rot}>Total da linha</label>
                <p className="px-3 py-2 rounded-lg bg-white border border-gray-100 text-sm font-semibold text-torg-dark tabular-nums" data-testid={`rec-total-${i}`}>{fmtMoeda(totalDaLinha(l))}</p>
              </div>
            </div>
          </div>
        );
      })}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <button type="button" onClick={() => onChange([...linhas, linhaReceitaVazia()])} className="text-xs text-torg-blue hover:underline inline-flex items-center gap-1"><Plus size={13} /> linha de receita</button>
        <p className="text-sm text-torg-gray">Total da receita do aditivo: <span className="font-bold text-torg-dark tabular-nums" data-testid="rec-total">{fmtMoeda(total)}</span></p>
      </div>
      {difere && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-start gap-2">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>A receita ({fmtMoeda(total)}) não bate com o valor do pedido do cliente ({fmtMoeda(pedido)}). Confira antes de criar — a diferença vai aparecer na medição.</span>
        </p>
      )}
    </div>
  );
}
