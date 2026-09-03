"use client";
// ─── GANTT DAS BANCADAS DA MONTAGEM ────────────────────────────────────────────
//
// Vitor (03/09/2026): "traga uma sugestão de como podemos fazer uma forma de gantt com as bancadas
// mostrando as OPs e os dias que elas vão ocupar em cada bancada". Sobre onde: "não acho que deve
// ficar em aba própria, deixa na mesma aba que estamos no pcp/producao" — e antes: "deixe em uma
// parte da tela separada para não ficar apertando botão e ficar uma zona tudo".
//
// ⚠⚠ BLOCO PRÓPRIO, SEMPRE ABERTO. Não é aba: quem programa precisa ver a agenda e o painel ao
// mesmo tempo. Esconder atrás de botão devolveria o problema que ele descreveu.
//
// ⚠⚠ ESTA TELA SÓ LÊ. Ela mostra o que a programação gravou; mexer no dia continua sendo na aba
// "Programado planejamento" (tirar) e em "Pronto para montar" (programar). Arrastar barra aqui
// seria um terceiro jeito de escrever a mesma coisa, e o primeiro a divergir.
//
// ⚠ AS TRÊS PERGUNTAS QUE ELA RESPONDE, e por isso cada elemento existe:
//   1. quando cabe        → o tracejado depois da última barra de cada bancada
//   2. quem está sem posto → a faixa "Sem bancada" (hoje 32 conjuntos e 35 t da OP-105, que não
//                            aparecem em nenhuma outra tela do portal)
//   3. dia estourado      → o rodapé, comparando o custo do dia com a meta de dias-bancada
import { useEffect, useMemo, useState } from "react";
import { Loader2, X } from "lucide-react";
import { fmtOP } from "@/lib/utils";
import { custoDoConjunto, RITMO_META, BANCADAS } from "@/lib/montagem-capacidade";

const fmtN = (n) => new Intl.NumberFormat("pt-BR").format(Math.round(Number(n) || 0));
const fmt1 = (n) => (Math.round((Number(n) || 0) * 10) / 10).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const hojeIso = () => new Date().toISOString().slice(0, 10);
const SEM = "__sem__";
const MAX_COLS = 22;

