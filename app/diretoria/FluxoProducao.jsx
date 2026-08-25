"use client";
// FLUXO DA PRODUÇÃO — as três perguntas da Diretoria, numa tela de leitura.
//
// Vitor (25/08/2026): "não tenho o controle do que a engenharia desce de desenho para o programador,
// não tenho a visão do que o programador de fato fez e não tenho o controle do que cada setor está
// fazendo".
//
// ⚠⚠ ORDEM DOS BLOCOS = ORDEM DA DOR. "Fora do mapa" vem PRIMEIRO, antes da fila do programador,
// porque enquanto a fábrica produz item que o portal não tem, todo o resto da conta sai errado —
// medido em 25/08/2026: 4.576 itens, 3.671 só na OP-064. Pôr a fila em cima daria a impressão de
// que o problema é o programador estar devagar.
//
// ⚠ NADA AQUI TEM BOTÃO QUE MUDA DADO. Quem opera trabalha no PCP e na Produção; esta tela é para
// olhar e cobrar. Virar tela de ação faria a quarta lista de trabalho da mesma fábrica.
import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  Loader2, AlertCircle, RefreshCw, EyeOff, Send, Factory, ArrowRight, CalendarClock,
} from "lucide-react";
import { fmtOP } from "@/lib/utils";

const fmtN = (n) => Number(n || 0).toLocaleString("pt-BR");
const fmtKg = (n) => `${Number(n || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} kg`;
const fmtD = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC", day: "2-digit", month: "2-digit" }) : "—");

