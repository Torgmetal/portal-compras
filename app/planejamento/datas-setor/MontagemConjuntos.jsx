"use client";
// ─── MONTAGEM: os conjuntos da obra e o dia em que cada um começa ─────────────
// Vitor (01/09/2026): "precisamos criar uma espécie de aba para selecionar a montagem, isso será
// necessário para trazer os conjuntos da obra, e o planejamento programa de acordo com o tempo da
// preparação a data que deverá iniciar a montagem" — e, ao ver a primeira versão numa tela própria:
// "não era isso, queria dentro da aba de datas por setor".
//
// ⚠ MORA AQUI DENTRO DE PROPÓSITO. É a mesma conversa da liberação para o PCP: o planejamento já
// está com a obra aberta, olhando o marco de cada setor. Tela separada obrigava a escolher a obra
// duas vezes e deixava a data da montagem longe do marco que a justifica.
//
// ⚠⚠ A PRONTIDÃO NÃO TRAVA NADA. Vitor (01/09/2026, corrigindo a primeira versão): "para a
// liberação da montagem no planejamento não precisa estar com os croquis prontos para ele liberar,
// apenas colocar para poder lançar para o PCP". Eu tinha feito o contrário — só deixava programar
// conjunto com TODOS os croquis cortados —, e isso invertia quem decide: o planejamento marca a
// data olhando o cronograma, e o corte corre atrás. A prontidão fica na tela como INFORMAÇÃO, para
// ele saber o que está pedindo; ordena a lista, mas não impede seleção nenhuma.
import { useState, useEffect, useCallback, useMemo } from "react";
import { Loader2, AlertCircle, CalendarClock, ArrowRight, CheckCircle2, X, Upload, Search } from "lucide-react";

