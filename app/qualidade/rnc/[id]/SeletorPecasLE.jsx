"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import { Loader2, Search, Plus, Trash2, AlertCircle, X } from "lucide-react";

const kg = (v) => `${Number(v || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} kg`;

/**
 * Escolhe as peças da RNC na LISTA DE EXPEDIÇÃO da obra — com peso e quantidade.
 *
 * Vitor (27/08/2026): "com base na lista LE trazer as marcas e deixar selecionar as peças e trazer
 * as informações dela e o peso, assim como deixar eu selecionar a quantidade. Preciso dessa
 * informação para poder calcular os retrabalhos gerados pelos setores".
 *
 * ⚠⚠ O PESO DEIXA DE SER DIGITADO. Antes o campo era texto livre ("T36F186 / T36F199 / …") e o peso
 * saía de um palpite que casava marca por marca no cadastro, UMA unidade cada: duas peças iguais
 * contavam uma, marca escrita diferente não casava e ninguém conseguia conferir de onde veio o
 * número que vira INDICADOR. Aqui cada peça vem da lista da obra e a quantidade é escolhida — o
 * peso é uma soma auditável.
 *
 * ⚠ O TEXTO LIVRE CONTINUA. Nem toda RNC é de peça da LE (matéria-prima, documento, serviço) — e
 * obra antiga não tem lista importada. Some a seleção, fica o campo de sempre.
 */
