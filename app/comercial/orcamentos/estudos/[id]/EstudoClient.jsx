"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { Loader2, FileSpreadsheet, Plus, Trash2, Save, TrendingDown } from "lucide-react";
import { useStore } from "@/lib/store";
import { CLASSES, PERFIS, FATURAMENTO, ESTRUTURAS, METODOS, DEMAOS, PRE_MONTAGEM, ITENS_COMERCIAIS, TERCEIRIZADOS, CAMADAS_TINTA, BDI_CAMPOS, LINHAS_FATURAMENTO, CFOPS, cargaDoCfop } from "@/lib/lqc";

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
  { k: "BDI", r: "Impostos e BDI" },
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
      <div className="grid grid-cols-2 sm:grid-cols-6 gap-px bg-gray-100 border border-gray-100 rounded-xl overflow-hidden mb-5">
        <Kpi r="Peso" v={fmtKg(res.pesoTotal)} />
        <Kpi r="Custo" v={fmtR$(res.custo)} />
        <Kpi r={`BDI ${res.bdiPct || 0}%`} v={fmtR$(res.bdiValor)} />
        <Kpi r="Impostos" v={fmtR$(res.totalImpostos)} />
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

/**
 * RESUMOS_EM — o quantitativo. É daqui que sai o peso por classe e por perfil.
 *
 * ⚠ CADA LINHA É UM CARTÃO, NÃO UMA LINHA DE TABELA. Vitor (22/08/2026): "precisa melhorar essa
 * projeção dessa linha, ser mais explicativo, pois está confuso e difícil de preencher".
 *
 * Ele tem razão: doze campos numa linha só cabem rolando de lado, e rolando de lado some o
 * cabeçalho — a pessoa digita sem saber em que coluna está. Pior: os campos que MAIS precisam de
 * explicação (classificação e perfil predominante) são justamente os que definem o preço, e
 * apareciam como duas palavras soltas.
 *
 * Então cada linha vira um bloco com três perguntas na ordem em que o orçamentista pensa:
 * ONDE fica · COMO se mede · DE QUE é feito. E cada escolha mostra a consequência: a faixa de
 * kg/m ao lado da classificação, o R$/kg ao lado do perfil, e o peso e o custo da linha
 * calculados na hora — porque um número que aparece na hora ensina mais que qualquer legenda.
 */
function Resumos({ e, c, setComp, mexer }) {
  const linhas = Array.isArray(c.resumos) ? c.resumos : [];
  const set = (i, campo, v) => setComp({ resumos: linhas.map((l, j) => (j === i ? { ...l, [campo]: v } : l)) });
  const add = () => setComp({ resumos: [...linhas, { item: `1.${linhas.length + 1}`, metodo: e.metodo || "ESTIMATIVA", un: "unid", quantidade: 1, unidades: 1 }] });
  const del = (i) => setComp({ resumos: linhas.filter((_, j) => j !== i) });
  const dup = (i) => setComp({ resumos: [...linhas.slice(0, i + 1), { ...linhas[i], item: `1.${linhas.length + 1}` }, ...linhas.slice(i + 1)] });
  const total = linhas.reduce((a, l) => a + num(l.quantidade) * num(l.unidades || 1) * num(l.pesoUnit), 0);

  return (
    <div>
      <div className="bg-white border border-gray-100 rounded-xl p-4 mb-4">
        <p className="text-[12px] text-torg-gray mb-3">
          Cada bloco é um pedaço da obra. O peso lançado aqui é o que alimenta a industrialização:
          a <strong className="text-torg-dark">classificação</strong> escolhe o preço de fabricação e pintura,
          e o <strong className="text-torg-dark">perfil predominante</strong> escolhe o preço da matéria-prima.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-[11px] font-semibold text-torg-dark">Método
            <Sel value={e.metodo || ""} onChange={(ev) => mexer({ metodo: ev.target.value })} opcoes={METODOS} className="block mt-1" /></label>
          <label className="text-[11px] font-semibold text-torg-dark">Demãos de tinta
            <Sel value={e.demaos || ""} onChange={(ev) => mexer({ demaos: ev.target.value })} opcoes={DEMAOS} className="block mt-1" /></label>
          <label className="text-[11px] font-semibold text-torg-dark">Pré-montagem
            <Sel value={e.preMontagem || ""} onChange={(ev) => mexer({ preMontagem: ev.target.value })} opcoes={PRE_MONTAGEM} className="block mt-1" /></label>
          <span className="ml-auto text-[12px] text-torg-gray">Total do quantitativo: <strong className="text-torg-dark tabular-nums">{fmtKg(total)}</strong></span>
        </div>
      </div>

      <div className="space-y-3">
        {linhas.map((l, i) => <CartaoLinha key={i} l={l} i={i} set={set} del={del} dup={dup} />)}
      </div>

      <button onClick={add}
        className="mt-3 text-[12px] font-semibold text-torg-blue border border-dashed border-torg-blue/40 rounded-xl px-4 py-2.5 w-full hover:bg-torg-blue-50 inline-flex items-center justify-center gap-1.5">
        <Plus size={14} /> {linhas.length ? "Adicionar outro elemento" : "Adicionar o primeiro elemento"}
      </button>
    </div>
  );
}

