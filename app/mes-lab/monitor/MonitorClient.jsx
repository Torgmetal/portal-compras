"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw, Maximize2, Minimize2, WifiOff } from "lucide-react";
import Cartao from "./Cartao";
import { PASSO_MS, proximoPasso } from "./passo";

// O MONITOR, DO LADO DO NAVEGADOR — no padrão das telas de TV do portal (a de Prioridades do
// Planejamento é a referência): barra navy com a marca e o relógio, corpo claro, título com a
// tarja laranja, e botão de tela cheia. Quem entra nesta TV reconhece que é o mesmo portal.
//
// ⚠⚠ `setTimeout` DEPOIS DA RESPOSTA, NÃO `setInterval` (recomendação do Codex, 13/09/2026). Com
// intervalo fixo, uma consulta que demore mais que o passo faz as chamadas se empilharem — e uma TV
// ligada o dia inteiro acumularia requisições até o banco reclamar.
//
// ⚠⚠ FALHA DE ATUALIZAÇÃO É MOSTRADA SEPARADA DO ESTADO DA FÁBRICA. Se a rede cair, os cards
// continuam com o último panorama e aparece a tarja de "sem atualizar há X" — apagar a tela ou
// pintar tudo de cinza faria o supervisor achar que a fábrica parou, quando quem parou foi o Wi-Fi.

const btnNavy = "p-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors";

