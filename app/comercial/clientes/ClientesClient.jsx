"use client";
import { useEffect, useState } from "react";
import { Loader2, Save, Search, Building2 } from "lucide-react";
import { TERMOS_PADRAO } from "@/lib/referencias-cliente";

// Comercial › Clientes — o dicionário de termos de cada cliente (papéis fixos, palavras dele).
// Vitor (16/09/2026): "no caso dos clientes que pedem outras numerações (…) vamos deixar amarrado
// esses termos?" → não. Aqui se diz que a TMSA fala TPR/OC/ETC/TAG e a Marko fala AF.
const PAPEIS = [
  ["projeto", "Projeto / contrato do cliente", "o guarda-chuva: TPR, ENC, obra"],
  ["pedido", "Pedido do cliente", "o que ele emite e o Fiscal fatura: OC, AF, PC"],
  ["item", "Item do pedido", "ETC, item da OC, posição"],
  ["tag", "TAG / equipamento", "TC 8011, SE-001"],
];
const campo = "w-full px-3 py-2 border border-gray-200 rounded-lg text-sm";

export default function ClientesClient() {
  const [dados, setDados] = useState(null);
  const [busca, setBusca] = useState("");
  const [editando, setEditando] = useState(null); // { id?, nome, termos }
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const carregar = () => fetch("/api/comercial/clientes", { cache: "no-store" }).then((r) => r.json()).then(setDados).catch((e) => setErro(e.message));
  useEffect(() => { carregar(); }, []);

  const abrir = (c) => setEditando({ id: c.id || null, nome: c.nome, razaoSocial: c.razaoSocial || "", cnpj: c.cnpj || "", termos: { ...TERMOS_PADRAO, ...(c.termosEfetivos || c.termos || {}) } });
  const setTermo = (papel, k, v) => setEditando((e) => ({ ...e, termos: { ...e.termos, [papel]: { ...e.termos[papel], [k]: v } } }));

  const salvar = async () => {
    setSalvando(true); setErro("");
    try {
      let id = editando.id;
      if (!id) {
        const r = await fetch("/api/comercial/clientes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nome: editando.nome }) });
        const j = await r.json(); if (!r.ok) throw new Error(j.error || "Erro"); id = j.cliente.id;
      }
      const r2 = await fetch("/api/comercial/clientes", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, termos: editando.termos, razaoSocial: editando.razaoSocial || null, cnpj: editando.cnpj || null }) });
      const j2 = await r2.json(); if (!r2.ok) throw new Error(j2.error || "Erro");
      setEditando(null); await carregar();
    } catch (e) { setErro(e.message); }
    finally { setSalvando(false); }
  };

  const lista = [
    ...(dados?.clientes || []).map((c) => ({ ...c, cadastrado: true })),
    ...(dados?.semCadastro || []).map((n) => ({ nome: n, cadastrado: false })),
  ].filter((c) => c.nome.toLowerCase().includes(busca.toLowerCase()));

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-torg-dark flex items-center gap-2"><Building2 size={22} className="text-torg-blue" /> Clientes — termos e referências</h1>
        <p className="text-sm text-torg-gray mt-1">O portal fixa o <b>papel</b> de cada código (projeto, pedido, item, TAG); aqui fica a <b>palavra</b> que cada cliente usa. É o que aparece na criação da OP, na aba Obra e nos documentos enviados a ele.</p>
      </div>
      <div className="relative max-w-sm">
        <Search size={15} className="absolute left-3 top-2.5 text-gray-400" />
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="buscar cliente…" className={`${campo} pl-9`} />
      </div>
      {erro && <p className="text-sm text-red-600">{erro}</p>}
      {!dados ? (
        <p className="text-sm text-torg-gray flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Carregando…</p>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50/60 text-[11px] uppercase tracking-wider text-torg-gray">
              <tr><th className="text-left px-4 py-2">Cliente</th>{PAPEIS.map(([k, r]) => <th key={k} className="text-left px-3 py-2">{r}</th>)}<th className="px-3 py-2"></th></tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {lista.map((c) => {
                const t = c.termosEfetivos || TERMOS_PADRAO;
                return (
                  <tr key={c.id || c.nome} className="hover:bg-gray-50/50">
                    <td className="px-4 py-2 font-medium text-torg-dark">{c.nome}{!c.cadastrado && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-100">sem dicionário</span>}</td>
                    {PAPEIS.map(([k]) => <td key={k} className={`px-3 py-2 ${t[k]?.ativo === false ? "text-gray-300" : "text-torg-dark"}`}>{c.cadastrado ? `${t[k]?.rotulo || "—"}${t[k]?.ativo === false ? " (não usa)" : ""}` : "—"}</td>)}
                    <td className="px-3 py-2 text-right"><button onClick={() => abrir(c)} className="text-xs text-torg-blue font-medium hover:underline">{c.cadastrado ? "Editar" : "Cadastrar termos"}</button></td>
                  </tr>
                );
              })}
              {lista.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-torg-gray">Nenhum cliente encontrado.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {editando && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => !salvando && setEditando(null)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div>
              <h3 className="text-base font-bold text-torg-dark">{editando.nome}</h3>
              <p className="text-xs text-torg-gray">Para cada papel: a palavra que o cliente usa, um exemplo, e se ele usa esse nível.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><label className="text-[11px] font-medium text-torg-gray">Razão social</label><input className={campo} value={editando.razaoSocial} onChange={(e) => setEditando((x) => ({ ...x, razaoSocial: e.target.value }))} /></div>
              <div><label className="text-[11px] font-medium text-torg-gray">CNPJ</label><input className={campo} value={editando.cnpj} onChange={(e) => setEditando((x) => ({ ...x, cnpj: e.target.value }))} /></div>
            </div>
            <div className="space-y-3">
              {PAPEIS.map(([k, rotulo, dica]) => (
                <div key={k} className="rounded-lg border border-gray-100 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-semibold text-torg-dark">{rotulo} <span className="text-[11px] font-normal text-torg-gray">— {dica}</span></p>
                    <label className="text-xs text-torg-gray inline-flex items-center gap-1.5"><input type="checkbox" checked={editando.termos[k]?.ativo !== false} onChange={(e) => setTermo(k, "ativo", e.target.checked)} /> o cliente usa</label>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input className={campo} value={editando.termos[k]?.rotulo || ""} onChange={(e) => setTermo(k, "rotulo", e.target.value)} placeholder="palavra do cliente (ex.: OC)" />
                    <input className={campo} value={editando.termos[k]?.exemplo || ""} onChange={(e) => setTermo(k, "exemplo", e.target.value)} placeholder="exemplo (ex.: 231297-1)" />
                  </div>
                </div>
              ))}
            </div>
            {erro && <p className="text-sm text-red-600">{erro}</p>}
            <div className="flex justify-end gap-2">
              <button onClick={() => setEditando(null)} disabled={salvando} className="px-4 py-2 text-sm rounded-lg border border-gray-200 text-torg-gray">Cancelar</button>
              <button onClick={salvar} disabled={salvando} className="px-4 py-2 text-sm rounded-lg bg-torg-blue text-white font-medium inline-flex items-center gap-2 disabled:opacity-50">{salvando ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Salvar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