/** Um elemento do quantitativo, com a consequência de cada escolha à vista. */
function CartaoLinha({ l, i, set, del, dup }) {
  const classe = CLASSES.find((x) => x.nome.toUpperCase() === String(l.classificacao || "").toUpperCase());
  const perfil = PERFIS.find((p) => p.nome === l.perfil);
  const peso = num(l.quantidade) * num(l.unidades || 1) * num(l.pesoUnit);
  const custoMat = perfil ? peso * perfil.preco : 0;
  const custoFab = classe ? peso * classe.fabricacao : 0;
  // a unidade do peso unitário SEGUE a unidade de medida — é o que evita lançar kg/m num item "unid"
  const unPeso = l.un === "m" ? "kg/m" : l.un === "m²" ? "kg/m²" : "kg/un";

  return (
    <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 bg-gray-50 border-b border-gray-100">
        <span className="text-[12px] font-bold text-torg-blue font-mono">{l.item || `1.${i + 1}`}</span>
        <span className="text-[12px] font-semibold text-torg-dark">{l.area || "sem área"}</span>
        {l.estrutura && <span className="text-[12px] text-torg-gray">· {l.estrutura}</span>}
        {l.elemento && <span className="text-[12px] text-torg-gray">· {l.elemento}</span>}
        <span className="ml-auto text-[13px] font-extrabold tabular-nums text-torg-dark">{fmtKg(peso)}</span>
        <button onClick={() => dup(i)} title="duplicar" className="text-gray-300 hover:text-torg-blue"><Plus size={14} /></button>
        <button onClick={() => del(i)} title="remover" className="text-gray-300 hover:text-red-600"><Trash2 size={14} /></button>
      </div>

      <div className="p-4 space-y-4">
        <Bloco titulo="Onde fica">
          <Campo r="Item" ajuda="numeração da proposta">
            <Inp value={l.item || ""} onChange={(ev) => set(i, "item", ev.target.value)} className="w-full" /></Campo>
          <Campo r="Área" ajuda="galpão, prédio, trecho">
            <Inp value={l.area || ""} onChange={(ev) => set(i, "area", ev.target.value)} className="w-full" /></Campo>
          <Campo r="Estrutura">
            <Sel value={l.estrutura || ""} onChange={(ev) => set(i, "estrutura", ev.target.value)} opcoes={ESTRUTURAS} className="w-full" /></Campo>
          <Campo r="Elemento" ajuda="tesoura, terça, pilar…">
            <Inp value={l.elemento || ""} onChange={(ev) => set(i, "elemento", ev.target.value)} className="w-full" /></Campo>
        </Bloco>

        <Bloco titulo="Como se mede" nota="Quantidade × Unidades × Peso unitário = peso do elemento">
          <Campo r="Método">
            <Sel value={l.metodo || ""} onChange={(ev) => set(i, "metodo", ev.target.value)} opcoes={METODOS} className="w-full" /></Campo>
          <Campo r="Unidade de medida" ajuda="define o peso unitário abaixo">
            <Sel value={l.un || ""} onChange={(ev) => set(i, "un", ev.target.value)} opcoes={["m", "m²", "unid"]} className="w-full" /></Campo>
          <Campo r="Quantidade" ajuda={l.un === "unid" ? "quantas peças" : `quantos ${l.un || "m"}`}>
            <Inp value={l.quantidade ?? ""} onChange={(ev) => set(i, "quantidade", ev.target.value)} className="w-full text-right" /></Campo>
          <Campo r="Unidades" ajuda="repetições iguais (ex.: 12 pórticos)">
            <Inp value={l.unidades ?? ""} onChange={(ev) => set(i, "unidades", ev.target.value)} className="w-full text-right" /></Campo>
          <Campo r={`Peso unitário (${unPeso})`} ajuda="peso de cada unidade de medida">
            <Inp value={l.pesoUnit ?? ""} onChange={(ev) => set(i, "pesoUnit", ev.target.value)} className="w-full text-right" /></Campo>
        </Bloco>

        <Bloco titulo="De que é feito" nota="as duas escolhas que definem o preço da linha">
          <Campo r="Classificação" ajuda={classe ? `${classe.faixa} · fabricação ${fmtR$(classe.fabricacao)}/kg` : "faixa de peso por metro do perfil"}>
            <select value={l.classificacao || ""} onChange={(ev) => set(i, "classificacao", ev.target.value)}
              className="border border-gray-200 rounded px-2 py-1 text-[12px] bg-white w-full">
              <option value="">—</option>
              {CLASSES.map((x) => <option key={x.key} value={x.nome.toUpperCase()}>{x.nome} · {x.faixa}</option>)}
            </select>
          </Campo>
          <Campo r="Perfil predominante" ajuda={perfil ? `matéria-prima ${fmtR$(perfil.preco)}/kg` : "define o preço do aço desta linha"}>
            <select value={l.perfil || ""} onChange={(ev) => set(i, "perfil", ev.target.value)}
              className="border border-gray-200 rounded px-2 py-1 text-[12px] bg-white w-full">
              <option value="">—</option>
              {PERFIS.map((p) => <option key={p.nome} value={p.nome}>{p.nome} · {fmtR$(p.preco)}/kg</option>)}
            </select>
          </Campo>
        </Bloco>

        {peso > 0 && (
          <p className="text-[11px] text-torg-gray border-t border-gray-100 pt-3">
            <strong className="text-torg-dark">{fmtKg(peso)}</strong>
            {perfil && <> · matéria-prima <strong className="text-torg-dark">{fmtR$(custoMat)}</strong></>}
            {classe && <> · fabricação <strong className="text-torg-dark">{fmtR$(custoFab)}</strong></>}
            {(!perfil || !classe) && <span className="text-torg-orange-700"> · falta {[!perfil && "o perfil", !classe && "a classificação"].filter(Boolean).join(" e ")} para esta linha custar</span>}
          </p>
        )}
      </div>
    </div>
  );
}

