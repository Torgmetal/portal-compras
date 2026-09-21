"use client";
import { Plus, Trash2 } from "lucide-react";
import { termosEfetivos } from "@/lib/referencias-cliente";

// Editor das referências do cliente — os PAPÉIS são fixos, as PALAVRAS vêm do dicionário do
// cliente (`termos`): para a TMSA aparece "TPR / OC / ETC / TAG", para a Marko "AF", para quem não
// tem dicionário "Projeto / Pedido". Vitor (16/09/2026). Ver lib/referencias-cliente.js.
//
// `valor` = { projetos: "TPR00751" (texto, um por linha), pedidos: [{ codigo, descricao, valor, data,
// revisao, itens: "texto", tags: "texto" }], outros: [{ rotulo, codigo }] } — texto cru, quem
// planifica é o servidor (planificarReferencias).
//
// `modo="aditivo"`: um pedido só, sem projeto/outros — o aditivo é o pedido novo do cliente.
export const REFERENCIAS_VAZIAS = { projetos: "", pedidos: [], outros: [] };
export const pedidoVazio = () => ({ codigo: "", descricao: "", valor: "", data: "", revisao: "", itens: "", tags: "" });

const campo = "w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue";
const rot = "block text-[11px] font-medium text-torg-gray mb-1";

