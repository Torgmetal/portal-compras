"use client";

// ─── OS CARTÕES DA TELA DE PRAZOS ────────────────────────────────────────────
//
// ⚠ Em arquivo próprio desde 17/09/2026, quando o filtro de fornecedor levou o
// `PrazosRMClient` a passar do teto de 350 linhas. O corte é por responsabilidade, não por
// contagem: aqui mora o DESENHO de uma RM e de um pedido; lá, a busca, os filtros e o estado.
import Link from "next/link";
import { CalendarClock, Truck, PackageCheck, ExternalLink } from "lucide-react";
import { SITUACAO } from "@/lib/painel-prazos-rm";

const fmt = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—");
const moeda = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const CHIP = {
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

export default function CartaoRM({ l }) {
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