const Bloco = ({ titulo, nota, children }) => (
  <div>
    <div className="flex flex-wrap items-baseline gap-2 mb-2">
      <p className="text-[10px] font-bold uppercase tracking-wider text-torg-blue">{titulo}</p>
      {nota && <p className="text-[10px] text-torg-gray">{nota}</p>}
    </div>
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">{children}</div>
  </div>
);

const Campo = ({ r, ajuda, children }) => (
  <label className="block min-w-0">
    <span className="block text-[11px] font-semibold text-torg-dark mb-1 truncate">{r}</span>
    {children}
    {ajuda && <span className="block text-[10px] text-torg-gray mt-0.5 leading-tight">{ajuda}</span>}
  </label>
);

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
            <th className="text-right px-2 py-1.5">Quantidade</th><th className="text-right px-2 py-1.5">Preço unit.</th>
            <th className="text-left px-2 py-1.5">Faturamento</th><th className="text-right px-4 py-1.5">Subtotal</th></tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {ITENS_COMERCIAIS.map((i) => {
            const qtd = num(it[i.key]?.qtd), preco = it[i.key]?.preco == null ? i.preco : num(it[i.key].preco);
            return (
              <tr key={i.key}>
                <td className="px-4 py-1">{i.nome}</td><td className="px-2 py-1 text-torg-gray">{i.un}</td>
                <td className="px-2 py-1 text-right"><Inp value={it[i.key]?.qtd ?? ""} onChange={(e) => set(i.key, "qtd", e.target.value)} className="w-24 text-right" /></td>
                <td className="px-2 py-1 text-right"><Inp value={it[i.key]?.preco ?? i.preco} onChange={(e) => set(i.key, "preco", e.target.value)} className="w-24 text-right" /></td>
                <td className="px-2 py-1"><Sel value={it[i.key]?.faturamento || ""} onChange={(e) => set(i.key, "faturamento", e.target.value)} opcoes={FATURAMENTO} className="w-24" /></td>
                <td className="px-4 py-1 text-right tabular-nums font-semibold">{fmtR$(qtd * preco)}</td>
              </tr>
            );
          })}
          <tr className="bg-gray-50 font-bold"><td className="px-4 py-1.5" colSpan={5}>Total</td>
            <td className="px-4 py-1.5 text-right tabular-nums">{fmtR$(res.totais?.comerciais)}</td></tr>
        </tbody>
      </table>
    </div>
  );
}

/**
 * IMPOSTOS E BDI — a aba que faltava.
 *
 * Vitor (23/08/2026): "não vi aba de impostos… o preço da planilha comercial está errado".
 *
 * ⚠ ERA A MESMA CAUSA. Na LQC o BDI não é um número solto: é composto
 * `(1+adm+seguro+risco)/(1−(impostos+factoring+margem+comissões))−1`, e mora na aba BDI junto com
 * a tabela de tributos por CFOP. O portal tinha um campo "BDI %" que não existia na planilha —
 * então a planilha saía com BDI zero e imposto nenhum, e o preço vinha errado.
 *
 * ⚠ E O BDI SÓ INCIDE SOBRE O QUE PASSA PELA TORG: o que o cliente compra direto entra na venda
 * pelo custo, sem margem. É o que a aba mostra separado.
 */