const isoHoje = () => new Date().toISOString().split("T")[0];
const isoDe = (v) => (v ? String(v).slice(0, 10) : "");
const fmtKg = (v) => `${(Number(v) || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} kg`;
// ⚠ SEM ACENTO E EM CAIXA ALTA dos dois lados. Descrição de conjunto vem em CAIXA ALTA do Tekla
// e às vezes acentuada ("CONSOLE", "PLATAFORMA DE INSPEÇÃO"); quem procura digita minúsculo e sem
// acento. Comparar cru faria "inspecao" não achar "INSPEÇÃO".
const semAcento = (v) => String(v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();

const fmtDiaLongo = (iso) => {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00Z");
  const semana = d.toLocaleDateString("pt-BR", { weekday: "short", timeZone: "UTC" }).replace(".", "");
  return `${semana} ${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" })}`;
};

export default function MontagemConjuntos({ opId, marcoMontagem }) {
  const [conjuntos, setConjuntos] = useState(null);
  const [montados, setMontados] = useState({});
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [colando, setColando] = useState(false);
  const [texto, setTexto] = useState("");
  const [importado, setImportado] = useState(null);
  const [okMsg, setOkMsg] = useState("");
  const [avisos, setAvisos] = useState([]);
  const [sel, setSel] = useState(new Set());
  const [busca, setBusca] = useState("");
  // ⚠ o dia sugerido é o MARCO do cronograma, não hoje: é ele que o planejamento veio olhar.
  const [dia, setDia] = useState(marcoMontagem || isoHoje());
  const [agindo, setAgindo] = useState(false);

  const carregar = useCallback(async () => {
    if (!opId) return;
    setCarregando(true); setErro("");
    try {
      const r = await fetch(`/api/planejamento/montagem?opId=${encodeURIComponent(opId)}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro ao carregar os conjuntos");
      setConjuntos(j.conjuntos || []);
      setMontados(j.montados || {});
      setSel(new Set());
    } catch (e) { setErro(e.message); } finally { setCarregando(false); }
  }, [opId]);
  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => { if (marcoMontagem) setDia(marcoMontagem); }, [marcoMontagem]);

  const lista = useMemo(() => (conjuntos || []).map((c) => {
    const q = Number(c.qte) || 1;
    const feito = Number(montados[c.marca] || 0);
    return { ...c, montado: feito >= q, emMontagem: feito > 0 && feito < q, feito, q };
  }), [conjuntos, montados]);

  // ⚠ ORDENA pela prontidão (mais cortado primeiro), mas TODOS entram na mesma lista e todos podem
  // ser selecionados — a ordem ajuda a escolher, não decide por ninguém.
  const aProgramar = useMemo(() => lista
    .filter((c) => !c.montagemDiaProgramado && !c.montado)
    .sort((a, b) => (b.prontidao?.pct || 0) - (a.prontidao?.pct || 0)
      || String(a.marca).localeCompare(String(b.marca), "pt-BR", { numeric: true })),
    [lista]);
  // ⚠ A BUSCA CASA MARCA **OU** DESCRIÇÃO, e cada palavra digitada tem que aparecer em uma das
  // duas (não precisam estar na mesma). "console t97" acha o CONSOLE da marca T97A13 — é assim que
  // se procura de cabeça: um pedaço do nome e um pedaço do código.
  const visiveis = useMemo(() => {
    const termos = semAcento(busca).split(/\s+/).filter(Boolean);
    if (!termos.length) return aProgramar;
    return aProgramar.filter((c) => {
      const alvo = `${semAcento(c.marca)} ${semAcento(c.descricao)}`;
      return termos.every((t) => alvo.includes(t));
    });
  }, [aProgramar, busca]);

  // ⚠⚠ OS BOTÕES DE MARCAR SEGUEM A BUSCA, NÃO A LISTA INTEIRA. Com a busca ligada, "marcar todos"
  // marca o que está À VISTA — senão procurar "console", ver 2 cartões e clicar em marcar todos
  // selecionaria os 29 da obra sem avisar, e o erro só apareceria na hora de liberar.
  const prontos = useMemo(() => visiveis.filter((c) => c.prontidao?.pronto), [visiveis]);
  const montadosN = useMemo(() => lista.filter((c) => c.montado).length, [lista]);

  const grupos = useMemo(() => {
    const hojeIso = isoHoje();
    const m = new Map();
    for (const c of lista.filter((c) => c.montagemDiaProgramado && !c.montado)) {
      const k = isoDe(c.montagemDiaProgramado);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(c);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([iso, l]) => ({
      iso, lista: l,
      kg: l.reduce((s, c) => s + (Number(c.pesoTotalKg) || 0), 0),
      // ⚠ vermelho = passou do dia e a montagem não terminou. Começar não é entregar.
      atrasado: !!iso && iso < hojeIso,
      hoje: iso === hojeIso,
    }));
  }, [lista]);

  const somaKg = (arr) => arr.reduce((s, c) => s + (Number(c.pesoTotalKg) || 0), 0);
  const selecao = useMemo(() => lista.filter((c) => sel.has(c.id)), [lista, sel]);

  const toggle = (id) => setSel((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  // ── IMPORTAR A LISTA DE MARCAS ─────────────────────────────────────────────────────────────
  // Vitor (01/09/2026): "precisa ter uma forma de importar uma lista, para poder selecionar essas
  // peças de uma vez para enviar para o pcp". Marcar 28 no clique já é trabalho à toa; com 100 é
  // inviável, e é justamente quando a lista vem pronta de fora (Excel da Engenharia, e-mail).
  //
  // ⚠ COLAR RESOLVE A MAIORIA. Copiar uma coluna do Excel dá uma marca por linha — não precisa de
  // arquivo. O upload existe para quem prefere o arquivo, e lê a PRIMEIRA COLUNA da primeira aba.
  //
  // ⚠⚠ O QUE NÃO CASA TEM DE APARECER. Selecionar 60 de 80 em silêncio é pior que não selecionar:
  // as 20 que ficaram de fora seguem para o PCP como se não existissem. A tela lista as não
  // encontradas, com o texto que veio.
  // ⚠ A MARCA É O PRIMEIRO CAMPO DA LINHA. Colar duas colunas do Excel traz "T97A1<TAB>25 kg" —
  // quebrar em tudo transformaria "25 kg" numa marca inexistente e encheria o aviso de lixo.
  // Quebra por LINHA e pega o 1º campo; linha única com vírgulas ainda vira lista.
  const normalizar = (t) => {
    const linhas = String(t || "").split(/[\r\n]+/).map((l) => l.trim()).filter(Boolean);
    const brutos = linhas.length > 1
      ? linhas.map((l) => l.split(/[\t;]/)[0].trim())
      : linhas.flatMap((l) => l.split(/[,;\t]/).map((x) => x.trim()));
    return [...new Set(brutos.filter(Boolean))];
  };

  function aplicarLista(textos) {
    const pedidas = normalizar(textos.join("\n"));
    if (!pedidas.length) return;
    const porMarca = new Map(lista.map((c) => [String(c.marca).trim().toUpperCase(), c]));
    const achadas = [], faltando = [];
    for (const t of pedidas) {
      const c = porMarca.get(t.toUpperCase());
      if (c) achadas.push(c); else faltando.push(t);
    }
    // ⚠ soma à seleção em vez de substituir: quem cola duas listas espera as duas
    setSel((prev) => { const n = new Set(prev); achadas.forEach((c) => n.add(c.id)); return n; });
    setImportado({ achadas: achadas.length, faltando, montadas: achadas.filter((c) => c.montado).length });
    setColando(false); setTexto("");
  }

  async function lerArquivo(file) {
    try {
      const XLSX = (await import("xlsx")).default;
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const linhas = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false });
      // primeira coluna de cada linha
      aplicarLista(linhas.map((l) => String(l?.[0] ?? "")).filter(Boolean));
    } catch (e) { setErro("Não consegui ler o arquivo: " + (e?.message || e)); }
  }

  const marcarLista = (l) => {
    const ids = l.map((c) => c.id);
    const todas = ids.length > 0 && ids.every((id) => sel.has(id));
    setSel((p) => { const n = new Set(p); ids.forEach((id) => (todas ? n.delete(id) : n.add(id))); return n; });
  };

  async function agir(payload, msg) {
    setAgindo(true); setErro(""); setOkMsg(""); setAvisos([]);
    try {
      const r = await fetch("/api/planejamento/montagem", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro na ação");
      setAvisos(j.avisos || []);
      if (j.atualizados > 0) setOkMsg(`${j.atualizados} conjunto(s) ${msg}.`);
      await carregar();
    } catch (e) { setErro(e.message); } finally { setAgindo(false); }
  }

  if (!opId) return null;
  if (carregando) return <p className="text-[12px] text-torg-gray inline-flex items-center gap-2 py-4"><Loader2 size={14} className="animate-spin" /> carregando os conjuntos…</p>;
  if (erro && !conjuntos) return <p className="text-[12px] text-red-700 inline-flex items-center gap-2 py-4"><AlertCircle size={14} /> {erro}</p>;
  if (!lista.length) return <p className="text-[12px] text-torg-gray py-4">Esta obra não tem conjuntos na LPC.</p>;

  return (
    <div className="space-y-3">
      {erro && <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-[12px] text-red-700">{erro}</div>}
      {okMsg && <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 text-[12px] text-emerald-800">{okMsg}</div>}
      {avisos.map((a, i) => (
        <div key={i} className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-[12px] text-amber-800 flex items-start gap-2">
          <AlertCircle size={14} className="mt-0.5 shrink-0" /> {a}
        </div>
      ))}

      <div className="flex items-center gap-3 flex-wrap text-[12px] text-torg-gray">
        <span><b className="text-emerald-700">{prontos.length}</b> prontos · {fmtKg(somaKg(prontos))}</span>
        <span><b className="text-torg-dark">{grupos.reduce((s, g) => s + g.lista.length, 0)}</b> programados</span>
        <span><b className="text-torg-dark">{montadosN}</b> já montados</span>
        {aProgramar.length > prontos.length && (
          <span>{aProgramar.length - prontos.length} ainda com croqui na máquina</span>
        )}
      </div>

      {sel.size > 0 && (
        <div className="bg-torg-blue-50/60 border border-torg-blue-100 rounded-lg px-3 py-2 flex items-center gap-2 flex-wrap">
          <span className="text-[12px] font-semibold text-torg-dark">{sel.size} conjunto(s) · {fmtKg(somaKg(selecao))}</span>
          <label className="text-[12px] text-torg-gray ml-1">Início da montagem</label>
          <input type="date" value={dia} onChange={(e) => setDia(e.target.value)}
            className="px-2 py-1 text-[12px] border border-gray-200 rounded-lg" />
          <button onClick={() => agir({ acao: "programar", ids: [...sel], dia }, "programado(s)")}
            disabled={agindo || !dia}
            className="px-3 py-1.5 bg-torg-blue text-white text-[12px] font-medium rounded-lg hover:bg-torg-blue-700 inline-flex items-center gap-1 disabled:opacity-50">
            {agindo ? <Loader2 size={12} className="animate-spin" /> : <CalendarClock size={12} />} Programar
          </button>
          <button onClick={() => agir({ acao: "adiar", ids: [...sel] }, "levado(s) para o próximo dia útil")} disabled={agindo}
            className="px-2.5 py-1.5 border border-red-200 text-red-700 text-[12px] rounded-lg hover:bg-red-50 disabled:opacity-50">
            Adiar 1 dia
          </button>
          <button onClick={() => agir({ acao: "desprogramar", ids: [...sel] }, "tirado(s) do plano")} disabled={agindo}
            className="px-2.5 py-1.5 border border-gray-200 text-torg-gray text-[12px] rounded-lg hover:bg-gray-50 disabled:opacity-50">
            Desprogramar
          </button>
          <button onClick={() => setSel(new Set())} className="ml-auto p-1 text-torg-gray hover:bg-white rounded"><X size={13} /></button>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-3">
        {/* A programar */}
        <div className="rounded-lg border border-gray-100 bg-gray-50/70">
          {/* ⚠ 11px, não 10: com três botões e dois números, 10px obriga a quebrar palavra —
              e "CONJUNTOS DA / OBRA" partido ao meio é o que fazia a faixa parecer amassada. */}
          <div className="px-3 py-2.5 flex text-[11px] text-emerald-800 bg-emerald-50 border-b border-emerald-100 rounded-t-lg">
            {/* ⚠⚠ DUAS LINHAS, NÃO UMA. Vitor (01/09/2026): "melhora isso aqui está horrível".
                Título, contagem e três ações na mesma linha, num painel estreito, quebravam no meio
                da palavra ("CONJUNTOS DA / OBRA", "1.451 / kg") e os links grudavam. Identidade em
                cima, ações embaixo — cada uma com o seu espaço e nada quebrando. */}
            <div className="w-full flex flex-col gap-2">
              <div className="flex items-baseline gap-2 flex-wrap">
                <CheckCircle2 size={12} className="shrink-0 self-center" />
                <span className="font-bold uppercase tracking-wide whitespace-nowrap">Conjuntos da obra</span>
                <span className="text-torg-gray-light">·</span>
                <span className="font-semibold tabular-nums whitespace-nowrap">{visiveis.length} conjuntos</span>
                <span className="font-normal tabular-nums whitespace-nowrap text-torg-gray">{fmtKg(somaKg(visiveis))}</span>
                {busca.trim() && (
                  <span className="font-normal tabular-nums whitespace-nowrap text-torg-gray-light">de {aProgramar.length}</span>
                )}
              </div>

              {aProgramar.length > 0 && (
                <div className="relative">
                  <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-torg-gray-light pointer-events-none" />
                  <input value={busca} onChange={(e) => setBusca(e.target.value)}
                    placeholder="procurar marca ou descrição…"
                    className="w-full pl-7 pr-7 py-1.5 rounded-md border border-emerald-200 bg-white text-[11px] text-torg-dark placeholder:text-torg-gray-light focus:outline-none focus:border-emerald-400" />
                  {busca && (
                    <button onClick={() => setBusca("")} title="limpar"
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded text-torg-gray hover:bg-gray-100">
                      <X size={12} />
                    </button>
                  )}
                </div>
              )}

              {visiveis.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  {prontos.length > 0 && (
                    <button onClick={() => marcarLista(prontos)}
                      className="px-2 py-1 rounded-md border border-emerald-200 bg-white text-emerald-700 font-semibold whitespace-nowrap hover:bg-emerald-50">
                      marcar os {prontos.length} prontos
                    </button>
                  )}
                  <button onClick={() => marcarLista(visiveis)}
                    className="px-2 py-1 rounded-md border border-gray-200 bg-white text-torg-gray font-semibold whitespace-nowrap hover:bg-gray-50">
                    {busca.trim() ? `marcar os ${visiveis.length} da busca` : "marcar todos"}
                  </button>
                  <button onClick={() => { setColando((v) => !v); setImportado(null); }}
                    className={`px-2 py-1 rounded-md border font-semibold whitespace-nowrap inline-flex items-center gap-1 ${
                      colando ? "border-torg-blue bg-torg-blue text-white" : "border-torg-blue-200 bg-white text-torg-blue hover:bg-torg-blue-50"}`}>
                    <Upload size={11} /> importar lista
                  </button>
                </div>
              )}
            </div>
          </div>

          {colando && (
            <div className="border-b border-gray-100 bg-torg-blue-50/40 p-2.5 space-y-2">
              <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={4}
                placeholder={"Cole as marcas — uma por linha (é o que sai ao copiar uma coluna do Excel).\nT97A1\nT97A13\nT97A100"}
                className="w-full text-[12px] font-mono border border-gray-200 rounded-lg px-2 py-1.5" />
              <div className="flex items-center gap-2 flex-wrap">
                <button onClick={() => aplicarLista([texto])} disabled={!texto.trim()}
                  className="px-3 py-1.5 bg-torg-blue text-white text-[12px] font-medium rounded-lg disabled:opacity-50">
                  Selecionar as marcas
                </button>
                <label className="text-[12px] text-torg-blue underline cursor-pointer">
                  ou escolher um arquivo (.xlsx, .csv)
                  <input type="file" accept=".xlsx,.xls,.csv,.txt" className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) lerArquivo(f); e.target.value = ""; }} />
                </label>
                <button onClick={() => { setColando(false); setTexto(""); }} className="text-[12px] text-torg-gray ml-auto">fechar</button>
              </div>
              <p className="text-[11px] text-torg-gray">Lê a primeira coluna da primeira aba. Marca já selecionada continua marcada.</p>
            </div>
          )}
          {importado && (
            <div className={`border-b p-2.5 text-[12px] ${importado.faltando.length ? "bg-amber-50 border-amber-200 text-amber-800" : "bg-emerald-50 border-emerald-200 text-emerald-800"}`}>
              <b>{importado.achadas}</b> marca(s) selecionada(s).
              {importado.montadas > 0 && <> <span className="text-torg-gray">({importado.montadas} já montada(s) — não entram no plano.)</span></>}
              {importado.faltando.length > 0 && (
                <div className="mt-1">
                  {/* ⚠ o que não casou APARECE: selecionar 60 de 80 em silêncio manda 20 peças para
                      o limbo, e ninguém descobre até a bancada ficar sem o que montar. */}
                  <b>{importado.faltando.length} não encontrada(s) nesta obra:</b>{" "}
                  <span className="font-mono">{importado.faltando.slice(0, 20).join(", ")}</span>
                  {importado.faltando.length > 20 && <> … e mais {importado.faltando.length - 20}</>}
                </div>
              )}
              <button onClick={() => setImportado(null)} className="underline mt-1">ok</button>
            </div>
          )}

          <div className="p-2 space-y-1.5 max-h-[46vh] overflow-y-auto">
            {/* ⚠ LISTA ÚNICA, TUDO SELECIONÁVEL. A prontidão ordena (mais cortado primeiro) e
                aparece em cada cartão, mas não separa nem esconde ninguém: aqui o planejamento
                marca a data olhando o cronograma, e o corte corre atrás. Quem exige 100% é a
                liberação do PCP, que é outra decisão e outra tela. */}
            {aProgramar.length === 0 && (
              <p className="text-[11px] text-torg-gray italic py-4 text-center">
                Todos os conjuntos desta obra já estão programados ou montados.
              </p>
            )}
            {/* ⚠ "a busca não achou" ≠ "não tem nada a programar": sem separar, quem procurou
                errado concluiria que a obra acabou. */}
            {aProgramar.length > 0 && visiveis.length === 0 && (
              <p className="text-[11px] text-torg-gray italic py-4 text-center">
                Nenhum conjunto com <b className="not-italic font-mono">{busca.trim()}</b> entre os {aProgramar.length} a programar.{" "}
                <button onClick={() => setBusca("")} className="underline not-italic">limpar a busca</button>
              </p>
            )}
            {visiveis.map((c) => <Card key={c.id} c={c} sel={sel} onToggle={toggle} />)}
          </div>
        </div>

        {/* Programado, dia a dia */}
        <div className="rounded-lg border border-gray-100 bg-gray-50/70">
          <div className="px-2.5 py-2 flex items-center gap-1.5 text-[10px] text-torg-gray bg-white border-b border-gray-100 rounded-t-lg">
            <CalendarClock size={11} />
            <span className="font-bold uppercase tracking-wide">programado</span>
            <span className="font-semibold">{grupos.reduce((s, g) => s + g.lista.length, 0)} conj</span>
          </div>
          <div className="p-2 space-y-1.5 max-h-[46vh] overflow-y-auto">
            {grupos.length === 0 && <p className="text-[11px] text-torg-gray italic py-6 text-center">Nada programado — selecione conjuntos ao lado e marque o dia.</p>}
            {grupos.map((g) => (
              <div key={g.iso} className="space-y-1.5 pb-1">
                <div className={`flex items-center gap-1.5 flex-wrap px-2 py-1.5 rounded-md border text-[10px] ${
                  g.atrasado ? "bg-red-50 border-red-200 text-red-700"
                    : g.hoje ? "bg-amber-50 border-amber-200 text-amber-800"
                    : "bg-white border-gray-100 text-torg-gray"}`}>
                  <CalendarClock size={11} />
                  <span className="font-bold uppercase tracking-wide">{fmtDiaLongo(g.iso)}</span>
                  <span className="font-semibold">{g.lista.length} conj · {fmtKg(g.kg)}</span>
                  {g.hoje && <span className="font-semibold">· hoje</span>}
                  {g.atrasado && (
                    <button onClick={() => agir({ acao: "adiar", ids: g.lista.map((c) => c.id) }, "levado(s) para o próximo dia útil")}
                      disabled={agindo}
                      className="ml-auto inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-600 text-white font-semibold hover:bg-red-700 disabled:opacity-50">
                      <ArrowRight size={10} /> levar p/ o próximo dia
                    </button>
                  )}
                </div>
                {g.lista.map((c) => <Card key={c.id} c={c} sel={sel} onToggle={toggle} alerta={g.atrasado} />)}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Card({ c, sel, onToggle, alerta, aviso }) {
  const p = c.prontidao || {};
  const original = isoDe(c.montagemDiaOriginal);
  const moveu = original && original !== isoDe(c.montagemDiaProgramado);
  const borda = sel?.has(c.id) ? "border-torg-blue ring-1 ring-torg-blue bg-white"
    : alerta ? "border-red-200 bg-red-50/40" : aviso ? "border-amber-200 bg-amber-50/30" : "border-gray-100 bg-white";
  return (
    <div className={`rounded-lg border p-2 text-[12px] space-y-1 ${borda}`}>
      <div className="flex items-center gap-2">
        <input type="checkbox" checked={sel?.has(c.id) || false} onChange={() => onToggle(c.id)} className="rounded border-gray-300" />
        <span className="font-mono font-bold text-torg-dark truncate">{c.marca}</span>
        <span className="text-torg-gray whitespace-nowrap text-[11px]">{c.qte}× · {fmtKg(c.pesoTotalKg)}</span>
        <span className="ml-auto text-[10px] text-torg-gray-light font-mono">{c.opNumero}</span>
      </div>
      {c.descricao && <p className="text-[10px] text-torg-gray truncate">{c.descricao}</p>}
      <div className="flex items-center gap-2 flex-wrap text-[10px]">
        <span className={p.pronto ? "text-emerald-700 font-semibold" : p.liberavel ? "text-amber-700 font-semibold" : "text-torg-gray"}>
          {p.atendidos ?? 0}/{p.total ?? 0} croquis cortados
        </span>
        {c.emMontagem && <span className="text-torg-blue font-semibold">montagem iniciada · {c.feito}/{c.q}</span>}
        {moveu && <span className="text-red-600 font-semibold">era {fmtDiaLongo(original)} · adiado {c.montagemAdiado}×</span>}
        {!moveu && alerta && <span className="text-red-600 font-semibold">não terminou no dia</span>}
      </div>
    </div>
  );
}
