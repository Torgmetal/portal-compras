"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, AlertTriangle, CheckCircle2, Clock, Ban, RefreshCw, GitCompare } from "lucide-react";

// ─── A VALIDAÇÃO DAS REGRAS ──────────────────────────────────────────────────
//
// ⚠⚠ AS REGRAS NÃO SE EDITAM AQUI, E A TELA DIZ ISSO. O briefing pede um "motor de regras em
// tabela"; o que existe é a VALIDAÇÃO em tabela. Regra em banco sairia do alcance do PR, do lint,
// do teste e da revisão — uma linha errada mudaria em silêncio o que o portal manda emitir, que é
// o oposto de "não invente regras". Esconder essa diferença faria a contabilidade achar que pode
// consertar sozinha o que só nós podemos mudar.

const fmt = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—");

const ESTILO = {
  VALIDADA: { rotulo: "Conferida", Icone: CheckCircle2, classe: "border-emerald-200 bg-emerald-50 text-emerald-800" },
  PENDENTE: { rotulo: "Não conferida", Icone: Clock, classe: "border-gray-200 bg-white text-torg-gray" },
  ALTERADA: { rotulo: "Mudou depois da conferência", Icone: GitCompare, classe: "border-amber-200 bg-amber-50 text-amber-800" },
  CONTESTADA: { rotulo: "Contestada — bloqueia a orientação", Icone: Ban, classe: "border-red-200 bg-red-50 text-red-800" },
  INDISPONIVEL: { rotulo: "Não verificada", Icone: AlertTriangle, classe: "border-amber-200 bg-amber-50 text-amber-800" },
};
const TIPOS = { cfop: "CFOP", etapa: "Etapa de cadeia", cenario: "Cenário de CST" };