export default function ReferenciasClienteEditor({ termos, valor, onChange, modo = "op" }) {
  const t = termosEfetivos(termos);
  const v = { ...REFERENCIAS_VAZIAS, ...(valor || {}) };
  const set = (k, x) => onChange({ ...v, [k]: x });
  const setPedido = (i, k, x) => set("pedidos", v.pedidos.map((p, idx) => (idx === i ? { ...p, [k]: x } : p)));
  const pedidos = modo === "aditivo" ? [v.pedidos[0] || pedidoVazio()] : v.pedidos;

  return (
    <div className="space-y-4">
      {modo !== "aditivo" && t.projeto.ativo && (
        <div>
          <label className={rot}>{t.projeto.rotulo} <span className="font-normal">— {t.projeto.exemplo}</span></label>
          <input className={campo} value={v.projetos} onChange={(e) => set("projetos", e.target.value)} placeholder={`ex.: ${t.projeto.exemplo}`} />
          <p className="text-[10px] text-torg-gray mt-1">Mais de um? Separe por vírgula.</p>
        </div>
      )}

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold text-torg-dark uppercase tracking-wider">{t.pedido.rotulo}{modo === "aditivo" ? " do aditivo" : "s do cliente"}</p>
          {modo !== "aditivo" && (
            <button type="button" onClick={() => set("pedidos", [...v.pedidos, pedidoVazio()])}
              className="text-xs text-torg-blue hover:underline inline-flex items-center gap-1"><Plus size={13} /> {t.pedido.rotulo}</button>
          )}
        </div>
        {pedidos.length === 0 && <p className="text-xs text-torg-gray">Nenhum {t.pedido.rotulo.toLowerCase()} informado ainda — pode preencher depois na aba Obra.</p>}
        {pedidos.map((p, i) => (
          <div key={i} className="rounded-lg border border-gray-200 p-3 space-y-2 bg-gray-50/40">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-2">
              <div className="md:col-span-3">
                <label className={rot}>{t.pedido.rotulo} nº</label>
                <input className={campo} value={p.codigo} onChange={(e) => (modo === "aditivo" ? onChange({ ...v, pedidos: [{ ...p, codigo: e.target.value }] }) : setPedido(i, "codigo", e.target.value))} placeholder={t.pedido.exemplo} />
              </div>
              <div className="md:col-span-5">
                <label className={rot}>Descrição</label>
                <input className={campo} value={p.descricao} onChange={(e) => (modo === "aditivo" ? onChange({ ...v, pedidos: [{ ...p, descricao: e.target.value }] }) : setPedido(i, "descricao", e.target.value))} placeholder="o que o pedido cobre" />
              </div>
              <div className="md:col-span-2">
                <label className={rot}>Valor (R$)</label>
                <input className={campo} value={p.valor} onChange={(e) => (modo === "aditivo" ? onChange({ ...v, pedidos: [{ ...p, valor: e.target.value }] }) : setPedido(i, "valor", e.target.value))} placeholder="0,00" inputMode="decimal" />
              </div>
              <div className="md:col-span-2">
                <label className={rot}>Data</label>
                <input type="date" className={campo} value={p.data || ""} onChange={(e) => (modo === "aditivo" ? onChange({ ...v, pedidos: [{ ...p, data: e.target.value }] }) : setPedido(i, "data", e.target.value))} />
              </div>
            </div>
            {(t.item.ativo || t.tag.ativo) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {t.item.ativo && (
                  <div>
                    <label className={rot}>{t.item.rotulo} <span className="font-normal">— um por linha ou separados por vírgula</span></label>
                    <textarea rows={2} className={campo} value={p.itens} onChange={(e) => (modo === "aditivo" ? onChange({ ...v, pedidos: [{ ...p, itens: e.target.value }] }) : setPedido(i, "itens", e.target.value))} placeholder={t.item.exemplo} />
                  </div>
                )}
                {t.tag.ativo && (
                  <div>
                    <label className={rot}>{t.tag.rotulo} <span className="font-normal">— um por linha ou separados por vírgula</span></label>
                    <textarea rows={2} className={campo} value={p.tags} onChange={(e) => (modo === "aditivo" ? onChange({ ...v, pedidos: [{ ...p, tags: e.target.value }] }) : setPedido(i, "tags", e.target.value))} placeholder={t.tag.exemplo} />
                  </div>
                )}
              </div>
            )}
            {modo !== "aditivo" && (
              <div className="flex justify-end">
                <button type="button" onClick={() => set("pedidos", v.pedidos.filter((_, idx) => idx !== i))} className="text-xs text-red-500 hover:underline inline-flex items-center gap-1"><Trash2 size={12} /> remover</button>
              </div>
            )}
          </div>
        ))}
      </div>

      {modo !== "aditivo" && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold text-torg-dark uppercase tracking-wider">Outros códigos <span className="font-normal normal-case">(TDR, CNO, contrato…)</span></p>
            <button type="button" onClick={() => set("outros", [...v.outros, { rotulo: "", codigo: "" }])} className="text-xs text-torg-blue hover:underline inline-flex items-center gap-1"><Plus size={13} /> código</button>
          </div>
          {v.outros.map((o, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-center">
              <input className={`${campo} col-span-3`} value={o.rotulo} onChange={(e) => set("outros", v.outros.map((x, idx) => (idx === i ? { ...x, rotulo: e.target.value } : x)))} placeholder="rótulo (ex.: CNO)" />
              <input className={`${campo} col-span-8`} value={o.codigo} onChange={(e) => set("outros", v.outros.map((x, idx) => (idx === i ? { ...x, codigo: e.target.value } : x)))} placeholder="código" />
              <button type="button" onClick={() => set("outros", v.outros.filter((_, idx) => idx !== i))} className="col-span-1 text-red-500 flex justify-center"><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Do que a API devolve (árvore com ids) para o que o editor edita (texto cru). */
export function arvoreParaEditor(arvore) {
  if (!arvore) return { ...REFERENCIAS_VAZIAS };
  const lista = (xs) => (xs || []).map((x) => x.codigo).join("\n");
  return {
    projetos: (arvore.projetos || []).map((p) => p.codigo).join(", "),
    pedidos: (arvore.pedidos || []).map((p) => ({
      codigo: p.codigo || "", descricao: p.descricao || "", valor: p.valor ?? "", data: p.data ? String(p.data).slice(0, 10) : "",
      revisao: p.revisao || "", itens: lista(p.itens), tags: lista(p.tags),
    })),
    outros: (arvore.outros || []).map((o) => ({ rotulo: o.rotulo || "", codigo: o.codigo || "" })),
  };
}
