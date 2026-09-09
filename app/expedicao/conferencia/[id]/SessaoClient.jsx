"use client";
import { useState } from "react";
import Link from "next/link";
import { AlertCircle, ArrowLeft, CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import { FormLancamento, ListaLancamentos, PainelMarcas } from "./componentes";
import { useSessao } from "./useSessao";
import ModoPatio from "./ModoPatio";
import { usarEhCelular } from "../modo-patio";

// A TELA DE CAMPO. Matheus (08/09/2026): "a ideia é usar essa tela em um celular em campo ou tablet
// para ele conferir as peças antes de ir para pintura e etiquetagem".
//
// ⚠⚠ NO CELULAR, ESTA TELA MORA DENTRO DO MODO PÁTIO. Matheus (08/09/2026): "quando clicar em
// iniciar conferencia entrar em modo tela full no celular para não ter chance do operador sair
// sem querer". `ModoPatio` (../ModoPatio.jsx) cobre a viewport e troca a saída livre (o Link
// "← Conferências" de sempre) por uma que exige confirmação — por isso esse Link só aparece na
// versão de tablet/desktop aqui embaixo, onde a moldura de campo não entra.

function Barra({ p }) {
  return (
    <div>
      <div className="flex items-baseline justify-between text-[13px] mb-1.5">
        <span className="text-torg-gray">
          <b className="text-torg-dark text-base">{p.conferido}</b> de {p.previsto} peças
        </span>
        <span className="text-torg-gray">{p.marcasCompletas}/{p.marcasTotal} marcas</span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full bg-torg-blue rounded-full transition-all" style={{ width: `${p.pct}%` }} />
      </div>
    </div>
  );
}

function Cabecalho({ dados, encerrada }) {
  const op = dados?.op;
  const status = dados?.conferencia?.status;
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-torg-dark">OP-{op?.numero} · {op?.cliente}</h1>
          {op?.obra && <p className="text-[13px] text-torg-gray truncate">{op.obra}</p>}
        </div>
        {encerrada && (
          <span className="shrink-0 text-[11px] font-bold px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700">
            {status === "CANCELADA" ? "CANCELADA" : "FINALIZADA"}
          </span>
        )}
      </div>
      {dados?.progresso && <Barra p={dados.progresso} />}
    </div>
  );
}

/**
 * ⚠ O ERRO FICA GRANDE E NO TOPO. É a mensagem que o pedido pediu ("vai dar erro e mensagem
 * avisando"), e ela precisa ser lida de relance — celular numa mão, peça na outra.
 */
function Avisos({ erro, ok, limparErro }) {
  if (erro) {
    return (
      <div className="bg-red-50 border-2 border-red-300 rounded-xl p-4 flex items-start gap-2.5 text-red-800">
        <AlertCircle size={22} className="mt-0.5 shrink-0" />
        <div className="flex-1 text-[15px] font-semibold leading-snug">{erro}</div>
        <button onClick={limparErro} className="text-sm underline shrink-0">ok</button>
      </div>
    );
  }
  if (!ok) return null;
  return (
    <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5 flex items-center gap-2 text-emerald-800 text-sm">
      <CheckCircle2 size={17} className="shrink-0" /> {ok}
    </div>
  );
}

function Encerrar({ onAcao, agindo }) {
  const [confirmando, setConfirmando] = useState(false);
  if (!confirmando) {
    return (
      <button onClick={() => setConfirmando(true)}
        className="w-full border border-gray-200 text-torg-gray font-semibold rounded-lg px-4 py-3 text-sm">
        Encerrar conferência
      </button>
    );
  }
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-3 space-y-2">
      <p className="text-[13px] text-torg-dark">
        <b>Finalizar</b> fecha a conferência e mantém o que foi contado.{" "}
        <b>Cancelar</b> descarta a sessão inteira — o que foi lançado aqui volta a faltar.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => onAcao("finalizar")} disabled={agindo}
          className="bg-emerald-600 text-white font-semibold rounded-lg py-3 text-sm disabled:opacity-40">Finalizar</button>
        <button onClick={() => onAcao("cancelar")} disabled={agindo}
          className="border border-red-200 text-red-700 font-semibold rounded-lg py-3 text-sm disabled:opacity-40">Cancelar sessão</button>
      </div>
      <button onClick={() => setConfirmando(false)} className="w-full text-[13px] text-torg-gray py-1">voltar</button>
    </div>
  );
}