export default function MonitorClient({ inicial }) {
  const [dados, setDados] = useState(inicial);
  const [falha, setFalha] = useState(null);
  const [agora, setAgora] = useState(() => Date.now());
  const [cheia, setCheia] = useState(false);
  const raiz = useRef(null);
  const vivo = useRef(true);

  // O relógio da tela é independente da busca: é ele que faz "12 min" virar "13 min" sem que
  // ninguém precise ir ao servidor perguntar.
  useEffect(() => {
    const relogio = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(relogio);
  }, []);

  useEffect(() => {
    const aoTrocar = () => setCheia(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", aoTrocar);
    return () => document.removeEventListener("fullscreenchange", aoTrocar);
  }, []);

  const buscar = useCallback(async () => {
    const r = await fetch("/api/mes-lab/monitor", { cache: "no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const json = await r.json();
    if (!json.success) throw new Error(json.error || "resposta sem sucesso");
    return json;
  }, []);

  useEffect(() => {
    vivo.current = true;
    let marcado;
    let erros = 0;

    const ciclo = async () => {
      try {
        const json = await buscar();
        if (!vivo.current) return;
        setDados(json);
        setFalha(null);
        erros = 0;
      } catch (e) {
        if (!vivo.current) return;
        erros += 1;
        setFalha(e.message);
      }
      if (vivo.current) marcado = setTimeout(ciclo, proximoPasso(erros));
    };

    marcado = setTimeout(ciclo, PASSO_MS);
    return () => { vivo.current = false; clearTimeout(marcado); };
  }, [buscar]);

  const { setores = [], resumo = {}, lidoEm } = dados || {};
  const atraso = lidoEm ? Math.floor((agora - new Date(lidoEm).getTime()) / 1000) : null;
  const relogio = new Date(agora);

  const telaCheia = () => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else raiz.current?.requestFullscreen?.();
  };

  return (
    <div ref={raiz} className="min-h-screen bg-[#F3F6F9] text-torg-dark">
      <div className="flex flex-wrap items-center justify-between gap-4 bg-torg-dark px-6 py-3.5">
        <div className="flex min-w-0 items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/torg-logo-white.png" alt="Torg Metal" className="h-8 w-auto shrink-0 sm:h-9" />
          <div className="hidden h-6 w-px bg-white/20 sm:block" />
          <span className="hidden text-sm font-medium text-torg-blue-200 sm:block">Monitor de máquinas</span>
        </div>

        <div className="flex items-center gap-4">
          <Atualizacao falha={falha} atraso={atraso} />
          <div className="text-right leading-tight text-white">
            <p className="text-xl font-bold tabular-nums">
              {relogio.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
            </p>
            <p className="text-[11px] capitalize text-torg-blue-200">
              {relogio.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" })}
            </p>
          </div>
          <button onClick={telaCheia} title={cheia ? "Sair da tela cheia" : "Tela cheia"} className={btnNavy}>
            {cheia ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
          </button>
        </div>
      </div>

      <div className="p-6">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="mb-2.5 h-1 w-11 rounded bg-torg-orange" />
            <h1 className="text-2xl font-extrabold leading-none text-torg-dark sm:text-3xl">
              O chão de fábrica agora
            </h1>
            <p className="mt-1.5 text-sm text-torg-gray">
              MES Torg · laboratório — cada posto com o que está fazendo, atualizado sozinho
            </p>
          </div>
          <Resumo resumo={resumo} />
        </div>

        {setores.length === 0 ? (
          <p className="mt-20 text-center text-lg text-torg-gray">
            Nenhum posto ativo no cadastro. Cadastre em <code>/mes-lab/cadastro</code>.
          </p>
        ) : null}

        {setores.map((s) => (
          <section key={s.codigo} className="mb-7">
            <div className="mb-3 flex items-center gap-3">
              {/* ⚠ A cor é a do CADASTRO (`MesSetor.cor`), que veio do Gantt do PCP — a mesma que
                  pinta o setor lá. Inventar uma paleta aqui faria o mesmo setor ter duas cores no
                  mesmo portal. */}
              <div className="h-6 w-1.5 rounded" style={{ backgroundColor: s.cor || "#006EAB" }} />
              <h2 className="text-lg font-extrabold text-torg-dark">{s.nome}</h2>
              <span className="text-xs font-semibold text-torg-gray-light">
                {s.postos.length} {s.postos.length === 1 ? "posto" : "postos"}
              </span>
            </div>
            <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
              {s.postos.map((p) => <Cartao key={p.id} posto={p} agora={agora} />)}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

const Conta = ({ rotulo, valor, cor }) => (
  <div className="text-center">
    <div className={`text-3xl font-black tabular-nums ${cor}`}>{valor ?? 0}</div>
    <div className="text-[10px] font-bold uppercase tracking-widest text-torg-gray-light">{rotulo}</div>
  </div>
);

/**
 * ⚠ PARADO, LIVRE E SEM REGISTRO SÃO TRÊS CONTAS SEPARADAS. Somar os três em "não produzindo" é o
 * número que o Syneco entrega hoje e que não serve para agir: parada é problema para resolver
 * agora, livre é máquina esperando trabalho, sem registro é posto que ninguém sabe.
 */
function Resumo({ resumo }) {
  return (
    <div className="flex flex-wrap items-center gap-6 rounded-2xl border border-gray-100 bg-white px-6 py-3 shadow-sm">
      <Conta rotulo="Produzindo" valor={resumo.produzindo} cor="text-emerald-600" />
      <Conta rotulo="Parado" valor={resumo.parado} cor="text-red-600" />
      <Conta rotulo="Setup" valor={resumo.setup} cor="text-amber-500" />
      <Conta rotulo="Livre" valor={resumo.livre} cor="text-torg-gray" />
      <Conta rotulo="Sem registro" valor={resumo.semRegistro} cor="text-gray-300" />
    </div>
  );
}

/** ⚠ Diz há quanto tempo o dado é, não "ao vivo": quem lê precisa saber se pode confiar. */
function Atualizacao({ falha, atraso }) {
  if (falha) {
    return (
      <span className="flex items-center gap-2 rounded-xl bg-red-500/20 px-3 py-2 text-sm font-bold text-red-200">
        <WifiOff size={16} />
        Sem atualizar {atraso != null ? `há ${atraso}s` : ""}
      </span>
    );
  }
  return (
    <span className="hidden items-center gap-2 text-xs font-semibold text-torg-blue-200 sm:flex">
      <RefreshCw size={14} />
      {atraso != null && atraso > 1 ? `há ${atraso}s` : "agora"}
    </span>
  );
}
