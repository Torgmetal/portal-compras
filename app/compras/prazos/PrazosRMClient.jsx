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
import { SITUACAO, rotuloSituacao, filtrarLinhas } from "@/lib/painel-prazos-rm";

const fmt = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—");
const moeda = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const CHIP = {
  red: "bg-red-100 text-red-700", orange: "bg-orange-100 text-orange-700",
  amber: "bg-amber-100 text-amber-700", sky: "bg-sky-100 text-sky-700",
  gray: "bg-gray-100 text-gray-600", emerald: "bg-emerald-100 text-emerald-700",
};
const ORDEM_CHIPS = ["ATRASADO", "VENCE_HOJE", "PROXIMO", "NO_PRAZO", "SEM_PRAZO", "CHEGOU"];

/** O quanto falta, em palavras — a mesma frase que alguém usaria no telefone. */
function Quando({ p }) {
  if (p.situacao === "CHEGOU") {
    const t = p.atrasoDias;
    return (
      <span className="text-emerald-700">
        chegou{t == null ? "" : t > 0 ? ` com ${t} ${t === 1 ? "dia" : "dias"} de atraso` : t === 0 ? " no prazo" : ` ${Math.abs(t)} ${Math.abs(t) === 1 ? "dia" : "dias"} adiantado`}
      </span>
    );
  }
  if (p.diasAte == null) return <span className="text-torg-gray">sem prazo informado</span>;
  if (p.diasAte < 0) return <span className="text-red-600 font-medium">{Math.abs(p.diasAte)} {Math.abs(p.diasAte) === 1 ? "dia" : "dias"} de atraso</span>;
  if (p.diasAte === 0) return <span className="text-orange-600 font-medium">vence hoje</span>;
  return <span className="text-torg-gray">em {p.diasAte} {p.diasAte === 1 ? "dia" : "dias"}</span>;
}

function LinhaPedido({ p }) {
  const cfg = SITUACAO[p.situacao];
  return (
    <li className="py-2 flex items-start gap-3 flex-wrap">
      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0 ${CHIP[cfg.cor]}`}>{cfg.rotulo}</span>
      <div className="flex-1 min-w-[180px]">
        <p className="text-sm text-torg-dark">
          {p.fornecedorNome}
          {p.numeroPedido && <span className="ml-1.5 text-xs text-torg-gray">#{p.numeroPedido}</span>}
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
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 py-3 bg-gray-50/60 border-b border-gray-100 flex items-center gap-3 flex-wrap">
        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${CHIP[cfg.cor]}`}>{cfg.rotulo}</span>
        {/* ⚠ O número da RM leva para a RM: esta tela responde "onde dói", e o conserto é lá. */}
        {l.rmId ? (
          <Link href={`/compras/rm/${l.rmId}`} className="font-semibold text-torg-dark hover:text-torg-blue inline-flex items-center gap-1">
            {l.numero} <ExternalLink size={12} />
          </Link>
        ) : (
          <span className="font-semibold text-torg-dark">{l.numero}</span>
        )}
        {l.op?.numero && <span className="text-xs text-torg-gray">OP-{String(l.op.numero).padStart(3, "0")} · {l.op.cliente || l.op.obra || ""}</span>}
        <span className="ml-auto text-xs text-torg-gray">
          {l.pedidos.length} {l.pedidos.length === 1 ? "pedido" : "pedidos"} · <b className="text-torg-dark tabular-nums">{moeda(l.total)}</b>
        </span>
      </div>
      <ul className="px-5 divide-y divide-gray-50">
        {l.pedidos.map((p) => <LinhaPedido key={p.id} p={p} />)}
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

  const visiveis = useMemo(() => filtrarLinhas(dados?.linhas, filtro), [dados, filtro]);

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

  const r = dados.resumo;
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
        <button type="button" onClick={() => setFiltro("PENDENTES")}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors bg-white text-torg-dark ${
            filtro === "PENDENTES" ? "border-torg-blue ring-1 ring-torg-blue" : "border-gray-200 hover:bg-gray-50"}`}>
          A chegar <b className="ml-1 tabular-nums">{r.rms - r.CHEGOU}</b>
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
          {r.rms} {r.rms === 1 ? "RM" : "RMs"} · {r.pedidos} pedidos · <b className="text-torg-dark">{r.pendentes}</b> ainda não chegaram
        </span>
      </div>

      {visiveis.length === 0 ? (
        <div className="py-16 text-center bg-white rounded-xl border border-gray-100">
          <Package size={28} className="mx-auto text-gray-300" />
          <p className="mt-2 text-sm text-torg-gray">
            {filtro === "PENDENTES" ? "Nenhuma RM esperando entrega — tudo que foi pedido já chegou."
              : filtro === "TODAS" ? "Nenhuma RM com pedido gerado ainda."
              : `Nenhuma RM em "${rotuloSituacao(filtro)}".`}
          </p>
          {filtro !== "TODAS" && (
            <button onClick={() => setFiltro("TODAS")} className="mt-3 text-sm text-torg-blue hover:underline inline-flex items-center gap-1">
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
