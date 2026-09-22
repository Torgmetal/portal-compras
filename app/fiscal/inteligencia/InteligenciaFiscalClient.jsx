"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { Search, Scale, AlertTriangle, FileText, Loader2, ExternalLink, ChevronRight, Info } from "lucide-react";

// ─── INTELIGÊNCIA FISCAL ─────────────────────────────────────────────────────
//
// ⚠⚠ A TELA NUNCA AFIRMA MAIS DO QUE A FONTE DIZ. São três contratos, e eles aparecem como texto
// na cara do usuário, não como comentário no código:
//   1. "ativa" ≠ "vigente" — a TIPI não declara vigência, e a tarja diz isso;
//   2. Ex desconhecido ≠ geral — a geral e cada Ex saem LADO A LADO, a tela não elege;
//   3. campo ausente ≠ conformidade — "NT", "0%" e "não declarada" são três rótulos distintos.

const fmtData = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—");

/** ⚠⚠ O TIPO DA ALÍQUOTA VIRA COR E TEXTO. "NT" em cinza-âmbar, tributada em azul, ausente em
 *  cinza: as três precisam ser distinguíveis de relance, senão viram todas "0%" na leitura. */
function Aliquota({ ipi, grande = false }) {
  const estilo = ipi.tipo === "PERCENTUAL"
    ? "bg-torg-blue/10 text-torg-blue border-torg-blue/20"
    : ipi.tipo === "NT"
      ? "bg-amber-50 text-amber-700 border-amber-200"
      : "bg-gray-100 text-torg-gray border-gray-200";
  return (
    <span className={`inline-flex items-center rounded-lg border font-semibold ${estilo} ${grande ? "px-3 py-1.5 text-lg" : "px-2 py-0.5 text-xs"}`}>
      {ipi.rotulo}
    </span>
  );
}

/** A tarja de procedência — sempre visível, nunca escondida atrás de um clique. */
function Procedencia({ referencia }) {
  const t = referencia?.tipi;
  if (!t) {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <AlertTriangle size={16} className="mt-0.5 shrink-0" />
        <span>Nenhuma versão da TIPI foi importada ainda. A consulta fica indisponível até a primeira sincronização.</span>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-gray-100 bg-white px-4 py-3 shadow-sm">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-torg-gray">
        <span><strong className="text-torg-dark">{t.totalNcm.toLocaleString("pt-BR")}</strong> NCMs na TIPI</span>
        <span>Fonte: <strong className="text-torg-dark">Receita Federal</strong></span>
        <span>Importada em <strong className="text-torg-dark">{fmtData(t.observadoEm)}</strong></span>
        {referencia.ncm && <span>NCM oficial: <strong className="text-torg-dark">{referencia.ncm.atoDeclarado}</strong></span>}
        <span className="font-mono text-[10px] text-gray-400">sha {t.fonte.sha256.slice(0, 12)}</span>
      </div>
      {/* ⚠⚠ ISTO NÃO É DETALHE: sem esta linha, "importada em 22/09" é lido como "vigente em 22/09". */}
      {!t.vigenciaDeclarada && (
        <p className="mt-2 flex items-start gap-1.5 border-t border-gray-100 pt-2 text-xs text-amber-700">
          <Info size={13} className="mt-0.5 shrink-0" />
          <span>
            O arquivo da Receita <strong>não declara vigência</strong>. Esta é a referência que o portal está usando,
            e não uma prova de que ela estava em vigor numa data passada — consulta retroativa exige a vigência registrada por quem tem o fundamento legal.
          </span>
        </p>
      )}
    </div>
  );
}

