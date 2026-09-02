"use client";
// ─── OBRA EM 3D: o modelo do Tekla como porta de entrada ──────────────────────
//
// Vitor (03/09/2026): "clicar na peça, dar o tipo do material, número do conjunto, quais croquis
// fazem parte daquele conjunto, rastreabilidade dos materiais, status de onde a peça está na
// fábrica (…) e na mesma página podermos selecionar a peça, caso seja o planejamento, poder
// definir prioridade em cima disso".
//
// ⚠⚠ O 3D NÃO GUARDA DADO NENHUM. Ele responde uma coisa só: QUAL peça. Todo o resto sai do
// portal, pela marca — é por isso que o clique precisava ser nosso, e não do visualizador de
// terceiro. Ver components/VisualizadorIfc.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, AlertCircle, Star } from "lucide-react";
import VisualizadorIfc from "@/components/VisualizadorIfc";

const COR = { pronta: "#0E7A5F", andando: "#B4761E", parado: "#9FB0BF" };
const fmtN = (n) => Number(n || 0).toLocaleString("pt-BR");
const fmtKg = (n) => `${Number(n || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} kg`;
const fmtD = (d) => (d ? String(d).slice(0, 10).split("-").reverse().join("/") : "—");

const ETAPAS = ["Corte", "Preparação", "Montagem", "Solda", "Jato", "Pintura", "Acabamento"];