export default function FluxoProducao() {
  const [d, setD] = useState(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    setCarregando(true); setErro("");
    try {
      const r = await fetch("/api/diretoria/fluxo", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro ao carregar");
      setD(j);
    } catch (e) { setErro(e.message); } finally { setCarregando(false); }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const foraDoMapa = useMemo(
    () => (d?.ops || []).filter((o) => o.foraDoMapa > 0).sort((a, b) => b.foraDoMapa - a.foraDoMapa),
    [d]);
  const filaProgramador = useMemo(
    () => (d?.ops || []).filter((o) => o.aLancar > 0).sort((a, b) => b.aLancar - a.aLancar),
    [d]);
  const picoDia = useMemo(() => Math.max(1, ...(d?.dias || []).map((x) => x.kg)), [d]);

  if (carregando) return <div className="flex items-center justify-center py-20 gap-3 text-torg-gray"><Loader2 size={22} className="animate-spin" /> Carregando…</div>;
  if (erro) return <div className="bg-red-50 border border-red-200 rounded-xl p-5 text-center text-red-700 flex flex-col items-center gap-2"><AlertCircle size={26} /> {erro}</div>;

  const t = d.totais;
  const pctLancado = t.entregues > 0 ? Math.round((t.lancadas / t.entregues) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <p className="text-sm text-torg-gray max-w-3xl">
          O caminho do trabalho, da Engenharia até a bancada: <strong>o que desceu</strong>,
          <strong> o que o programador pegou</strong> e <strong>o que cada setor fez</strong>.
          Só leitura — quem opera trabalha no PCP e na Produção.
        </p>
        <button onClick={carregar} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-200 rounded-lg text-torg-gray hover:bg-gray-50">
          <RefreshCw size={15} /> Atualizar
        </button>
      </div>

      {/* ── o funil, em três números ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card n={fmtN(t.entregues)} l="Peças que a Engenharia entregou" sub="lista de produção importada" cor="#006EAB" bg="#e8f2f9" />
        <Card n={`${pctLancado}%`} l="Programadas no Syneco" sub={`${fmtN(t.lancadas)} de ${fmtN(t.entregues)}`} cor="#1e9e6a" bg="#e7f5ee" />
        <Card n={fmtN(t.aLancar)} l="Esperando o programador" sub="entregue e sem ordem" cor="#b45309" bg="#fff6e6" />
        <Card n={fmtN(t.foraDoMapa)} l="Fora do mapa" sub={`em ${t.obrasForaDoMapa} obra(s)`} cor="#dc2626" bg="#fdeaea" />
      </div>

      {/* ── 1. FORA DO MAPA (vem primeiro: contamina todo o resto) ── */}
      <Bloco
        icone={EyeOff}
        titulo="A fábrica está produzindo o que o portal não conhece"
        sub={`${fmtN(t.foraDoMapa)} item(ns) com ordem no Syneco e sem peça na lista do portal, em ${t.obrasForaDoMapa} obra(s).`}
        cor="text-red-700"
      >
        {/* ⚠ o texto explica o EFEITO, não só o fato: sem isso, o número vira curiosidade. */}
        <p className="text-[12px] text-torg-gray mb-3">
          Enquanto a lista não entra, tudo que se conta por obra sai errado — kg pendente, avanço de
          setor, fila do programador. É por isso que este bloco vem antes dos outros.
        </p>
        {!foraDoMapa.length ? <Vazio texto="Nenhuma obra fora do mapa. Toda ordem do Syneco tem peça no portal." /> : (
          <Tabela cabecalho={["Obra", "Fora do mapa", "Na lista", "Situação"]}>
            {foraDoMapa.map((o) => (
              <tr key={o.opId} className="border-t border-gray-50 hover:bg-gray-50/60">
                <Td><Obra o={o} /></Td>
                <Td dir><span className="font-bold text-red-700 tabular-nums">{fmtN(o.foraDoMapa)}</span></Td>
                <Td dir><span className="tabular-nums text-torg-gray">{fmtN(o.entregues)}</span></Td>
                <Td>
                  {o.semListaNenhuma
                    ? <Chip cor="bg-red-100 text-red-800 border-red-200">produz sem lista nenhuma</Chip>
                    : <Chip cor="bg-amber-50 text-amber-700 border-amber-200">lista incompleta</Chip>}
                </Td>
              </tr>
            ))}
          </Tabela>
        )}
      </Bloco>

      {/* ── 2. FILA DO PROGRAMADOR ── */}
      <Bloco
        icone={Send}
        titulo="A Engenharia entregou e o programador ainda não pegou"
        sub={`${fmtN(t.aLancar)} peça(s) com lista no portal e sem ordem no Syneco.`}
        cor="text-amber-700"
      >
        {!filaProgramador.length ? <Vazio texto="Nada esperando: toda peça entregue já tem ordem no Syneco." /> : (
          <Tabela cabecalho={["Obra", "A programar", "Programado", "Último lançamento", "Entrega"]}>
            {filaProgramador.map((o) => (
              <tr key={o.opId} className="border-t border-gray-50 hover:bg-gray-50/60">
                <Td><Obra o={o} /></Td>
                <Td dir><span className="font-bold text-amber-700 tabular-nums">{fmtN(o.aLancar)}</span></Td>
                <Td dir><span className="tabular-nums text-torg-gray">{fmtN(o.lancadas)}/{fmtN(o.entregues)}</span></Td>
                {/* ⚠ "há N dias sem lançar" é o que separa fila grande de fila PARADA — uma obra com
                    1.100 peças mexida ontem é volume; a mesma parada há três semanas é problema. */}
                <Td>
                  <span className={`text-[12px] tabular-nums ${o.diasSemLancar >= 14 ? "text-red-600 font-semibold" : o.diasSemLancar >= 7 ? "text-amber-700" : "text-torg-gray"}`}>
                    {o.diasSemLancar == null ? "nunca" : o.diasSemLancar === 0 ? "hoje" : `há ${o.diasSemLancar}d`}
                  </span>
                </Td>
                <Td>
                  <span className={`text-[12px] tabular-nums inline-flex items-center gap-1 ${o.atrasoDias > 0 ? "text-red-600 font-semibold" : "text-torg-gray"}`}>
                    <CalendarClock size={11} /> {fmtD(o.entrega)}
                  </span>
                </Td>
              </tr>
            ))}
          </Tabela>
        )}
      </Bloco>

      {/* ── 3. RITMO POR SETOR ── */}
      <Bloco
        icone={Factory}
        titulo={`O que cada setor fez nos últimos ${d.janelaDias} dias`}
        sub="Apontamento do Syneco, por dia de produção."
        cor="text-torg-blue"
      >
        <Tabela cabecalho={["Setor", "Peso", "Média/dia", "Dias com apontamento", "Obras", "Último"]}>
          {d.setores.map((s) => (
            <tr key={s.setor} className="border-t border-gray-50 hover:bg-gray-50/60">
              <Td><span className="font-semibold text-torg-dark">{s.setor}</span></Td>
              <Td dir><span className="font-bold tabular-nums">{fmtKg(s.kg)}</span></Td>
              <Td dir><span className="tabular-nums text-torg-gray">{fmtKg(s.mediaDia)}</span></Td>
              {/* ⚠ dias COM apontamento é a pergunta escondida: um setor que soma bastante peso em
                  poucos dias não está tocando todo dia — e é isso que quebra o ritmo da fábrica. */}
              <Td>
                <span className={`text-[12px] tabular-nums ${s.dias <= d.janelaDias / 2 ? "text-amber-700 font-semibold" : "text-torg-gray"}`}>
                  {s.dias} de {d.janelaDias}
                </span>
              </Td>
              <Td dir><span className="tabular-nums text-torg-gray">{s.obras}</span></Td>
              <Td><span className="text-[12px] text-torg-gray tabular-nums">{fmtD(s.ultimo)}</span></Td>
            </tr>
          ))}
        </Tabela>

        {/* ⚠ o gráfico é de BARRA SIMPLES, sem biblioteca: o que se quer ver é a irregularidade do
            ritmo — dias de 1 t ao lado de dias de 33 t —, e para isso a altura relativa basta. */}
        <div className="mt-4">
          <p className="text-[11px] font-semibold text-torg-gray uppercase tracking-wide mb-2">Ritmo diário (kg apontados)</p>
          <div className="flex items-end gap-1 h-24">
            {d.dias.map((x) => (
              <div key={x.dia} className="flex-1 flex flex-col items-center gap-1 min-w-0" title={`${x.dia}: ${fmtKg(x.kg)} em ${x.setores} setor(es)`}>
                <div className="w-full bg-torg-blue/80 rounded-t hover:bg-torg-blue" style={{ height: `${Math.max(2, (x.kg / picoDia) * 100)}%` }} />
                <span className="text-[9px] text-torg-gray-light tabular-nums">{x.dia.slice(8)}</span>
              </div>
            ))}
          </div>
        </div>
      </Bloco>

      <p className="text-[11px] text-torg-gray-light text-right">
        Gerado em {new Date(d.geradoEm).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
      </p>
    </div>
  );
}

function Obra({ o }) {
  return (
    <span className="min-w-0">
      {/* ⚠ leva para a OP, não para a tela de trabalho: daqui se investiga, não se opera. */}
      <Link href={`/comercial/${o.opId}`} className="font-extrabold text-torg-dark tabular-nums hover:text-torg-blue hover:underline">
        {fmtOP(o.numero)}
      </Link>
      <span className="block text-[11px] text-torg-gray truncate max-w-[26ch]" title={`${o.cliente || ""}${o.obra ? ` — ${o.obra}` : ""}`}>
        {o.cliente || "—"}{o.obra ? ` — ${o.obra}` : ""}
      </span>
    </span>
  );
}

function Bloco({ icone: Icone, titulo, sub, cor, children }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-start gap-2 mb-1">
        <Icone size={18} className={`${cor} mt-0.5 shrink-0`} />
        <div className="min-w-0">
          <h3 className={`font-bold ${cor}`}>{titulo}</h3>
          <p className="text-[12px] text-torg-gray">{sub}</p>
        </div>
      </div>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function Tabela({ cabecalho, children }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-[11px] uppercase text-torg-gray">
          <tr>{cabecalho.map((h, i) => <th key={h} className={`px-3 py-2 font-semibold ${i === 0 ? "text-left" : "text-left"}`}>{h}</th>)}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
const Td = ({ children, dir }) => <td className={`px-3 py-2 align-top ${dir ? "text-right" : ""}`}>{children}</td>;
const Chip = ({ cor, children }) => <span className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold ${cor}`}>{children}</span>;
const Vazio = ({ texto }) => (
  <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2.5 inline-flex items-center gap-2">
    <ArrowRight size={14} /> {texto}
  </p>
);

function Card({ n, l, sub, cor, bg }) {
  return (
    <div className="rounded-xl p-3.5 border border-transparent" style={{ background: bg }}>
      <div className="text-2xl font-extrabold tabular-nums" style={{ color: cor }}>{n}</div>
      <div className="text-xs text-torg-gray mt-0.5">{l}</div>
      {sub && <div className="text-[10px] text-torg-gray-light mt-0.5">{sub}</div>}
    </div>
  );
}