function Bdi({ c, res, setComp }) {
  const bdi = c.bdi || {};
  const cfops = c.cfops || {};
  const set = (k, v) => setComp({ bdi: { ...bdi, [k]: v } });
  const noCusto = BDI_CAMPOS.filter((x) => x.onde === "custo");
  const naVenda = BDI_CAMPOS.filter((x) => x.onde === "venda");

  return (
    <div className="space-y-4">
      <div className="bg-white border border-gray-100 rounded-xl p-5">
        <p className="text-[12px] font-bold text-torg-dark mb-1">Composição do BDI</p>
        <p className="text-[11px] text-torg-gray mb-4">
          BDI = (1 + administração + seguro + risco) ÷ (1 − impostos − factoring − margem − comissões) − 1.
          Os três primeiros são custo indireto; os quatro últimos incidem sobre a venda.
        </p>
        <div className="grid sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {[...noCusto, ...naVenda].map((campo) => (
            <label key={campo.key} className="text-[11px] text-torg-dark">
              {campo.nome} (%)
              <Inp value={bdi[campo.key] ?? ""} onChange={(e) => set(campo.key, e.target.value)} className="block mt-1 w-full text-right" />
              <span className="block text-[10px] text-torg-gray mt-0.5">{campo.onde === "custo" ? "sobre o custo" : "sobre a venda"}</span>
            </label>
          ))}
        </div>
        <dl className="mt-5 space-y-1 text-[13px] max-w-md">
          <Linha r="Custo faturado pela Torg" v={fmtR$(res.custoTorg)} />
          <Linha r="Custo em faturamento direto" v={fmtR$(res.custoDireto)} />
          <Linha r={`BDI (${res.bdiPct || 0}%) — só sobre o que a Torg fatura`} v={fmtR$(res.bdiValor)} />
          <Linha r="Preço de venda" v={fmtR$(res.preco)} forte />
          <Linha r="Preço por kg" v={fmtR$(res.precoPorKg)} />
        </dl>
      </div>

      <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100">
          <p className="text-[12px] font-bold text-torg-dark">Impostos por linha de faturamento</p>
          <p className="text-[11px] text-torg-gray mt-0.5">
            O CFOP escolhe a coluna da tabela de tributos. PIS e COFINS entram sobre a base sem ICMS —
            somar tudo direto infla a carga e encarece a proposta à toa.
          </p>
        </div>
        <table className="w-full text-[12px]">
          <thead className="bg-gray-50 text-[10px] uppercase text-torg-gray">
            <tr><th className="text-left px-5 py-1.5">Linha</th><th className="text-left px-2 py-1.5">CFOP / cód.</th>
              <th className="text-right px-2 py-1.5">Base</th><th className="text-right px-2 py-1.5">Carga</th><th className="text-right px-5 py-1.5">Imposto</th></tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {(res.impostos || []).map((l) => (
              <tr key={l.key}>
                <td className="px-5 py-1.5">{l.nome}</td>
                <td className="px-2 py-1.5">
                  <select value={cfops[l.key] || l.padrao} onChange={(e) => setComp({ cfops: { ...cfops, [l.key]: e.target.value } })}
                    className="border border-gray-200 rounded px-2 py-1 text-[12px] bg-white">
                    {CFOPS.map((f) => <option key={f.cod} value={f.cod}>{f.rotulo}</option>)}
                  </select>
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">{fmtR$(l.base)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums text-torg-gray">{l.cargaPct}%</td>
                <td className="px-5 py-1.5 text-right tabular-nums font-semibold">{fmtR$(l.valor)}</td>
              </tr>
            ))}
            <tr className="bg-gray-50 font-bold"><td className="px-5 py-1.5" colSpan={4}>Total de impostos</td>
              <td className="px-5 py-1.5 text-right tabular-nums">{fmtR$(res.totalImpostos)}</td></tr>
          </tbody>
        </table>
      </div>

      <div className="bg-white border border-gray-100 rounded-xl p-5">
        <p className="text-[12px] font-bold text-torg-dark mb-3">Carga por CFOP</p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {CFOPS.map((f) => (
            <div key={f.cod} className="flex justify-between gap-3 text-[11px] border border-gray-100 rounded px-2.5 py-1.5">
              <span className="text-torg-gray truncate">{f.rotulo}</span>
              <span className="font-semibold tabular-nums text-torg-dark shrink-0">{Math.round(cargaDoCfop(f.cod) * 10000) / 100}%</span>
            </div>
          ))}
        </div>
      </div>
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
