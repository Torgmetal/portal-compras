"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Factory, RefreshCw, WifiOff } from "lucide-react";
import Cartao from "./Cartao";
import { PASSO_MS, proximoPasso } from "./passo";

// O MONITOR, DO LADO DO NAVEGADOR.
//
// ⚠⚠ `setTimeout` DEPOIS DA RESPOSTA, NÃO `setInterval` (recomendação do Codex, 13/09/2026). Com
// intervalo fixo, uma consulta que demore mais que o passo faz as chamadas se empilharem — e uma TV
// ligada o dia inteiro acumularia requisições até o banco reclamar. Assim só existe uma viagem por
// vez, e a seguinte é marcada quando a anterior termina.
//
// ⚠⚠ FALHA DE ATUALIZAÇÃO É MOSTRADA SEPARADA DO ESTADO DA FÁBRICA. Se a rede cair, os cards
// continuam com o último panorama e aparece a tarja de "sem atualizar há X" — apagar a tela ou
// pintar tudo de cinza faria o supervisor achar que a fábrica parou, quando quem parou foi o Wi-Fi.

export default function MonitorClient({ inicial }) {
  const [dados, setDados] = useState(inicial);
  const [falha, setFalha] = useState(null);
  const [agora, setAgora] = useState(() => Date.now());
  const vivo = useRef(true);

  // O relógio da tela é independente da busca: é ele que faz "12 min" virar "13 min" sem que
  // ninguém precise ir ao servidor perguntar.
  useEffect(() => {
    const relogio = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(relogio);
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

  return (
    <div className="min-h-screen bg-slate-950 px-6 py-5 text-white">
      <Cabecalho resumo={resumo} falha={falha} atraso={atraso} />

      {setores.length === 0 ? (
        <p className="mt-20 text-center text-lg text-white/40">
          Nenhum posto ativo no cadastro. Cadastre em <code>/mes-lab/cadastro</code>.
        </p>
      ) : null}

      {setores.map((s) => (
        <section key={s.codigo} className="mt-7">
          <h2 className="mb-3 flex items-baseline gap-3 text-sm font-black uppercase tracking-widest text-white/50">
            {s.nome}
            <span className="text-xs font-semibold text-white/25">{s.postos.length} postos</span>
          </h2>
          <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {s.postos.map((p) => <Cartao key={p.id} posto={p} agora={agora} />)}
          </div>
        </section>
      ))}
    </div>
  );
}

const Conta = ({ rotulo, valor, cor }) => (
  <div className="text-center">
    <div className={`text-3xl font-black tabular-nums ${cor}`}>{valor ?? 0}</div>
    <div className="text-[10px] font-bold uppercase tracking-widest text-white/35">{rotulo}</div>
  </div>
);

function Cabecalho({ resumo, falha, atraso }) {
  return (
    <header className="flex flex-wrap items-center gap-x-8 gap-y-4 border-b border-white/10 pb-4">
      <div className="flex items-center gap-3">
        <Factory size={26} className="text-white/60" />
        <div>
          <h1 className="text-2xl font-black tracking-tight">Monitor de máquinas</h1>
          <p className="text-xs text-white/35">MES Torg · laboratório</p>
        </div>
      </div>

      <div className="flex flex-1 flex-wrap items-center justify-end gap-6">
        <Conta rotulo="Produzindo" valor={resumo.produzindo} cor="text-emerald-400" />
        <Conta rotulo="Parado" valor={resumo.parado} cor="text-red-400" />
        <Conta rotulo="Setup" valor={resumo.setup} cor="text-amber-400" />
        <Conta rotulo="Livre" valor={resumo.livre} cor="text-slate-400" />
        <Conta rotulo="Sem registro" valor={resumo.semRegistro} cor="text-white/30" />
        <Atualizacao falha={falha} atraso={atraso} />
      </div>
    </header>
  );
}

/** ⚠ Diz há quanto tempo o dado é, não "ao vivo": quem lê precisa saber se pode confiar. */
function Atualizacao({ falha, atraso }) {
  if (falha) {
    return (
      <span className="flex items-center gap-2 rounded-lg bg-red-500/15 px-3 py-2 text-sm font-bold text-red-300">
        <WifiOff size={16} />
        Sem atualizar {atraso != null ? `há ${atraso}s` : ""}
      </span>
    );
  }
  return (
    <span className="flex items-center gap-2 text-xs font-semibold text-white/30">
      <RefreshCw size={14} />
      {atraso != null && atraso > 1 ? `há ${atraso}s` : "agora"}
    </span>
  );
}