// ⚠ só dia ÚTIL vira coluna: sábado e domingo vazios no meio do Gantt empurram tudo para a direita
// e fazem uma semana parecer dez dias.
function diasUteisEntre(de, ate) {
  const out = [];
  const d = new Date(`${de}T00:00:00Z`), fim = new Date(`${ate}T00:00:00Z`);
  while (d <= fim && out.length < MAX_COLS) {
    const s = d.getUTCDay();
    if (s !== 0 && s !== 6) out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}
const rotDia = (d) => {
  const dt = new Date(`${d}T00:00:00Z`);
  const sem = dt.toLocaleDateString("pt-BR", { weekday: "short", timeZone: "UTC" }).replace(".", "");
  return `${sem} ${dt.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" })}`;
};

// ⚠ cor por OBRA, estável: a mesma OP tem que ter a mesma cor em todas as bancadas, senão a leitura
// horizontal (onde essa obra está espalhada) se perde.
const CORES = ["#1E4E8C", "#C2621A", "#2A7A70", "#6B4E9E", "#8C1E3F", "#4E7A1E"];

export default function GanttBancadas({ recarga = 0 }) {
  const [dados, setDados] = useState(null);
  const [aberto, setAberto] = useState(null);

  useEffect(() => {
    let vivo = true;
    setDados(null);
    fetch("/api/pcp/bancadas", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => vivo && setDados(j?.conjuntos || []))
      .catch(() => vivo && setDados([]));
    return () => { vivo = false; };
  }, [recarga]);

  const g = useMemo(() => {
    const cs = dados || [];
    if (!cs.length) return null;
    const hoje = hojeIso();
    const diasComAlgo = [...new Set(cs.map((c) => c.dia).filter(Boolean))].sort();
    // ⚠ começa em HOJE quando a programação já passou: o Gantt é para decidir daqui para a frente;
    // semanas vencidas só empurrariam o que interessa para fora da tela.
    const de = diasComAlgo[0] < hoje ? diasComAlgo[0] : hoje;
    const dias = diasUteisEntre(de, diasComAlgo[diasComAlgo.length - 1]);
    const idx = new Map(dias.map((d, i) => [d, i]));

    const cores = new Map();
    [...new Set(cs.map((c) => c.opNumero))].sort().forEach((op, i) => cores.set(op, CORES[i % CORES.length]));

    const linhas = [];
    const usadas = [...new Set(cs.map((c) => c.bancada).filter(Boolean))];
    // ⚠ as bancadas conhecidas vêm primeiro e na ordem do resto do portal (lib/montagem-capacidade);
    // uma bancada com nome fora do padrão ainda assim aparece, no fim.
    const ordem = [...BANCADAS.filter((b) => usadas.includes(b)), ...usadas.filter((b) => !BANCADAS.includes(b))];
    for (const b of ordem) linhas.push({ key: b, nome: b, sem: false });
    if (cs.some((c) => !c.bancada)) linhas.push({ key: SEM, nome: "Sem bancada", sem: true });

    for (const l of linhas) {
      const daLinha = cs.filter((c) => (l.sem ? !c.bancada : c.bancada === l.key) && idx.has(c.dia));
      // junta dias SEGUIDOS da mesma obra numa barra só
      const barras = [];
      for (const op of [...new Set(daLinha.map((c) => c.opNumero))]) {
        const is = [...new Set(daLinha.filter((c) => c.opNumero === op).map((c) => idx.get(c.dia)))].sort((a, b) => a - b);
        let ini = null, ant = null;
        const fechar = () => {
          const itens = daLinha.filter((c) => c.opNumero === op && idx.get(c.dia) >= ini && idx.get(c.dia) <= ant);
          barras.push({
            op, ini, fim: ant, itens,
            un: itens.reduce((s, c) => s + (c.qte || 0), 0),
            kg: itens.reduce((s, c) => s + (c.pesoTotalKg || 0), 0),
            andando: itens.some((c) => c.andando),
          });
        };
        for (const i of is) {
          if (ini === null) { ini = i; ant = i; continue; }
          if (i === ant + 1) { ant = i; continue; }
          fechar(); ini = i; ant = i;
        }
        if (ini !== null) fechar();
      }
      // ⚠ duas obras podem cair no mesmo dia da mesma bancada: cada uma ganha sua faixa, senão uma
      // barra taparia a outra e a bancada pareceria menos carregada do que está.
      const faixas = [];
      for (const b of barras.sort((a, x) => a.ini - x.ini)) {
        let f = faixas.findIndex((ate) => ate < b.ini);
        if (f === -1) { faixas.push(b.fim); f = faixas.length - 1; } else faixas[f] = b.fim;
        b.faixa = f;
      }
      l.barras = barras;
      l.faixas = Math.max(1, faixas.length);
      l.ultimo = barras.length ? Math.max(...barras.map((b) => b.fim)) : -1;
    }

    // rodapé: peças no dia e o custo em dias-bancada, na mesma régua da programação
    const nBanc = Math.max(1, linhas.filter((l) => !l.sem).length);
    const rodape = dias.map((d) => {
      const doDia = cs.filter((c) => c.dia === d);
      return {
        dia: d,
        un: doDia.reduce((s, c) => s + (c.qte || 0), 0),
        custo: doDia.reduce((s, c) => s + custoDoConjunto(c, RITMO_META), 0),
      };
    });
    return { dias, linhas, cores, rodape, nBanc, hoje };
  }, [dados]);

  if (!dados) {
    return (
      <div className="bg-white rounded-xl border border-torg-blue-100 px-4 py-4 mb-4">
        <p className="text-[12.5px] text-torg-gray inline-flex items-center gap-2">
          <Loader2 size={13} className="animate-spin" /> montando a agenda das bancadas…
        </p>
      </div>
    );
  }
  if (!g) {
    return (
      <div className="bg-white rounded-xl border border-torg-blue-100 px-4 py-4 mb-4">
        <p className="text-[12.5px] text-torg-gray">Nenhum conjunto com dia de montagem marcado — a agenda das bancadas aparece aqui assim que houver programação.</p>
      </div>
    );
  }

  const col = (i, span = 1) => ({ gridColumn: `${i + 2} / span ${span}` });
  const ops = [...g.cores.keys()];

  return (
    <div className="bg-white rounded-xl border border-torg-blue-100 overflow-hidden mb-4">
      <div className="flex items-center gap-3 flex-wrap px-4 py-2.5 border-b border-gray-100 bg-gray-50/60">
        <span className="text-[13px] font-bold text-torg-dark">Bancadas da montagem</span>
        {ops.map((op) => (
          <span key={op} className="inline-flex items-center gap-1.5 text-[11px] text-torg-gray">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: g.cores.get(op) }} />
            {fmtOP(op)}
          </span>
        ))}
        <span className="ml-auto text-[11px] text-torg-gray-light">dias úteis · só leitura</span>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[820px]">
          {/* cabeçalho dos dias */}
          <div className="grid border-b border-gray-100 bg-gray-50/40"
            style={{ gridTemplateColumns: `132px repeat(${g.dias.length}, minmax(56px, 1fr))` }}>
            <div className="px-3 py-1.5 text-[11px] text-torg-gray-light">bancada</div>
            {g.dias.map((d) => (
              <div key={d} className={`py-1.5 text-center text-[11px] ${
                d === g.hoje ? "bg-torg-blue/10 text-torg-blue font-semibold" : "text-torg-gray-light"}`}>{rotDia(d)}</div>
            ))}
          </div>

          {g.linhas.map((l) => (
            <div key={l.key} className={`grid items-center border-b border-gray-100 ${l.sem ? "bg-amber-50/50" : ""}`}
              style={{ gridTemplateColumns: `132px repeat(${g.dias.length}, minmax(56px, 1fr))` }}>
              <div className="px-3 py-2 text-[12px] font-semibold text-torg-dark"
                style={{ gridRow: `1 / span ${l.faixas}` }}>
                {l.sem ? <span className="text-amber-800">Sem bancada<br /><span className="text-[10.5px] font-normal">programado, sem posto</span></span> : l.nome}
              </div>
              {l.barras.map((b, i) => (
                <button key={i} onClick={() => setAberto({ linha: l.nome, ...b })}
                  style={{ ...col(b.ini, b.fim - b.ini + 1), gridRow: b.faixa + 1, background: g.cores.get(b.op) }}
                  className="m-1 px-2 py-1 rounded-md text-white text-[11px] leading-tight text-left truncate hover:opacity-90">
                  {fmtOP(b.op)} · {fmtN(b.itens.length)} conj{b.andando ? " · na bancada" : ""}
                  <span className="block opacity-80">{fmtN(b.kg)} kg</span>
                </button>
              ))}
              {/* ⚠ o vazio depois da última barra é a resposta de "quando cabe" — é o que ele pediu
                  desde a semana passada e que hoje ninguém sabe sem abrir a programação inteira. */}
              {!l.sem && l.ultimo < g.dias.length - 1 && (
                <div style={{ ...col(l.ultimo + 1, g.dias.length - l.ultimo - 1), gridRow: 1 }}
                  className="m-1 px-2 py-1 rounded-md border border-dashed border-gray-200 text-[11px] text-torg-gray-light truncate">
                  livre a partir de {rotDia(g.dias[l.ultimo + 1])}
                </div>
              )}
            </div>
          ))}

          {/* rodapé: o dia estourou? */}
          <div className="grid bg-gray-50/60" style={{ gridTemplateColumns: `132px repeat(${g.dias.length}, minmax(56px, 1fr))` }}>
            <div className="px-3 py-1.5 text-[11px] text-torg-gray-light">peças no dia</div>
            {g.rodape.map((r) => {
              // ⚠ estourado = custa mais dias-bancada do que existem bancadas naquele dia. É a mesma
              // conta que a programação usa para prometer o prazo (RITMO_META).
              const estourou = r.custo > g.nBanc + 0.01;
              return (
                <div key={r.dia} title={`${fmt1(r.custo)} dias-bancada · ${g.nBanc} bancada(s)`}
                  className={`py-1.5 text-center text-[11px] tabular-nums ${
                    estourou ? "text-red-700 font-semibold bg-red-50" : r.un ? "text-torg-gray" : "text-torg-gray-light"}`}>
                  {r.un ? fmtN(r.un) : "—"}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {aberto && (
        <div className="px-4 py-3 border-t border-gray-100 bg-gray-50/40">
          <div className="flex items-center gap-2 mb-2">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: g.cores.get(aberto.op) }} />
            <span className="text-[12.5px] font-semibold text-torg-dark">
              {fmtOP(aberto.op)} na {aberto.linha} — {rotDia(g.dias[aberto.ini])}
              {aberto.fim > aberto.ini && <> a {rotDia(g.dias[aberto.fim])}</>}
            </span>
            <span className="text-[11.5px] text-torg-gray">{fmtN(aberto.itens.length)} conjuntos · {fmtN(aberto.un)} peças · {fmtN(aberto.kg)} kg</span>
            <button onClick={() => setAberto(null)} className="ml-auto p-1 text-torg-gray hover:text-torg-dark"><X size={14} /></button>
          </div>
          <div className="border border-gray-100 rounded-lg bg-white overflow-auto max-h-[220px]">
            <table className="w-full text-[12px]">
              <tbody className="divide-y divide-gray-50">
                {aberto.itens.map((c) => (
                  <tr key={c.id}>
                    <td className="px-3 py-1 text-torg-gray-light whitespace-nowrap w-[92px]">{rotDia(c.dia)}</td>
                    <td className="py-1 font-mono font-semibold text-torg-dark whitespace-nowrap w-[116px]">{c.marca}</td>
                    <td className="py-1 text-torg-gray truncate">{c.descricao || "—"}</td>
                    <td className="py-1 text-right tabular-nums text-torg-gray whitespace-nowrap w-[52px]">{fmtN(c.qte)}</td>
                    <td className="px-3 py-1 text-right tabular-nums text-torg-gray whitespace-nowrap w-[80px]">{fmtN(c.pesoTotalKg)} kg</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap px-4 py-2 border-t border-gray-100">
        <span className="text-[10.5px] text-torg-gray-light border border-dashed border-gray-200 rounded px-2 py-0.5">tracejado = bancada livre</span>
        <span className="text-[10.5px] text-red-700 bg-red-50 rounded px-2 py-0.5">vermelho = dia acima da capacidade das bancadas</span>
        <span className="text-[10.5px] text-amber-800 bg-amber-50 rounded px-2 py-0.5">faixa amarela = tem dia mas não tem bancada</span>
      </div>
    </div>
  );
}
