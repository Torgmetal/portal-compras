"use client";

// ─── PRAZOS DAS RMs — TODAS DE UMA VEZ ───────────────────────────────────────
//
// Matheus (16/09/2026): "preciso de uma aba fora para ver todas as RMs de uma vez, seus pedidos e
// prazos de cada", aberta pelo que aperta.
//
// ⚠ A conta não mora aqui: situação, ordem e resumo vêm de `lib/painel-prazos-rm`, que por sua vez
// usa a mesma `linhaDoTempo` da régua dentro da RM. Duas telas que contam o mesmo atraso não podem
// discordar em um dia.
import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { Loader2, AlertCircle, Package, CalendarClock, ChevronRight, Truck, PackageCheck, ExternalLink } from "lucide-react";
import { SITUACAO, rotuloSituacao, filtrarLinhas, resumoPorSituacao } from "@/lib/painel-prazos-rm";

const fmt = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—");
const moeda = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const CHIP = {
  red: "bg-red-100 text-red-700", orange: "bg-orange-100 text-orange-700",
  amber: "bg-amber-100 text-amber-700", sky: "bg-sky-100 text-sky-700",
  gray: "bg-gray-100 text-gray-600", emerald: "bg-emerald-100 text-emerald-700",
  slate: "bg-slate-200 text-slate-700", violet: "bg-violet-100 text-violet-700",
};

// ⚠⚠ A COR VIVE NUM FILETE, NÃO NA FAIXA INTEIRA. Duas correções na mesma tarde: o cabeçalho era
// `bg-gray-50/60`, quase branco, e nada separava um cartão do outro (Matheus: "deixe mais forte a
// cor dos cabeçalhos"); tingir a faixa toda resolveu isso e criou o oposto — "está muito colorido,
// deixe com layout melhor". São 238 cartões empilhados: faixa cheia vira parede.
//
// ⚠ O filete de 4px na borda esquerda dá o mesmo sinal a distância — a coluna de cores continua
// legível ao rolar — gastando uma fração da área. É o padrão de "trilho de status": sinal forte
// num lugar pequeno, superfície calma no resto.
//
// ⚠ Com o filete carregando a cor, o CHIP volta ao tom suave. Dois elementos gritando pela mesma
// informação é o que fazia a tela cansar; o filete diz "olhe aqui" e o chip diz "o que é".
const FILETE = {
  red: "border-l-red-500", orange: "border-l-orange-500", amber: "border-l-amber-500",
  sky: "border-l-sky-500", gray: "border-l-gray-300", emerald: "border-l-emerald-500",
  slate: "border-l-slate-400", violet: "border-l-violet-500",
};

/**
 * A marca de Faturamento Direto — mesmo desenho do painel financeiro da OP
 * (`components/ControleFinanceiroOP.jsx`), para o mesmo conceito não ter duas caras no portal.
 *
 * ⚠ FD significa que o material vai do fornecedor DIRETO para o cliente e nunca entra no estoque
 * da Torg. Quem acompanha prazo precisa saber disso: a cobrança da entrega é com o cliente, e não
 * há recebimento no almoxarifado para conferir.
 */
function TagFD({ parcial = false }) {
  return (
    <span
      className="text-[10px] px-1.5 py-0.5 rounded font-bold whitespace-nowrap bg-amber-100 text-amber-800"
      title={parcial
        ? "Parte dos pedidos desta RM é Faturamento Direto — o material vai do fornecedor direto ao cliente"
        : "Faturamento Direto — o material vai do fornecedor direto ao cliente, sem passar pela Torg"}
    >
      FD{parcial ? " parcial" : ""}
    </span>
  );
}

const ORDEM_CHIPS = ["ATRASADO", "PARCIAL", "VENCE_HOJE", "PROXIMO", "NO_PRAZO", "SEM_PRAZO", "ENCERRADO", "CHEGOU"];

const plural = (n) => (Math.abs(n) === 1 ? "dia" : "dias");

/** O veredito de quem já chegou: dentro do prazo, atrasado ou adiantado. */
function Chegou({ t }) {
  const sufixo = t == null ? ""
    : t > 0 ? ` com ${t} ${plural(t)} de atraso`
      : t === 0 ? " no prazo"
        : ` ${Math.abs(t)} ${plural(t)} adiantado`;
  return <span className="text-emerald-700">chegou{sufixo}</span>;
}

/**
 * O parcial diz DUAS coisas ao mesmo tempo: parte chegou, e o resto está a N dias de atraso.
 *
 * ⚠⚠ O ATRASO NÃO PODE SUMIR JUNTO COM O CHIP VERMELHO. Os 19 pedidos parciais de 17/09/2026
 * tinham todos a previsão vencida; se o chip "Recebido parcial" fosse a única mudança, a tela
 * trocaria um problema visível por um escondido. O chip diz o que é, a frase diz o quanto dói.
 */