function Abas({ aba, setAba, quantasMarcas }) {
  return (
    <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
      {[["lancar", "Lançar"], ["lista", `Lista da obra (${quantasMarcas})`]].map(([k, r]) => (
        <button key={k} onClick={() => setAba(k)}
          className={`flex-1 rounded-lg py-2.5 text-sm font-semibold ${
            aba === k ? "bg-white text-torg-dark shadow-sm" : "text-torg-gray"}`}>
          {r}
        </button>
      ))}
    </div>
  );
}

/**
 * ⚠⚠ SEM DADOS, SEM CONTROLES. Achado do Codex (09/09/2026): quando o GET inicial falha, a tela
 * antiga caía direto no render normal com `dados` nulo — cabeçalho vazio, mas o formulário de
 * lançar e o botão de encerrar continuavam lá, mexendo numa sessão que a tela nem confirmou que
 * existe. "Tentar novamente" é o único caminho daqui: sem sessão carregada, não tem o que lançar.
 */
function ErroInicial({ erro, onTentar }) {
  return (
    <div className="max-w-md mx-auto mt-16 bg-white rounded-xl border-2 border-red-200 p-6 text-center space-y-4">
      <AlertCircle size={32} className="mx-auto text-red-500" />
      <p className="text-[15px] font-semibold text-torg-dark leading-snug">
        {erro || "Não deu para carregar esta conferência."}
      </p>
      <button onClick={onTentar}
        className="w-full bg-torg-blue text-white font-semibold rounded-lg px-4 py-3 text-sm flex items-center justify-center gap-2">
        <RefreshCw size={16} /> Tentar novamente
      </button>
    </div>
  );
}

/** O topo em telas largas — no celular, `ModoPatio` já dá o caminho de saída (com confirmação). */
function VoltarDesktop() {
  return (
    <Link href="/expedicao/conferencia"
      className="hidden md:inline-flex items-center gap-1.5 text-sm text-torg-gray hover:text-torg-blue">
      <ArrowLeft size={15} /> Conferências
    </Link>
  );
}

export default function SessaoClient({ id }) {
  const s = useSessao(id);
  const [aba, setAba] = useState("lancar");
  const ehCelular = usarEhCelular();

  let conteudo;
  let titulo = "";

  if (s.carregando && !s.dados) {
    conteudo = (
      <div className="flex items-center justify-center py-20 gap-3 text-torg-gray">
        <Loader2 size={22} className="animate-spin" /> Carregando a conferência…
      </div>
    );
  } else if (!s.dados) {
    conteudo = (
      <div className="max-w-3xl space-y-4 pb-10">
        <VoltarDesktop />
        <ErroInicial erro={s.erro} onTentar={s.recarregar} />
      </div>
    );
  } else {
    const op = s.dados.op;
    titulo = op ? `OP-${op.numero} · ${op.cliente}` : "";
    conteudo = (
      <div className="max-w-3xl space-y-4 pb-10">
        <VoltarDesktop />

        <Cabecalho dados={s.dados} encerrada={s.encerrada} />
        <Avisos erro={s.erro} ok={s.ok} limparErro={s.limparErro} />

        {s.encerrada && (
          <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-[13px] text-torg-gray">
            Esta conferência foi encerrada. Para conferir mais peças desta obra, abra uma nova.
          </div>
        )}

        <Abas aba={aba} setAba={setAba} quantasMarcas={s.marcas.length} />

        {aba === "lancar" ? (
          <>
            <FormLancamento marcas={s.marcas} onLancar={s.lancar} salvando={s.salvando} encerrada={s.encerrada} />
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <h2 className="text-[11px] font-bold uppercase tracking-wide text-torg-gray mb-1">
                Conferido nesta sessão
              </h2>
              <ListaLancamentos lancamentos={s.lancamentos} onApagar={s.apagar} onEditar={s.editar}
                apagando={s.apagando} salvando={s.salvando} encerrada={s.encerrada} />
            </div>
            {!s.encerrada && <Encerrar onAcao={s.encerrar} agindo={s.agindo} />}
          </>
        ) : (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <PainelMarcas marcas={s.marcas} />
          </div>
        )}
      </div>
    );
  }

  return ehCelular ? <ModoPatio titulo={titulo}>{conteudo}</ModoPatio> : conteudo;
}