export default function ModeloClient({ ops }) {
  const [opId, setOpId] = useState(ops?.[0]?.id || "");
  const [lista, setLista] = useState(null);
  const [erro, setErro] = useState("");
  const [modelo, setModelo] = useState(null);
  const [marca, setMarca] = useState(null);
  const [peca, setPeca] = useState(null);
  const [carregandoPeca, setCarregandoPeca] = useState(false);
  // ⚠⚠ DUAS LEITURAS DO MESMO MODELO, e as duas são necessárias. A cor DO MODELO é a que a
  // Engenharia deu no Tekla (viga azul, treliça amarela) — é como o pessoal reconhece a obra. A cor
  // do ANDAMENTO responde outra pergunta: o que já passou pela fábrica. Misturar as duas seria
  // perder as duas.
  const [modo, setModo] = useState("modelo");

  // ── modelos e andamento da obra ──
  useEffect(() => {
    if (!opId) return;
    let vivo = true;
    setLista(null); setErro(""); setModelo(null); setMarca(null); setPeca(null);
    fetch(`/api/producao/modelo-3d?opId=${opId}`, { cache: "no-store" })
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (!vivo) return;
        if (!ok) return setErro(j.error || "Erro ao buscar os modelos.");
        setLista(j);
        setModelo(j.modelos?.find((m) => !m.grande) || null);
      })
      .catch(() => vivo && setErro("Erro ao buscar os modelos."));
    return () => { vivo = false; };
  }, [opId]);

  // ⚠ cores por MARCA, montadas uma vez: o visualizador pinta a cena inteira de uma vez só.
  const cores = useMemo(() => {
    const e = lista?.estados || {};
    return Object.fromEntries(Object.entries(e).map(([m, st]) => [m, COR[st] || COR.parado]));
  }, [lista]);

  // ── o dossiê da peça clicada ──
  const abrir = useCallback((m) => {
    setMarca(m);
    if (!m) return setPeca(null);
    setCarregandoPeca(true); setPeca(null);
    fetch(`/api/producao/peca?opId=${opId}&marca=${encodeURIComponent(m)}`, { cache: "no-store" })
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => setPeca(ok ? j : { erro: j.error || "Não achei essa marca na lista." }))
      .catch(() => setPeca({ erro: "Erro ao buscar a peça." }))
      .finally(() => setCarregandoPeca(false));
  }, [opId]);

  const urlModelo = modelo ? `/api/producao/modelo-3d?opId=${opId}&rel=${encodeURIComponent(modelo.rel)}` : null;

  return (
    // ⚠⚠ A OBRA OCUPA A TELA. Vitor (03/09/2026): "o layout externo está bem ruim". Estava — era
    // um formulário com um quadro de 3D dentro: título grande, parágrafo de explicação, seletor
    // solto e o modelo espremido em 560px. Visualizador de modelo é o contrário disso: a cena é a
    // página, e todo o resto encolhe para caber numa faixa. É o que o Trimble faz, e é o que faz
    // sentido — ninguém abre esta tela para ler texto.
    // ⚠ `left-64` casa com o `ml-64` do layout de Produção e com a `w-64 fixed` da barra lateral
    // (conferido nos dois arquivos). Fixo em vez de fluido porque a tela precisa da altura inteira
    // da janela: dentro do `p-8` do layout, o modelo nunca passaria de meia tela.
    <div data-tela-cheia className="fixed inset-y-0 right-0 left-64 flex flex-col bg-torg-dark">
      {/* faixa de controle: tudo numa linha, escura, para a obra ficar sendo a única coisa clara */}
      <div className="flex items-center gap-2 flex-wrap px-3 py-2 shrink-0 text-white/90">
        <span className="text-[13px] font-bold tracking-tight mr-1">Obra em 3D</span>
        <select value={opId} onChange={(e) => setOpId(e.target.value)}
          className="text-[12px] bg-white/10 border border-white/15 rounded-md px-2 py-1 max-w-[300px] outline-none focus:border-white/40">
          {ops.map((o) => <option key={o.id} value={o.id} className="text-torg-dark">OP-{o.numero} — {o.obra || o.cliente || "sem obra"}</option>)}
        </select>
        {lista?.modelos?.length > 1 && (
          <select value={modelo?.rel || ""} onChange={(e) => { setModelo(lista.modelos.find((m) => m.rel === e.target.value)); setMarca(null); setPeca(null); }}
            className="text-[12px] bg-white/10 border border-white/15 rounded-md px-2 py-1 max-w-[340px] outline-none focus:border-white/40">
            {lista.modelos.map((m) => (
              <option key={m.rel} value={m.rel} disabled={m.grande} className="text-torg-dark">
                {m.nome}{m.kb ? ` · ${(m.kb / 1024).toFixed(1)} MB` : ""}{m.grande ? " (grande demais)" : ""}
              </option>
            ))}
          </select>
        )}

        <div className="flex gap-0.5 bg-white/10 border border-white/15 rounded-md p-0.5">
          {[["modelo", "Cores do modelo"], ["andamento", "Andamento"]].map(([k, t]) => (
            <button key={k} onClick={() => setModo(k)}
              className={`text-[11.5px] font-semibold px-2.5 py-1 rounded ${modo === k ? "bg-white text-torg-dark" : "text-white/70 hover:text-white"}`}>
              {t}
            </button>
          ))}
        </div>

        {lista?.resumo && modo === "andamento" && (
          <div className="flex items-center gap-2.5 text-[11.5px] text-white/70">
            <span className="inline-flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: COR.pronta }} /> {lista.resumo.prontas}</span>
            <span className="inline-flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: COR.andando }} /> {lista.resumo.andando}</span>
            <span className="inline-flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: COR.parado }} /> {lista.resumo.marcas - lista.resumo.prontas - lista.resumo.andando}</span>
          </div>
        )}

        {marca && (
          <button onClick={() => { setMarca(null); setPeca(null); }}
            className="ml-auto text-[11.5px] text-white/60 hover:text-white">fechar a peça</button>
        )}
      </div>

      {/* corpo: cena + painel, ocupando tudo o que sobra */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row bg-white">
        <div className="flex-1 min-h-0 relative">
          {erro && (
            <div className="absolute inset-0 grid place-items-center p-6 z-10 bg-white">
              <p className="text-[13px] text-red-600 text-center max-w-sm inline-flex items-start gap-2">
                <AlertCircle size={15} className="mt-0.5 shrink-0" /> {erro}
              </p>
            </div>
          )}
          {lista && !lista.modelos?.length && !erro && (
            <div className="absolute inset-0 grid place-items-center p-6 z-10 bg-white">
              <p className="text-[13px] text-torg-gray text-center max-w-md">
                Esta obra não tem modelo IFC na pasta da Engenharia.<br />
                <span className="text-[12px]">O arquivo é procurado em <b>2. Engenharia › 2.5 Projetos</b> — normalmente em <b>2.5.3 Modelo 3D</b>.</span>
              </p>
            </div>
          )}
          {!lista && !erro && (
            <div className="absolute inset-0 grid place-items-center bg-white">
              <p className="text-[13px] text-torg-gray inline-flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> procurando o modelo…</p>
            </div>
          )}
          {urlModelo && (
            <VisualizadorIfc key={urlModelo} url={urlModelo} onSelecionar={abrir}
              selecionada={marca} cores={cores} modo={modo} altura="fill" />
          )}
        </div>

        {/* ⚠ o painel só existe quando há peça: coluna vazia ocupando um terço da tela rouba da obra
            justamente quando não há nada a dizer. */}
        {marca && (
          <aside className="w-full lg:w-[360px] shrink-0 border-t lg:border-t-0 lg:border-l border-gray-200 overflow-y-auto bg-white">
            <div className="p-4">
              {carregandoPeca && <p className="text-[13px] text-torg-gray inline-flex items-center gap-2"><Loader2 size={13} className="animate-spin" /> buscando {marca}…</p>}
              {peca?.erro && (
                <div className="text-[13px]">
                  <p className="font-mono font-bold text-torg-dark">{marca}</p>
                  <p className="text-amber-700 mt-1">{peca.erro}</p>
                  <p className="text-[12px] text-torg-gray mt-1">Objeto do modelo sem marca na LPC — normalmente é eixo ou objeto auxiliar.</p>
                </div>
              )}
              {peca && !peca.erro && <Painel d={peca} />}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

/** O dossiê — cada bloco vem de uma parte do portal que já existia, agora na mesma tela. */
export function Painel({ d }) {
  const p = d.pecas?.[0] || {};
  const feitos = new Set((d.fabrica?.trilha || []).map((t) => t.setor));
  return (
    <div className="space-y-3">
      <div className="flex items-baseline gap-2 flex-wrap">
        <h3 className="font-mono text-[17px] font-bold text-torg-dark">{d.marca}</h3>
        <span className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full border border-torg-blue-200 bg-torg-blue-50 text-torg-blue">
          {p.tipoPeca === "CONJUNTO" ? "conjunto" : p.tipoPeca === "CROQUI" ? "croqui" : "marca"}
        </span>
        {d.fabrica?.setorAtual && (
          <span className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full border border-amber-200 bg-amber-50 text-amber-800">
            {d.fabrica.setorAtual}
          </span>
        )}
        {p.prioridade ? (
          <span className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full border border-torg-orange-200 bg-orange-50 text-torg-orange-700 inline-flex items-center gap-1">
            <Star size={10} className="fill-current" /> prioridade {p.prioridade}
          </span>
        ) : null}
      </div>

      <Bloco titulo="A peça">
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[12.5px]">
          <dt className="text-torg-gray">Descrição</dt><dd className="font-medium">{p.descricao || "—"}</dd>
          <dt className="text-torg-gray">Perfil</dt><dd className="font-mono font-medium">{p.perfil || "—"}</dd>
          <dt className="text-torg-gray">Material</dt><dd className="font-medium">{p.material || "—"}</dd>
          <dt className="text-torg-gray">Comprimento</dt><dd className="font-medium">{p.comprimentoMm ? `${fmtN(p.comprimentoMm)} mm` : "—"}</dd>
          <dt className="text-torg-gray">Quantidade</dt><dd className="font-medium">{fmtN(p.qte)} un · {fmtKg(p.pesoTotalKg)}</dd>
          <dt className="text-torg-gray">Frente</dt><dd className="font-mono font-medium">{p.opNumero || "—"}</dd>
        </dl>
      </Bloco>

      {d.croquis?.length > 0 && (
        <Bloco titulo={`Croquis do conjunto (${d.croquis.length})`}>
          <div className="max-h-44 overflow-y-auto space-y-0.5">
            {d.croquis.map((c) => (
              <div key={c.marca} className="flex gap-2 text-[12px]">
                <span className="font-mono font-semibold min-w-[86px]">{c.marca}</span>
                <span className="text-torg-gray flex-1 truncate">{c.perfil || c.descricao || ""}</span>
                <span className="text-torg-gray tabular-nums">{fmtN(c.qtdNoConjunto)}×</span>
              </div>
            ))}
          </div>
        </Bloco>
      )}
      {d.conjuntos?.length > 0 && (
        <Bloco titulo="Faz parte de">
          <p className="font-mono text-[12.5px]">{d.conjuntos.map((c) => c.marca).join(", ")}</p>
        </Bloco>
      )}

      {/* ⚠⚠ UMA LINHA POR PERFIL, E O MOTIVO QUANDO NÃO HÁ R. Vitor (03/09/2026), na foto de um
          conjunto com a mesma cantoneira repetida onze vezes: "aqui não é real que está sem R, é?".
          Era real — só que por prazo de fornecedor, não por furo de rastreio. "Sem R" sozinho, em
          vermelho, acusa quem não tem culpa; agora a linha diz POR QUE não há R. */}
      <Bloco titulo="Rastreabilidade">
        {d.rastreio?.length ? d.rastreio.map((r, i) => {
          const mat = d.materialPorPerfil?.[r.perfil] || null;
          return (
            <div key={i} className="text-[12px] mb-1.5 last:mb-0">
              <span className="font-mono font-semibold">{r.perfil}</span>
              {r.posicoes > 1 && <span className="text-torg-gray-light ml-1">{r.posicoes}×</span>}
              {r.usadas?.length ? r.usadas.map((u, k) => (
                <span key={k} className="ml-2">
                  <span className="font-mono font-semibold text-emerald-700">R {u.r}</span>
                  {u.corrida && <span className="text-torg-gray"> · corrida {u.corrida}</span>}
                  {u.nf && <span className="text-torg-gray"> · NF {u.nf}</span>}
                  {u.indicado && <span className="text-torg-gray-light"> (indicado)</span>}
                </span>
              )) : (
                <span className="ml-2">
                  {mat?.estado === "ESTOQUE" && !mat.rInformado
                    ? <span className="text-amber-700">{mat.rotulo === "aguardando entrega" ? "aço a caminho — sem entrada no CMR ainda" : `de estoque · ${mat.rotulo || "sem o R informado"}`}</span>
                    : mat && mat.estado !== "NA_OP"
                    ? <span className="text-amber-700">{mat.rotulo || "material não comprado"}</span>
                    : <span className="text-red-600 italic">sem R</span>}
                </span>
              )}
              {mat?.descricaoCmr && <span className="block text-[11px] text-torg-gray-light truncate" title={mat.descricaoCmr}>{mat.descricaoCmr}</span>}
            </div>
          );
        }) : <p className="text-[12.5px] text-torg-gray italic">Sem rastreio ainda.</p>}
      </Bloco>

      <Bloco titulo="Onde está na fábrica">
        <div className="flex flex-wrap gap-1.5">
          {ETAPAS.map((s) => (
            <span key={s} className={`text-[11px] px-2 py-0.5 rounded border ${
              feitos.has(s) ? "border-amber-300 bg-amber-50 text-amber-800 font-semibold" : "border-gray-200 text-torg-gray"}`}>{s}</span>
          ))}
        </div>
        {d.fabrica?.trilha?.length ? (
          <p className="text-[11.5px] text-torg-gray mt-1.5">
            {d.fabrica.trilha.map((t) => `${t.setor} ${fmtN(t.un)} un · ${fmtKg(t.kg)} · ${fmtD(t.ultimo)}`).join(" · ")}
          </p>
        ) : <p className="text-[12px] text-torg-gray italic mt-1">Nenhum apontamento ainda.</p>}
      </Bloco>

      {d.liberacoes?.length > 0 && (
        <Bloco titulo="Programação">
          {d.liberacoes.map((l, i) => (
            <p key={i} className="text-[12px]">
              <b>{fmtD(l.dia) || "sem dia"}</b> · {(l.setores || []).join(" / ")}
              {l.liberadoPor && <span className="text-torg-gray"> — liberado por {l.liberadoPor}</span>}
            </p>
          ))}
        </Bloco>
      )}

      <Bloco titulo="Qualidade">
        {d.relatorios?.length ? d.relatorios.map((r) => (
          <div key={r.codigo} className="flex gap-2 text-[12px]">
            <span className="font-mono font-semibold">{r.codigo}</span>
            <span className="text-torg-gray flex-1">{r.tipoRotulo}</span>
            {r.resultado && <span className={r.resultado === "APROVADO" ? "text-emerald-700 font-semibold" : "text-red-600 font-semibold"}>{r.resultado}</span>}
          </div>
        )) : (
          <>
            <p className="text-[12.5px] text-torg-gray italic">Nenhum relatório emitido para esta marca.</p>
            <p className="text-[11.5px] text-torg-gray-light mt-1">Dimensional, visual de solda e ultrassom aparecem aqui quando o primeiro for emitido.</p>
          </>
        )}
      </Bloco>
    </div>
  );
}

function Bloco({ titulo, children }) {
  return (
    <div className="pt-2.5 border-t border-gray-100 first:border-t-0 first:pt-0">
      <p className="text-[10px] uppercase tracking-wider text-torg-gray font-semibold mb-1">{titulo}</p>
      {children}
    </div>
  );
}
