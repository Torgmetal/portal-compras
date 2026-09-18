"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Scissors,
  Hammer,
  Flame,
  Sparkles,
  Wind,
  Paintbrush,
  Box,
  SlidersHorizontal,
  Flag,
  CalendarDays,
  AlertTriangle,
  PackageOpen,
  FileSpreadsheet,
} from "lucide-react";
import { ETAPAS } from "@/lib/producao-operacional";
import { aplicarRemanejoNaFila } from "@/lib/fila-operador";
import { montarVisaoEncarregado } from "@/lib/visao-encarregado";
import { rotuloPosto } from "@/lib/postos-operador";
import TrabalhoEncarregado from "./TrabalhoEncarregado";
import FichaPecaModal from "@/components/FichaPecaModal";
import DesenhoPecaModal from "@/components/DesenhoPecaModal";
import {
  useConsulta,
  EstadoConsulta,
  botao,
  campo,
  fmt,
  data,
  Atualizar,
} from "./ConsultaOperacional";

const SETORES = {
  CORTE: Scissors,
  MONTAGEM: Hammer,
  SOLDA: Flame,
  ACABAMENTO: Sparkles,
  JATO: Wind,
  PINTURA: Paintbrush,
};
const CHAVE = "torg.producao.meu-posto.v1";
export default function MinhaFila() {
  const [posto, setPosto] = useState(null),
    [escolher, setEscolher] = useState(false),
    [carregado, setCarregado] = useState(false);
  const [aberto, setAberto] = useState(null),
    [desenho, setDesenho] = useState(null),
    [ficha, setFicha] = useState(null),
    [remanejar, setRemanejar] = useState(null);
  useEffect(() => {
    try {
      const p = JSON.parse(localStorage.getItem(CHAVE) || "null");
      if (p && SETORES[p.setor])
        setPosto({
          setor: p.setor,
          recurso: typeof p.recurso === "string" ? p.recurso : "",
        });
    } catch {}
    setCarregado(true);
  }, []);
  const estado = useConsulta(
    posto ? `/api/producao/fila?setor=${posto.setor}` : null,
    true,
    true,
  );
  const [baixandoSyneco, setBaixandoSyneco] = useState(false), [avisoSyneco, setAvisoSyneco] = useState("");
  async function planilhaSyneco() {
    setBaixandoSyneco(true); setAvisoSyneco("");
    try {
      const { baixarPlanilhaApontamentosSyneco } = await import("@/lib/apontamentos-syneco-cliente");
      const t = await baixarPlanilhaApontamentosSyneco({ setor: posto.setor, nome: ETAPAS[posto.setor] || posto.setor });
      // ⚠ o total que importa aqui é o das DUAS origens: a baixa do portal e o furo que o
      // apontamento à frente denuncia. Só a primeira fazia a tela dizer "nada a lançar" com a
      // planilha cheia — e, no posto de Pintura ou Acabamento, vazia sem dizer por quê.
      const aLancar = (t.linhas || 0) + (t.etapaAnterior?.linhas || 0);
      setAvisoSyneco(aLancar
        ? `${aLancar} lançamento(s) para o Syneco — planilha baixada.`
        : (t.motivo || "Nada a lançar neste setor."));
    } catch (e) { setAvisoSyneco(e.message || "Não consegui montar a planilha."); }
    finally { setBaixandoSyneco(false); }
  }
  useEffect(() => {
    if (!posto || remanejar) return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") estado.recarregar();
    }, 60000);
    return () => clearInterval(id);
  }, [posto, remanejar, estado.recarregar]);
  function escolherPosto(setor, recurso = "") {
    const p = { setor, recurso };
    setPosto(p);
    setEscolher(false);
    setAberto(null);
    setDesenho(null);
    setFicha(null);
    setRemanejar(null);
    try {
      localStorage.setItem(CHAVE, JSON.stringify(p));
    } catch {}
  }
  const recursos = [
    ...new Set([
      ...(estado.dados?.recursos?.[posto?.setor] || []),
      ...(estado.dados?.lotes || [])
        .filter((l) => l.setor === posto?.setor && l.recurso)
        .map((l) => l.recurso),
    ]),
  ].sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }));
  const hoje = estado.dados?.hoje || "";
  const visao = montarVisaoEncarregado(
    estado.dados?.lotes,
    posto?.setor,
    posto?.recurso,
    hoje,
    recursos,
  );
  function salvarRemanejo(recurso, dia) {
    estado.atualizar((d) => ({
      ...d,
      lotes: aplicarRemanejoNaFila(d.lotes, remanejar, recurso, dia),
      geradoEm: new Date().toISOString(),
    }));
  }
  function trabalho(l, tipo = "hoje", proximo = null) {
    return (
      <TrabalhoEncarregado
        key={l.id}
        lote={l}
        tipo={tipo}
        hoje={hoje}
        aberto={aberto}
        onAbrir={setAberto}
        onDesenho={setDesenho}
        onFicha={setFicha}
        remanejar={remanejar}
        onRemanejar={setRemanejar}
        onSalvo={salvarRemanejo}
        atualizando={estado.atualizando}
        proximo={proximo}
      />
    );
  }
  if (!carregado)
    return (
      <p role="status" className="p-5 text-torg-gray">
        Abrindo seu posto…
      </p>
    );
  if (!posto || escolher)
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <header>
          <p className="text-xs font-semibold uppercase tracking-wide text-torg-blue">
            Produção
          </p>
          <h1 className="text-3xl font-bold text-torg-dark mt-2">
            Em qual setor você trabalha?
          </h1>
          <p className="text-torg-gray mt-3">
            Escolha uma vez. Neste aparelho, o portal vai abrir direto na sua
            fila.
          </p>
        </header>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {Object.entries(SETORES).map(([s, Icon]) => (
            <button
              key={s}
              onClick={() => escolherPosto(s)}
              className="bg-white text-torg-dark border rounded-xl p-5 min-h-28 text-left hover:border-torg-blue"
            >
              <Icon className="text-torg-blue mb-3" />
              <span className="font-semibold">{ETAPAS[s]}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-3">
          {posto && (
            <button className={botao} onClick={() => setEscolher(false)}>
              Voltar ao meu trabalho
            </button>
          )}
          <Link href="/producao/gestao" className={botao}>
            Gestão das OPs
          </Link>
          <Link
            href="/producao/modelo"
            className={`${botao} flex items-center gap-2`}
          >
            <Box size={16} />
            Modelo 3D
          </Link>
        </div>
      </div>
    );
  return (
    <div className="max-w-5xl mx-auto min-w-0 space-y-5">
      <header className="flex flex-wrap justify-between items-start gap-3">
        <div>
          <p className="text-xs uppercase tracking-wider font-semibold text-torg-blue">
            Meu trabalho · Produção
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold text-torg-dark mt-1">
            Hoje na fábrica
          </h1>
          <p className="text-sm text-torg-gray mt-1">
            {ETAPAS[posto.setor]} · trabalho por{" "}
            {posto.setor === "CORTE" ? "máquina" : "bancada"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {/* ⚠ a planilha de CORREÇÃO do setor: o que foi baixado no portal e o Syneco ainda não tem. Vitor
              (14/09/2026): "exportar a planilha de Apontamentos para ser corrigido no Syneco". */}
          <button
            type="button"
            onClick={planilhaSyneco}
            disabled={baixandoSyneco}
            className={`${botao} inline-flex gap-2 items-center`}
            title="Planilha do que este setor baixou no portal e ainda não está no Syneco, para lançar lá"
          >
            <FileSpreadsheet size={17} />
            {baixandoSyneco ? "Montando…" : "Planilha p/ Syneco"}
          </button>
          <Link
            href="/producao/modelo"
            className={`${botao} inline-flex gap-2 items-center !text-torg-blue`}
          >
            <Box size={17} />
            Modelo 3D
          </Link>
        </div>
      </header>
      {avisoSyneco && <p className="text-sm text-torg-dark bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{avisoSyneco}</p>}
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-torg-gray flex-1 min-w-0 basis-48">
          {posto.setor === "CORTE" ? "Máquina" : "Montador / bancada"}
          <select
            aria-label="Minha bancada ou máquina"
            disabled={!!remanejar}
            className={`${campo} !text-base block w-full mt-1`}
            value={posto.recurso}
            onChange={(e) => escolherPosto(posto.setor, e.target.value)}
          >
            <option value="">Todo o setor</option>
            {posto.recurso && !recursos.includes(posto.recurso) && (
              <option value={posto.recurso}>
                {rotuloPosto(posto.recurso)}
              </option>
            )}
            {recursos.map((r) => (
              <option key={r} value={r}>
                {rotuloPosto(r)}
              </option>
            ))}
          </select>
        </label>
        <button
          className={`${botao} flex items-center gap-2`}
          disabled={!!remanejar}
          onClick={() => setEscolher(true)}
        >
          <SlidersHorizontal size={16} />
          Trocar setor
        </button>
        <Atualizar
          onClick={estado.recarregar}
          disabled={estado.carregando || estado.atualizando || !!remanejar}
        />
      </div>
      <EstadoConsulta estado={estado}>
        {visao.prioritarias > 0 && (
          <p className="flex items-center gap-2 rounded-lg bg-orange-50 border border-orange-200 text-orange-900 p-3 text-sm font-semibold">
            <Flag size={18} className="shrink-0" />
            {fmt(visao.prioritarias)} peças prioritárias para fazer primeiro
          </p>
        )}
        {visao.pendencias.length > 0 && (
          <a
            href="#pendencias-producao"
            className="flex items-center gap-2 min-h-11 text-sm text-amber-900 underline underline-offset-4"
          >
            <AlertTriangle size={17} className="shrink-0" />
            {fmt(visao.pendencias.reduce((s, l) => s + l.saldo, 0))} peças com
            pendências · conferir abaixo
          </a>
        )}
        <section aria-label="Trabalho para agora" className="space-y-3">
          {!visao.postos.length ? (
            <div className="bg-white rounded-xl border p-5 text-torg-gray">
              <PackageOpen className="mb-2" />
              <h2 className="font-semibold text-torg-dark">
                Nenhum lote programado para agora
              </h2>
              <p className="text-sm mt-2">
                Confira as pendências e os lotes aguardando distribuição abaixo.
              </p>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 gap-4 items-start">
              {visao.postos.map((p, index) => (
                <div
                  key={p.recurso}
                  className={`min-w-0 space-y-3 ${index === 0 && p.agora[0].saldoPrioritario > 0 ? "md:col-span-2" : ""}`}
                >
                  {trabalho(p.agora[0], "hoje", p.agora[1] || p.proximo)}
                  {p.agora.length > 1 && (
                    <details className="bg-white border rounded-xl p-3">
                      <summary className="min-h-11 cursor-pointer text-sm font-semibold text-torg-blue">
                        Mais {p.agora.length - 1} lote(s) para agora ·{" "}
                        {rotuloPosto(p.recurso)}
                      </summary>
                      <div className="space-y-3 mt-2">
                        {p.agora.slice(1).map((l) => trabalho(l))}
                      </div>
                    </details>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
        <section
          id="pendencias-producao"
          aria-label="Pendências da produção"
          className="space-y-3 scroll-mt-20"
        >
          <h2 className="font-bold text-lg text-torg-dark">
            O que precisa de atenção
          </h2>
          {visao.pendencias.length ? (
            <div className="grid md:grid-cols-2 gap-4 items-start">
              {visao.pendencias.map((l) => trabalho(l, "pendencia"))}
            </div>
          ) : (
            <p className="text-sm text-torg-gray">
              Nenhuma pendência registrada nesta seleção.
            </p>
          )}
        </section>
        <section aria-label="Aguardando distribuição" className="space-y-3">
          <div className="flex flex-wrap gap-3 items-center justify-between">
            <h2 className="font-bold text-lg text-torg-dark">
              Aguardando distribuição
            </h2>
            <Link
              href="/pcp/producao"
              className={`${botao} inline-flex items-center gap-2 !text-torg-blue`}
            >
              <CalendarDays size={16} />
              Distribuir no Gantt
            </Link>
          </div>
          <p className="text-sm text-torg-gray">
            Lotes cuja pendência na fila é definir data ou posto. A distribuição
            continua no Gantt compartilhado com o PCP.
          </p>
          {visao.aguardandoProgramacao.length ? (
            <div className="grid md:grid-cols-2 gap-4 items-start">
              {visao.aguardandoProgramacao.map((l) => trabalho(l, "programar"))}
            </div>
          ) : (
            <p className="text-sm text-torg-gray">
              Nenhum lote aguardando programação nesta seleção.
            </p>
          )}
        </section>
        <details className="bg-white border rounded-xl px-4">
          <summary className="cursor-pointer font-semibold text-torg-blue min-h-12 py-3">
            {posto.setor === "CORTE" ? "Máquinas" : "Bancadas"} sem trabalho
            para agora ({visao.semTrabalho.length})
          </summary>
          <p className="text-xs text-torg-gray pb-3">
            Confira pendências, programação futura e disponibilidade da equipe
            antes de distribuir.
          </p>
          <div className="divide-y">
            {visao.semTrabalho.map((p) => (
              <button
                key={p.recurso}
                disabled={!!remanejar}
                onClick={() => escolherPosto(posto.setor, p.recurso)}
                className="block text-left w-full min-h-16 py-3 disabled:opacity-40"
              >
                <span className="block text-sm font-semibold text-torg-dark">
                  {rotuloPosto(p.recurso)}
                </span>
                <span className="block text-xs text-torg-gray mt-1">
                  {p.pendencias.length
                    ? `${fmt(p.pendencias.reduce((s, l) => s + l.saldo, 0))} peças com pendências`
                    : p.aguardandoProgramacao.length
                      ? "Aguardando definição de data"
                      : "Sem lote para agora"}
                  {p.proximo
                    ? ` · Próxima OP ${p.proximo.op} em ${data(p.proximo.dia)}`
                    : " · sem programação futura"}
                </span>
              </button>
            ))}
          </div>
          {!visao.semTrabalho.length && (
            <p className="text-sm text-torg-gray pb-4">
              Todos os postos desta seleção têm trabalho para agora.
            </p>
          )}
        </details>
        <details className="bg-white border rounded-xl px-4">
          <summary className="cursor-pointer font-semibold text-torg-blue min-h-12 py-3">
            Próximos 6 dias ({visao.proximos.length})
          </summary>
          <div className="space-y-3 pb-4">
            {visao.proximos.map((l) => trabalho(l, "futuro"))}
            {!visao.proximos.length && (
              <p className="text-sm text-torg-gray">
                Sem lotes programados neste período.
              </p>
            )}
          </div>
        </details>
        {visao.maisAdiante.length > 0 && (
          <details className="bg-white border rounded-xl px-4">
            <summary className="cursor-pointer font-semibold text-torg-blue min-h-12 py-3">
              Programação mais adiante ({visao.maisAdiante.length})
            </summary>
            <div className="space-y-3 pb-4">
              {visao.maisAdiante.map((l) => trabalho(l, "futuro"))}
            </div>
          </details>
        )}
        <p role="status" className="text-xs text-torg-gray">
          {estado.atualizando
            ? "Atualizando a fila…"
            : `Atualizado às ${estado.dados?.geradoEm ? new Date(estado.dados.geradoEm).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "—"} · atualização automática a cada minuto`}
        </p>
      </EstadoConsulta>
      <footer className="border-t pt-4 flex flex-wrap justify-between gap-3 text-sm">
        <Link
          className="min-h-11 flex items-center text-torg-gray"
          href="/producao/gestao"
        >
          Gestão das OPs
        </Link>
        <Link
          className="min-h-11 flex items-center text-torg-blue"
          href="/producao/agenda"
        >
          Programação e recursos
        </Link>
      </footer>
      {desenho && (
        <DesenhoPecaModal
          {...desenho}
          setor={posto.setor}
          onClose={() => setDesenho(null)}
        />
      )}
      {ficha && <FichaPecaModal {...ficha} onClose={() => setFicha(null)} />}
    </div>
  );
}