function Parcial({ diasAte }) {
  if (diasAte == null) return <span className="text-violet-700">parte do pedido já chegou</span>;
  if (diasAte < 0) {
    return (
      <span className="text-violet-700">
        parte já chegou · <b className="font-medium text-red-600">{Math.abs(diasAte)} {plural(diasAte)} de atraso no restante</b>
      </span>
    );
  }
  return <span className="text-violet-700">parte já chegou · restante em {diasAte} {plural(diasAte)}</span>;
}

/** O quanto falta, em palavras — a mesma frase que alguém usaria no telefone. */
function Quando({ p }) {
  if (p.situacao === "CHEGOU") return <Chegou t={p.atrasoDias} />;
  if (p.situacao === "PARCIAL") return <Parcial diasAte={p.diasAte} />;
  // ⚠⚠ ENCERRADO PRECISA DA FRASE DELE. Sem isto cairia em "sem prazo informado" — e a queixa que
  // originou tudo era justamente a tela mentir sobre pedido acabado. Aqui existe prazo; ele é que
  // deixou de ser cobrado.
  if (p.situacao === "ENCERRADO") {
    return (
      <span className="text-slate-600" title="O Omie encerrou este pedido — o portal parou de cobrar o prazo dele">
        encerrado no Omie{p.encerradoOmieEm ? ` (visto em ${fmt(p.encerradoOmieEm)})` : ""}
      </span>
    );
  }
  if (p.diasAte == null) return <span className="text-torg-gray">sem prazo informado</span>;
  if (p.diasAte < 0) return <span className="text-red-600 font-medium">{Math.abs(p.diasAte)} {plural(p.diasAte)} de atraso</span>;
  if (p.diasAte === 0) return <span className="text-orange-600 font-medium">vence hoje</span>;
  return <span className="text-torg-gray">em {p.diasAte} {plural(p.diasAte)}</span>;
}

function LinhaPedido({ p, mostrarFD }) {
  const cfg = SITUACAO[p.situacao];
  return (
    <li className="py-2 flex items-start gap-3 flex-wrap">
      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0 ${CHIP[cfg.cor]}`}>{cfg.rotulo}</span>
      <div className="flex-1 min-w-[180px]">
        <p className="text-sm text-torg-dark flex items-center gap-1.5 flex-wrap">
          {p.fornecedorNome}
          {p.numeroPedido && <span className="text-xs text-torg-gray">#{p.numeroPedido}</span>}
          {/* ⚠⚠ A TAG SÓ DESCE PARA A LINHA QUANDO A RM É MISTA. Com a RM inteira em FD, o
              cabeçalho já respondeu e repetir em cada pedido não acrescenta nada — só enche a tela,
              que foi o que Matheus pediu para corrigir ("está muito colorido"). Numa RM mista é o
              contrário: é aqui, e só aqui, que se vê QUAL pedido é o direto. */}
          {mostrarFD && p.faturamentoDireto && <TagFD />}
        </p>
        <p className="text-xs text-torg-gray mt-0.5 flex items-center gap-1.5 flex-wrap">
          <CalendarClock size={11} /> Previsão: <b className="font-medium text-torg-dark">{fmt(p.previsao)}</b>
          <span>·</span> <Quando p={p} />
        </p>
        {/* ⚠ As etapas já lançadas aparecem aqui como rastro curto: quem varre a lista quer saber
            se alguém já mexeu no pedido, sem ter que abrir a RM para descobrir. */}
        {p.etapas.length > 0 && (
          <p className="text-[11px] text-torg-gray mt-0.5 flex items-center gap-1 flex-wrap">
            {p.etapas.map((e) => (
              <span key={e.id} className="inline-flex items-center gap-1">
                {e.etapa === "MATERIAL_RECEBIDO" ? <PackageCheck size={10} className="text-emerald-600" /> : <Truck size={10} />}
                {e.titulo} em {fmt(e.data)}
              </span>
            ))}
          </p>
        )}
      </div>
      <span className="text-sm text-torg-orange-700 font-semibold tabular-nums">{moeda(p.total)}</span>
    </li>
  );
}

function CartaoRM({ l }) {
  const cfg = SITUACAO[l.situacao];
  return (
    <div className={`bg-white rounded-xl border border-gray-200 border-l-4 shadow-sm overflow-hidden ${FILETE[cfg.cor]}`}>
      <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex items-center gap-3 flex-wrap">
        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${CHIP[cfg.cor]}`}>{cfg.rotulo}</span>
        {/* ⚠ O número da RM leva para a RM: esta tela responde "onde dói", e o conserto é lá. */}
        {l.rmId ? (
          <Link href={`/compras/rm/${l.rmId}`} className="font-semibold text-torg-dark hover:text-torg-blue inline-flex items-center gap-1">
            {l.numero} <ExternalLink size={12} />
          </Link>
        ) : (
          <span className="font-semibold text-torg-dark">{l.numero}</span>
        )}
        {l.fd !== "NENHUM" && <TagFD parcial={l.fd === "PARCIAL"} />}
        {l.op?.numero && <span className="text-xs text-torg-gray">OP-{String(l.op.numero).padStart(3, "0")} · {l.op.cliente || l.op.obra || ""}</span>}
        <span className="ml-auto text-xs text-torg-gray">
          {l.pedidos.length} {l.pedidos.length === 1 ? "pedido" : "pedidos"} · <b className="text-torg-dark tabular-nums">{moeda(l.total)}</b>
        </span>
      </div>
      <ul className="px-5 divide-y divide-gray-50">
        {l.pedidos.map((p) => <LinhaPedido key={p.id} p={p} mostrarFD={l.fd === "PARCIAL"} />)}
      </ul>
    </div>
  );
}

