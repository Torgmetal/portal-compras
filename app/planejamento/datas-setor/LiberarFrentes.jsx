"use client";
// LIBERAR PARA O PCP — planilha de peças, com filtro, prioridade e pré-seleção do dia.
//
// Vitor (25/08/2026): "ficou bem ruim para selecionar, quero que deixe como planilha com filtro e
// um botão de podermos marcar quais peças são prioridades, uma opção de filtro para selecionar só
// as a fazer, e aí que o jogo precisa acontecer: você já deveria trazer uma pré-seleção para
// cumprir a meta diária de acordo com a obra que estamos selecionando no dia".
//
// ⚠⚠ A LISTA DE FRENTES NÃO SERVIA. Ela mostrava T67B com 37 t e 2.398 peças e o botão "liberar" —
// mas ninguém libera 2.398 peças de uma vez: o dia da fábrica são ~1.100. Escolher tem de acontecer
// no nível da PEÇA, e a máquina é que deve propor o dia.
//
// ⚠ A DATA É MARCO, NÃO GATILHO. Liberar depois do marco exige motivo; adiantar não (adiantar não
// custa prazo). O marco é congelado na liberação — recalcular o cronograma depois não pode apagar
// um desvio já medido.
import { useState, useEffect, useCallback, useMemo } from "react";
import { Loader2, AlertCircle, Send, Check, X, Flag, CalendarClock, Wand2, Star, RefreshCw } from "lucide-react";
import { useFiltroColunas, ThFiltro } from "@/components/FiltroColuna";

const fmtN = (n) => Number(n || 0).toLocaleString("pt-BR");
const fmtKg = (n) => `${Number(n || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} kg`;
const fmtD = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC", day: "2-digit", month: "2-digit" }) : "—");
// classes por extenso: Tailwind não gera classe montada em runtime
const PRIO = {
  ALTA:  { rot: "Alta",  chip: "bg-red-50 text-red-700 border-red-200" },
  MEDIA: { rot: "Média", chip: "bg-amber-50 text-amber-700 border-amber-200" },
  BAIXA: { rot: "Baixa", chip: "bg-gray-100 text-torg-gray border-gray-200" },
};
const NAT = { croqui: "Peça P", avulsa: "Avulsa", conjunto: "Conjunto" };

const COLUNAS = [
  { key: "frente",   label: "Frente",   valor: (p) => p.frente || "—" },
  // ⚠ estar na LPC não é ter desenho — e é por esta coluna que dá para separar os dois.
  { key: "desenho",  label: "Desenho",  valor: (p) => (p.temDesenho == null ? "não conferido" : p.temDesenho ? "na pasta"
      : p.desenhoForaPadrao ? "outro nome" : p.desenhoSoEnvio ? "só em 2.5.5" : "sem desenho") },
  { key: "natureza", label: "Tipo",     valor: (p) => NAT[p.natureza] || p.natureza },
  { key: "perfil",   label: "Perfil",   valor: (p) => p.perfil || "—" },
  { key: "pool",     label: "Máquina",  valor: (p) => (p.pool === "CHAPAS" ? "Laser chapa" : "Laser perfil") },
  { key: "situacao", label: "Situação", valor: (p) => (p.cortada ? "Já cortada" : "A fazer") },
];

