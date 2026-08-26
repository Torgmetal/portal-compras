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
import { Loader2, AlertCircle, Send, Check, X, Flag, CalendarClock, Wand2, Star, RefreshCw, Minus, FileWarning, Timer, FileDown, CalendarRange } from "lucide-react";
import { useFiltroColunas, ThFiltro } from "@/components/FiltroColuna";
import { estimarPrazo, somarDiasUteis, proximoDiaUtil, classeDaPeca, kgPorMetro } from "@/lib/prazo-preparacao";

const fmtN = (n) => Number(n || 0).toLocaleString("pt-BR");
const fmtKg = (n) => `${Number(n || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} kg`;
const fmtD = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC", day: "2-digit", month: "2-digit" }) : "—");
// classes por extenso: Tailwind não gera classe montada em runtime
const PRIO = {
  ALTA:  { rot: "Alta",  chip: "bg-red-50 text-red-700 border-red-200" },
  MEDIA: { rot: "Média", chip: "bg-amber-50 text-amber-700 border-amber-200" },
  BAIXA: { rot: "Baixa", chip: "bg-gray-100 text-torg-gray border-gray-200" },
};
// ⚠ o nome que a fábrica usa. Vitor (26/08/2026): croqui é croqui, e a avulsa é uma MARCA — "Peça
// P" e "Avulsa" eram rótulo de tela, não a palavra de quem trabalha com a peça na mão.
const MAT = {
  NA_OP:        { rot: "entregue",   dica: "material desta obra recebido no CMR",             cor: "text-emerald-600", Icone: "Check" },
  ESTOQUE:      { rot: "de estoque", dica: "existe material igual, mas entrou por outra obra — o PCP informa o R usado", cor: "text-amber-700", Icone: "FileWarning" },
  SEM_MATERIAL: { rot: "não chegou", dica: "sem entrada no CMR para este perfil",             cor: "text-red-500",     Icone: "X" },
};
const MAT_FALTA = { AGUARDANDO_ENTREGA: "aguardando entrega", SOLICITADO: "pedido não emitido", NAO_COMPRADO: "não comprado" };

const NAT = { croqui: "Croqui", avulsa: "Marca", conjunto: "Conjunto" };