export default function PrazosRMClient() {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);
  // ⚠ Abre em "pendentes" porque 71% do acervo já chegou (168 de 236 RMs, medido em 16/09/2026):
  // aberta em "todas", a tela saía com 31 mil pixels e escondia as 53 RMs que apertam atrás das
  // que já foram resolvidas.
  const [filtro, setFiltro] = useState("PENDENTES");
  const [obra, setObra] = useState(""); // OP.numero ("" = todas)

  const buscar = async () => {
    setCarregando(true);
    setErro("");
    try {
      const r = await fetch("/api/compras/prazos-rm");
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Não foi possível carregar.");
      setDados(j);
    } catch (e) {
      setErro(e.message);
    } finally {
      setCarregando(false);
    }
  };
  useEffect(() => { buscar(); }, []);

  // ⚠⚠ A OBRA FILTRA ANTES DE TUDO — cartões, contadores e lista. Matheus (16/09/2026): "adicionar
  // filtros por obra se eu quiser ver RMs somente de uma obra os prazos".
  //
  // ⚠ Aqui o filtro pode ser do NAVEGADOR sem mentir, porque a rota não corta nada: ela devolve
  // todos os pedidos CRIADOS, sem `take`. Nas RMs de material o mesmo desenho escondeu 111 linhas
  // justamente porque lá havia um `take: 100` antes do filtro. Se um dia esta rota ganhar teto, o
  // filtro tem que subir para o servidor junto — senão o defeito volta igual.
  const daObra = useMemo(
    () => (obra ? (dados?.linhas || []).filter((l) => String(l.op?.numero || "") === obra) : (dados?.linhas || [])),
    [dados, obra]
  );

  // ⚠⚠ OS CONTADORES SEGUEM A OBRA. Deixá-los no resumo do servidor faria o cabeçalho dizer
  // "Atrasado 37" enquanto a lista da obra mostra 2 — número que não corresponde ao que está na
  // tela é pior que número nenhum.
  const resumo = useMemo(() => (obra ? resumoPorSituacao(daObra) : dados?.resumo), [obra, daObra, dados]);

  // As obras que têm RM com pedido, com quantas cada uma tem. Saem de TODAS as linhas, nunca das
  // já filtradas — senão escolher uma obra apagaria as outras da lista de opções.
  const obras = useMemo(() => {
    const m = new Map();
    for (const l of dados?.linhas || []) {
      const n = l.op?.numero ? String(l.op.numero) : null;
      if (!n) continue;
      if (!m.has(n)) m.set(n, { numero: n, cliente: l.op.cliente || l.op.obra || "", quantidade: 0 });
      m.get(n).quantidade++;
    }
    const num = (x) => parseInt(String(x).match(/\d+/)?.[0] || "0", 10);
    return [...m.values()].sort((a, b) => num(b.numero) - num(a.numero));
  }, [dados]);

  const visiveis = useMemo(() => filtrarLinhas(daObra, filtro), [daObra, filtro]);

  if (carregando) {
    return <p className="py-16 text-center text-sm text-torg-gray inline-flex items-center gap-2 justify-center w-full"><Loader2 size={16} className="animate-spin" /> Carregando os prazos…</p>;
  }
  if (erro) {
    return (
      <div className="py-16 text-center">
        <AlertCircle size={28} className="mx-auto text-red-400" />
        <p className="mt-2 text-sm text-red-700">{erro}</p>
        <button onClick={buscar} className="mt-3 px-3 py-1.5 text-sm rounded-lg border border-gray-300 hover:bg-gray-50">Tentar novamente</button>
      </div>
    );
  }

  const r = resumo;
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-torg-dark flex items-center gap-2"><CalendarClock size={22} /> Prazos das RMs</h1>
        <p className="text-sm text-torg-gray mt-0.5">
          Todas as RMs com pedido no Omie, seus pedidos e o prazo de cada um. O que aperta vem primeiro.
        </p>
      </div>

      {/* ⚠ Os contadores FILTRAM, não são enfeite: quem chega para cobrar fornecedor clica em
          "Atrasado" e trabalha só naquilo. Clicar de novo volta para a lista inteira. */}
      <div className="flex items-center gap-2 flex-wrap">
        {obras.length > 0 && (
          <select
            value={obra}
            onChange={(e) => setObra(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg text-xs font-medium border border-gray-300 bg-white text-torg-dark"
            title="Ver os prazos de uma obra só"
          >
            <option value="">Todas as obras</option>
            {obras.map((o) => (
              <option key={o.numero} value={o.numero}>
                OP-{String(o.numero).padStart(3, "0")}{o.cliente ? ` — ${o.cliente}` : ""} ({o.quantidade})
              </option>
            ))}
          </select>
        )}
        <button type="button" onClick={() => setFiltro("PENDENTES")}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors bg-white text-torg-dark ${
            filtro === "PENDENTES" ? "border-torg-blue ring-1 ring-torg-blue" : "border-gray-200 hover:bg-gray-50"}`}>
          A chegar <b className="ml-1 tabular-nums">{r.rms - r.CHEGOU - r.ENCERRADO}</b>
        </button>
        {ORDEM_CHIPS.filter((k) => r[k] > 0).map((k) => (
          <button key={k} type="button" onClick={() => setFiltro(filtro === k ? "PENDENTES" : k)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              filtro === k ? "border-torg-blue ring-1 ring-torg-blue" : "border-gray-200 hover:bg-gray-50"} ${CHIP[SITUACAO[k].cor]}`}>
            {rotuloSituacao(k)} <b className="ml-1 tabular-nums">{r[k]}</b>
          </button>
        ))}
        {/* ⚠ "Todas" existe porque o pedido foi ver TODAS as RMs de uma vez — o padrão só escolhe
            por onde começar, não decide o que você pode ver. */}
        <button type="button" onClick={() => setFiltro("TODAS")}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors bg-white text-torg-gray ${
            filtro === "TODAS" ? "border-torg-blue ring-1 ring-torg-blue" : "border-gray-200 hover:bg-gray-50"}`}>
          Todas <b className="ml-1 tabular-nums">{r.rms}</b>
        </button>
        <span className="text-xs text-torg-gray ml-auto">
          {/* ⚠ "cobram prazo", não "não chegaram": o encerrado também não chegou, mas saiu da conta
              de propósito — a frase antiga passaria a discordar do número ao lado dela. */}
          {r.rms} {r.rms === 1 ? "RM" : "RMs"} · {r.pedidos} pedidos · <b className="text-torg-dark">{r.pendentes}</b> ainda cobram prazo
        </span>
      </div>

      {visiveis.length === 0 ? (
        <div className="py-16 text-center bg-white rounded-xl border border-gray-100">
          <Package size={28} className="mx-auto text-gray-300" />
          <p className="mt-2 text-sm text-torg-gray">
            {(() => {
              // ⚠ Com obra escolhida o vazio diz QUAL obra: "nenhuma RM atrasada" sem dizer onde
              // faz parecer que o portal inteiro está em dia.
              const onde = obra ? ` na OP-${String(obra).padStart(3, "0")}` : "";
              if (filtro === "PENDENTES") return `Nenhuma RM${onde} esperando entrega — o que foi pedido já chegou ou foi encerrado no Omie.`;
              if (filtro === "TODAS") return `Nenhuma RM${onde} com pedido gerado ainda.`;
              return `Nenhuma RM${onde} em "${rotuloSituacao(filtro)}".`;
            })()}
          </p>
          {(filtro !== "TODAS" || obra) && (
            <button onClick={() => { setFiltro("TODAS"); setObra(""); }} className="mt-3 text-sm text-torg-blue hover:underline inline-flex items-center gap-1">
              ver todas <ChevronRight size={13} />
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {visiveis.map((l) => <CartaoRM key={l.rmId || l.numero} l={l} />)}
        </div>
      )}
    </div>
  );
}
