"use client";

// ─── O ACOMPANHAMENTO DE UM PEDIDO, DENTRO DO CARTÃO DA RM ───────────────────
//
// Matheus (16/09/2026): "preciso ter na tela de RMs que foram geradas pedidos um histórico de
// datas da previsão de entrega para eu ir controlando depois que o pedido vai pro Omie se já foi
// recebido o material ou encaminhado para obra ou liberado para coleta no prazo estimado, mas não
// altere nada do que existe hoje na tela".
//
// ⚠⚠ POR ISSO ELE VEM RECOLHIDO, e isso é o pedido, não economia de trabalho. O cartão do pedido
// já tem fornecedor, número, status, NF, valor e botões; aberto por padrão, um bloco de linha do
// tempo por pedido empurraria tudo isso para fora da vista numa RM com quatro pedidos. A régua
// fechada mostra o que decide se vale abrir: a previsão e se chegou no prazo.
import { useState } from "react";
import { useSession } from "next-auth/react";
import { CalendarClock, History, Plus, X, Loader2, CheckCircle2, Truck, PackageCheck, AlertTriangle } from "lucide-react";
import { linhaDoTempo, ETAPAS, ETAPAS_VALIDAS, hojeEmSP } from "@/lib/acompanhamento-pedido";
import CampoData from "@/components/CampoData";

const fmt = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—");
const hoje = () => new Date().toISOString().slice(0, 10);

const ICONE = {
  LIBERADO_COLETA: Truck,
  ENCAMINHADO_OBRA: Truck,
  ENTREGA: Truck,
  MATERIAL_RECEBIDO: PackageCheck,
};

/** A régua fechada: o que decide se vale abrir a linha do tempo. */
function Resumo({ previsao, atrasoDias, quantos }) {
  // ⚠ Zero dia é EM CIMA DO PRAZO, não atraso — `atrasoDias > 0` e não `>= 0`, senão o pedido que
  // chegou no dia combinado apareceria em vermelho.
  const atrasado = atrasoDias != null && atrasoDias > 0;
  const chegou = atrasoDias != null;
  return (
    <span className="inline-flex items-center gap-2 flex-wrap">
      <CalendarClock size={11} />
      <span>Previsão: <b className="font-semibold text-torg-dark">{fmt(previsao)}</b></span>
      {chegou && (
        <span className={atrasado ? "text-red-600 font-medium" : "text-emerald-700 font-medium"}>
          {atrasoDias === 0 ? "chegou no prazo"
            : atrasado ? `${atrasoDias} ${atrasoDias === 1 ? "dia" : "dias"} de atraso`
            : `${Math.abs(atrasoDias)} ${Math.abs(atrasoDias) === 1 ? "dia" : "dias"} adiantado`}
        </span>
      )}
      {quantos > 0 && <span className="text-torg-gray">· {quantos} {quantos === 1 ? "registro" : "registros"}</span>}
    </span>
  );
}

// ⚠⚠ A PREVISÃO NÃO É UMA ETAPA, E ENTRA NO MESMO SELETOR ASSIM MESMO. Matheus (23/09/2026):
// *"preciso que tenha a opção quando alterar a data de selecionar DATA DE ENTREGA, não achamos
// essa opção, só apareceu 3 opção"*. As três são ACONTECIMENTOS que o comprador registra; a
// previsão é uma PROMESSA sobre o futuro, e ela só se mudava na tela Compras › Cronograma.
//
// ⚠ Juntar as duas coisas num seletor só é deliberado: de onde a pessoa olha, é tudo "lançar uma
// data sobre este pedido" — e a linha do tempo JÁ mistura os dois de propósito (`tipo: "prazo"` ao
// lado de `tipo: "etapa"`), justamente para se enxergar a promessa ao lado do que aconteceu. O que
// não pode é o rótulo mentir sobre qual das duas é: por isso ela sai separada por um traço no
// seletor e escrita como **previsão**, nunca como "entregue".
const PREVISAO = "__PREVISAO__";