const COLUNAS = [
  { key: "frente",   label: "Frente",   valor: (p) => p.frente || "—" },
  // ⚠ estar na LPC não é ter desenho — e é por esta coluna que dá para separar os dois.
  // ⚠ o FILTRO fica por extenso (ninguém procura por um ícone numa lista de opções); quem encurta
  // é a célula.
  { key: "nc1",      label: "NC1",      valor: (p) => (p.temMaquina == null ? "não medido" : p.temMaquina ? "tem NC1" : "sem NC1") },
  { key: "material", label: "Material", valor: (p) => (p.material ? MAT[p.material]?.rot || p.material : "não medido") },
  { key: "desenho",  label: "Desenho",  valor: (p) => (p.temDesenho == null ? "não conferido" : p.temDesenho ? "tem desenho"
      : p.desenhoForaPadrao ? "outro nome" : "sem desenho") },
  { key: "natureza", label: "Tipo",     valor: (p) => NAT[p.natureza] || p.natureza },
  { key: "perfil",   label: "Perfil",   valor: (p) => p.perfil || "—" },
  { key: "pool",     label: "Máquina",  valor: (p) => (p.pool === "CHAPAS" ? "Laser chapa" : "Laser perfil") },
  { key: "situacao", label: "Situação", valor: (p) => (p.cortada ? "Já cortada" : p.programadaEm ? "Programada" : "A fazer") },
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
  const [baixando, setBaixando] = useState(false);
  const [dia, setDia] = useState("");
  const [programandoSemana, setProgramandoSemana] = useState(false);
  const [plano, setPlano] = useState(null);
  const [nDias, setNDias] = useState(5);

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
  // ⚠ os DOIS arquivos: o desenho que a bancada abre e o NC1 que a máquina lê. `temMaquina == null`
  // é conferência antiga que não mediu isso — aí não se cobra, senão travava tudo até o cron passar.
  // ⚠ JÁ PROGRAMADA SAI DA ESCOLHA. Programar a semana é voltar aqui vários dias seguidos; se a
  // peça do dia 1 continuasse disponível, o "preencher o dia" devolveria o mesmo lote sempre.
  const liberavel = (p) => !!d?.pasta?.confiavel && p.temDesenho === true && p.temMaquina !== false && !p.programadaEm;
  const selecionaveis = useMemo(() => f.filtradas.filter(liberavel), [f.filtradas]);
  const selecionadas = useMemo(() => f.filtradas.filter((p) => sel.has(p.id)), [f.filtradas, sel]);
  const somaSel = useMemo(() => selecionadas.reduce((a, p) => ({
    kg: a.kg + (p.pesoTotalKg || 0), n: a.n + (p.qte || 1),
    perfis: a.perfis + (p.pool === "PERFIS" ? p.qte || 1 : 0),
    chapas: a.chapas + (p.pool === "CHAPAS" ? p.qte || 1 : 0),
  }), { kg: 0, n: 0, perfis: 0, chapas: 0 }), [selecionadas]);

  // ⚠⚠ A PREVISÃO. Vitor (26/08/2026): "de acordo com o total da lista ou a seleção das peças vc já
  // nos informa quanto tempo (…) para podermos definir o tempo que será necessário para o setor
  // finalizar". Sem seleção ela fala da LISTA INTEIRA — é a pergunta "quanto tempo esta obra leva";
  // com seleção, fala do pacote — "quanto tempo o que estou mandando hoje leva".
  const escopo = selecionadas.length ? selecionadas : f.filtradas;
  const travadasNoEscopo = useMemo(() => escopo.reduce((n, p) => n + (liberavel(p) ? 0 : (Number(p.qte) || 1)), 0), [escopo]); // eslint-disable-line react-hooks/exhaustive-deps
  const prazo = useMemo(
    () => estimarPrazo(escopo, { metaKg: Number(metaKg) || 12000, pools: d?.pools }),
    [escopo, metaKg, d]);

  // ⚠ O MARCO VEM DO CRONOGRAMA. Vitor (26/08/2026): "a partir da OP que eu selecionar vc já traz a
  // data informada no cronograma". A data digitada à mão continua existindo (é ela que manda na TV
  // de Prioridades) e entra só como reserva, quando o cronograma não tem a linha daquele setor.
  const marco = useMemo(() => {
    const datas = setores.map((k) => lib?.datasSetorCrono?.[k] || lib?.datasSetor?.[k]).filter(Boolean).sort();
    return datas[0] || null;
  }, [setores, lib]);
  const desvio = marco ? Math.round((new Date().setUTCHours(12, 0, 0, 0) - new Date(`${marco}T12:00:00Z`)) / 86400000) : null;

  // ⚠ MARCO VENCIDO NÃO VIRA PROMESSA. Vitor (26/08/2026): "se a data já estiver como atrasa sem
  // problema preencha com a data nova". Repetir uma data que já passou seria fingir que dá; o que
  // vale é quando dá se começar agora.
  const marcoPrazo = useMemo(() => {
    if (!prazo.diasCheios) return null;
    const atrasado = desvio != null && desvio > 0;
    const partida = atrasado || !marco ? proximoDiaUtil() : new Date(`${marco}T12:00:00Z`);
    return {
      marco, atrasado,
      inicio: partida.toISOString().slice(0, 10),
      fim: somarDiasUteis(partida, prazo.diasCheios - 1).toISOString().slice(0, 10),
    };
  }, [marco, desvio, prazo.diasCheios]);

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

  // ⚠ EXPORTA O QUE ESTÁ NA TELA, não a lista bruta: sai com os filtros aplicados e na ordem que a
  // pessoa deixou. Planilha que ignora o filtro obriga a filtrar tudo de novo no Excel.
  // ⚠ E SAI INTEIRA — a tabela mostra no máximo 1.500 linhas, a planilha leva as {f.filtradas}.
  async function exportar() {
    if (!f.filtradas.length) return;
    setBaixando(true); setErro("");
    try {
      const { criarRelatorioTorg, adicionarHeaderTabela, adicionarLinhaTabela, adicionarRodapeISO, downloadWorkbook } =
        await import("@/lib/excel-relatorio");
      const cab = ["Marca", "Frente", "Tipo", "Desenho", "NC1", "Material", "Perfil", "Aço", "Compr. (mm)",
        "Qtd", "Peso (kg)", "Classe", "kg/m", "Máquina", "Situação", "Prioridade", "Selecionada"];
      const { workbook, sheet: ws, linhaInicio } = await criarRelatorioTorg({
        titulo: `Lista de preparação — OP-${opNumero}`,
        subtitulo: [
          selecionadas.length ? `${fmtN(somaSel.n)} peça(s) selecionada(s)` : "Lista completa",
          f.ativos ? `Filtro: ${f.rotulosAtivos.join(", ")}` : soAFazer ? "Só as a fazer" : "Todas",
          prazo.diasCheios ? `Previsão ${fmtN(prazo.diasCheios)} dia(s) na meta de ${fmtN(Number(metaKg) || 0)} kg/dia` : "",
        ].filter(Boolean).join(" · "),
        kpis: [`${fmtN(prazo.un)} peça(s)`, fmtKg(prazo.kg), `${fmtN(prazo.diasCheios)} dia(s)`],
        totalColunas: cab.length, nomePlanilha: "Preparacao", codigoDoc: "REL-PLN-003",
      });
      ws.columns = [{ width: 16 }, { width: 10 }, { width: 10 }, { width: 12 }, { width: 10 }, { width: 20 },
        { width: 22 }, { width: 14 }, { width: 12 }, { width: 7 }, { width: 11 }, { width: 14 },
        { width: 8 }, { width: 10 }, { width: 11 }, { width: 11 }, { width: 12 }];
      let l = linhaInicio;
      adicionarHeaderTabela(ws, l, cab); l++;
      for (const p of f.filtradas) {
        const c = classeDaPeca(p);
        adicionarLinhaTabela(ws, l, [
          p.marca, p.frente, NAT[p.natureza] || p.natureza,
          // ⚠ na planilha vai por extenso: ✓/✕ é atalho de tela, e ninguém filtra Excel por ícone.
          p.temDesenho == null ? "não conferido" : p.temDesenho ? "tem" : p.desenhoForaPadrao ? `outro nome: ${p.desenhoForaPadrao}` : "não tem",
          p.temMaquina == null ? "não medido" : p.temMaquina ? "tem" : "não tem",
          !p.material ? "não medido" : p.material === "SEM_MATERIAL" ? (MAT_FALTA[p.materialFalta] || "não chegou") : MAT[p.material]?.rot || p.material,
          p.perfil || "", p.aco || "", Math.round(p.comprimentoMm || 0), p.qte || 0,
          Math.round(p.pesoTotalKg || 0), c?.nome || "", Number(kgPorMetro(p).toFixed(1)),
          p.pool === "CHAPAS" ? "chapa" : "perfil",
          p.cortada ? "já cortada" : p.programadaEm ? (p.programadaEm === "sem data" ? "programada" : `programada ${fmtD(p.programadaEm)}`) : "a fazer",
          p.prioridade != null ? "sim" : "", sel.has(p.id) ? "sim" : "",
        ], { alinhamento: { 8: "right", 9: "right", 10: "right", 12: "right" } });
        l++;
      }
      adicionarRodapeISO(ws, l + 1, cab.length);
      await downloadWorkbook(workbook, `Lista de preparacao - OP-${opNumero}.xlsx`);
    } catch (e) { setErro(`Não consegui gerar a planilha: ${e?.message || e}`); }
    finally { setBaixando(false); }
  }

  // ⚠⚠ PROGRAMAR VÁRIOS DIAS DE UMA VEZ. Vitor (26/08/2026): "já deixar permitido para eu fazer
  // isso já vários dias para já deixar pronto essa programação".
  //
  // ⚠ MONTA ANTES, GRAVA DEPOIS. Chamar o "preencher o dia" em laço não funcionaria: cada gravação
  // recarrega a lista e o estado do React só chega no render seguinte — o dia 2 escolheria as
  // mesmas peças do dia 1. Aqui o pool é uma cópia local e cada dia sai dele.
  //
  // ⚠ E MOSTRA O PLANO ANTES DE GRAVAR: são N liberações de uma vez, cada uma vira trabalho no
  // chão de fábrica. Gravar sete dias sem o Planejamento ver o que saiu seria escolher por ele.
  async function montarPlano() {
    const { sugerirDoDia } = await import("@/lib/liberacao-sugestao");
    let pool = selecionaveis.slice();
    const partida = dia ? new Date(`${dia}T12:00:00Z`) : proximoDiaUtil();
    const dias = [];
    for (let i = 0; i < Math.max(1, Number(nDias) || 1) && pool.length; i++) {
      const sug = sugerirDoDia(pool, { metaKg: Number(metaKg) || 12000, pools: d.pools });
      if (!sug.ids?.length) break;
      const ids = new Set(sug.ids);
      const pecas = pool.filter((p) => ids.has(p.id));
      dias.push({
        data: (i === 0 ? partida : somarDiasUteis(partida, i)).toISOString().slice(0, 10),
        pecas,
        kg: pecas.reduce((a, x) => a + (x.pesoTotalKg || 0), 0),
        un: pecas.reduce((a, x) => a + (x.qte || 1), 0),
      });
      pool = pool.filter((p) => !ids.has(p.id));
    }
    setPlano({ dias, sobra: pool.length, sobraKg: pool.reduce((a, x) => a + (x.pesoTotalKg || 0), 0) });
    setSel(new Set()); setSugestao(null);
  }

  async function gravarPlano() {
    if (!plano?.dias?.length || !setores.length) return;
    setProgramandoSemana(true); setErro("");
    try {
      for (const dd of plano.dias) {
        const frentes = [...new Set(dd.pecas.map((p) => p.frente))];
        const r = await fetch("/api/planejamento/liberacao", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            opId, frente: frentes.length === 1 ? frentes[0] : `${frentes.length} frentes`,
            setores, prioridade, dataMarco: marco, desvioMotivo: motivo, dataProgramada: dd.data,
            pecaIds: dd.pecas.map((p) => p.id), metaKg: Number(metaKg) || null,
            totalKg: Math.round(dd.kg), totalPecas: dd.un,
          }),
        });
        const j = await r.json();
        // ⚠ para no primeiro erro e diz em qual dia parou — seguir gravaria um calendário com buraco
        if (!r.ok) throw new Error(`${new Date(`${dd.data}T12:00:00Z`).toLocaleDateString("pt-BR")}: ${j.error || "erro ao programar"}`);
      }
      setPlano(null); setMotivo("");
      await carregar(); onMudou?.();
    } catch (e) { setErro(e.message); await carregar(); }
    finally { setProgramandoSemana(false); }
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
    if (!selecionadas.length) return false;
    // a frente da liberação: se a seleção é de uma frente só, usa ela; senão, marca como mista
    const frentes = [...new Set(selecionadas.map((p) => p.frente))];
    const frente = frentes.length === 1 ? frentes[0] : `${frentes.length} frentes`;
    setSalvando(true); setErro("");
    let ok = false;
    try {
      const r = await fetch("/api/planejamento/liberacao", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          opId, frente, setores, prioridade, dataMarco: marco, desvioMotivo: motivo,
          dataProgramada: dia || null,
          // ⚠ MANDA O QUE A TELA MOSTRA. `sel` guarda tudo que já foi marcado, inclusive o que
          // saiu de vista quando o filtro mudou — e os totais ao lado do botão saem de
          // `selecionadas`. Mandar `sel` liberava mais peças do que o número no botão dizia.
          pecaIds: selecionadas.map((p) => p.id), metaKg: Number(metaKg) || null,
          totalKg: Math.round(somaSel.kg), totalPecas: somaSel.n,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro ao liberar");
      ok = true;
      setSel(new Set()); setSugestao(null); setMotivo("");
      // ⚠ o próximo dia já vem preenchido: quem programa a semana não deveria digitar data sete vezes
      if (dia) setDia(somarDiasUteis(new Date(`${dia}T12:00:00Z`), 1).toISOString().slice(0, 10));
      await carregar(); onMudou?.();
    } catch (e) { setErro(e.message); } finally { setSalvando(false); }
    return ok;
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

      {/* ⚠⚠ O PORTÃO DO DESENHO. Vitor (26/08/2026): "só pode ser liberado as marcas que possuem
          projetos nas pastas".

          ⚠ A PASTA DE ENVIO AO CLIENTE NÃO APARECE EM LUGAR NENHUM. Vitor (26/08/2026): "o vinculo
          da pasta 2.5.5 não precisa ser mencionado em nada só se eu pedir". Continua sendo medida
          (o dado está gravado, para quando ele pedir), mas para quem lê a tela o estado é um só:
          não tem desenho na fabricação.

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
            <span className="block mt-0.5 text-amber-700">
              Conferido em {new Date(d.pasta.checadoEm).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
              {" "}· se a Engenharia acabou de salvar, reconfira.
            </span>
          </div>
          <BotaoConferir onClick={conferirPasta} conferindo={conferindo} />
        </div>
      )}

      {d?.pasta?.conferida && d.pasta.confiavel && d.pasta.semMaquina > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 text-[12px] text-amber-800 flex items-start gap-2">
          <AlertCircle size={15} className="mt-0.5 shrink-0" />
          <div className="flex-1">
            <b>{fmtN(d.pasta.semMaquina)} peça(s) têm desenho mas não têm arquivo de máquina</b> (NC1, DXF
            ou modelo 3D) na pasta da obra. O desenho a bancada abre; sem o NC1 a máquina não tem o
            que ler, então também não desce.
          </div>
          <BotaoConferir onClick={conferirPasta} conferindo={conferindo} />
        </div>
      )}

      {d?.dias?.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className="uppercase text-torg-gray-light">Já programado</span>
          {d.dias.map((x) => (
            <span key={x.dia || "sem"} className="px-1.5 py-0.5 rounded border border-emerald-200 bg-emerald-50 text-emerald-800 font-semibold whitespace-nowrap">
              {x.dia ? fmtD(x.dia) : "sem data"} · {fmtN(x.pecas)} pç
            </span>
          ))}
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

      {d?.material && d.material.semMaterial > 0 && (
        <div className="bg-sky-50 border border-sky-200 rounded-lg px-3 py-2.5 text-[12px] text-sky-900 flex items-start gap-2">
          <AlertCircle size={15} className="mt-0.5 shrink-0" />
          <span>
            <b>{fmtN(d.material.semMaterial)} peça(s) · {fmtKg(d.material.kgSemMaterial)} sem material entregue</b>
            {(d.material.aguardandoEntrega > 0 || d.material.solicitado > 0 || d.material.naoComprado > 0) && <>
              {" "}— {[
                d.material.aguardandoEntrega > 0 ? `${fmtN(d.material.aguardandoEntrega)} a caminho` : null,
                d.material.solicitado > 0 ? `${fmtN(d.material.solicitado)} sem pedido emitido` : null,
                d.material.naoComprado > 0 ? `${fmtN(d.material.naoComprado)} sem RM` : null,
              ].filter(Boolean).join(" · ")}
            </>}.
            {" "}Dá para liberar assim mesmo: quem separa o material e trava o que falta é o PCP.
          </span>
        </div>
      )}

      {/* ── quanto tempo isto leva ── */}
      {prazo.un > 0 && (
        <div className="bg-white border border-torg-blue-100 rounded-xl p-3.5 space-y-3">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <Timer size={15} className="text-torg-blue self-center" />
            <p className="text-sm font-bold text-torg-dark">
              {fmtN(prazo.diasCheios)} dia(s) de preparação
            </p>
            <span className="text-[12px] text-torg-gray">
              {selecionadas.length ? "para a seleção" : "para a lista inteira"} · {fmtN(prazo.un)} peça(s) · {fmtKg(prazo.kg)} · meta {fmtN(Number(metaKg) || 0)} kg/dia
            </span>
            {marcoPrazo && (
              <span className="text-[12px] text-torg-gray ml-auto">
                {marcoPrazo.atrasado
                  ? <>marco de {fmtD(marcoPrazo.marco)} já passou — começando hoje, termina <b className="text-torg-dark">{fmtD(marcoPrazo.fim)}</b></>
                  : <>começando {fmtD(marcoPrazo.inicio)}, termina <b className="text-torg-dark">{fmtD(marcoPrazo.fim)}</b></>}
              </span>
            )}
          </div>

          {/* ⚠ o prazo da lista INTEIRA conta o que ainda não pode descer — é o tempo que o setor
              precisa, não o que dá para mandar hoje. Dizer os dois evita ler "3 dias" numa lista
              que está 90% travada. */}
          {!selecionadas.length && travadasNoEscopo > 0 && (
            <p className="text-[12px] text-amber-800">
              {fmtN(travadasNoEscopo)} destas peças ainda não podem ser liberadas (falta desenho ou NC1) —
              o prazo acima é o do setor, não o do que desce hoje.
            </p>
          )}

          {/* ⚠ O QUE TRAVA O DIA, não só quantos dias. Peso e peças são tetos diferentes: 12 t de
              extra leve são milhares de peças e 12 t de extra pesado são dezenas. Dizer só o número
              de dias esconde o motivo — e o motivo é o que se ataca. */}
          <div className="flex flex-wrap gap-1.5">
            {prazo.porPool.map((g) => (
              <span key={g.pool} className="text-[11px] px-2 py-1 rounded-lg border border-gray-200 bg-gray-50 text-torg-gray">
                <b className="text-torg-dark">{g.label}</b> {fmtN(Math.ceil(g.dias))} d ·
                {" "}{fmtKg(g.kg)} / {fmtN(g.un)} pç ·
                {" "}<span className={g.limite === "pecas" ? "text-torg-orange font-semibold" : ""}>
                  trava {g.limite === "pecas" ? "no nº de peças" : "no peso"}
                </span>
              </span>
            ))}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead className="text-torg-gray-light uppercase text-[10px]">
                <tr className="text-left">
                  <th className="py-1 pr-3 font-semibold">Classe</th>
                  <th className="py-1 pr-3 font-semibold">Faixa</th>
                  <th className="py-1 pr-3 font-semibold text-right">Peças</th>
                  <th className="py-1 pr-3 font-semibold text-right">Peso</th>
                  <th className="py-1 pr-3 font-semibold text-right">Peso/peça</th>
                  <th className="py-1 font-semibold text-right">% do peso</th>
                </tr>
              </thead>
              <tbody className="text-torg-gray">
                {prazo.porClasse.map((c) => (
                  <tr key={c.key} className="border-t border-gray-50">
                    <td className="py-1 pr-3 font-semibold text-torg-dark whitespace-nowrap">{c.nome}</td>
                    <td className="py-1 pr-3 text-torg-gray-light whitespace-nowrap">{c.faixa}</td>
                    <td className="py-1 pr-3 text-right tabular-nums">{fmtN(c.un)}</td>
                    <td className="py-1 pr-3 text-right tabular-nums">{fmtKg(c.kg)}</td>
                    <td className="py-1 pr-3 text-right tabular-nums">{fmtKg(c.un ? c.kg / c.un : 0)}</td>
                    <td className="py-1 text-right tabular-nums">{prazo.kg ? Math.round((c.kg / prazo.kg) * 100) : 0}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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

        <span className="text-torg-gray-light">·</span>
        <span className="text-[12px] text-torg-gray">dia</span>
        <input type="date" value={dia} onChange={(e) => { setDia(e.target.value); setPlano(null); }}
          title="O dia em que este lote deve ser cortado. Em branco, a liberação vai sem data."
          className="text-[13px] border border-gray-200 rounded-lg px-2 py-1 tabular-nums focus:border-torg-blue outline-none" />

        <button onClick={preencherDia} disabled={!selecionaveis.length}
          title="Escolhe as peças até a meta, respeitando o limite de kg E de peças de cada laser"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-torg-blue text-white hover:opacity-90 disabled:opacity-40">
          <Wand2 size={14} /> Preencher o dia
        </button>

        {/* ⚠ a programação de vários dias fica ao lado do dia 1 de propósito: é a mesma decisão,
            só que repetida — e quem monta a semana não deveria procurar isso em outro canto. */}
        <span className="text-torg-gray-light">·</span>
        <input type="number" value={nDias} min={1} max={20} onChange={(e) => { setNDias(e.target.value); setPlano(null); }}
          className="w-14 text-[13px] border border-gray-200 rounded-lg px-2 py-1 text-right tabular-nums focus:border-torg-blue outline-none" />
        <button onClick={montarPlano} disabled={!selecionaveis.length}
          title="Monta um lote por dia útil, na meta, até acabar a lista — e mostra antes de gravar"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-torg-blue text-torg-blue bg-white hover:bg-torg-blue-50 disabled:opacity-40">
          <CalendarRange size={14} /> Montar {Math.max(1, Number(nDias) || 1)} dia(s)
        </button>

        <div className="ml-auto flex items-center gap-2">
          {f.ativos > 0 && <button onClick={f.limpar} className="text-[11px] text-torg-orange hover:underline">limpar filtro</button>}
          <button onClick={exportar} disabled={baixando || !f.filtradas.length}
            title="Exporta as linhas filtradas, com classe, kg/m e o status de desenho e NC1"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-torg-blue-100 bg-white text-torg-dark hover:border-torg-blue disabled:opacity-40">
            {baixando ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />} Planilha
          </button>
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
                <ThFiltro col="nc1" label="NC1" className="px-3 py-2 font-semibold text-left" {...fp} />
                <ThFiltro col="material" label="Material" className="px-3 py-2 font-semibold text-left" {...fp} />
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
                <tr><td colSpan={14} className="px-3 py-8 text-center text-sm text-torg-gray">
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
                      {!d?.pasta?.confiavel || p.temDesenho == null
                        ? <Minus size={13} className="text-torg-gray-light" title="A pasta desta obra não tem conferência que valha — reconfira" />
                        : p.temDesenho
                        ? <Check size={14} className="text-emerald-600" title="Desenho na pasta 2.5.2 Fabricação" />
                        : p.desenhoForaPadrao
                        ? <span className="inline-flex items-center gap-1 text-[11px] text-amber-700 whitespace-nowrap" title={`o arquivo existe com outro nome: ${p.desenhoForaPadrao} — renomear resolve`}><FileWarning size={13} className="shrink-0" /> nome</span>
                        : <X size={14} className="text-red-500" title="Sem desenho em 2.5.2 Fabricação — não desce para o PCP" />}
                    </td>
                    <td className="px-3 py-1.5">
                      {p.temMaquina == null
                        ? <Minus size={13} className="text-torg-gray-light" title="Esta conferência não mediu arquivo de máquina — reconfira" />
                        : p.temMaquina
                        ? <Check size={14} className="text-emerald-600" title="Arquivo de máquina (NC1/DXF) ou modelo 3D na pasta" />
                        : <X size={14} className="text-red-500" title="Sem arquivo de máquina — a máquina não tem o que ler" />}
                    </td>
                    <td className="px-3 py-1.5 whitespace-nowrap">
                      {!p.material ? <Minus size={13} className="text-torg-gray-light" title="Material não medido para esta peça" />
                        : p.material === "NA_OP" ? <Check size={14} className="text-emerald-600" title={MAT.NA_OP.dica} />
                        : p.material === "ESTOQUE" ? <span className="inline-flex items-center gap-1 text-[11px] text-amber-700" title={MAT.ESTOQUE.dica}><FileWarning size={13} className="shrink-0" /> estoque</span>
                        : <span className="inline-flex items-center gap-1 text-[11px] text-red-600" title={MAT_FALTA[p.materialFalta] || MAT.SEM_MATERIAL.dica}><X size={13} className="shrink-0" /> {p.materialFalta === "AGUARDANDO_ENTREGA" ? "a caminho" : "não tem"}</span>}
                    </td>
                    <td className="px-3 py-1.5 text-[12px] text-torg-gray truncate max-w-[18ch]" title={p.perfil}>{p.perfil || "—"}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-[12px] text-torg-gray">{p.comprimentoMm ? fmtN(p.comprimentoMm) : "—"}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-[12px]">{fmtN(p.qte)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-[12px]">{fmtKg(p.pesoTotalKg)}</td>
                    <td className="px-3 py-1.5 text-[12px] text-torg-gray">{p.pool === "CHAPAS" ? "chapa" : "perfil"}</td>
                    <td className="px-3 py-1.5">
                      {p.cortada
                        ? <span className="text-[11px] text-emerald-700">já cortada</span>
                        : p.programadaEm
                        ? <span className="text-[11px] text-torg-blue font-semibold whitespace-nowrap" title="já programada — sai da escolha do próximo dia">
                            {p.programadaEm === "sem data" ? "programada" : fmtD(p.programadaEm)}
                          </span>
                        : <span className="text-[11px] text-torg-gray">a fazer</span>}
                    </td>
                    <td className="px-3 py-1.5" />
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {/* ⚠ coluna de ícone pede legenda: sem ela o ✓ e o ✕ viram adivinhação, e é justamente esta
            coluna que decide o que pode descer. */}
        <div className="px-3 py-2 border-t border-gray-100 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-torg-gray">
          <span className="uppercase text-torg-gray-light">Desenho / NC1</span>
          <span className="inline-flex items-center gap-1"><Check size={13} className="text-emerald-600" /> tem — pode ser liberada</span>
          <span className="text-torg-gray-light">Desenho = o que a bancada abre · NC1 = o que a máquina lê</span>
        </div>
        {/* ⚠ MATERIAL NÃO TRAVA AQUI. Vitor (25/08/2026) pôs essa etapa no PCP: "pcp recebe a
            solicitação, manda separar o material (…) caso não tenha o material não libera aquele
            projeto para preparar". Aqui é para o Planejamento saber com o que está contando. */}
        <div className="px-3 pb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-torg-gray">
          <span className="uppercase text-torg-gray-light">Material</span>
          <span className="inline-flex items-center gap-1"><Check size={13} className="text-emerald-600" /> entregue nesta obra (CMR)</span>
          <span className="inline-flex items-center gap-1 text-amber-700"><FileWarning size={13} /> estoque — existe, entrou por outra OP</span>
          <span className="inline-flex items-center gap-1 text-red-600"><X size={13} /> a caminho / não tem</span>
          <span className="text-torg-gray-light">não trava a liberação — quem separa material é o PCP</span>
          <span className="inline-flex items-center gap-1"><X size={13} className="text-red-500" /> não tem</span>
          <span className="inline-flex items-center gap-1 text-amber-700"><FileWarning size={13} /> nome — existe com outro nome, é renomear</span>
          <span className="inline-flex items-center gap-1"><Minus size={13} className="text-torg-gray-light" /> sem conferência que valha</span>
        </div>

        {f.filtradas.length > 1500 && (
          /* ⚠ corte declarado: lista silenciosamente truncada faria alguém liberar achando que viu tudo */
          <p className="px-3 py-2 text-[11px] text-amber-700 bg-amber-50 border-t border-amber-100">
            Mostrando 1.500 de {fmtN(f.filtradas.length)}. Use os filtros para chegar no que interessa — a
            seleção e o "preencher o dia" consideram as {fmtN(f.filtradas.length)} — sempre só as que
            têm desenho.
          </p>
        )}
      </div>

      {/* ── a programação montada, antes de gravar ── */}
      {plano && (
        <div className="bg-white border-2 border-torg-blue rounded-xl p-4 space-y-3">
          <div className="flex flex-wrap items-baseline gap-3">
            <p className="text-sm font-bold text-torg-dark inline-flex items-center gap-2">
              <CalendarRange size={16} className="text-torg-blue" /> Programação de {fmtN(plano.dias.length)} dia(s)
            </p>
            <span className="text-[12px] text-torg-gray">
              {fmtN(plano.dias.reduce((a, x) => a + x.un, 0))} peça(s) · {fmtKg(plano.dias.reduce((a, x) => a + x.kg, 0))}
            </span>
            <button onClick={() => setPlano(null)} className="text-[11px] text-torg-gray hover:underline ml-auto">descartar</button>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {plano.dias.map((dd) => (
              <span key={dd.data} className="text-[11px] px-2 py-1 rounded-lg border border-torg-blue-100 bg-torg-blue-50 text-torg-dark whitespace-nowrap">
                <b>{fmtD(dd.data)}</b> · {fmtN(dd.un)} pç · {fmtKg(dd.kg)}
              </span>
            ))}
          </div>

          {/* ⚠ o que SOBRA é a informação que decide se a semana fecha a obra ou não */}
          {plano.sobra > 0 && (
            <p className="text-[12px] text-amber-800">
              Sobram {fmtN(plano.sobra)} linha(s) · {fmtKg(plano.sobraKg)} depois destes dias — não cabem na meta.
            </p>
          )}

          {!setores.length && (
            <p className="text-[12px] text-red-600">Escolha abaixo os setores que descem antes de gravar.</p>
          )}

          <button onClick={gravarPlano} disabled={programandoSemana || !setores.length || (desvio > 0 && !motivo.trim())}
            className="px-4 py-2 bg-torg-blue text-white text-sm font-semibold rounded-lg disabled:opacity-40 inline-flex items-center gap-2">
            {programandoSemana ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
            Gravar a programação ({fmtN(plano.dias.length)} liberação(ões))
          </button>
        </div>
      )}

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
                {salvando ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                Liberar {fmtN(somaSel.n)} peça(s){dia ? ` para ${fmtD(dia)}` : ""}
              </button>
              <span className="text-[11px] text-torg-gray-light">o PCP gera a separação, imprime os projetos e libera para os setores</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
