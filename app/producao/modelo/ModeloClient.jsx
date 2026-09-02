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
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-[11px] text-torg-gray uppercase tracking-wide mb-1">Obra</label>
          <select value={opId} onChange={(e) => setOpId(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 min-w-[280px]">
            {ops.map((o) => <option key={o.id} value={o.id}>OP-{o.numero} — {o.obra || o.cliente || "sem obra"}</option>)}
          </select>
        </div>
        {lista?.modelos?.length > 1 && (
          <div>
            <label className="block text-[11px] text-torg-gray uppercase tracking-wide mb-1">Modelo</label>
            <select value={modelo?.rel || ""} onChange={(e) => { setModelo(lista.modelos.find((m) => m.rel === e.target.value)); setMarca(null); setPeca(null); }}
              className="text-sm border border-gray-200 rounded-lg px-3 py-2 max-w-[420px]">
              {lista.modelos.map((m) => (
                <option key={m.rel} value={m.rel} disabled={m.grande}>
                  {m.nome} {m.kb ? `· ${(m.kb / 1024).toFixed(1)} MB` : ""}{m.grande ? " (grande demais)" : ""}
                </option>
              ))}
            </select>
          </div>
        )}
        {lista?.resumo && (
          <div className="flex items-center gap-3 text-[12px] text-torg-gray ml-auto">
            <span className="inline-flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: COR.pronta }} /> {lista.resumo.prontas} prontas</span>
            <span className="inline-flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: COR.andando }} /> {lista.resumo.andando} em produção</span>
            <span className="inline-flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: COR.parado }} /> {lista.resumo.marcas - lista.resumo.prontas - lista.resumo.andando} a fazer</span>
          </div>
        )}
      </div>

      {erro && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2 flex items-start gap-2">
          <AlertCircle size={14} className="mt-0.5 shrink-0" /> <span>{erro}</span>
        </div>
      )}

      {lista && !lista.modelos?.length && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg px-3 py-2.5">
          Esta obra não tem modelo IFC na pasta da Engenharia. O arquivo é procurado em
          <b> 2. Engenharia › 2.5 Projetos</b> — normalmente em <b>2.5.3 Modelo 3D</b>.
        </div>
      )}

      {urlModelo && (
        <div className="grid grid-cols-1 lg:grid-cols-[1.7fr_1fr] gap-0 bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="border-b lg:border-b-0 lg:border-r border-gray-100">
            {/* ⚠ `key` no url: trocar de modelo remonta a cena. Sem isso o visualizador manteria a
                obra anterior na tela — e o painel passaria a responder por outra OP. */}
            <VisualizadorIfc key={urlModelo} url={urlModelo} onSelecionar={abrir}
              selecionada={marca} cores={cores} altura={560} />
          </div>

          <div className="p-4">
            {!marca && (
              <div className="text-[13px] text-torg-gray">
                <p className="font-semibold text-torg-dark mb-1">Clique numa peça do modelo.</p>
                <p>Arraste para girar, role para o zoom. A cor mostra em que ponto da fábrica cada conjunto está.</p>
              </div>
            )}
            {carregandoPeca && <p className="text-[13px] text-torg-gray inline-flex items-center gap-2"><Loader2 size={13} className="animate-spin" /> buscando {marca}…</p>}
            {peca?.erro && (
              <div className="text-[13px]">
                <p className="font-mono font-bold text-torg-dark">{marca}</p>
                <p className="text-amber-700 mt-1">{peca.erro}</p>
                <p className="text-[12px] text-torg-gray mt-1">
                  Objeto do modelo sem marca correspondente na LPC — normalmente é eixo ou objeto auxiliar.
                </p>
              </div>
            )}
            {peca && !peca.erro && <Painel d={peca} />}
          </div>
        </div>
      )}
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