function FormLancamento({ pedido, aoLancar }) {
  const pedidoId = pedido.id;
  const { data: sessao } = useSession();
  // ⚠⚠ REMARCAR PRAZO É DE ADMIN E COMPRAS; LANÇAR ETAPA TAMBÉM É DO ALMOXARIFADO. A rota de prazo
  // exige `["ADMIN","COMPRAS"]` e a de acompanhamento aceita `ALMOXARIFADO` — oferecer a opção a
  // quem não pode faria o almoxarife escolher e tomar um 403 sem entender por quê.
  // ⚠ Espelha `requireRole(["ADMIN","COMPRAS"])` de lib/session.js: ADMIN é TIPO e passa em tudo;
  // o resto precisa do MÓDULO. Inventar a conta aqui faria a tela e o servidor discordarem.
  const u = sessao?.user;
  const podeRemarcar = u?.tipo === "ADMIN" || (u?.modulos ?? []).includes("COMPRAS");

  const [etapa, setEtapa] = useState(ETAPAS_VALIDAS[0]);
  const [data, setData] = useState(hoje());
  const [observacao, setObservacao] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const ehPrevisao = etapa === PREVISAO;

  /**
   * ⚠⚠ TROCAR PARA "PREVISÃO" TROCA A DATA PADRÃO, e isso não é conveniência. Etapa é um fato do
   * passado, então HOJE é o palpite certo; previsão é uma data futura, e deixar HOJE ali convida a
   * gravar sem querer um prazo para hoje — que jogaria o pedido para "vence hoje" na tela de
   * Prazos e dispararia cobrança em cima de um fornecedor que não combinou nada disso.
   */
  const trocarTipo = (novo) => {
    setEtapa(novo);
    if (novo === PREVISAO) setData(pedido.prazoEntregaPrevisto ? new Date(pedido.prazoEntregaPrevisto).toISOString().slice(0, 10) : "");
    else if (ehPrevisao) setData(hoje());
  };

  const enviar = async (e) => {
    e.preventDefault();
    setSalvando(true);
    setErro("");
    try {
      const r = ehPrevisao
        ? await fetch("/api/compras/entregas/prazo", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            // ⚠ A observação vira o MOTIVO da remarcação — é o campo que o histórico de prazos
            // mostra, e é o que responde "por que a data mudou" seis semanas depois.
            body: JSON.stringify({ pedidoId, novoPrazo: data, motivo: observacao.trim() || undefined }),
          })
        : await fetch(`/api/pedido-omie/${pedidoId}/acompanhamento`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ etapa, data, observacao: observacao.trim() || null }),
          });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error || "Não foi possível lançar.");
      setObservacao("");
      aoLancar();
    } catch (e2) {
      setErro(e2.message);
    } finally {
      setSalvando(false);
    }
  };

  const campo = "px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-torg-blue";
  return (
    <form onSubmit={enviar} className="mt-2 flex items-end gap-2 flex-wrap">
      <select value={etapa} onChange={(e) => trocarTipo(e.target.value)} className={campo} disabled={salvando}>
        {ETAPAS_VALIDAS.map((k) => <option key={k} value={k}>{ETAPAS[k].rotulo}</option>)}
        {podeRemarcar && (
          <optgroup label="Previsão">
            <option value={PREVISAO}>Data de entrega (previsão)</option>
          </optgroup>
        )}
      </select>
      {/* ⚠ A data vem com HOJE preenchido, mas editável: o caso comum é lançar no dia, e o caso
          que importa medir é o de lançar depois — quem registra na segunda o que chegou na sexta
          precisa poder dizer sexta.

          ⚠⚠ `CampoData`, NÃO `<input type="date">`: o campo nativo usa o idioma da INTERFACE do
          navegador, e numa máquina em inglês ele pede mm/dd/aaaa no meio de uma tela em português
          — visto nesta própria validação, que renderizou "09/16/2026". Data de entrega lida ao
          contrário é o prazo medido errado, que é justamente o que este bloco existe para medir. */}
      {/* ⚠ Numa caixa de largura própria: o `CampoData` se estica com `w-full`, e solto num flex
          ele toma a linha inteira e empurra observação e botão para baixo. */}
      <span className="w-[112px] shrink-0 inline-flex">
        <CampoData value={data} onChange={setData} className={`${campo} w-full`} disabled={salvando} required />
      </span>
      <input
        type="text" value={observacao} onChange={(e) => setObservacao(e.target.value)}
        placeholder="Observação (opcional)" maxLength={500}
        className={`${campo} flex-1 min-w-[140px]`} disabled={salvando}
      />
      <button type="submit" disabled={salvando}
        className="px-2.5 py-1 text-xs rounded bg-torg-blue text-white font-medium inline-flex items-center gap-1 disabled:opacity-50">
        {salvando ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />} Lançar
      </button>
      {/* ⚠⚠ O AVISO DA PROPOSTA PENDENTE. Remarcar por dentro DESCARTA a data que o fornecedor
          mandou pelo link público — e quem está remarcando talvez nem saiba que ela existe. */}
      {ehPrevisao && pedido.prazoPropostoId && (
        <span className="w-full inline-flex items-start gap-1.5 text-xs text-amber-700">
          <AlertTriangle size={12} className="mt-0.5 shrink-0" />
          O fornecedor propôs {fmt(pedido.prazoProposto)} e essa proposta ainda está em análise. Remarcar aqui descarta a proposta dele.
        </span>
      )}
      {/* ⚠⚠ O AVISO NA HORA DE LANÇAR, porque foi aqui que a confusão nasceu (24/09/2026): 7 dos 10
          lançamentos eram "liberado para coleta" com data futura, e o pedido continuava "atrasado" e
          na lista de COBRANÇA — a previsão, que é o que decide isso, não tinha mudado. Quem digita
          uma data futura numa etapa quase sempre quis remarcar a entrega. */}
      {/* ⚠ `hojeEmSP`, não o `hoje()` deste arquivo (que é UTC): é a MESMA régua de `linhaDoTempo`,
          senão a dica e a linha do tempo discordariam à noite sobre o que é "futuro". */}
      {!ehPrevisao && data > hojeEmSP() && (
        <span className="w-full text-xs text-sky-700">
          Data futura: vai aparecer como <b className="font-medium">{(ETAPAS[etapa]?.previsto ?? "previsto").toLowerCase()}</b>.
          {podeRemarcar && <> Se é a nova data de entrega do fornecedor, use <b className="font-medium">Data de entrega (previsão)</b> — é ela que tira o pedido do atraso e da cobrança.</>}
        </span>
      )}
      {ehPrevisao && (
        <span className="w-full text-xs text-torg-gray">
          Isto muda a <b className="font-medium text-torg-dark">previsão</b> de entrega do pedido e entra no histórico de prazos — não registra que o material chegou.
        </span>
      )}
      {erro && <span className="text-xs text-red-600 w-full">{erro}</span>}
    </form>
  );
}

