"use client";
import { useEffect, useState } from "react";
import { Loader2, Paintbrush, Pencil, Check, X } from "lucide-react";
import { METODOS_PREPARO, PLP_PADRAO, resumoPlp } from "@/lib/plp";
import { GRAUS_LIMPEZA, METODOS_APLICACAO } from "@/lib/pintura-campos";

// ─── O PLP DA OBRA, DENTRO DO RELATÓRIO ───────────────────────────────────────
// Vitor (22/08/2026): "aqui já não podemos deixar definido? puxando do PLP de cada
// obra"; "poderia deixar isso mais dinâmico e rápido, para apenas preencher os
// valores encontrados".
//
// O PLP mora aqui, e não numa tela distante, porque é aqui que se descobre que ele
// falta: o inspetor abre o relatório, vê os campos especificados em branco, define o
// plano uma vez e todo relatório de pintura daquela obra passa a nascer preenchido.
//
// ⚠ Definir o PLP não reescreve relatório já criado — cada um guarda o que estava
// especificado no dia. Ver o comentário de camposDoRelatorioPintura em lib/plp.js.

const N = ["1ª", "2ª", "3ª"];

export default function PlpPainel({ opNumero, podeEditar, onTintas }) {
  const [dados, setDados] = useState(null);
  const [editando, setEditando] = useState(false);
  const [f, setF] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    fetch(`/api/qualidade/plp/${encodeURIComponent(opNumero)}`)
      .then((r) => r.json())
      .then((j) => { setDados(j); onTintas?.(j.tintas || []); })
      .catch(() => setDados({ plp: null, tintas: [] }));
  }, [opNumero, onTintas]);

  function abrir() {
    const p = dados?.plp;
    setF({
      revisao: p?.revisao || "",
      preparoMetodo: p?.preparoMetodo || PLP_PADRAO.preparoMetodo,
      grauLimpeza: p?.grauLimpeza || PLP_PADRAO.grauLimpeza,
      abrasivo: p?.abrasivo || "",
      rugosidadeMin: p?.rugosidadeMin ?? PLP_PADRAO.rugosidadeMin,
      rugosidadeMax: p?.rugosidadeMax ?? PLP_PADRAO.rugosidadeMax,
      metodoAplicacao: p?.metodoAplicacao || "",
      espessuraTotal: p?.espessuraTotal ?? "",
      demaos: N.map((_, i) => {
        const d = (p?.demaos || [])[i] || {};
        return { ordem: i + 1, nome: `${N[i]} demão`, produto: d.produto || "", fabricante: d.fabricante || "", cor: d.cor || "", espessuraMin: d.espessuraMin ?? "" };
      }),
      observacoes: p?.observacoes || "",
    });
    setEditando(true);
  }

  async function salvar() {
    setSalvando(true); setErro("");
    try {
      const r = await fetch(`/api/qualidade/plp/${encodeURIComponent(opNumero)}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        // demão sem produto não vira linha do esquema — plano com três demãos vazias
        // é pior que plano nenhum: parece definido e não define nada
        body: JSON.stringify({ ...f, demaos: f.demaos.filter((d) => d.produto || d.espessuraMin) }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Falha ao salvar");
      setDados((d) => ({ ...d, plp: j.plp, temPlp: true }));
      setEditando(false);
    } catch (e) { setErro(e.message); } finally { setSalvando(false); }
  }

  if (!dados) return <p className="text-[11px] text-torg-gray inline-flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> carregando o PLP…</p>;

  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const setD = (i, k, v) => setF((p) => ({ ...p, demaos: p.demaos.map((d, j) => (j === i ? { ...d, [k]: v } : d)) }));
  const Inp = ({ v, on, ph = "", tipo = "text", w = "" }) => (
    <input type={tipo} value={v ?? ""} placeholder={ph} onChange={(e) => on(e.target.value)}
      className={`text-[12px] border border-gray-200 rounded-lg px-2 py-1.5 focus:border-torg-blue ${w || "w-full"}`} />
  );

  if (!editando) {
    return (
      <div className="flex items-center justify-between gap-3 bg-torg-blue-50 border border-torg-blue-200 rounded-lg px-3 py-2 mb-3">
        <p className="text-[12px] text-torg-dark min-w-0">
          <Paintbrush size={13} className="inline mr-1.5 text-torg-blue" />
          <span className="font-semibold">Plano de Pintura (PLP)</span>
          <span className="text-torg-gray"> — {resumoPlp(dados.plp)}</span>
          {!dados.plp && <span className="block text-[11px] text-amber-700 mt-0.5">Sem PLP, os campos especificados nascem em branco em todo relatório desta obra.</span>}
        </p>
        {podeEditar && (
          <button onClick={abrir} className="text-[11px] font-semibold text-torg-blue border border-torg-blue-300 rounded-lg px-2.5 py-1 hover:bg-white inline-flex items-center gap-1 shrink-0">
            <Pencil size={11} /> {dados.plp ? "Editar" : "Definir"}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white border border-torg-blue-200 rounded-xl p-3 mb-3 shadow-sm">
      <p className="text-[12px] font-bold text-torg-dark mb-2 flex items-center gap-1.5"><Paintbrush size={13} className="text-torg-blue" /> Plano de Pintura da OP-{opNumero}</p>
      {erro && <p className="text-[11px] text-red-600 mb-2">{erro}</p>}

      <div className="grid sm:grid-cols-4 gap-2 mb-2">
        <label className="block"><span className="block text-[10px] font-semibold text-torg-gray mb-0.5">Revisão do PLP</span><Inp v={f.revisao} on={(v) => set("revisao", v)} ph="R0" /></label>
        <label className="block"><span className="block text-[10px] font-semibold text-torg-gray mb-0.5">Método de preparo</span>
          <select value={f.preparoMetodo} onChange={(e) => set("preparoMetodo", e.target.value)} className="w-full text-[12px] border border-gray-200 rounded-lg px-2 py-1.5">
            {METODOS_PREPARO.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>
        <label className="block"><span className="block text-[10px] font-semibold text-torg-gray mb-0.5">Grau de limpeza</span>
          <select value={f.grauLimpeza} onChange={(e) => set("grauLimpeza", e.target.value)} className="w-full text-[12px] border border-gray-200 rounded-lg px-2 py-1.5">
            {GRAUS_LIMPEZA.map((g) => <option key={g.id} value={g.id}>{g.nome}</option>)}
          </select>
        </label>
        <label className="block"><span className="block text-[10px] font-semibold text-torg-gray mb-0.5">Tipo de abrasivo</span><Inp v={f.abrasivo} on={(v) => set("abrasivo", v)} ph="granalha de aço" /></label>
        <label className="block"><span className="block text-[10px] font-semibold text-torg-gray mb-0.5">Rugosidade mín. (µm)</span><Inp tipo="number" v={f.rugosidadeMin} on={(v) => set("rugosidadeMin", v)} /></label>
        <label className="block"><span className="block text-[10px] font-semibold text-torg-gray mb-0.5">Rugosidade máx. (µm)</span><Inp tipo="number" v={f.rugosidadeMax} on={(v) => set("rugosidadeMax", v)} /></label>
        <label className="block"><span className="block text-[10px] font-semibold text-torg-gray mb-0.5">Método de aplicação</span>
          <select value={f.metodoAplicacao} onChange={(e) => set("metodoAplicacao", e.target.value)} className="w-full text-[12px] border border-gray-200 rounded-lg px-2 py-1.5">
            <option value="">—</option>
            {METODOS_APLICACAO.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>
        <label className="block"><span className="block text-[10px] font-semibold text-torg-gray mb-0.5">Espessura total (µm)</span><Inp tipo="number" v={f.espessuraTotal} on={(v) => set("espessuraTotal", v)} ph="soma das demãos" /></label>
      </div>

      <p className="text-[11px] font-semibold text-torg-gray mb-1">Esquema de pintura</p>
      <div className="space-y-1.5 mb-2">
        {f.demaos.map((d, i) => (
          <div key={i} className="grid sm:grid-cols-5 gap-2 items-center">
            <span className="text-[11px] font-semibold text-torg-dark">{N[i]} demão</span>
            {/* a tinta pode vir do CMR: escolher preenche produto e fabricante de uma vez */}
            <select value="" onChange={(e) => {
              const t = (dados.tintas || []).find((x) => x.id === e.target.value);
              if (t) { setD(i, "produto", t.produto); if (t.fabricante) setD(i, "fabricante", t.fabricante); }
            }} className="text-[12px] border border-gray-200 rounded-lg px-2 py-1.5 text-torg-gray">
              <option value="">tinta do CMR…</option>
              {(dados.tintas || []).map((t) => <option key={t.id} value={t.id}>{t.produto}</option>)}
            </select>
            <Inp v={d.produto} on={(v) => setD(i, "produto", v)} ph="produto / norma" />
            <Inp v={d.fabricante} on={(v) => setD(i, "fabricante", v)} ph="fabricante" />
            <div className="flex gap-2">
              <Inp v={d.cor} on={(v) => setD(i, "cor", v)} ph="cor" />
              <Inp tipo="number" v={d.espessuraMin} on={(v) => setD(i, "espessuraMin", v)} ph="µm" />
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-end gap-2">
        <button onClick={() => setEditando(false)} className="text-[11px] text-torg-gray border border-gray-300 rounded-lg px-2.5 py-1 hover:bg-gray-50 inline-flex items-center gap-1"><X size={11} /> Cancelar</button>
        <button onClick={salvar} disabled={salvando} className="text-[11px] font-semibold text-white bg-torg-blue rounded-lg px-2.5 py-1 hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-1">
          {salvando ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />} Salvar PLP
        </button>
      </div>
      <p className="text-[10px] text-torg-gray mt-1.5">
        Vale para os PRÓXIMOS relatórios desta obra. Os já criados guardam o que estava especificado no dia.
      </p>
    </div>
  );
}
