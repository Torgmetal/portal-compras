"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { Loader2, FileSpreadsheet, Plus, Trash2, Save, TrendingDown } from "lucide-react";
import { useStore } from "@/lib/store";
import { CLASSES, PERFIS, FATURAMENTO, ESTRUTURAS, METODOS, DEMAOS, PRE_MONTAGEM, ITENS_COMERCIAIS, TERCEIRIZADOS, CAMADAS_TINTA } from "@/lib/lqc";

const fmtR$ = (v) => `R$ ${Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtKg = (v) => `${Number(v || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} kg`;
const num = (v) => { const n = Number(String(v ?? "").replace(",", ".")); return Number.isFinite(n) ? n : 0; };

// ⚠ AS ABAS SÃO AS DA LQC, NA ORDEM DA LQC. Vitor (22/08/2026): "que você transforme cada aba da
// geração de custo igual está na nossa LQC". Quem orça já sabe onde cada coisa fica; inventar uma
// navegação "melhor" obrigaria a reaprender o que a casa faz há anos — e a conferir contra a
// planilha ficaria impossível.
const ABAS = [
  { k: "RESUMOS", r: "Quantitativo (RESUMOS_EM)" },
  { k: "IND", r: "Industrialização" },
  { k: "TINTAS", r: "MC_TINTAS" },
  { k: "COMERCIAIS", r: "Itens comerciais" },
  { k: "BDI", r: "BDI" },
  { k: "COMERCIAL", r: "Planilha comercial" },
  { k: "CENARIO", r: "Cenário financeiro" },
];

export default function EstudoClient({ id }) {
  const { showToast } = useStore();
  const [d, setD] = useState(null);
  const [aba, setAba] = useState("RESUMOS");
  const [salvando, setSalvando] = useState(false);
  const [sujo, setSujo] = useState(false);
  const timer = useRef(null);

  useEffect(() => {
    fetch(`/api/comercial/estudos/${id}`).then((r) => r.json()).then(setD);
  }, [id]);

  const salvar = useCallback(async (patch) => {
    setSalvando(true);
    try {
      const r = await fetch(`/api/comercial/estudos/${id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro");
      setD((p) => ({ ...p, estudo: j.estudo, resultado: j.resultado, cenario: j.cenario }));
      setSujo(false);
    } catch (e) { showToast(e.message, "error"); } finally { setSalvando(false); }
  }, [id, showToast]);

  // ⚠ salva sozinho, com atraso: composição de custo se mexe campo a campo, e obrigar a clicar
  // "salvar" a cada número é o caminho mais curto pra alguém perder meia hora de trabalho.
  const mexer = useCallback((patch) => {
    setD((p) => ({ ...p, estudo: { ...p.estudo, ...patch } }));
    setSujo(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => salvar(patch), 900);
  }, [salvar]);

  if (!d?.estudo) return <div className="p-6"><Loader2 className="animate-spin text-torg-blue" size={22} /></div>;
  const e = d.estudo, res = d.resultado || {}, c = e.composicao || {};
  const setComp = (patch) => mexer({ composicao: { ...c, ...patch } });
  const codigo = `LQC-${String(e.numero || 0).padStart(3, "0")}-${String(e.ano).slice(-2)}-R${String(e.revisao || 0).padStart(2, "0")}`;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <p className="text-[11px] font-mono font-bold text-torg-blue">{codigo}</p>
          <h1 className="text-xl font-bold text-torg-dark">{e.cliente}{e.obra ? ` · ${e.obra}` : ""}</h1>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-torg-gray">
            {salvando ? <span className="inline-flex items-center gap-1"><Loader2 size={11} className="animate-spin" /> salvando…</span>
              : sujo ? "alterações pendentes" : <span className="inline-flex items-center gap-1"><Save size={11} /> salvo</span>}
          </span>
          <a href={`/api/comercial/estudos/${id}/planilha`}
            className="text-[12px] font-semibold text-white bg-torg-blue hover:bg-torg-dark rounded-lg px-3 py-1.5 inline-flex items-center gap-1.5">
            <FileSpreadsheet size={14} /> Extrair planilha
          </a>
        </div>
      </div>

      {/* barra de resultado — sempre visível, porque é a pergunta que o orçamentista faz */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-px bg-gray-100 border border-gray-100 rounded-xl overflow-hidden mb-5">
        <Kpi r="Peso" v={fmtKg(res.pesoTotal)} />
        <Kpi r="Custo" v={fmtR$(res.custo)} />
        <Kpi r={`BDI ${res.bdiPct || 0}%`} v={fmtR$(res.bdiValor)} />
        <Kpi r="Preço" v={fmtR$(res.preco)} cor="text-torg-blue" />
        <Kpi r="R$/kg" v={fmtR$(res.precoPorKg)} cor="text-green-700" />
      </div>

      <div className="flex flex-wrap gap-1 mb-4 border-b border-gray-100">
        {ABAS.map((a) => (
          <button key={a.k} onClick={() => setAba(a.k)}
            className={`text-[12px] font-semibold px-3 py-2 -mb-px border-b-2 ${aba === a.k ? "border-torg-blue text-torg-blue" : "border-transparent text-torg-gray hover:text-torg-dark"}`}>
            {a.r}
          </button>
        ))}
      </div>

      {aba === "RESUMOS" && <Resumos e={e} c={c} setComp={setComp} mexer={mexer} />}
      {aba === "IND" && <Industrializacao c={c} res={res} setComp={setComp} e={e} mexer={mexer} />}
      {aba === "TINTAS" && <Tintas c={c} setComp={setComp} />}
      {aba === "COMERCIAIS" && <Comerciais c={c} res={res} setComp={setComp} />}
      {aba === "BDI" && <Bdi c={c} res={res} setComp={setComp} />}
      {aba === "COMERCIAL" && <PlanilhaComercial res={res} e={e} />}
      {aba === "CENARIO" && <Cenario e={e} cen={d.cenario} res={res} mexer={mexer} />}
    </div>
  );
}