export function AcompanhamentoPedido({ pedido, aoMudar }) {
  const [desfazendo, setDesfazendo] = useState(null);
  const { previsao, prazoOriginal, eventos, atrasoDias } = linhaDoTempo(pedido);

  const desfazer = async (id) => {
    setDesfazendo(id);
    try {
      const r = await fetch(`/api/pedido-omie/${pedido.id}/acompanhamento?lancamentoId=${id}`, { method: "DELETE" });
      if (r.ok) aoMudar();
    } finally {
      setDesfazendo(null);
    }
  };

  return (
    <details className="mt-2 group">
      <summary className="text-[11px] text-torg-gray cursor-pointer select-none hover:text-torg-dark inline-flex items-center gap-1.5">
        <History size={11} className="shrink-0" />
        <Resumo previsao={previsao} atrasoDias={atrasoDias} quantos={eventos.filter((e) => e.tipo === "etapa").length} />
      </summary>

      <div className="mt-2 pl-4 border-l-2 border-gray-100">
        {/* ⚠ O prazo ORIGINAL abre a régua quando houve remarcação: é contra ele que se enxerga
            quanto o fornecedor empurrou, e a previsão de hoje já sai no resumo acima. */}
        {prazoOriginal && new Date(prazoOriginal).getTime() !== new Date(previsao || 0).getTime() && (
          <p className="text-[11px] text-torg-gray mb-1.5">
            Prazo original: <b className="font-medium text-torg-dark">{fmt(prazoOriginal)}</b>
          </p>
        )}

        {eventos.length === 0 ? (
          <p className="text-[11px] text-torg-gray italic">Nada lançado ainda.</p>
        ) : (
          <ul className="space-y-1">
            {eventos.map((ev, i) => {
              // ⚠ Etapa com data futura é previsão: calendário, não caminhão — a mesma regra do cartão de Prazos.
              const Icone = ev.prevista ? CalendarClock : (ICONE[ev.etapa] || (ev.tipo === "prazo" ? CalendarClock : CheckCircle2));
              return (
                <li key={ev.id || `${ev.tipo}-${i}`} className="text-[11px] flex items-start gap-1.5">
                  <Icone size={11} className={`mt-0.5 shrink-0 ${ev.etapa === "MATERIAL_RECEBIDO" ? "text-emerald-600" : "text-torg-gray"}`} />
                  <span className="text-torg-gray">
                    <b className="font-medium text-torg-dark">{fmt(ev.data)}</b>{" · "}
                    {ev.titulo}
                    {ev.detalhe && <span className="text-torg-gray"> — {ev.detalhe}</span>}
                  </span>
                  {/* ⚠ Só o que foi lançado à mão pode ser desfeito. O carimbo do Omie vem da nota
                      fiscal: apagá-lo daqui não o desfaz lá, e voltaria no próximo sync. */}
                  {ev.podeDesfazer && (
                    <button
                      type="button" onClick={() => desfazer(ev.id)} disabled={desfazendo === ev.id}
                      title="Desfazer este lançamento"
                      className="text-gray-300 hover:text-red-500 disabled:opacity-50 shrink-0"
                    >
                      {desfazendo === ev.id ? <Loader2 size={10} className="animate-spin" /> : <X size={10} />}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <FormLancamento pedido={pedido} aoLancar={aoMudar} />
      </div>
    </details>
  );
}