export default function SeletorPecasLE({ rncId, pecas, onChange, textoLivre, onTextoLivre }) {
  const [aberto, setAberto] = useState(false);
  const [d, setD] = useState(null);
  const [erro, setErro] = useState("");
  const [busca, setBusca] = useState("");
  const [carregando, setCarregando] = useState(false);

  const lista = useMemo(() => (Array.isArray(pecas) ? pecas : []), [pecas]);
  const total = useMemo(
    () => lista.reduce((s, p) => s + (Number(p.pesoKg) || (Number(p.qtd) || 0) * (Number(p.pesoUnitKg) || 0)), 0),
    [lista],
  );

  const carregar = useCallback(async () => {
    setCarregando(true); setErro("");
    try {
      const r = await fetch(`/api/qualidade/rnc/${rncId}/pecas`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Não consegui ler a lista da obra.");
      setD(j);
    } catch (e) { setErro(e.message); } finally { setCarregando(false); }
  }, [rncId]);
  useEffect(() => { if (aberto && !d) carregar(); }, [aberto, d, carregar]);

  const add = (p) => {
    if (lista.some((x) => String(x.marca).toUpperCase() === String(p.marca).toUpperCase())) return;
    onChange([...lista, {
      marca: p.marca, descricao: p.descricao || null, perfil: p.perfil || null, material: p.material || null,
      pesoUnitKg: p.pesoUnitKg ?? null, qtd: 1,
      pesoKg: p.pesoUnitKg != null ? Math.round(p.pesoUnitKg * 100) / 100 : null,
    }]);
  };
  const setQtd = (i, v) => {
    const qtd = Math.max(0, Number(v) || 0);
    onChange(lista.map((p, j) => (j === i
      ? { ...p, qtd, pesoKg: p.pesoUnitKg != null ? Math.round(qtd * p.pesoUnitKg * 100) / 100 : p.pesoKg }
      : p)));
  };

  const filtradas = (d?.pecas || []).filter((p) => {
    if (!busca.trim()) return true;
    const q = busca.trim().toLowerCase();
    return `${p.marca} ${p.descricao || ""} ${p.perfil || ""}`.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-2">
      {lista.length > 0 && (
        <div className="border border-gray-200 rounded-lg divide-y divide-gray-50">
          {lista.map((p, i) => (
            <div key={p.marca} className="flex items-center gap-2 px-2.5 py-1.5 text-[12px]">
              <span className="font-semibold text-torg-dark w-28 truncate" title={p.marca}>{p.marca}</span>
              <span className="text-torg-gray flex-1 truncate" title={`${p.descricao || ""} ${p.perfil || ""}`}>
                {p.descricao || p.perfil || "—"}{p.material ? ` · ${p.material}` : ""}
              </span>
              <input type="number" min="0" step="1" value={p.qtd ?? 1} onChange={(e) => setQtd(i, e.target.value)}
                title="Quantidade retrabalhada" className="w-16 text-[12px] border border-gray-200 rounded px-1.5 py-1 text-center" />
              <span className="text-torg-gray-light w-20 text-right">
                {p.pesoUnitKg != null ? `${p.pesoUnitKg.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} kg/un` : "sem peso"}
              </span>
              <span className="font-semibold text-torg-dark w-24 text-right">{kg(p.pesoKg ?? (p.qtd || 0) * (p.pesoUnitKg || 0))}</span>
              <button onClick={() => onChange(lista.filter((_, j) => j !== i))} className="text-torg-gray-light hover:text-red-600"><Trash2 size={13} /></button>
            </div>
          ))}
          <div className="flex items-center justify-end gap-2 px-2.5 py-1.5 bg-gray-50 text-[12px]">
            <span className="text-torg-gray">{lista.length} peça(s) ·</span>
            <span className="font-bold text-torg-dark">{kg(total)}</span>
            {/* ⚠ peça sem peso no cadastro não some: aparece aqui, senão o total mente por omissão */}
            {lista.some((p) => p.pesoUnitKg == null) && (
              <span className="text-amber-700 inline-flex items-center gap-1"><AlertCircle size={12} /> alguma sem peso no cadastro</span>
            )}
          </div>
        </div>
      )}

      {!aberto ? (
        <div className="flex items-center gap-3 flex-wrap">
          <button type="button" onClick={() => setAberto(true)}
            className="text-[12px] font-semibold text-torg-blue border border-torg-blue-300 rounded-lg px-2.5 py-1 hover:bg-torg-blue-50 inline-flex items-center gap-1.5">
            <Plus size={12} /> escolher peças da lista de expedição
          </button>
          {!lista.length && (
            <input value={textoLivre || ""} onChange={(e) => onTextoLivre(e.target.value)}
              placeholder="ou escreva o desenho / projeto / marca" className="inp flex-1 min-w-[12rem]" />
          )}
        </div>
      ) : (
        <div className="border border-torg-blue-200 rounded-lg p-2.5 space-y-2 bg-torg-blue-50/30">
          <div className="flex items-center gap-2">
            <Search size={13} className="text-torg-gray-light shrink-0" />
            <input autoFocus value={busca} onChange={(e) => setBusca(e.target.value)}
              placeholder="marca ou descrição" className="inp flex-1" />
            <button type="button" onClick={() => setAberto(false)} className="text-torg-gray"><X size={14} /></button>
          </div>
          {erro && <p className="text-[12px] text-amber-700 inline-flex items-start gap-1.5"><AlertCircle size={13} className="mt-0.5 shrink-0" /> {erro}</p>}
          {carregando && <p className="text-[12px] text-torg-gray inline-flex items-center gap-2"><Loader2 size={13} className="animate-spin" /> lendo a lista…</p>}
          {d && (
            <>
              <p className="text-[11px] text-torg-gray">
                OP-{d.op?.numero} · {d.total} marca(s) na lista de expedição{busca.trim() ? ` · ${filtradas.length} encontrada(s)` : ""}
              </p>
              <div className="max-h-56 overflow-y-auto border border-gray-100 rounded bg-white divide-y divide-gray-50">
                {filtradas.slice(0, 200).map((p) => {
                  const ja = lista.some((x) => String(x.marca).toUpperCase() === String(p.marca).toUpperCase());
                  return (
                    <button type="button" key={p.marca} onClick={() => add(p)} disabled={ja}
                      className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-[12px] text-left ${ja ? "opacity-40" : "hover:bg-torg-blue-50/60"}`}>
                      <span className="font-semibold text-torg-dark w-28 truncate">{p.marca}</span>
                      <span className="text-torg-gray flex-1 truncate">{p.descricao || p.perfil || "—"}</span>
                      <span className="text-torg-gray-light shrink-0">{p.qteTotal} un na obra</span>
                      <span className="text-torg-dark w-20 text-right shrink-0">
                        {p.pesoUnitKg != null ? `${p.pesoUnitKg.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} kg/un` : "—"}
                      </span>
                    </button>
                  );
                })}
                {!filtradas.length && <p className="px-2.5 py-3 text-[12px] text-torg-gray text-center">Nada encontrado nesta obra.</p>}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