function Kpi({ r, v, cor }) {
  return (
    <div className="bg-white p-3">
      <p className="text-[10px] font-medium text-torg-gray uppercase tracking-wider">{r}</p>
      <p className={`text-[15px] font-extrabold tabular-nums ${cor || "text-torg-dark"}`}>{v}</p>
    </div>
  );
}

const Inp = (p) => <input {...p} className={`border border-gray-200 rounded px-2 py-1 text-[12px] ${p.className || ""}`} />;
const Sel = ({ opcoes, ...p }) => (
  <select {...p} className={`border border-gray-200 rounded px-2 py-1 text-[12px] bg-white ${p.className || ""}`}>
    <option value="">—</option>
    {opcoes.map((o) => <option key={o} value={o}>{o}</option>)}
  </select>
);

/** RESUMOS_EM — o quantitativo. É daqui que sai o peso por classe e por perfil. */
function Resumos({ e, c, setComp, mexer }) {
  const linhas = Array.isArray(c.resumos) ? c.resumos : [];
  const set = (i, campo, v) => setComp({ resumos: linhas.map((l, j) => (j === i ? { ...l, [campo]: v } : l)) });
  const add = () => setComp({ resumos: [...linhas, { item: `1.${linhas.length + 1}`, metodo: e.metodo || "ESTIMATIVA", un: "unid", quantidade: 1, unidades: 1 }] });
  const del = (i) => setComp({ resumos: linhas.filter((_, j) => j !== i) });

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3 mb-3">
        <label className="text-[11px] font-semibold text-torg-dark">Método
          <Sel value={e.metodo || ""} onChange={(ev) => mexer({ metodo: ev.target.value })} opcoes={METODOS} className="block mt-1" /></label>
        <label className="text-[11px] font-semibold text-torg-dark">Demãos
          <Sel value={e.demaos || ""} onChange={(ev) => mexer({ demaos: ev.target.value })} opcoes={DEMAOS} className="block mt-1" /></label>
        <label className="text-[11px] font-semibold text-torg-dark">Pré-montagem
          <Sel value={e.preMontagem || ""} onChange={(ev) => mexer({ preMontagem: ev.target.value })} opcoes={PRE_MONTAGEM} className="block mt-1" /></label>
        <button onClick={add} className="ml-auto text-[12px] font-semibold text-torg-blue inline-flex items-center gap-1"><Plus size={13} /> linha</button>
      </div>
      <div className="overflow-x-auto bg-white border border-gray-100 rounded-xl">
        <table className="w-full text-[12px]" style={{ minWidth: 1050 }}>
          <thead className="bg-gray-50 text-[10px] uppercase text-torg-gray">
            <tr>{["Item", "Área", "Estrutura", "Elemento", "Classificação", "Un.", "Qtd.", "Unid.", "Peso unit.", "Perfil predominante", "Peso total", ""].map((h) => <th key={h} className="text-left px-2 py-1.5 whitespace-nowrap">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {linhas.map((l, i) => {
              const peso = num(l.quantidade) * num(l.unidades || 1) * num(l.pesoUnit);
              return (
                <tr key={i}>
                  <td className="px-2 py-1"><Inp value={l.item || ""} onChange={(ev) => set(i, "item", ev.target.value)} className="w-14" /></td>
                  <td className="px-2 py-1"><Inp value={l.area || ""} onChange={(ev) => set(i, "area", ev.target.value)} className="w-24" /></td>
                  <td className="px-2 py-1"><Sel value={l.estrutura || ""} onChange={(ev) => set(i, "estrutura", ev.target.value)} opcoes={ESTRUTURAS} className="w-40" /></td>
                  <td className="px-2 py-1"><Inp value={l.elemento || ""} onChange={(ev) => set(i, "elemento", ev.target.value)} className="w-32" /></td>
                  <td className="px-2 py-1"><Sel value={l.classificacao || ""} onChange={(ev) => set(i, "classificacao", ev.target.value)} opcoes={CLASSES.map((x) => x.nome.toUpperCase())} className="w-32" /></td>
                  <td className="px-2 py-1"><Inp value={l.un || ""} onChange={(ev) => set(i, "un", ev.target.value)} className="w-14" /></td>
                  <td className="px-2 py-1"><Inp value={l.quantidade ?? ""} onChange={(ev) => set(i, "quantidade", ev.target.value)} className="w-20 text-right" /></td>
                  <td className="px-2 py-1"><Inp value={l.unidades ?? ""} onChange={(ev) => set(i, "unidades", ev.target.value)} className="w-16 text-right" /></td>
                  <td className="px-2 py-1"><Inp value={l.pesoUnit ?? ""} onChange={(ev) => set(i, "pesoUnit", ev.target.value)} className="w-24 text-right" /></td>
                  <td className="px-2 py-1"><Sel value={l.perfil || ""} onChange={(ev) => set(i, "perfil", ev.target.value)} opcoes={PERFIS.map((p) => p.nome)} className="w-40" /></td>
                  <td className="px-2 py-1 text-right tabular-nums font-semibold whitespace-nowrap">{fmtKg(peso)}</td>
                  <td className="px-2 py-1"><button onClick={() => del(i)} className="text-gray-300 hover:text-red-600"><Trash2 size={13} /></button></td>
                </tr>
              );
            })}
            {!linhas.length && <tr><td colSpan={12} className="px-3 py-6 text-center text-torg-gray">Sem linhas. O peso da obra entra aqui.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** INDUSTRIALIZAÇÃO — faturamento por grupo, preços de entrada e o quadro calculado. */
function Industrializacao({ c, res, setComp }) {
  const fat = c.faturamento || {};
  const setFat = (k, v) => setComp({ faturamento: { ...fat, [k]: v } });
  const g = res.grupos || {};
  const grupos = [
    ["1.1 MATÉRIA PRIMA", "materiaPrima", g.materiaPrima],
    ["1.2 FIXADORES", "fixadores", g.fixadores],
    ["1.3 TINTAS", "tintas", g.tintas],
    ["3.1 FABRICAÇÃO", "fabricacao", g.fabricacao],
    ["3.2 PINTURA", "pintura", g.pintura],
    ["3.3 PRÉ-MONTAGEM", "preMontagem", g.preMontagem],
  ];
  return (
    <div className="space-y-4">
      {/* ⚠ o faturamento não é rótulo: na LQC, ICMS e PIS/COFINS só entram quando é TORG.
          Material que o cliente compra direto não passa pelo nosso faturamento. */}
      <div className="bg-white border border-gray-100 rounded-xl p-4">
        <p className="text-[12px] font-bold text-torg-dark mb-1">Faturamento por grupo</p>
        <p className="text-[11px] text-torg-gray mb-3">TORG = passa pelo nosso faturamento e carrega ICMS e PIS/COFINS. DIRETO = o cliente compra do fornecedor.</p>
        <div className="grid sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {[["materiaPrima", "Matéria-prima"], ["fixadores", "Fixadores"], ["tintas", "Tintas"], ["fabricacao", "Fabricação"], ["pintura", "Pintura"], ["preMontagem", "Pré-montagem"], ...TERCEIRIZADOS.map((t) => [t.key, t.nome])].map(([k, r]) => (
            <label key={k} className="text-[11px] text-torg-dark">{r}
              <Sel value={fat[k] || ""} onChange={(ev) => setFat(k, ev.target.value)} opcoes={FATURAMENTO} className="block mt-1 w-full" /></label>
          ))}
        </div>
      </div>

      <div className="bg-white border border-gray-100 rounded-xl p-4">
        <p className="text-[12px] font-bold text-torg-dark mb-3">Preços que a planilha não calcula</p>
        <div className="grid sm:grid-cols-3 lg:grid-cols-4 gap-3">
          <label className="text-[11px] text-torg-dark">Fixadores (R$/kg)
            <Inp value={c.fixadoresRsKg ?? ""} onChange={(ev) => setComp({ fixadoresRsKg: ev.target.value })} className="block mt-1 w-full" /></label>
          {TERCEIRIZADOS.map((t) => (
            <label key={t.key} className="text-[11px] text-torg-dark">{t.nome} (R$/kg)
              <Inp value={c.terceirizados?.[t.key]?.precoKg ?? ""}
                onChange={(ev) => setComp({ terceirizados: { ...(c.terceirizados || {}), [t.key]: { precoKg: ev.target.value } } })}
                className="block mt-1 w-full" /></label>
          ))}
        </div>
      </div>

      {grupos.filter(([, , grp]) => grp?.linhas?.some((l) => l.pesoKg > 0 || l.subtotal > 0)).map(([rot, , grp]) => (
        <Quadro key={rot} titulo={rot} grupo={grp} />
      ))}
      {res.grupos?.terceirizados?.total?.subtotal > 0 && <Quadro titulo="2. MÃO DE OBRA TERCEIRIZADA" grupo={res.grupos.terceirizados} />}
    </div>
  );
}

function Quadro({ titulo, grupo }) {
  return (
    <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
      <p className="text-[12px] font-bold text-torg-dark px-4 py-2 bg-gray-50">{titulo}</p>
      <table className="w-full text-[12px]">
        <thead className="text-[10px] uppercase text-torg-gray">
          <tr><th className="text-left px-4 py-1.5">Descrição</th><th className="text-left px-2 py-1.5">Espec.</th>
            <th className="text-right px-2 py-1.5">Peso</th><th className="text-right px-2 py-1.5">R$/kg</th>
            <th className="text-right px-2 py-1.5">Subtotal</th><th className="text-right px-2 py-1.5">ICMS</th><th className="text-right px-4 py-1.5">PIS/COFINS</th></tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {grupo.linhas.filter((l) => l.pesoKg > 0 || l.subtotal > 0).map((l, i) => (
            <tr key={i}>
              <td className="px-4 py-1">{l.nome}</td><td className="px-2 py-1 text-torg-gray">{l.espec || "—"}</td>
              <td className="px-2 py-1 text-right tabular-nums">{fmtKg(l.pesoKg)}</td>
              <td className="px-2 py-1 text-right tabular-nums">{fmtR$(l.precoKg)}</td>
              <td className="px-2 py-1 text-right tabular-nums font-semibold">{fmtR$(l.subtotal)}</td>
              <td className="px-2 py-1 text-right tabular-nums text-torg-gray">{fmtR$(l.icms)}</td>
              <td className="px-4 py-1 text-right tabular-nums text-torg-gray">{fmtR$(l.pisCofins)}</td>
            </tr>
          ))}
          <tr className="bg-gray-50 font-bold">
            <td className="px-4 py-1.5" colSpan={4}>Total</td>
            <td className="px-2 py-1.5 text-right tabular-nums">{fmtR$(grupo.total.subtotal)}</td>
            <td className="px-2 py-1.5 text-right tabular-nums">{fmtR$(grupo.total.icms)}</td>
            <td className="px-4 py-1.5 text-right tabular-nums">{fmtR$(grupo.total.pisCofins)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/** MC_TINTAS — as duas linhas de tinta do modelo, uma por fator de perda. */
function Tintas({ c, setComp }) {
  const t = Array.isArray(c.tintas) ? c.tintas : [];
  const linha = (i) => t[i] || {};
  const set = (i, campo, v) => {
    const novo = [...t];
    novo[i] = { ...linha(i), [campo]: v, nome: i === 0 ? "ESTRUTURA — FATOR DE PERDA: 45%" : "ESTRUTURA — FATOR DE PERDA: 85%", perda: i === 0 ? 45 : 85 };
    setComp({ tintas: novo });
  };
  return (
    <div className="space-y-4">
      {[0, 1].map((i) => (
        <div key={i} className="bg-white border border-gray-100 rounded-xl p-4">
          <p className="text-[12px] font-bold text-torg-dark mb-3">Estrutura — fator de perda: {i === 0 ? "45%" : "85%"}</p>
          <div className="grid sm:grid-cols-3 lg:grid-cols-4 gap-3">
            <label className="text-[11px] text-torg-dark">Camada
              <Sel value={linha(i).camada || ""} onChange={(e) => set(i, "camada", e.target.value)} opcoes={CAMADAS_TINTA} className="block mt-1 w-full" /></label>
            {[["produto", "Produto"], ["cor", "Cor"], ["solidos", "Sólidos por volume (%)"], ["peliculaSeca", "Película seca (µm)"], ["precoLitro", "Preço/litro (R$)"], ["pesoKg", "Peso atingido (kg)"], ["precoKg", "Custo (R$/kg)"]].map(([k, r]) => (
              <label key={k} className="text-[11px] text-torg-dark">{r}
                <Inp value={linha(i)[k] ?? ""} onChange={(e) => set(i, k, e.target.value)} className="block mt-1 w-full" /></label>
            ))}
          </div>
        </div>
      ))}
      <p className="text-[11px] text-torg-gray">
        Na planilha, área de pintura, rendimento e litros saem de fórmula a partir do quantitativo.
        Aqui entram o produto e o preço; o custo por kg alimenta a linha de TINTAS da industrialização.
      </p>
    </div>
  );
}

function Comerciais({ c, res, setComp }) {
  const it = c.itensComerciais || {};
  const set = (k, campo, v) => setComp({ itensComerciais: { ...it, [k]: { ...(it[k] || {}), [campo]: v } } });
  return (
    <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
      <table className="w-full text-[12px]">
        <thead className="bg-gray-50 text-[10px] uppercase text-torg-gray">
          <tr><th className="text-left px-4 py-1.5">Item</th><th className="text-left px-2 py-1.5">Un.</th>
            <th className="text-right px-2 py-1.5">Quantidade</th><th className="text-right px-2 py-1.5">Preço unit.</th><th className="text-right px-4 py-1.5">Subtotal</th></tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {ITENS_COMERCIAIS.map((i) => {
            const qtd = num(it[i.key]?.qtd), preco = it[i.key]?.preco == null ? i.preco : num(it[i.key].preco);
            return (
              <tr key={i.key}>
                <td className="px-4 py-1">{i.nome}</td><td className="px-2 py-1 text-torg-gray">{i.un}</td>
                <td className="px-2 py-1 text-right"><Inp value={it[i.key]?.qtd ?? ""} onChange={(e) => set(i.key, "qtd", e.target.value)} className="w-24 text-right" /></td>
                <td className="px-2 py-1 text-right"><Inp value={it[i.key]?.preco ?? i.preco} onChange={(e) => set(i.key, "preco", e.target.value)} className="w-24 text-right" /></td>
                <td className="px-4 py-1 text-right tabular-nums font-semibold">{fmtR$(qtd * preco)}</td>
              </tr>
            );
          })}
          <tr className="bg-gray-50 font-bold"><td className="px-4 py-1.5" colSpan={4}>Total</td>
            <td className="px-4 py-1.5 text-right tabular-nums">{fmtR$(res.totais?.comerciais)}</td></tr>
        </tbody>
      </table>
    </div>
  );
}

function Bdi({ c, res, setComp }) {
  const bdi = c.bdi || {};
  return (
    <div className="bg-white border border-gray-100 rounded-xl p-5 max-w-xl">
      <label className="text-[12px] font-semibold text-torg-dark">BDI (%)
        <Inp value={bdi.percentual ?? ""} onChange={(e) => setComp({ bdi: { ...bdi, percentual: e.target.value } })} className="block mt-1 w-32" /></label>
      {/* ⚠ o BDI incide sobre a VENDA, não sobre o custo: preço = custo ÷ (1 − BDI). Somar
          "custo × BDI" entrega margem menor do que a pretendida — é o erro clássico. */}
      <p className="text-[11px] text-torg-gray mt-2">
        Preço = custo ÷ (1 − BDI). O BDI incide sobre a venda, não sobre o custo.
      </p>
      <dl className="mt-4 space-y-1 text-[13px]">
        <Linha r="Custo direto" v={fmtR$(res.custo)} />
        <Linha r={`BDI (${res.bdiPct || 0}%)`} v={fmtR$(res.bdiValor)} />
        <Linha r="Preço de venda" v={fmtR$(res.preco)} forte />
        <Linha r="Preço por kg" v={fmtR$(res.precoPorKg)} />
      </dl>
    </div>
  );
}

const Linha = ({ r, v, forte }) => (
  <div className={`flex justify-between gap-4 ${forte ? "font-bold text-torg-dark border-t border-gray-100 pt-1" : "text-torg-gray"}`}>
    <dt>{r}</dt><dd className="tabular-nums">{v}</dd>
  </div>
);

function PlanilhaComercial({ res, e }) {
  const t = res.totais || {};
  return (
    <div className="bg-white border border-gray-100 rounded-xl overflow-hidden max-w-4xl">
      <table className="w-full text-[13px]">
        <thead className="bg-gray-50 text-[10px] uppercase text-torg-gray">
          <tr><th className="text-left px-4 py-2">Item</th><th className="text-left px-2 py-2">Descrição</th>
            <th className="text-left px-2 py-2">un.</th><th className="text-right px-2 py-2">Quant.</th>
            <th className="text-right px-2 py-2">Unit. R$</th><th className="text-right px-4 py-2">Valor R$</th></tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          <tr><td className="px-4 py-2 font-semibold">1</td><td className="px-2 py-2 font-semibold" colSpan={5}>FORNECIMENTO DE ESTRUTURAS METÁLICAS</td></tr>
          <tr>
            <td className="px-4 py-2">1.1</td>
            <td className="px-2 py-2">Fornecimento das estruturas metálicas — {e.obra || ""}</td>
            <td className="px-2 py-2">kg</td>
            <td className="px-2 py-2 text-right tabular-nums">{Number(res.pesoTotal || 0).toLocaleString("pt-BR")}</td>
            <td className="px-2 py-2 text-right tabular-nums">{fmtR$(res.precoPorKg)}</td>
            <td className="px-4 py-2 text-right tabular-nums font-semibold">{fmtR$(res.preco)}</td>
          </tr>
          <tr className="bg-gray-50 font-bold"><td className="px-4 py-2" colSpan={5}>TOTAL GERAL</td>
            <td className="px-4 py-2 text-right tabular-nums">{fmtR$(res.preco)}</td></tr>
        </tbody>
      </table>
      <div className="p-4 border-t border-gray-100 grid sm:grid-cols-4 gap-3 text-[12px]">
        <Kpi r="Material" v={fmtR$(t.material?.subtotal)} />
        <Kpi r="MDO terceirizada" v={fmtR$(t.mdo?.subtotal)} />
        <Kpi r="Industrialização" v={fmtR$(t.industrializacao?.subtotal)} />
        <Kpi r="Itens comerciais" v={fmtR$(t.comerciais)} />
      </div>
    </div>
  );
}

/**
 * CENÁRIO FINANCEIRO — a aba que o Vitor pediu.
 *
 * ⚠ É AQUI QUE O ORÇAMENTO GANHA OU PERDE DEPOIS DE FECHADO. Com material por nossa conta, a Torg
 * compra o aço no começo e recebe ao longo da obra: no meio há meses em que o nosso caixa financia
 * o cliente. Margem boa no papel não salva proposta que exige capital de giro que não temos.
 */
function Cenario({ e, cen, res, mexer }) {
  const cfg = e.cenario || {};
  const set = (k, v) => mexer({ cenario: { ...cfg, [k]: v } });
  const parcelas = Array.isArray(cfg.parcelas) ? cfg.parcelas : [];
  const setP = (i, campo, v) => set("parcelas", parcelas.map((p, j) => (j === i ? { ...p, [campo]: v } : p)));
  const somaPct = parcelas.reduce((a, p) => a + num(p.pct), 0);

  return (
    <div className="space-y-4">
      <div className="bg-white border border-gray-100 rounded-xl p-4">
        <div className="grid sm:grid-cols-4 gap-3">
          {[["prazoFabricacaoMeses", "Prazo de fabricação (meses)"], ["pagamentoFornecedorDias", "Pagamento ao fornecedor (dias)"], ["taxaMensalPct", "Custo do dinheiro (% a.m.)"]].map(([k, r]) => (
            <label key={k} className="text-[11px] text-torg-dark">{r}
              <Inp value={cfg[k] ?? ""} onChange={(ev) => set(k, ev.target.value)} className="block mt-1 w-full" /></label>
          ))}
        </div>
        <div className="mt-4">
          <div className="flex items-center gap-2 mb-2">
            <p className="text-[12px] font-bold text-torg-dark">Recebimento</p>
            <button onClick={() => set("parcelas", [...parcelas, { pct: 0, dias: 30 }])} className="text-[11px] font-semibold text-torg-blue inline-flex items-center gap-1"><Plus size={12} /> parcela</button>
            {parcelas.length > 0 && somaPct !== 100 && (
              <span className="text-[11px] font-semibold text-torg-orange-700">as parcelas somam {somaPct}%, não 100%</span>
            )}
          </div>
          {parcelas.map((p, i) => (
            <div key={i} className="flex items-center gap-2 mb-1">
              <Inp value={p.pct ?? ""} onChange={(ev) => setP(i, "pct", ev.target.value)} className="w-20 text-right" /><span className="text-[11px] text-torg-gray">% em</span>
              <Inp value={p.dias ?? ""} onChange={(ev) => setP(i, "dias", ev.target.value)} className="w-20 text-right" /><span className="text-[11px] text-torg-gray">dias</span>
              <button onClick={() => set("parcelas", parcelas.filter((_, j) => j !== i))} className="text-gray-300 hover:text-red-600"><Trash2 size={13} /></button>
            </div>
          ))}
          {!parcelas.length && <p className="text-[11px] text-torg-gray">Sem parcela definida, o cenário assume tudo no fim da obra — o pior caso, que é o que serve pra decidir.</p>}
        </div>
      </div>

      {cen && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-gray-100 border border-gray-100 rounded-xl overflow-hidden">
            <Kpi r="Capital de giro" v={fmtR$(cen.capitalDeGiro)} cor="text-torg-orange-700" />
            <Kpi r="Custo financeiro" v={fmtR$(cen.custoFinanceiro)} />
            <Kpi r="Margem bruta" v={fmtR$(cen.margemBruta)} />
            <Kpi r={`Margem líquida (${cen.margemLiquidaPct}%)`} v={fmtR$(cen.margemLiquida)} cor={cen.margemLiquida > 0 ? "text-green-700" : "text-red-600"} />
          </div>
          {cen.capitalDeGiro > 0 && (
            <p className="text-[12px] text-torg-dark bg-[#FFF7ED] border border-[#F4801F]/30 rounded-lg px-3 py-2 inline-flex items-start gap-2">
              <TrendingDown size={14} className="text-[#F4801F] mt-0.5 shrink-0" />
              <span>No pior mês a obra exige <strong>{fmtR$(cen.capitalDeGiro)}</strong> do nosso caixa — é dinheiro nosso financiando o cliente
                até o recebimento. Material por conta do cliente (faturamento DIRETO) derruba esse número.</span>
            </p>
          )}
          <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
            <table className="w-full text-[12px]">
              <thead className="bg-gray-50 text-[10px] uppercase text-torg-gray">
                <tr><th className="text-left px-4 py-1.5">Mês</th><th className="text-right px-2 py-1.5">Desembolso</th>
                  <th className="text-right px-2 py-1.5">Recebimento</th><th className="text-right px-2 py-1.5">Juros</th><th className="text-right px-4 py-1.5">Saldo</th></tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {cen.fluxo.filter((f) => f.saida || f.entrada || f.saldo).map((f) => (
                  <tr key={f.mes}>
                    <td className="px-4 py-1">{f.mes === 0 ? "início" : `mês ${f.mes}`}</td>
                    <td className="px-2 py-1 text-right tabular-nums text-red-600">{f.saida ? `- ${fmtR$(f.saida)}` : "—"}</td>
                    <td className="px-2 py-1 text-right tabular-nums text-green-700">{f.entrada ? fmtR$(f.entrada) : "—"}</td>
                    <td className="px-2 py-1 text-right tabular-nums text-torg-gray">{f.juros ? fmtR$(f.juros) : "—"}</td>
                    <td className={`px-4 py-1 text-right tabular-nums font-semibold ${f.saldo < 0 ? "text-red-600" : "text-torg-dark"}`}>{fmtR$(f.saldo)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <p className="text-[11px] text-torg-gray">Preço de venda considerado: {fmtR$(res.preco)}.</p>
    </div>
  );
}