function DetalheNcm({ dados, aoFechar }) {
  const o = dados.oficialNcm;
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-mono text-2xl font-bold text-torg-dark">{dados.ncmFormatado}</h2>
          <p className="mt-1 max-w-3xl text-sm text-torg-gray">{dados.descricaoCompleta}</p>
        </div>
        <button onClick={aoFechar} className="shrink-0 text-sm text-torg-gray hover:text-torg-dark">Fechar</button>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-gray-100 bg-gray-50/60 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-torg-gray">IPI — alíquota geral</p>
          <div className="mt-2">{dados.geral ? <Aliquota ipi={dados.geral.ipi} grande /> : <span className="text-sm text-torg-gray">sem linha geral</span>}</div>
        </div>
        <div className="rounded-lg border border-gray-100 bg-gray-50/60 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-torg-gray">Hierarquia</p>
          <ul className="mt-2 space-y-0.5 text-sm text-torg-dark">
            <li><span className="text-torg-gray">Capítulo </span>{dados.capitulo ? `${dados.capitulo.codigoFormatado} — ${dados.capitulo.descricao}` : "—"}</li>
            <li><span className="text-torg-gray">Posição </span>{dados.posicao ? `${dados.posicao.codigoFormatado} — ${dados.posicao.descricao}` : "—"}</li>
            <li><span className="text-torg-gray">Subposição </span>{dados.subposicao ? `${dados.subposicao.codigoFormatado} — ${dados.subposicao.descricao}` : "—"}</li>
          </ul>
        </div>
      </div>

      {/* ⚠⚠ Ex DESCONHECIDO NÃO SIGNIFICA GERAL. As exceções aparecem SEPARADAS, nunca fundidas
          com a geral — o 1211.20.00 é "NT" na geral e 0% no Ex 01, e as duas estão certas. */}
      {dados.excecoes.length > 0 && (
        <div className="mt-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-torg-gray">Ex TIPI — tratamentos específicos</p>
          <div className="mt-2 overflow-x-auto rounded-lg border border-gray-100">
            <table className="w-full text-sm">
              <thead className="bg-gray-50/60 text-left text-xs uppercase text-torg-gray">
                <tr><th className="px-3 py-2">Ex</th><th className="px-3 py-2">Descrição</th><th className="px-3 py-2">IPI</th></tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {dados.excecoes.map((e) => (
                  <tr key={e.ex}><td className="px-3 py-2 font-mono">{e.ex}</td><td className="px-3 py-2">{e.descricao}</td><td className="px-3 py-2"><Aliquota ipi={e.ipi} /></td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-amber-700">
            ⚠ Um Ex vale só para o produto que se enquadra nele. Com o NCM sozinho não se escolhe entre a geral e a exceção.
          </p>
        </div>
      )}

      {o && (
        <div className="mt-5 rounded-lg border border-gray-100 bg-gray-50/60 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-torg-gray">Nomenclatura oficial (Siscomex)</p>
          <p className="mt-1 text-sm text-torg-dark">{o.descricao}</p>
          <p className="mt-1 text-xs text-torg-gray">
            Vigência da <strong>nomenclatura</strong>: {fmtData(o.vigenciaInicio)}{o.vigenciaFim ? ` até ${fmtData(o.vigenciaFim)}` : " (sem fim declarado)"}
            {o.ato ? ` · ${o.ato}` : ""}
          </p>
          {/* ⚠ A vigência acima é do CÓDIGO, não da alíquota. Deixar isso ambíguo faria o leitor
              concluir que o IPI está comprovado para aquele período — e não está. */}
          <p className="mt-1 text-xs text-amber-700">⚠ Esta vigência é do código na nomenclatura. A TIPI não declara vigência da alíquota.</p>
        </div>
      )}
    </div>
  );
}

function AbaNcm({ referencia }) {
  const [termo, setTermo] = useState("");
  const [resultados, setResultados] = useState([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState(null);
  const [detalhe, setDetalhe] = useState(null);
  const pedido = useRef(0);

  useEffect(() => {
    const t = termo.trim();
    if (t.length < 2) { setResultados([]); setErro(null); return; }
    const meu = ++pedido.current;
    setCarregando(true);
    const id = setTimeout(async () => {
      try {
        const r = await fetch(`/api/fiscal/inteligencia/ncm?q=${encodeURIComponent(t)}`);
        const d = await r.json();
        // ⚠ Resposta de busca antiga NÃO sobrescreve a nova: digitar rápido chegava fora de ordem.
        if (meu !== pedido.current) return;
        if (!d.success) { setErro(d.error || "Falha na consulta."); setResultados([]); }
        else { setErro(null); setResultados(d.resultados || []); }
      } catch {
        if (meu === pedido.current) setErro("Não foi possível consultar. Verifique a conexão.");
      } finally {
        if (meu === pedido.current) setCarregando(false);
      }
    }, 250);
    return () => clearTimeout(id);
  }, [termo]);

  const abrir = useCallback(async (ncm) => {
    setCarregando(true);
    try {
      const r = await fetch(`/api/fiscal/inteligencia/ncm/${ncm}`);
      const d = await r.json();
      setDetalhe(d.success ? d : null);
      if (!d.success) setErro(d.erro || "NCM não encontrado.");
    } finally { setCarregando(false); }
  }, []);

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-torg-gray" />
        <input
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          placeholder="Digite o NCM ou a descrição do produto..."
          className="w-full rounded-xl border border-gray-200 bg-white py-3.5 pl-12 pr-12 text-torg-dark shadow-sm outline-none transition focus:border-torg-blue focus:ring-2 focus:ring-torg-blue/20"
        />
        {carregando && <Loader2 size={18} className="absolute right-4 top-1/2 -translate-y-1/2 animate-spin text-torg-blue" />}
      </div>
      <p className="text-xs text-torg-gray">
        Aceita <span className="font-mono">84379000</span>, <span className="font-mono">8437.90.00</span> ou texto como
        &ldquo;partes de máquinas moagem&rdquo;. A busca lê o caminho inteiro da TIPI, não só a última linha.
      </p>

      {erro && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{erro}</div>}

      {detalhe && <DetalheNcm dados={detalhe} aoFechar={() => setDetalhe(null)} />}

      {!detalhe && resultados.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-gray-50/60 text-left text-xs uppercase text-torg-gray">
              <tr><th className="px-4 py-2.5">NCM</th><th className="px-4 py-2.5">Ex</th><th className="px-4 py-2.5">Descrição</th><th className="px-4 py-2.5">IPI</th><th className="w-8" /></tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {resultados.map((r) => (
                <tr key={`${r.ncm}-${r.ex ?? ""}`} onClick={() => abrir(r.ncm)} className="cursor-pointer transition hover:bg-gray-50/60">
                  <td className="whitespace-nowrap px-4 py-2.5 font-mono font-medium text-torg-dark">{r.ncmFormatado}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-torg-gray">{r.ex || "—"}</td>
                  <td className="px-4 py-2.5 text-torg-dark">{r.descricaoCompleta}</td>
                  <td className="whitespace-nowrap px-4 py-2.5"><Aliquota ipi={r.ipi} /></td>
                  <td className="px-2 text-torg-gray"><ChevronRight size={15} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!detalhe && !carregando && termo.trim().length >= 2 && !resultados.length && !erro && (
        <div className="rounded-xl border border-gray-100 bg-white py-12 text-center shadow-sm">
          <FileText size={30} className="mx-auto text-gray-300" />
          <p className="mt-2 text-sm text-torg-dark">Nada encontrado para &ldquo;{termo}&rdquo;.</p>
          <p className="mt-1 text-xs text-torg-gray">
            A TIPI descreve mercadorias, não nomes de peça — &ldquo;guarda-corpo&rdquo; não existe lá. Tente pela matéria ou pela função.
          </p>
        </div>
      )}

      {!termo.trim() && (
        <div className="rounded-xl border border-gray-100 bg-white py-12 text-center shadow-sm">
          <Scale size={30} className="mx-auto text-gray-300" />
          <p className="mt-2 text-sm text-torg-gray">Digite um NCM ou uma descrição para começar.</p>
        </div>
      )}
      <Procedencia referencia={referencia} />
    </div>
  );
}

function AbaCfop({ cfops, operacoes, cstIpi, familias }) {
  const [termo, setTermo] = useState("");
  const [familia, setFamilia] = useState(null);
  const semAcento = (x) => String(x).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const t = semAcento(termo.trim());
  const d = termo.replace(/\D/g, "");
  const lista = cfops.filter((c) => {
    if (familia && c.familia !== familia) return false;
    if (!termo.trim()) return true;
    if (d.length >= 2 && c.codigo.startsWith(d)) return true;
    return semAcento(c.resumo).includes(t);
  });

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-torg-gray" />
        <input
          value={termo} onChange={(e) => setTermo(e.target.value)}
          placeholder="Digite o CFOP ou a descrição da operação..."
          className="w-full rounded-xl border border-gray-200 bg-white py-3.5 pl-12 pr-4 text-torg-dark shadow-sm outline-none transition focus:border-torg-blue focus:ring-2 focus:ring-torg-blue/20"
        />
      </div>

      <div className="flex flex-wrap gap-1.5">
        <button onClick={() => setFamilia(null)} className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${!familia ? "bg-torg-blue text-white" : "bg-white text-torg-gray border border-gray-200 hover:bg-gray-50"}`}>Todos</button>
        {familias.map((f) => (
          <button key={f} onClick={() => setFamilia(f === familia ? null : f)} className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${familia === f ? "bg-torg-blue text-white" : "bg-white text-torg-gray border border-gray-200 hover:bg-gray-50"}`}>{f}</button>
        ))}
      </div>

      {/* ⚠⚠ A TARJA É OBRIGATÓRIA: estes verbetes são resumo operacional, não a tabela do CONFAZ.
          Sem dizer isso, alguém fundamenta uma nota num texto que a contabilidade nunca conferiu. */}
      <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
        <AlertTriangle size={15} className="mt-0.5 shrink-0" />
        <span>
          Descrições abaixo são <strong>resumo operacional da TORG</strong>, ainda pendentes de conferência contra a tabela oficial
          (Convênio S/Nº de 15/12/1970). <strong>CFOP sozinho não determina imposto</strong> — cada verbete lista o que ainda precisa ser respondido.
        </span>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {lista.map((c) => (
          <div key={c.codigo} className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="font-mono text-lg font-bold text-torg-dark">{c.codigoFormatado}</span>
              <span className="rounded-md bg-gray-100 px-2 py-0.5 text-[10px] font-medium uppercase text-torg-gray">{c.familia}</span>
              <span className="rounded-md bg-gray-100 px-2 py-0.5 text-[10px] font-medium uppercase text-torg-gray">{c.ambito === "INTERNA" ? "SP" : "Fora de SP"}</span>
            </div>
            <p className="mt-1.5 text-sm text-torg-dark">{c.resumo}</p>
            {c.nota && <p className="mt-1.5 text-xs text-amber-700">{c.nota}</p>}
            {c.exige?.length > 0 && (
              <div className="mt-2.5 border-t border-gray-100 pt-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-torg-gray">Precisa responder</p>
                <ul className="mt-1 space-y-0.5 text-xs text-torg-gray">{c.exige.map((e) => <li key={e}>· {e}</li>)}</ul>
              </div>
            )}
          </div>
        ))}
      </div>

      {!termo.trim() && !familia && (
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-torg-dark">Operações reais da TORG</h3>
          <p className="mt-0.5 text-xs text-torg-gray">
            ⚠ Casos históricos, <strong>não precedentes</strong>: revalide antes de transformar em regra.
          </p>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {operacoes.map((o) => (
              <div key={o.id} className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-semibold text-torg-dark">{o.titulo}</h4>
                  {o.cliente && <span className="rounded-md bg-torg-blue/10 px-2 py-0.5 text-[10px] font-medium text-torg-blue">{o.cliente}</span>}
                </div>
                <p className="mt-1 text-xs text-torg-gray">{o.resumo}</p>
                <p className="mt-2 text-xs text-torg-dark">{o.fluxo.join("  →  ")}</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {o.cfops.map((c) => <span key={c} className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[11px] text-torg-dark">{c[0]}.{c.slice(1)}</span>)}
                </div>
                {o.alerta && <p className="mt-2 text-xs text-amber-700">{o.alerta}</p>}
              </div>
            ))}
          </div>

          <h3 className="mt-6 text-sm font-semibold text-torg-dark">CST de IPI (saída)</h3>
          <div className="mt-2 overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-gray-50/60 text-left text-xs uppercase text-torg-gray">
                <tr><th className="px-4 py-2">CST</th><th className="px-4 py-2">Situação</th><th className="px-4 py-2">Exige fundamento</th></tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {cstIpi.map((c) => (
                  <tr key={c.cst}>
                    <td className="px-4 py-2 font-mono font-medium text-torg-dark">{c.cst}</td>
                    <td className="px-4 py-2 text-torg-dark">{c.rotulo}{c.nota && <span className="block text-xs text-amber-700">{c.nota}</span>}</td>
                    <td className="px-4 py-2">{c.exigeFundamento ? <span className="text-amber-700">sim — dispositivo legal</span> : <span className="text-torg-gray">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

const ABAS = [{ id: "ncm", rotulo: "Consulta NCM" }, { id: "cfop", rotulo: "Consulta CFOP" }];

export default function InteligenciaFiscalClient({ referencia, cfops, operacoes, cstIpi, familias }) {
  const [aba, setAba] = useState("ncm");
  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-torg-dark"><Scale size={24} className="text-torg-blue" /> Inteligência Fiscal</h1>
        <p className="mt-1 text-sm text-torg-gray">Consulte NCM, CFOP e tributos aplicáveis às operações da TORG METAL.</p>
      </header>

      <div className="flex gap-1 border-b border-gray-200">
        {ABAS.map((a) => (
          <button key={a.id} onClick={() => setAba(a.id)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition ${aba === a.id ? "border-torg-blue text-torg-blue" : "border-transparent text-torg-gray hover:text-torg-dark"}`}>
            {a.rotulo}
          </button>
        ))}
      </div>

      {aba === "ncm"
        ? <AbaNcm referencia={referencia} />
        : <AbaCfop cfops={cfops} operacoes={operacoes} cstIpi={cstIpi} familias={familias} />}

      <p className="flex items-center gap-1.5 pt-2 text-xs text-torg-gray">
        <ExternalLink size={12} />
        Fontes: TIPI (Receita Federal) e Nomenclatura Comum do Mercosul (Siscomex). O portal não calcula imposto devido — ele mostra o que a fonte oficial diz.
      </p>
    </div>
  );
}
