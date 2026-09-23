"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { Search, Scale, AlertTriangle, FileText, Loader2, ExternalLink, ChevronRight, Info, RefreshCw, CheckCircle2, XCircle, MinusCircle, Upload, ShieldAlert, HelpCircle, Calculator, Ban } from "lucide-react";

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
            {/* ⚠ O exemplo vem DEPOIS da descrição e com outro peso: ele ajuda a reconhecer o caso,
                não a fundamentar a nota. Invertido, viraria a definição que o verbete não é. */}
            {c.quando && <p className="mt-1.5 rounded-lg bg-gray-50 px-2.5 py-1.5 text-xs text-torg-gray"><strong className="text-torg-dark">Quando usar:</strong> {c.quando}</p>}
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


const fmtHora = (d) => (d ? new Date(d).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");

/** ⚠ Os três desfechos precisam ser distinguíveis: "sem mudança" é SUCESSO (e é o caminho normal),
 *  não um meio-termo entre importar e falhar. */
const DESFECHO = {
  IMPORTADA:   { Icone: CheckCircle2, cor: "text-emerald-600", rotulo: "importada" },
  SEM_MUDANCA: { Icone: MinusCircle,  cor: "text-torg-gray",   rotulo: "sem mudança" },
  FALHOU:      { Icone: XCircle,      cor: "text-red-600",     rotulo: "falhou" },
  RODANDO:     { Icone: Loader2,      cor: "text-torg-blue",   rotulo: "rodando" },
};

function AbaAdmin({ referencia: inicial, ehAdmin }) {
  const [dados, setDados] = useState({ referencia: inicial, historico: [], ultimaVerificacaoOk: null });
  const [sincronizando, setSincronizando] = useState(false);
  const [aviso, setAviso] = useState(null);

  const carregar = useCallback(async () => {
    try {
      const r = await fetch("/api/fiscal/inteligencia/status");
      const d = await r.json();
      if (d.success) setDados(d);
    } catch { /* a tela já mostra o que tem */ }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const verificar = async () => {
    setSincronizando(true); setAviso(null);
    try {
      const r = await fetch("/api/fiscal/inteligencia/sincronizar", { method: "POST" });
      const d = await r.json();
      setAviso(d.success
        ? { tipo: "ok", texto: `TIPI: ${d.tipi.mensagem} · NCM: ${d.ncm.mensagem}` }
        : { tipo: "erro", texto: d.error || "Não foi possível verificar." });
      await carregar();
    } catch {
      setAviso({ tipo: "erro", texto: "Falha de rede ao chamar a verificação." });
    } finally { setSincronizando(false); }
  };

  const t = dados.referencia?.tipi;
  const n = dados.referencia?.ncm;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-torg-gray">TIPI — alíquotas de IPI</p>
          {t ? (
            <>
              <p className="mt-1 text-2xl font-bold text-torg-dark">{t.totalNcm.toLocaleString("pt-BR")}<span className="ml-1 text-sm font-normal text-torg-gray">NCMs</span></p>
              <dl className="mt-2 space-y-0.5 text-xs text-torg-gray">
                <div>Importada em <strong className="text-torg-dark">{fmtHora(t.observadoEm)}</strong></div>
                <div>Aprovada em <strong className="text-torg-dark">{fmtHora(t.aprovadoEm)}</strong></div>
                {/* ⚠⚠ As três datas ficam SEPARADAS de propósito — ver o contrato 1. */}
                <div>Vigência normativa: <strong className="text-amber-700">{t.vigenciaDeclarada ? fmtHora(t.vigenciaInicio) : "não declarada pela fonte"}</strong></div>
                <div className="pt-1 font-mono text-[10px] text-gray-400">sha {t.fonte.sha256.slice(0, 24)}</div>
              </dl>
            </>
          ) : <p className="mt-2 text-sm text-amber-700">Nenhuma versão importada.</p>}
        </div>

        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-torg-gray">NCM — nomenclatura</p>
          {n ? (
            <>
              <p className="mt-1 text-2xl font-bold text-torg-dark">{n.totalCodigos.toLocaleString("pt-BR")}<span className="ml-1 text-sm font-normal text-torg-gray">códigos</span></p>
              <dl className="mt-2 space-y-0.5 text-xs text-torg-gray">
                <div>Importada em <strong className="text-torg-dark">{fmtHora(n.observadoEm)}</strong></div>
                {/* ⚠ Esta fonte DECLARA o ato — ao contrário da TIPI. */}
                <div>Ato: <strong className="text-torg-dark">{n.atoDeclarado || "—"}</strong></div>
                <div className="pt-1 font-mono text-[10px] text-gray-400">sha {n.fonte.sha256.slice(0, 24)}</div>
              </dl>
            </>
          ) : <p className="mt-2 text-sm text-amber-700">Nenhuma versão importada.</p>}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-100 bg-white px-4 py-3 shadow-sm">
        <button
          onClick={verificar}
          disabled={!ehAdmin || sincronizando}
          className="inline-flex items-center gap-2 rounded-lg bg-torg-blue px-4 py-2 text-sm font-medium text-white transition hover:bg-torg-blue/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {sincronizando ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
          Verificar atualizações
        </button>
        <span className="text-xs text-torg-gray">
          Última verificação bem-sucedida: <strong className="text-torg-dark">{fmtHora(dados.ultimaVerificacaoOk)}</strong> · automática todo dia às 4h30
        </span>
        {!ehAdmin && <span className="text-xs text-amber-700">Só o administrador pode disparar a verificação.</span>}
      </div>

      {/* ⚠ O teto é da FONTE, não do portal — e dizer isso evita que o clique bloqueado pareça bug. */}
      <p className="text-xs text-torg-gray">
        ⚠ O Siscomex limita a <strong>3 consultas por hora</strong>. O botão espera 15 minutos entre disparos para não queimar a cota do cron.
      </p>

      {aviso && (
        <div className={`rounded-xl border px-4 py-3 text-sm ${aviso.tipo === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700"}`}>
          {aviso.texto}
        </div>
      )}

      <div>
        <h3 className="text-sm font-semibold text-torg-dark">Histórico de verificações</h3>
        <div className="mt-2 overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-gray-50/60 text-left text-xs uppercase text-torg-gray">
              <tr><th className="px-4 py-2">Quando</th><th className="px-4 py-2">Fonte</th><th className="px-4 py-2">Origem</th><th className="px-4 py-2">Desfecho</th><th className="px-4 py-2">Detalhe</th></tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {dados.historico.map((h) => {
                const d = DESFECHO[h.status] ?? DESFECHO.RODANDO;
                const Icone = d.Icone;
                return (
                  <tr key={h.id}>
                    <td className="whitespace-nowrap px-4 py-2 text-torg-dark">{fmtHora(h.iniciadaEm)}</td>
                    <td className="px-4 py-2 font-medium text-torg-dark">{h.fonte}</td>
                    <td className="px-4 py-2 text-xs text-torg-gray">{h.disparo === "CRON" ? "automática" : "manual"}</td>
                    <td className={`whitespace-nowrap px-4 py-2 ${d.cor}`}><span className="inline-flex items-center gap-1.5"><Icone size={14} />{d.rotulo}</span></td>
                    <td className="px-4 py-2 text-xs text-torg-gray">{h.mensagem || "—"}</td>
                  </tr>
                );
              })}
              {!dados.historico.length && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-torg-gray">Nenhuma verificação registrada ainda.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}


const moeda = (v) => (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** ⚠ Gravidade vira cor — mas "não avaliável" NÃO é uma gravidade menor: é a ausência de veredito,
 *  e precisa de forma própria para não ser lida como "conferido, está ok". */
const CHIP = {
  ALTA:  "border-red-200 bg-red-50 text-red-700",
  MEDIA: "border-amber-200 bg-amber-50 text-amber-800",
  INFO:  "border-gray-200 bg-gray-50 text-torg-gray",
};

function AbaAuditoria() {
  const [arquivo, setArquivo] = useState(null);
  const [resultado, setResultado] = useState(null);
  const [erro, setErro] = useState(null);
  const [carregando, setCarregando] = useState(false);

  const enviar = async (f) => {
    if (!f) return;
    setCarregando(true); setErro(null); setResultado(null); setArquivo(f.name);
    try {
      const fd = new FormData(); fd.append("xml", f);
      const r = await fetch("/api/fiscal/inteligencia/auditoria", { method: "POST", body: fd });
      const d = await r.json();
      if (!d.success) setErro(d.error || "Não foi possível auditar o arquivo.");
      else setResultado(d);
    } catch {
      setErro("Falha de rede ao enviar o arquivo.");
    } finally { setCarregando(false); }
  };

  return (
    <div className="space-y-4">
      <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-white py-10 transition hover:border-torg-blue/40 hover:bg-gray-50/60">
        <input type="file" accept=".xml,text/xml,application/xml" className="hidden"
          onChange={(e) => enviar(e.target.files?.[0])} />
        {carregando ? <Loader2 size={26} className="animate-spin text-torg-blue" /> : <Upload size={26} className="text-gray-300" />}
        <span className="mt-2 text-sm font-medium text-torg-dark">{carregando ? "Auditando…" : "Enviar o XML da NF-e"}</span>
        <span className="mt-0.5 text-xs text-torg-gray">{arquivo && !carregando ? arquivo : "o arquivo é lido e descartado — nada é gravado"}</span>
      </label>

      {erro && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{erro}</div>}

      {resultado && (
        <>
          <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-torg-dark">NF-e {resultado.numero}</h2>
                <p className="text-xs text-torg-gray">
                  {resultado.emitente?.nome} → {resultado.destinatario} · {resultado.itens} itens · emitida em {fmtData(resultado.emitidaEm)}
                </p>
                <p className="mt-0.5 font-mono text-[10px] text-gray-400">{resultado.chave}</p>
              </div>
              <div className="text-right">
                <p className="text-xs uppercase tracking-wide text-torg-gray">Diferença estimada</p>
                <p className={`text-2xl font-bold ${resultado.resumo.diferencaEstimada > 0 ? "text-red-600" : "text-emerald-600"}`}>
                  {moeda(resultado.resumo.diferencaEstimada)}
                </p>
                {/* ⚠⚠ "ESTIMADA", NUNCA "DEVIDA". É a soma das contas óbvias dos achados, para
                    dimensionar o problema — não uma apuração, e não base de cálculo de nada. */}
                <p className="text-[10px] text-torg-gray">sobre {moeda(resultado.resumo.baseDaEstimativa)} · estimativa, não apuração</p>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2 border-t border-gray-100 pt-3 text-xs">
              <span className={`rounded-lg border px-2.5 py-1 font-medium ${CHIP.ALTA}`}>{resultado.resumo.alta} de alta gravidade</span>
              <span className={`rounded-lg border px-2.5 py-1 font-medium ${CHIP.MEDIA}`}>{resultado.resumo.media} média</span>
              <span className={`rounded-lg border px-2.5 py-1 font-medium ${CHIP.INFO}`}>{resultado.resumo.naoAvaliaveis} não avaliável(is)</span>
            </div>

            {/* ⚠⚠ A RESSALVA DA REFERÊNCIA ANDA JUNTO DO APONTAMENTO. Sem ela, um achado sobre nota
                antiga pareceria mais sólido do que é. */}
            {resultado.referencia?.ressalva && (
              <p className="mt-3 flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <Info size={13} className="mt-0.5 shrink-0" />{resultado.referencia.ressalva}
              </p>
            )}
          </div>

          <div className="space-y-2">
            {resultado.achados.map((a, i) => (
              <div key={i} className={`rounded-xl border bg-white p-4 shadow-sm ${a.gravidade === "ALTA" ? "border-red-100" : "border-gray-100"}`}>
                <div className="flex items-start gap-2.5">
                  {a.tipo === "NAO_AVALIAVEL" ? <HelpCircle size={16} className="mt-0.5 shrink-0 text-torg-gray" />
                    : <ShieldAlert size={16} className={`mt-0.5 shrink-0 ${a.gravidade === "ALTA" ? "text-red-600" : "text-amber-600"}`} />}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold text-torg-dark">{a.titulo}</h3>
                      {a.inconclusivo && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">inconclusivo</span>}
                    </div>
                    {(a.item || a.descricao) && (
                      <p className="mt-0.5 text-xs text-torg-gray">
                        {a.item ? `item ${a.item}` : `${a.itens?.length ?? 0} itens`}{a.descricao ? ` · ${a.descricao}` : ""}
                      </p>
                    )}
                    <p className="mt-1.5 text-xs text-torg-gray">{a.detalhe}</p>
                    {a.estimativa && (
                      <p className="mt-1.5 text-xs text-torg-dark">
                        {moeda(a.estimativa.base)} × {String(a.estimativa.aliquota).replace(".", ",")}% = <strong>{moeda(a.estimativa.ipi)}</strong>
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {!resultado.achados.length && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-6 text-center text-sm text-emerald-800">
                Nenhuma divergência encontrada entre o declarado e a TIPI de referência.
              </div>
            )}
          </div>

          {/* ⚠⚠ O LIMITE DITO EM VOZ ALTA. O sistema aponta; quem conclui é a contabilidade. */}
          <p className="rounded-xl border border-gray-100 bg-white px-4 py-3 text-xs text-torg-gray">
            ⚠ Estes são <strong>apontamentos para investigar</strong>, não uma apuração. O portal compara o que a nota declarou
            com a tabela oficial — tratamentos específicos, Ex TIPI e a classificação real de cada peça são decisão da contabilidade.
            Nenhuma nota complementar é gerada aqui.
          </p>
        </>
      )}
    </div>
  );
}


const UFS = ["AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT","PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO"];
const campo = "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-torg-dark outline-none transition focus:border-torg-blue focus:ring-2 focus:ring-torg-blue/20";
const rotulo = "text-xs font-medium text-torg-gray";

function AbaSimulador() {
  const [opcoes, setOpcoes] = useState({ ops: [], cfops: [], pares: [], familias: [], cstIpi: [] });
  const [f, setF] = useState({ ncm: "", cfop: "", opId: "", ufDestino: "", valor: "", cstPretendido: "" });
  const parEscolhido = opcoes.pares.find((c) => c.chave === f.cfop) ?? null;
  const [r, setR] = useState(null);
  const [erro, setErro] = useState(null);
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    fetch("/api/fiscal/inteligencia/simular").then((x) => x.json())
      .then((d) => { if (d.success) setOpcoes(d); }).catch(() => {});
  }, []);

  const simular = async () => {
    if (!f.ncm.trim()) { setErro("Informe o NCM."); return; }
    setCarregando(true); setErro(null);
    try {
      const resp = await fetch("/api/fiscal/inteligencia/simular", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ncm: f.ncm, cfop: f.cfop || null, opId: f.opId || null,
          ufDestino: f.ufDestino || null, valor: f.valor ? Number(String(f.valor).replace(",", ".")) : null,
          cstPretendido: f.cstPretendido || null,
        }),
      });
      const d = await resp.json();
      if (!d.success) { setErro(d.error); setR(null); } else setR(d);
    } catch { setErro("Falha de rede."); } finally { setCarregando(false); }
  };

  const op = opcoes.ops.find((o) => o.id === f.opId);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="md:col-span-1">
            <label className={rotulo}>NCM</label>
            <input className={`${campo} font-mono`} placeholder="8437.90.00" value={f.ncm}
              onChange={(e) => setF({ ...f, ncm: e.target.value })} />
          </div>
          {/* ⚠⚠ O SELETOR É DE CFOP, NÃO DE "NOME DE OPERAÇÃO". Matheus (22/09/2026): *"tire os nomes,
              deixe os CFOPs e a descrição do CFOP"*. Quem emite pensa no código que vai na nota — e
              um rótulo como "Venda à ordem (ex.: TMSA)" fazia a operação parecer daquele cliente.
              ⚠⚠ AGRUPADO POR FAMÍLIA E EM PARES DENTRO/FORA DO ESTADO ("5.101 / 6.101 — Venda…"),
              a pedido do Matheus (22/09/2026). A venda para Campinas e a venda para Caxias são o
              MESMO negócio: o que separa o 5.101 do 6.101 é o destino, e o destino sai das UFs. O
              portal resolve o dígito; o operador escolhe a operação. */}
          <div className="md:col-span-2">
            <label className={rotulo}>CFOP da operação</label>
            <select className={campo} value={f.cfop} onChange={(e) => setF({ ...f, cfop: e.target.value })}>
              <option value="">— escolha —</option>
              {opcoes.familias.map((fam) => (
                <optgroup key={fam} label={fam}>
                  {opcoes.pares.filter((c) => c.familia === fam).map((c) => (
                    <option key={c.chave} value={c.chave}>{c.rotulo} — {c.resumo}</option>
                  ))}
                </optgroup>
              ))}
            </select>
            {/* ⚠⚠ O EXEMPLO PRECISA APARECER ANTES DE SIMULAR, não só no resultado. É aqui que a
                pessoa ainda pode trocar de código — no resultado ela já escolheu. Um `<option>` não
                comporta duas linhas, então o exemplo mora logo abaixo do seletor. */}
            {parEscolhido?.quando && (
              <p className="mt-1.5 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-xs text-torg-gray">
                <strong className="text-torg-dark">Quando usar:</strong> {parEscolhido.quando}
                <span className="mt-1 block text-[11px] text-amber-700">⚠ Exemplo da operação da TORG — não substitui a descrição oficial do CONFAZ.</span>
              </p>
            )}
          </div>

          {/* ⚠⚠ A ENTRADA PELA OP FOI O PEDIDO ORIGINAL: "seleciono a OP e já puxa os dados do meu
              cliente para entender a cidade que vai ser a NF de venda". Campo que o cadastro já
              sabe é campo que ninguém digita errado. */}
          <div className="md:col-span-2">
            <label className={rotulo}>Obra (OP) — preenche o destino pelo cadastro do cliente</label>
            <select className={campo} value={f.opId} onChange={(e) => setF({ ...f, opId: e.target.value, ufDestino: "" })}>
              <option value="">— informar a UF na mão —</option>
              {opcoes.ops.map((o) => <option key={o.id} value={o.id}>OP {o.numero} · {o.cliente}{o.clienteUF ? ` (${o.clienteUF})` : ""}</option>)}
            </select>
            {op && <p className="mt-1 text-xs text-torg-gray">{op.cliente} · {op.clienteCidade || "cidade não cadastrada"}{op.clienteUF ? `/${op.clienteUF}` : ""}</p>}
          </div>
          <div>
            <label className={rotulo}>UF de destino</label>
            <select className={campo} value={f.ufDestino} disabled={Boolean(f.opId)}
              onChange={(e) => setF({ ...f, ufDestino: e.target.value })}>
              <option value="">{f.opId ? "vem da OP" : "— escolha —"}</option>
              {UFS.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>

          <div>
            <label className={rotulo}>Valor dos produtos (R$)</label>
            <input className={campo} inputMode="decimal" placeholder="0,00" value={f.valor}
              onChange={(e) => setF({ ...f, valor: e.target.value })} />
          </div>
          <div className="md:col-span-2">
            <label className={rotulo}>CST de IPI que pretende usar (opcional — o portal confere)</label>
            <select className={campo} value={f.cstPretendido} onChange={(e) => setF({ ...f, cstPretendido: e.target.value })}>
              <option value="">— deixar o portal sugerir —</option>
              {opcoes.cstIpi.map((c) => <option key={c.cst} value={c.cst}>{c.cst} — {c.rotulo}</option>)}
            </select>
          </div>
        </div>

        <button onClick={simular} disabled={carregando}
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-torg-blue px-4 py-2 text-sm font-medium text-white transition hover:bg-torg-blue/90 disabled:opacity-50">
          {carregando ? <Loader2 size={15} className="animate-spin" /> : <Calculator size={15} />} Simular
        </button>
      </div>

      {erro && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{erro}</div>}

      {r && (
        <>
          {/* ⚠⚠ OS ALERTAS VÊM PRIMEIRO. É o alerta que a NF-e 973 não teve — enterrá-lo no fim da
              página seria repetir o defeito que a tela existe para impedir. */}
          {r.alertas.length > 0 && (
            <div className="space-y-2">
              {r.alertas.map((a, i) => (
                <div key={i} className={`flex items-start gap-2 rounded-xl border px-4 py-3 text-sm ${a.nivel === "alto" ? "border-red-200 bg-red-50 text-red-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
                  <ShieldAlert size={16} className="mt-0.5 shrink-0" />
                  <span>{a.texto}</span>
                </div>
              ))}
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-torg-gray">IPI — da TIPI oficial</p>
              {r.ipi.determinado ? (
                <>
                  <div className="mt-2 flex items-center gap-3">
                    <span className="text-2xl font-bold text-torg-dark">{r.ipi.rotulo}</span>
                    <span className="rounded-lg border border-torg-blue/20 bg-torg-blue/10 px-2 py-1 text-xs font-medium text-torg-blue">
                      CST {r.ipi.cstSugerido} — {r.ipi.cstRotulo}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-torg-gray">{r.ipi.nota}</p>
                  {r.ipi.estimativa && (
                    <p className="mt-2 text-sm text-torg-dark">
                      {moeda(r.ipi.estimativa.base)} × {String(r.ipi.estimativa.aliquota).replace(".", ",")}% = <strong>{moeda(r.ipi.estimativa.valor)}</strong>
                      <span className="ml-1 text-xs text-torg-gray">(estimativa)</span>
                    </p>
                  )}
                  {/* ⚠⚠ O ENQUADRAMENTO NÃO É SUGERIDO — sugerir seria inventar fundamento legal. */}
                  <p className="mt-2 border-t border-gray-100 pt-2 text-xs text-amber-700">⚠ {r.ipi.cEnqNota}</p>
                </>
              ) : <p className="mt-2 text-sm text-amber-700">{r.ipi.motivo}</p>}
              {r.descricaoNcm && <p className="mt-2 text-xs text-torg-gray">{r.descricaoNcm}</p>}
            </div>

            <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-torg-gray">
                CFOP escolhido {r.cfop.ambito ? `· operação ${r.cfop.ambito === "INTERNA" ? "interna" : "interestadual"}` : ""}
              </p>
              {r.cfop.escolhido ? (
                <>
                  <div className="mt-2">
                    <span className="font-mono text-2xl font-bold text-torg-dark">{r.cfop.escolhido.codigoFormatado}</span>
                    <span className="ml-2 rounded-md bg-gray-100 px-2 py-0.5 text-[10px] font-medium uppercase text-torg-gray">{r.cfop.escolhido.familia}</span>
                  </div>
                  <p className="mt-1 text-sm text-torg-gray">{r.cfop.escolhido.resumo}</p>
                  {/* ⚠ A dedução fica à vista: quem emite confere o raciocínio, não só recebe o código. */}
                  {r.cfop.resolvidoDoPar && (
                    <p className="mt-1 text-xs text-torg-gray">
                      Escolhido entre <span className="font-mono">{r.cfop.resolvidoDoPar}</span> porque {r.entrada.ufOrigem} → {r.entrada.ufDestino} é uma operação {r.cfop.ambito === "INTERNA" ? "interna" : "interestadual"}.
                    </p>
                  )}
                  {r.cfop.escolhido.quando && (
                    <p className="mt-1.5 rounded-lg bg-gray-50 px-2.5 py-1.5 text-xs text-torg-gray"><strong className="text-torg-dark">Quando usar:</strong> {r.cfop.escolhido.quando}</p>
                  )}
                  {r.cfop.escolhido.nota && <p className="mt-1 text-xs text-amber-700">{r.cfop.escolhido.nota}</p>}
                  {/* ⚠ Os exemplos reais são CONTEXTO, não determinação — por isso vêm depois do código. */}
                  {r.cfop.operacoes.length > 0 && (
                    <div className="mt-2.5 border-t border-gray-100 pt-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-torg-gray">Aparece nestas operações da TORG</p>
                      {r.cfop.operacoes.map((o) => (
                        <p key={o.id} className="mt-0.5 text-xs text-torg-gray">
                          {o.titulo}{o.cliente ? ` (ex.: ${o.cliente})` : ""} · {o.fluxo.join(" → ")}
                        </p>
                      ))}
                    </div>
                  )}
                </>
              ) : r.cfop.parPendente ? (
                <p className="mt-2 text-sm text-torg-gray">
                  <span className="font-mono">{r.cfop.parPendente}</span> — informe a UF de destino para o portal saber qual dos dois vale.
                </p>
              ) : <p className="mt-2 text-sm text-torg-gray">Escolha o CFOP da operação.</p>}
              <p className="mt-2 border-t border-gray-100 pt-2 text-xs text-amber-700">⚠ {r.cfop.ressalva}</p>
            </div>
          </div>

          {r.perguntas.length > 0 && (
            <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-torg-gray">Ainda precisa ser respondido</p>
              <ul className="mt-2 space-y-1 text-sm text-torg-dark">
                {r.perguntas.map((p) => <li key={p} className="flex gap-2"><HelpCircle size={14} className="mt-0.5 shrink-0 text-torg-gray" />{p}</li>)}
              </ul>
            </div>
          )}

          {/* ⚠⚠ O QUE O PORTAL NÃO DETERMINA, DITO COM O MOTIVO. Um número plausível aqui seria pior
              que um campo vazio: o vazio manda perguntar, o plausível vai para a nota. */}
          <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-torg-gray">O portal NÃO determina</p>
            <ul className="mt-2 space-y-2">
              {r.naoDeterminados.map((n) => (
                <li key={n.tributo} className="flex gap-2 text-sm">
                  <Ban size={14} className="mt-0.5 shrink-0 text-torg-gray" />
                  <span><strong className="text-torg-dark">{n.tributo}</strong> <span className="text-torg-gray">— {n.motivo}</span></span>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

const ABAS = [{ id: "ncm", rotulo: "Consulta NCM" }, { id: "cfop", rotulo: "Consulta CFOP" }, { id: "simulador", rotulo: "Simulador" }, { id: "auditoria", rotulo: "Auditoria de NF-e" }, { id: "admin", rotulo: "Atualizações Tributárias" }];

export default function InteligenciaFiscalClient({ referencia, cfops, operacoes, cstIpi, familias, ehAdmin }) {
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

      {aba === "ncm" && <AbaNcm referencia={referencia} />}
      {aba === "cfop" && <AbaCfop cfops={cfops} operacoes={operacoes} cstIpi={cstIpi} familias={familias} />}
      {aba === "simulador" && <AbaSimulador />}
      {aba === "auditoria" && <AbaAuditoria />}
      {aba === "admin" && <AbaAdmin referencia={referencia} ehAdmin={ehAdmin} />}

      <p className="flex items-center gap-1.5 pt-2 text-xs text-torg-gray">
        <ExternalLink size={12} />
        Fontes: TIPI (Receita Federal) e Nomenclatura Comum do Mercosul (Siscomex). O portal não calcula imposto devido — ele mostra o que a fonte oficial diz.
      </p>
    </div>
  );
}
