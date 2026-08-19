"use client";
import { useState } from "react";

// ─────────────────────────────────────────────────────────────────────────────────────────────
// ORÇAMENTO DO COMERCIAL — busca a pasta do orçamento no SharePoint, vincula proposta e estudo,
// e LÊ a planilha de estudo. Vitor (19/08): "o campo para importar isso deve aparecer logo quando
// clicamos no botão de criarmos as OPs".
//
// Vincula pela PASTA do orçamento (não arquivo por arquivo): a estrutura é sempre a mesma
// (5.Estudos / 6.Propostas), então o portal já sugere o estudo (LQC/EPC) e a proposta (PTC) mais
// recentes — e quem cria só confirma. Obra com aditivo tem pasta própria e pode ser vinculada
// depois, na OP.
export default function OrcamentoComercial({ valor, onChange, onPreencher, opId = null, onSalvar = null }) {
  const [busca, setBusca] = useState("");
  const [sugestoes, setSugestoes] = useState(null);
  const [lista, setLista] = useState(null);
  const [docs, setDocs] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [lendo, setLendo] = useState(false);
  const [erro, setErro] = useState("");

  // OP JÁ CRIADA: o portal ranqueia as pastas pelo nome, mas quem confirma é a pessoa —
  // as pastas de um mesmo cliente e obra são quase idênticas (250-25 × 249-26 na DANPOWER).
  const sugerir = async () => {
    setCarregando(true); setErro(""); setSugestoes(null);
    try {
      const r = await fetch(`/api/comercial/orcamento-sharepoint?opId=${encodeURIComponent(opId)}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro ao sugerir");
      setSugestoes(j.sugestoes || []);
    } catch (e) { setErro(e.message); } finally { setCarregando(false); }
  };

  const procurar = async (e) => {
    e?.preventDefault();
    setCarregando(true); setErro(""); setLista(null);
    try {
      const r = await fetch(`/api/comercial/orcamento-sharepoint?q=${encodeURIComponent(busca)}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro ao buscar");
      setLista(j.orcamentos || []);
    } catch (e) { setErro(e.message); } finally { setCarregando(false); }
  };

  const abrir = async (o) => {
    setCarregando(true); setErro(""); setDocs(null);
    try {
      const r = await fetch(`/api/comercial/orcamento-sharepoint?pasta=${encodeURIComponent(o.caminho)}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro ao abrir a pasta");
      setDocs(j);
      const acha = (id, arr) => (id ? arr.find((f) => f.id === id) : null);
      const ptc = acha(j.sugestao?.ptc, j.propostas);
      onChange({
        pasta: o.caminho, ref: o.nome,
        // PTC é técnica e comercial no mesmo documento — entra nos dois campos
        tecnica: acha(j.sugestao?.tecnica, j.propostas) || ptc || null,
        comercial: acha(j.sugestao?.comercial, j.propostas) || ptc || null,
        estudo: acha(j.sugestao?.estudo, j.estudos) || null,
        dados: null,
      });
      setLista(null);
    } catch (e) { setErro(e.message); } finally { setCarregando(false); }
  };

  const lerEstudo = async () => {
    if (!valor.estudo) return;
    setLendo(true); setErro("");
    try {
      const r = await fetch("/api/comercial/ler-estudo-planilha", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: valor.estudo.id, nome: valor.estudo.nome }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Não consegui ler a planilha");
      onChange({ ...valor, dados: j });
    } catch (e) { setErro(e.message); } finally { setLendo(false); }
  };

  const d = valor.dados;
  const fmt = (n) => (n == null ? "—" : Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 0 }));

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h3 className="text-lg font-semibold text-torg-dark">Orçamento do Comercial</h3>
          <p className="text-sm text-torg-gray">Vincula a proposta e o estudo, e traz as quantidades estimadas da planilha.</p>
        </div>
        {valor.pasta && (
          <button type="button" onClick={() => { onChange({ pasta: null, ref: null, tecnica: null, comercial: null, estudo: null, dados: null }); setDocs(null); }}
            className="text-[12px] text-torg-gray hover:text-red-600 underline">trocar orçamento</button>
        )}
      </div>

      {erro && <p className="text-[13px] text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{erro}</p>}

      {!valor.pasta ? (
        <>
          {opId && (
            <div className="flex items-center gap-2 flex-wrap">
              <button type="button" onClick={sugerir} disabled={carregando}
                className="bg-torg-dark text-white text-[12px] font-semibold rounded-lg px-3 py-1.5 disabled:opacity-50">
                {carregando ? "Procurando…" : "Sugerir pelo cliente e obra"}
              </button>
              <span className="text-[11px] text-torg-gray">confira antes: pastas do mesmo cliente são quase iguais</span>
            </div>
          )}
          {sugestoes && (
            sugestoes.length === 0 ? <p className="text-[13px] text-torg-gray">Nenhuma pasta parecida — busque pelo nome.</p> : (
              <div className="border border-gray-100 rounded-lg divide-y divide-gray-100">
                {sugestoes.map((o) => (
                  <button key={o.caminho} type="button" onClick={() => abrir(o)}
                    className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center justify-between gap-3">
                    <span className="text-[13px] font-medium text-torg-dark truncate">{o.nome}</span>
                    <span className={`text-[11px] shrink-0 ${o.score >= 80 ? "text-emerald-700" : "text-amber-700"}`}>{o.score}% parecido</span>
                  </button>
                ))}
              </div>
            )
          )}
          <div className="flex gap-2">
            <input value={busca} onChange={(e) => setBusca(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") procurar(e); }}
              placeholder="Buscar por cliente, obra ou número (ex: danpower, 249)"
              className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            <button type="button" onClick={procurar} disabled={carregando}
              className="bg-torg-blue text-white text-sm font-semibold rounded-lg px-4 py-2 disabled:opacity-50">
              {carregando ? "Buscando…" : "Buscar"}
            </button>
          </div>
          {lista && (
            lista.length === 0 ? <p className="text-[13px] text-torg-gray">Nenhum orçamento encontrado.</p> : (
              <div className="border border-gray-100 rounded-lg divide-y divide-gray-100 max-h-64 overflow-y-auto">
                {lista.map((o) => (
                  <button key={o.caminho} type="button" onClick={() => abrir(o)}
                    className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center justify-between gap-3">
                    <span className="text-[13px] font-medium text-torg-dark truncate">{o.nome}</span>
                    <span className="text-[11px] text-torg-gray shrink-0">{o.ano.replace(/^OR[ÇC]AMENTOS[_ ]/i, "")} · {o.fase.replace(/^\d+\.\s*/, "")}</span>
                  </button>
                ))}
              </div>
            )
          )}
        </>
      ) : (
        <div className="space-y-3">
          <p className="text-[13px]"><b className="text-torg-blue">{valor.ref}</b></p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[["Proposta técnica", "tecnica", docs?.propostas], ["Proposta comercial", "comercial", docs?.propostas], ["Planilha de estudo", "estudo", docs?.estudos]].map(([rot, campo, opcoes]) => (
              <div key={campo}>
                <label className="block text-[12px] font-medium text-torg-dark mb-1">{rot}</label>
                <select value={valor[campo]?.id || ""} onChange={(e) => {
                    const f = (opcoes || []).find((x) => x.id === e.target.value) || null;
                    onChange({ ...valor, [campo]: f, ...(campo === "estudo" ? { dados: null } : {}) });
                  }}
                  className="w-full border border-gray-200 rounded-lg px-2 py-2 text-[12px]">
                  <option value="">— não vincular —</option>
                  {(opcoes || []).map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
                </select>
              </div>
            ))}
          </div>
          {valor.tecnica && valor.comercial && valor.tecnica.id === valor.comercial.id && (
            <p className="text-[11px] text-torg-gray">Técnica e comercial no mesmo documento (PTC).</p>
          )}

          {valor.estudo && !d && (
            <button type="button" onClick={lerEstudo} disabled={lendo}
              className="bg-torg-dark text-white text-sm font-semibold rounded-lg px-4 py-2 disabled:opacity-50">
              {lendo ? "Lendo a planilha…" : "Ler o estudo"}
            </button>
          )}

          {onSalvar && valor.pasta && (
            <button type="button" onClick={() => onSalvar(valor)}
              className="bg-torg-blue text-white text-sm font-semibold rounded-lg px-4 py-2">
              Salvar vínculo na OP
            </button>
          )}

          {d && (
            <div className="bg-blue-50/60 border border-blue-100 rounded-lg p-4 space-y-3">
              <p className="text-[12px] font-semibold text-torg-blue">
                Estudo lido ({d.modelo}) — estimativa do Comercial
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[13px]">
                <div><p className="text-torg-gray text-[11px]">Aço</p><p className="font-bold">{fmt(d.aco?.pesoKg)} kg</p></div>
                <div><p className="text-torg-gray text-[11px]">Área de pintura</p><p className="font-bold">{fmt(d.aco?.areaPinturaM2)} m²</p></div>
                <div><p className="text-torg-gray text-[11px]">Tinta</p><p className="font-bold">{fmt((d.pintura?.itens || []).reduce((a, x) => a + (x.litros || 0), 0))} L</p></div>
                <div><p className="text-torg-gray text-[11px]">Áreas da obra</p><p className="font-bold">{d.aco?.itens?.length || d.aco?.perfis?.length || 0}</p></div>
              </div>
              {(d.familias?.familias || []).length > 0 && (
                <div>
                  <p className="text-[11px] text-torg-gray mb-1">Famílias do orçamento</p>
                  <div className="flex flex-wrap gap-1.5">
                    {d.familias.familias.map((f) => (
                      <span key={f.nome} className="text-[11px] bg-white border border-blue-200 rounded-lg px-2 py-1">
                        <b>{f.nome}</b> {fmt(f.total)} {f.unidade}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {d.faltando?.length > 0 && (
                <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                  Não consegui ler: {d.faltando.join(" · ")} — o resto foi importado.
                </p>
              )}
              {onPreencher && (d.aco?.itens?.[0]?.area || valor.ref) && (
                <button type="button"
                  onClick={() => onPreencher({ obra: d.aco?.itens?.[0]?.area || "", descricao: (d.familias?.familias || []).map((f) => `${f.nome}: ${fmt(f.total)} ${f.unidade}`).join(" · ") })}
                  className="text-[12px] font-semibold text-torg-blue underline">
                  usar isto para preencher obra e descrição
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