function BotaoConferir({ onClick, conferindo }) {
  return (
    <button onClick={onClick} disabled={conferindo}
      title="Lê a pasta 2.5 Projetos no SharePoint agora e refaz a conferência desta obra"
      className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold rounded-lg border border-current bg-white/70 hover:bg-white disabled:opacity-50">
      {conferindo ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
      {conferindo ? "conferindo…" : "conferir a pasta agora"}
    </button>
  );
}

export default function LiberarFrentes({ opId, opNumero, onMudou }) {
  const [d, setD] = useState(null);
  const [lib, setLib] = useState(null);            // frentes + datasSetor + setores
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [sel, setSel] = useState(() => new Set());
  const [soAFazer, setSoAFazer] = useState(true);
  const [soComDesenho, setSoComDesenho] = useState(false);
  const [col, setCol] = useState(null);
  const [metaKg, setMetaKg] = useState(12000);
  const [sugestao, setSugestao] = useState(null);
  const [setores, setSetores] = useState([]);
  const [prioridade, setPrioridade] = useState("MEDIA");
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [marcando, setMarcando] = useState(false);
  const [conferindo, setConferindo] = useState(false);

  const carregar = useCallback(async () => {
    if (!opId) { setD(null); setLib(null); return; }
    setCarregando(true); setErro(""); setSel(new Set()); setSugestao(null);
    try {
      const [rp, rl] = await Promise.all([
        fetch(`/api/planejamento/liberacao/pecas?opId=${opId}`, { cache: "no-store" }),
        fetch(`/api/planejamento/liberacao?opId=${opId}`, { cache: "no-store" }),
      ]);
      const [jp, jl] = await Promise.all([rp.json(), rl.json()]);
      if (!rp.ok) throw new Error(jp.error || "Erro ao carregar as peças");
      if (!rl.ok) throw new Error(jl.error || "Erro ao carregar as liberações");
      setD(jp); setLib(jl);
      setSetores(jl.setores?.[0] ? [jl.setores[0].key] : []);
    } catch (e) { setErro(e.message); } finally { setCarregando(false); }
  }, [opId]);
  useEffect(() => { carregar(); }, [carregar]);

  // ⚠ conjunto fora da planilha: não se corta conjunto. Quem escolhe o dia escolhe peça P e avulsa.
  const base = useMemo(
    () => (d?.pecas || []).filter((p) => p.natureza !== "conjunto"
      && (!soAFazer || p.aFazer)
      // ⚠ opcional de propósito: o retrato da pasta é de uma varredura periódica e pode estar
      // velho. Esconder por padrão faria sumir peça que ganhou desenho depois da última conferência.
      && (!soComDesenho || p.temDesenho !== false)),
    [d, soAFazer, soComDesenho]);
  const f = useFiltroColunas(base, COLUNAS);
  const fp = { filtros: f.filtros, setFiltros: f.setFiltros, opcoesDaColuna: f.opcoesDaColuna, aberta: col, setAberta: setCol };

  // ⚠ O PORTÃO, do lado da tela — o mesmo que o POST cobra. Vitor (26/08/2026): "só pode ser
  // liberado as marcas que possuem projetos nas pastas". `temDesenho == null` = obra nunca
  // conferida: também não libera, porque "não sei" não é "tem".
  // ⚠ `confiavel` entra aqui porque o POST cobra ele: conferência truncada ou de antes da lista
  // atual barra a OP INTEIRA. Sem isso a tela pintaria verde no que o servidor recusa.
  const liberavel = (p) => !!d?.pasta?.confiavel && p.temDesenho === true;
  const selecionaveis = useMemo(() => f.filtradas.filter(liberavel), [f.filtradas]);
  const selecionadas = useMemo(() => f.filtradas.filter((p) => sel.has(p.id)), [f.filtradas, sel]);
  const somaSel = useMemo(() => selecionadas.reduce((a, p) => ({
    kg: a.kg + (p.pesoTotalKg || 0), n: a.n + (p.qte || 1),
    perfis: a.perfis + (p.pool === "PERFIS" ? p.qte || 1 : 0),
    chapas: a.chapas + (p.pool === "CHAPAS" ? p.qte || 1 : 0),
  }), { kg: 0, n: 0, perfis: 0, chapas: 0 }), [selecionadas]);

  // o marco = a data do primeiro setor escolhido
  const marco = useMemo(() => {
    const datas = setores.map((k) => lib?.datasSetor?.[k]).filter(Boolean).sort();
    return datas[0] || null;
  }, [setores, lib]);
  const desvio = marco ? Math.round((new Date().setUTCHours(12, 0, 0, 0) - new Date(`${marco}T12:00:00Z`)) / 86400000) : null;

  async function preencherDia() {
    const { sugerirDoDia } = await import("@/lib/liberacao-sugestao");
    // ⚠ a sugestão do dia respeita o portão: sugerir peça que o POST vai barrar é fazer a pessoa
    // montar a carga do dia duas vezes.
    const s = sugerirDoDia(selecionaveis, { metaKg: Number(metaKg) || 12000, pools: d.pools });
    setSel(new Set(s.ids)); setSugestao(s);
  }

  async function marcarPrioridade(valor) {
    if (!sel.size) return;
    setMarcando(true); setErro("");
    try {
      const r = await fetch("/api/planejamento/liberacao/pecas", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...sel], prioridade: valor }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro ao marcar");
      await carregar();
    } catch (e) { setErro(e.message); } finally { setMarcando(false); }
  }

  async function conferirPasta() {
    setConferindo(true); setErro("");
    try {
      const r = await fetch("/api/planejamento/liberacao/pasta", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opId }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro ao conferir a pasta");
      await carregar();
    } catch (e) { setErro(e.message); } finally { setConferindo(false); }
  }

  async function liberar() {
    if (!selecionadas.length) return;
    // a frente da liberação: se a seleção é de uma frente só, usa ela; senão, marca como mista
    const frentes = [...new Set(selecionadas.map((p) => p.frente))];
    const frente = frentes.length === 1 ? frentes[0] : `${frentes.length} frentes`;
    setSalvando(true); setErro("");
    try {
      const r = await fetch("/api/planejamento/liberacao", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          opId, frente, setores, prioridade, dataMarco: marco, desvioMotivo: motivo,
          // ⚠ MANDA O QUE A TELA MOSTRA. `sel` guarda tudo que já foi marcado, inclusive o que
          // saiu de vista quando o filtro mudou — e os totais ao lado do botão saem de
          // `selecionadas`. Mandar `sel` liberava mais peças do que o número no botão dizia.
          pecaIds: selecionadas.map((p) => p.id), metaKg: Number(metaKg) || null,
          totalKg: Math.round(somaSel.kg), totalPecas: somaSel.n,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro ao liberar");
      setSel(new Set()); setSugestao(null); setMotivo("");
      await carregar(); onMudou?.();
    } catch (e) { setErro(e.message); } finally { setSalvando(false); }
  }

  if (!opId) return null;
  if (carregando) return <div className="text-sm text-torg-gray inline-flex items-center gap-2 py-4"><Loader2 size={15} className="animate-spin" /> carregando as peças…</div>;
  if (!d) return null;

  // ⚠ SEM LPC NÃO SE LIBERA — e a tela precisa DIZER isso, senão parece obra sem peça.
  if (!d.temLpc) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-[13px] text-amber-800 flex items-start gap-2">
        <AlertCircle size={16} className="mt-0.5 shrink-0" />
        <span>A <b>OP-{opNumero}</b> não tem LPC importada. Sem a lista da Engenharia não há o que liberar — o PCP não teria peça para imprimir nem para baixar.</span>
      </div>
    );
  }

  // ⚠ "todas" = todas as que PODEM descer. Marcar as travadas encheria a seleção de peça que o
  // POST vai barrar, e o erro só apareceria no fim.
  const todasMarcadas = selecionaveis.length > 0 && selecionaveis.every((p) => sel.has(p.id));

  return (
    <div className="space-y-3">
      {erro && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-[13px] text-red-700 flex items-start gap-2">
          <AlertCircle size={15} className="mt-0.5 shrink-0" /> {erro}
        </div>
      )}

      {/* ⚠⚠ O PORTÃO DO DESENHO. Vitor (26/08/2026): "vamos ignorar os projetos da pasta 2.5.5,
          então precisamos disso na tela do planejamento, só pode ser liberado as marcas que
          possuem projetos nas pastas".

          ⚠ O retrato é de uma varredura periódica, então o bloqueio VEM COM SAÍDA: o botão
          reconfere a obra na hora. Barrar por um dado de ontem sem oferecer como atualizar seria
          uma parede, não um portão. */}
      {d?.pasta && !d.pasta.conferida && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 text-[12px] text-red-700 flex items-start gap-2">
          <AlertCircle size={15} className="mt-0.5 shrink-0" />
          <div className="flex-1">
            <b>A pasta desta obra nunca foi conferida.</b> Sem saber quais marcas têm desenho em
            2.5.2 Fabricação nada pode ser liberado — estar na LPC não é ter projeto.
            {d.pasta.erro && <span className="block mt-0.5 text-red-600">Última tentativa: {d.pasta.erro}</span>}
          </div>
          <BotaoConferir onClick={conferirPasta} conferindo={conferindo} />
        </div>
      )}

      {d?.pasta?.conferida && !d.pasta.confiavel && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 text-[12px] text-red-700 flex items-start gap-2">
          <AlertCircle size={15} className="mt-0.5 shrink-0" />
          <div className="flex-1">
            {d.pasta.truncado > 0
              ? <><b>A conferência desta obra veio cortada</b> — {fmtN(d.pasta.truncado)} marca(s) ficaram fora da lista de faltantes.</>
              : <><b>A conferência é de antes da lista atual:</b> olhou {fmtN(d.pasta.marcasConferidas)} marca(s) e a LPC hoje tem {fmtN(d.pasta.marcasHoje)}.</>}
            {" "}O que ficou de fora passaria por "tem desenho", então nada é liberado até reconferir.
          </div>
          <BotaoConferir onClick={conferirPasta} conferindo={conferindo} />
        </div>
      )}

      {d?.pasta?.conferida && d.pasta.confiavel && d.pasta.semDesenho > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 text-[12px] text-amber-800 flex items-start gap-2">
          <AlertCircle size={15} className="mt-0.5 shrink-0" />
          <div className="flex-1">
            <b>{fmtN(d.pasta.semDesenho)} peça(s) desta lista estão travadas por falta de desenho</b> em
            2.5.2 Fabricação — só desce para o PCP o que tem projeto na pasta.
            {d.pasta.soEnvio > 0 && <> {fmtN(d.pasta.soEnvio)} delas estão em <b>2.5.5</b>, a pasta de envio ao cliente: é mover o arquivo, não desenhar.</>}
            <span className="block mt-0.5 text-amber-700">
              Conferido em {new Date(d.pasta.checadoEm).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
              {" "}· se a Engenharia acabou de salvar, reconfira.
            </span>
          </div>
          <BotaoConferir onClick={conferirPasta} conferindo={conferindo} />
        </div>
      )}

      {/* ── o que já está liberado ── */}
      {lib?.frentes?.some((x) => x.liberacao && x.liberacao.status !== "CANCELADA") && (
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className="text-torg-gray-light uppercase">já liberado:</span>
          {lib.frentes.filter((x) => x.liberacao && x.liberacao.status !== "CANCELADA").map((x) => (
            <span key={x.frente} title={x.liberacao.desvioMotivo || ""}
              className={`px-1.5 py-0.5 rounded border font-semibold ${PRIO[x.liberacao.prioridade].chip}`}>
              {x.frente} · {(x.liberacao.setores || []).join(" ")}
              {x.liberacao.desvioDias > 0 && <span className="ml-1 font-normal">{x.liberacao.desvioDias}d após o marco</span>}
            </span>
          ))}
        </div>
      )}

      {/* ── barra de ação ── */}
      <div className="bg-white border border-torg-blue-100 rounded-xl p-3 flex flex-wrap items-center gap-2">
        <label className="text-[12px] text-torg-gray inline-flex items-center gap-1.5 cursor-pointer select-none">
          <input type="checkbox" checked={soAFazer} onChange={(e) => { setSoAFazer(e.target.checked); setSel(new Set()); setSugestao(null); }} className="accent-torg-blue" />
          só as a fazer
        </label>
        {d?.pasta?.conferida && !d.pasta.confiavel && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 text-[12px] text-red-700 flex items-start gap-2">
          <AlertCircle size={15} className="mt-0.5 shrink-0" />
          <div className="flex-1">
            {d.pasta.truncado > 0
              ? <><b>A conferência desta obra veio cortada</b> — {fmtN(d.pasta.truncado)} marca(s) ficaram fora da lista de faltantes.</>
              : <><b>A conferência é de antes da lista atual:</b> olhou {fmtN(d.pasta.marcasConferidas)} marca(s) e a LPC hoje tem {fmtN(d.pasta.marcasHoje)}.</>}
            {" "}O que ficou de fora passaria por "tem desenho", então nada é liberado até reconferir.
          </div>
          <BotaoConferir onClick={conferirPasta} conferindo={conferindo} />
        </div>
      )}

      {d?.pasta?.conferida && d.pasta.confiavel && d.pasta.semDesenho > 0 && (
          <label className="text-[12px] text-torg-gray inline-flex items-center gap-1.5 cursor-pointer select-none" title="Tira da frente as marcas travadas por falta de desenho (elas continuam existindo — só não aparecem)">
            <input type="checkbox" checked={soComDesenho} onChange={(e) => { setSoComDesenho(e.target.checked); setSel(new Set()); setSugestao(null); }} className="accent-torg-blue" />
            esconder as travadas
          </label>
        )}

        <span className="text-torg-gray-light">·</span>
        <span className="text-[12px] text-torg-gray">meta do dia</span>
        <input type="number" value={metaKg} onChange={(e) => setMetaKg(e.target.value)} min={500} step={500}
          className="w-24 text-[13px] border border-gray-200 rounded-lg px-2 py-1 text-right tabular-nums focus:border-torg-blue outline-none" />
        <span className="text-[12px] text-torg-gray">kg</span>

        <button onClick={preencherDia} disabled={!f.filtradas.length}
          title="Escolhe as peças até a meta, respeitando o limite de kg E de peças de cada laser"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-torg-blue text-white hover:opacity-90 disabled:opacity-40">
          <Wand2 size={14} /> Preencher o dia
        </button>

        <div className="ml-auto flex items-center gap-2">
          {f.ativos > 0 && <button onClick={f.limpar} className="text-[11px] text-torg-orange hover:underline">limpar filtro</button>}
          <span className="text-[12px] text-torg-gray">
            {fmtN(f.filtradas.length)} de {fmtN(base.length)} peça(s)
          </span>
        </div>
      </div>

      {/* ── o que a sugestão montou ── */}
      {sugestao && (
        /* ⚠ dizer POR QUE parou: pacote que fecha abaixo da meta sem explicação parece erro. */
        <div className="bg-torg-blue-50 border border-torg-blue-100 rounded-xl px-4 py-2.5 text-[12px] text-torg-dark">
          <b>{fmtN(sugestao.pecas)} peças · {fmtKg(sugestao.kg)}</b> — {sugestao.limite}.
          {Object.entries(sugestao.porPool).map(([k, v]) => (
            <span key={k} className="ml-3 text-torg-gray">
              {v.label}: {fmtN(v.n)}/{fmtN(v.tetoPecas)} peças · {fmtKg(v.kg)}/{fmtKg(v.tetoKg)}{v.cheio ? " (cheio)" : ""}
            </span>
          ))}
          <span className="ml-3 text-torg-gray-light">a meta é {sugestao.fator}× a capacidade medida</span>
        </div>
      )}

      {/* ── a planilha ── */}
      <div className="border border-gray-100 rounded-xl overflow-hidden">
        <div className="overflow-x-auto max-h-[28rem] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-[11px] uppercase text-torg-gray sticky top-0 z-10">
              <tr>
                <th className="px-3 py-2 w-8">
                  <input type="checkbox" aria-label="Marcar todas as visíveis" className="accent-torg-orange"
                    checked={todasMarcadas}
                    onChange={() => setSel(todasMarcadas ? new Set() : new Set(selecionaveis.map((p) => p.id)))} />
                </th>
                <th className="px-3 py-2 text-left font-semibold">Marca</th>
                <ThFiltro col="frente" label="Frente" className="px-3 py-2 font-semibold text-left" {...fp} />
                <ThFiltro col="natureza" label="Tipo" className="px-3 py-2 font-semibold text-left" {...fp} />
                <ThFiltro col="desenho" label="Desenho" className="px-3 py-2 font-semibold text-left" {...fp} />
                <ThFiltro col="perfil" label="Perfil" className="px-3 py-2 font-semibold text-left" {...fp} />
                <th className="px-3 py-2 text-right font-semibold">Compr.</th>
                <th className="px-3 py-2 text-right font-semibold">Qtd</th>
                <th className="px-3 py-2 text-right font-semibold">Peso</th>
                <ThFiltro col="pool" label="Máquina" className="px-3 py-2 font-semibold text-left" {...fp} />
                <ThFiltro col="situacao" label="Situação" className="px-3 py-2 font-semibold text-left" {...fp} />
                <th className="px-3 py-2 w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {!f.filtradas.length && (
                <tr><td colSpan={12} className="px-3 py-8 text-center text-sm text-torg-gray">
                  {soAFazer ? "Nada a fazer com este filtro — tudo já foi cortado." : "Nada com este filtro."}
                </td></tr>
              )}
              {f.filtradas.slice(0, 1500).map((p) => {
                const on = sel.has(p.id);
                // ⚠ trava a linha, não some com ela: a marca sem desenho é justamente a que o
                // Planejamento precisa enxergar para cobrar a Engenharia.
                const trava = !liberavel(p);
                return (
                  <tr key={p.id} className={`${on ? "bg-torg-blue-50/50" : trava ? "bg-red-50/40" : "hover:bg-gray-50/60"} ${p.cortada ? "opacity-60" : ""}`}>
                    <td className="px-3 py-1.5">
                      <input type="checkbox" className="accent-torg-orange disabled:cursor-not-allowed" checked={on} disabled={trava}
                        aria-label={trava ? `${p.marca} sem desenho na pasta — não pode ser liberada` : `Selecionar ${p.marca}`}
                        title={trava ? "Sem desenho em 2.5.2 Fabricação — não desce para o PCP" : ""}
                        onChange={() => setSel((s) => { const n = new Set(s); n.has(p.id) ? n.delete(p.id) : n.add(p.id); return n; })} />
                    </td>
                    <td className="px-3 py-1.5 font-mono text-[12px] font-semibold text-torg-dark whitespace-nowrap">
                      {p.prioridade != null && <Star size={11} className="inline mr-1 text-torg-orange fill-current" />}
                      {p.marca}
                    </td>
                    <td className="px-3 py-1.5 text-[12px] text-torg-gray">{p.frente}</td>
                    <td className="px-3 py-1.5 text-[12px] text-torg-gray">{NAT[p.natureza]}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap">
                      {!d?.pasta?.confiavel ? <span className="text-[11px] text-torg-gray-light" title="A conferência desta obra não vale — reconfira a pasta">não conferido</span>
                        : p.temDesenho == null ? <span className="text-[11px] text-torg-gray-light" title="A pasta desta obra nunca foi conferida">não conferido</span>
                        : p.temDesenho ? <span className="text-[11px] text-emerald-700">na pasta</span>
                        : p.desenhoForaPadrao ? <span className="text-[11px] text-amber-700" title={`o arquivo existe com outro nome: ${p.desenhoForaPadrao} — renomear resolve`}>outro nome *</span>
                        : p.desenhoSoEnvio ? <span className="text-[11px] text-amber-700" title="o desenho está em 2.5.5, a pasta de envio ao cliente — mover para 2.5.2 resolve">só em 2.5.5</span>
                        : <span className="text-[11px] text-red-600">sem desenho</span>}
                    </td>
                    <td className="px-3 py-1.5 text-[12px] text-torg-gray truncate max-w-[18ch]" title={p.perfil}>{p.perfil || "—"}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-[12px] text-torg-gray">{p.comprimentoMm ? fmtN(p.comprimentoMm) : "—"}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-[12px]">{fmtN(p.qte)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-[12px]">{fmtKg(p.pesoTotalKg)}</td>
                    <td className="px-3 py-1.5 text-[12px] text-torg-gray">{p.pool === "CHAPAS" ? "chapa" : "perfil"}</td>
                    <td className="px-3 py-1.5">
                      {p.cortada
                        ? <span className="text-[11px] text-emerald-700">já cortada</span>
                        : <span className="text-[11px] text-torg-gray">a fazer</span>}
                    </td>
                    <td className="px-3 py-1.5" />
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {f.filtradas.length > 1500 && (
          /* ⚠ corte declarado: lista silenciosamente truncada faria alguém liberar achando que viu tudo */
          <p className="px-3 py-2 text-[11px] text-amber-700 bg-amber-50 border-t border-amber-100">
            Mostrando 1.500 de {fmtN(f.filtradas.length)}. Use os filtros para chegar no que interessa — a
            seleção e o "preencher o dia" consideram as {fmtN(f.filtradas.length)}.
          </p>
        )}
      </div>

      {/* ── o que fazer com a seleção ── */}
      {sel.size > 0 && (
        <div className="bg-white border border-torg-blue-100 rounded-xl p-4 space-y-3">
          <div className="flex items-baseline gap-3 flex-wrap">
            <p className="text-sm font-bold text-torg-dark">{fmtN(somaSel.n)} peça(s) · {fmtKg(somaSel.kg)}</p>
            <span className="text-[12px] text-torg-gray">perfil {fmtN(somaSel.perfis)} · chapa {fmtN(somaSel.chapas)}</span>
            <button onClick={() => { setSel(new Set()); setSugestao(null); }} className="text-[11px] text-torg-gray hover:underline ml-auto">limpar seleção</button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] uppercase text-torg-gray-light">Prioridade da peça</span>
            <button onClick={() => marcarPrioridade(1)} disabled={marcando}
              className="text-[12px] px-2.5 py-1 rounded-lg border bg-torg-orange text-white border-torg-orange disabled:opacity-40 inline-flex items-center gap-1">
              <Star size={12} /> marcar como prioridade
            </button>
            <button onClick={() => marcarPrioridade(null)} disabled={marcando}
              className="text-[12px] px-2.5 py-1 rounded-lg border bg-white text-torg-gray border-gray-200 disabled:opacity-40">
              tirar prioridade
            </button>
            {marcando && <Loader2 size={13} className="animate-spin text-torg-blue" />}
          </div>

          <div className="border-t border-gray-100 pt-3 space-y-3">
            <p className="text-sm font-bold text-torg-dark inline-flex items-center gap-2"><Flag size={15} className="text-torg-blue" /> Liberar para o PCP</p>

            <div>
              <p className="text-[11px] uppercase text-torg-gray-light mb-1.5">Setores que descem agora</p>
              <div className="flex flex-wrap gap-1.5">
                {(lib?.setores || []).map((s) => {
                  const on = setores.includes(s.key);
                  return (
                    <button key={s.key} onClick={() => setSetores((v) => (on ? v.filter((k) => k !== s.key) : [...v, s.key]))}
                      className={`text-[12px] px-2.5 py-1 rounded-lg border ${on ? "bg-torg-blue text-white border-torg-blue" : "bg-white text-torg-gray border-gray-200 hover:border-torg-blue"}`}>
                      {s.label}
                      {lib?.datasSetor?.[s.key] && <span className={`ml-1.5 text-[10px] ${on ? "text-white/70" : "text-torg-gray-light"}`}>{fmtD(lib.datasSetor[s.key])}</span>}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[11px] uppercase text-torg-gray-light">Prioridade da carga</span>
              {["ALTA", "MEDIA", "BAIXA"].map((k) => (
                <button key={k} onClick={() => setPrioridade(k)}
                  className={`text-[12px] px-2.5 py-1 rounded-lg border ${prioridade === k ? PRIO[k].chip + " font-semibold" : "bg-white text-torg-gray border-gray-200"}`}>
                  {PRIO[k].rot}
                </button>
              ))}
            </div>

            <div className="text-[12px] text-torg-gray inline-flex items-center gap-2">
              <CalendarClock size={14} />
              {marco
                ? <>Marco: <b className="text-torg-dark">{fmtD(marco)}</b>{desvio === 0 ? " — liberando no dia" : desvio > 0 ? <span className="text-red-600"> — {desvio} dia(s) depois</span> : <span className="text-emerald-700"> — {-desvio} dia(s) antes</span>}</>
                : <span className="text-torg-gray-light">Sem data por setor informada — a liberação fica sem marco e sem desvio para medir.</span>}
            </div>

            {desvio > 0 && (
              <div>
                <label className="block text-[11px] uppercase text-torg-gray-light mb-1">Por que não começou no marco?</label>
                <input value={motivo} onChange={(e) => setMotivo(e.target.value)}
                  placeholder="ex.: material não chegou, desenho em revisão, fábrica na OP-083"
                  className="w-full text-[13px] border border-gray-200 rounded-lg px-3 py-2 focus:border-torg-blue outline-none" />
              </div>
            )}

            <div className="flex items-center gap-2">
              <button onClick={liberar} disabled={salvando || !setores.length || (desvio > 0 && !motivo.trim())}
                className="px-4 py-2 bg-torg-blue text-white text-sm font-semibold rounded-lg disabled:opacity-40 inline-flex items-center gap-2">
                {salvando ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Liberar {fmtN(somaSel.n)} peça(s) para o PCP
              </button>
              <span className="text-[11px] text-torg-gray-light">o PCP gera a separação, imprime os projetos e libera para os setores</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