function Regra({ r, ocupada, onDecidir }) {
  const [ressalva, setRessalva] = useState("");
  const [fonte, setFonte] = useState("");
  const s = ESTILO[r.situacao.situacao] ?? ESTILO.PENDENTE;
  return (
    <div className={`rounded-xl border p-4 ${s.classe}`}>
      <div className="flex items-start gap-2">
        <s.Icone className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="min-w-0 flex-1">
          {/* ⚠⚠ COR E ÍCONE NÃO SÃO RÓTULO. O estado só aparecia na borda e no ícone: quem não
              distingue as cores — ou quem só lê o texto — não tinha como saber se aquele verbete
              estava conferido ou bloqueado. O nome do estado vai escrito, ao lado do título. */}
          <p className="text-sm font-semibold">
            {r.titulo}
            <span className="ml-2 rounded border border-current/25 px-1.5 py-0.5 text-[10px] font-medium opacity-90">{s.rotulo}</span>
          </p>
          <p className="text-[11px] opacity-80">{TIPOS[r.tipo] ?? r.tipo} · {r.contexto}</p>
          <p className="mt-1 text-xs">{r.situacao.motivo}</p>
          {r.situacao.em && <p className="text-[11px] opacity-80">Em {fmt(r.situacao.em)}</p>}
          {/* ⚠ O que ela vai conferir fica à vista — sem isso, "conferir" vira clicar num botão. */}
          <details className="mt-2">
            <summary className="cursor-pointer text-[11px] font-medium underline">Ver o texto que está sendo conferido</summary>
            <pre className="mt-1 max-h-60 overflow-auto whitespace-pre-wrap rounded border border-current/15 bg-white/60 p-2 text-[11px] text-torg-dark">
              {JSON.stringify(r.conteudo, null, 2)}
            </pre>
          </details>
          <div className="mt-2 grid gap-2 md:grid-cols-2">
            <input value={fonte} onChange={(e) => setFonte(e.target.value)} placeholder="Conferida contra… (ex.: Convênio s/nº de 15/12/1970, Anexo)"
              className="rounded-lg border border-current/20 bg-white/70 px-2 py-1.5 text-xs text-torg-dark" />
            <input value={ressalva} onChange={(e) => setRessalva(e.target.value)} placeholder="Ressalva / o que está errado"
              className="rounded-lg border border-current/20 bg-white/70 px-2 py-1.5 text-xs text-torg-dark" />
          </div>
          <div className="mt-2 flex gap-2">
            <button disabled={ocupada} onClick={() => onDecidir(r, "VALIDADA", { fonte, ressalva })}
              className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800 disabled:opacity-40">
              Conferi e está correta
            </button>
            {/* ⚠⚠ Contestar BLOQUEIA a ficha de emissão — o botão diz isso antes do clique. */}
            <button disabled={ocupada || !ressalva.trim()} onClick={() => onDecidir(r, "CONTESTADA", { fonte, ressalva })}
              title={ressalva.trim() ? "" : "Escreva o que está errado"}
              className="rounded-lg border border-red-300 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-800 disabled:opacity-40">
              Está errada — bloquear a orientação
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AbaRegras({ showToast }) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState(null);
  const [ocupada, setOcupada] = useState(null);
  const [filtro, setFiltro] = useState("PENDENTE");

  const carregar = useCallback(async () => {
    setErro(null);
    try {
      const r = await fetch("/api/fiscal/inteligencia/regras");
      const j = await r.json();
      if (!j.success) throw new Error(j.error ?? "Não foi possível ler as regras.");
      setDados(j);
    } catch (e) { setErro(e.message); setDados(null); }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const decidir = async (r, estado, { fonte, ressalva }) => {
    if (estado === "CONTESTADA" && !confirm("Contestar bloqueia a ficha de emissão de quem usar este verbete. Confirma?")) return;
    setOcupada(r.id);
    try {
      const resp = await fetch("/api/fiscal/inteligencia/regras", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ regraId: r.id, estado, impressao: r.impressao, fonte: fonte || null, ressalva: ressalva || null }),
      });
      const j = await resp.json();
      if (!j.success) throw new Error(j.error);
      showToast?.(estado === "VALIDADA" ? "Regra marcada como conferida." : "Regra contestada — a orientação está bloqueada.", "success");
      await carregar();
    } catch (e) { showToast?.(e.message, "error"); } finally { setOcupada(null); }
  };

  const contagem = useMemo(() => {
    const c = { PENDENTE: 0, VALIDADA: 0, ALTERADA: 0, CONTESTADA: 0, INDISPONIVEL: 0 };
    for (const r of dados?.regras ?? []) c[r.situacao.situacao] = (c[r.situacao.situacao] ?? 0) + 1;
    return c;
  }, [dados]);

  const lista = (dados?.regras ?? []).filter((r) => filtro === "TODAS" || r.situacao.situacao === filtro);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-torg-blue/20 bg-torg-blue/5 p-4">
        <h2 className="text-sm font-semibold text-torg-dark">O que a contabilidade já conferiu</h2>
        <p className="mt-1 text-xs text-torg-gray">
          Cada verbete de CFOP, cada etapa de cadeia e cada cenário de CST é uma <strong>regra com versão própria</strong>.
          Conferir grava seu nome e a data <strong>naquela versão</strong>: se o texto mudar depois, a conferência deixa de valer sozinha.
          Contestar <strong>bloqueia a ficha de emissão</strong> de quem usar aquele verbete.
        </p>
        {/* ⚠⚠ O LIMITE DA ENTREGA FICA ESCRITO — esconder faria a contabilidade achar que pode
            consertar sozinha o que só passa por código. */}
        <p className="mt-2 text-[11px] text-torg-gray">
          ⚠ As regras <strong>não se editam aqui</strong>: elas vivem no código, revisadas e testadas. Esta tela registra a
          <strong> conferência humana</strong> delas. Criar ou corrigir uma regra continua passando por nós.
        </p>
      </div>

      {dados && !dados.disponivel && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          ⚠ Não foi possível ler o registro de validação. Enquanto isso, a ficha de emissão fica <strong>suspensa</strong> —
          o portal não orienta sem saber se algum verbete foi contestado.
        </p>
      )}

      {erro && (
        <div className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="flex items-center gap-2 text-sm text-red-700"><AlertTriangle className="h-4 w-4" /> {erro}</p>
          <button onClick={carregar} className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700">
            <RefreshCw className="h-3.5 w-3.5" /> Tentar novamente
          </button>
        </div>
      )}

      {!erro && !dados && <p className="flex items-center gap-2 p-8 text-sm text-torg-gray"><Loader2 className="h-4 w-4 animate-spin" /> Lendo as regras…</p>}

      {dados && (
        <>
          <div className="flex flex-wrap gap-2">
            {["PENDENTE", "CONTESTADA", "ALTERADA", "VALIDADA", "TODAS"].map((k) => (
              <button key={k} onClick={() => setFiltro(k)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${filtro === k ? "border-torg-blue bg-torg-blue text-white" : "border-gray-200 bg-white text-torg-gray"}`}>
                {k === "TODAS" ? `Todas (${dados.regras.length})` : `${ESTILO[k].rotulo.split(" —")[0]} (${contagem[k] ?? 0})`}
              </button>
            ))}
          </div>
          {lista.length === 0
            ? <p className="rounded-xl border border-gray-100 bg-white p-8 text-center text-sm text-torg-gray">Nenhuma regra neste estado.</p>
            : <div className="space-y-2">{lista.map((r) => <Regra key={r.id} r={r} ocupada={ocupada === r.id} onDecidir={decidir} />)}</div>}
        </>
      )}
    </div>
  );
}
