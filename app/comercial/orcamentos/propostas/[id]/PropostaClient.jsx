"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import { Loader2, AlertCircle, FileText, Plus, Trash2, Check, Download, Files, Ruler, ListChecks, Coins, Send } from "lucide-react";
import { useStore } from "@/lib/store";
import { ELEMENTOS, ELEMENTO_POR_ID, ESCOPO_ITENS, MODALIDADES, CATEGORIAS, blocosAplicaveis, fraseDoEscopo, blocosDoEscopo, numeroDaProposta } from "@/lib/proposta-estrutura";

// ─── ELABORAÇÃO DA PROPOSTA, PASSO A PASSO ────────────────────────────────────
// Vitor (30/08/2026): "precisamos fazer aquele passo a passo que estamos fazendo na LQC para
// podermos garantir o levantamento das áreas, para posteriormente começarmos a preencher a
// proposta".
//
// ⚠⚠ A ORDEM É A GARANTIA. O levantamento vem ANTES do escopo e o escopo antes do preço, porque é
// assim que cada passo trava o seguinte: sem área lançada não há descrição de obra; sem escopo
// definido a proposta promete cálculo e transporte que ninguém orçou. Deixar tudo numa tela só é o
// que produz a proposta com brecha.
const PASSOS = [
  { k: "DOCS", r: "Documentos", Icon: Files, ajuda: "o que o cliente mandou" },
  { k: "LEVANTAMENTO", r: "Levantamento", Icon: Ruler, ajuda: "as áreas e o que tem em cada uma" },
  { k: "ESCOPO", r: "Escopo", Icon: ListChecks, ajuda: "o que entra e o que sai" },
  { k: "PRECO", r: "Preço", Icon: Coins, ajuda: "vem do estudo LQC" },
  { k: "EMITIR", r: "Emitir", Icon: Send, ajuda: "PT, PC ou PTC" },
];

const n2 = (v) => (v || v === 0 ? Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—");

export default function PropostaClient({ id }) {
  const { showToast } = useStore();
  const [p, setP] = useState(null);
  const [erro, setErro] = useState("");
  const [passo, setPasso] = useState("DOCS");
  const [salvando, setSalvando] = useState(false);
  const [emitindo, setEmitindo] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const r = await fetch(`/api/comercial/proposta-estrutura/${id}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro ao carregar");
      setP(j.proposta);
    } catch (e) { setErro(e.message); }
  }, [id]);
  useEffect(() => { carregar(); }, [carregar]);

  // ⚠ salva o campo inteiro, não um patch parcial: a tela é a dona do estado enquanto está aberta,
  // e mesclar no servidor abriria espaço para perder edição concorrente sem ninguém perceber.
  const salvar = async (campos) => {
    setSalvando(true);
    try {
      const r = await fetch(`/api/comercial/proposta-estrutura/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(campos),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro ao salvar");
      setP((x) => ({ ...x, ...j.proposta }));
    } catch (e) { showToast(e.message, "erro"); } finally { setSalvando(false); }
  };

  const emitir = async (tipo, formato) => {
    setEmitindo(true);
    try {
      const r = await fetch(`/api/comercial/proposta-estrutura/${id}/emitir`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ formato, revisar: true }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Falha ao emitir");
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = r.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] || `proposta.${formato}`;
      a.click(); URL.revokeObjectURL(url);
      carregar();
    } catch (e) { showToast(e.message, "erro"); } finally { setEmitindo(false); }
  };

  const escopoItens = p?.escopo || [];
  const liberados = useMemo(() => blocosDoEscopo(escopoItens), [escopoItens]);
  const disponiveis = useMemo(
    () => (p ? blocosAplicaveis({ tipo: p.tipo, comMontagem: p.comMontagem }) : []),
    [p?.tipo, p?.comMontagem]);

  if (erro) return <div className="p-8 text-center"><AlertCircle size={32} className="mx-auto text-red-400 mb-3" /><p className="text-red-600">{erro}</p></div>;
  if (!p) return <div className="p-12 text-center"><Loader2 size={24} className="animate-spin text-torg-blue mx-auto" /></div>;

  const totalElementos = (p.areas || []).reduce((a, x) => a + (x.elementos?.length || 0), 0);

  return (
    <div className="max-w-6xl space-y-5">
      <div>
        <p className="text-[11px] font-semibold text-torg-gray uppercase tracking-wider">Elaboração da proposta</p>
        <h2 className="text-2xl font-extrabold text-torg-dark tracking-tight">
          {numeroDaProposta({ tipo: p.tipo, orcamento: p.orcamento.numero, revisao: p.revisao })}
        </h2>
        <p className="text-sm text-torg-gray mt-0.5">
          {p.orcamento.cliente}{p.orcamento.obra ? ` · ${p.orcamento.obra}` : ""}
          {p.estudo ? ` · estudo LQC-${String(p.estudo.numero).padStart(3, "0")}-${String(p.estudo.ano).slice(-2)}` : " · sem estudo vinculado"}
        </p>
      </div>

      {/* ⚠ o passo mostra o que JÁ TEM, não só o nome: é o que faz alguém perceber que pulou o
          levantamento antes de chegar na emissão e descobrir a proposta vazia. */}
      <div className="flex items-stretch gap-1 overflow-x-auto">
        {PASSOS.map((s, i) => {
          const ativo = passo === s.k;
          const resumo = s.k === "DOCS" ? `${(p.documentos || []).length + (p.projetos || []).length} arquivos`
            : s.k === "LEVANTAMENTO" ? `${(p.areas || []).length} áreas · ${totalElementos} itens`
            : s.k === "ESCOPO" ? `${escopoItens.length} serviços`
            : s.k === "PRECO" ? (p.estudo?.resultado?.preco ? "vinculado" : "sem estudo")
            : `R${String(p.revisao).padStart(2, "0")}`;
          return (
            <button key={s.k} onClick={() => setPasso(s.k)}
              className={`flex-1 min-w-[128px] text-left px-3 py-2.5 rounded-xl border transition-colors ${
                ativo ? "bg-torg-blue text-white border-torg-blue" : "bg-white border-gray-200 hover:border-torg-blue/40"}`}>
              <div className="flex items-center gap-1.5">
                <span className={`text-[10px] font-bold ${ativo ? "text-white/70" : "text-torg-gray-light"}`}>{i + 1}</span>
                <s.Icon size={13} className={ativo ? "text-white" : "text-torg-gray"} />
                <span className={`text-[13px] font-semibold ${ativo ? "text-white" : "text-torg-dark"}`}>{s.r}</span>
              </div>
              <p className={`text-[10.5px] mt-0.5 truncate ${ativo ? "text-white/75" : "text-torg-gray"}`}>{resumo}</p>
            </button>
          );
        })}
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        {passo === "DOCS" && <PassoDocumentos p={p} salvar={salvar} />}
        {passo === "LEVANTAMENTO" && <PassoLevantamento p={p} salvar={salvar} />}
        {passo === "ESCOPO" && <PassoEscopo p={p} salvar={salvar} disponiveis={disponiveis} liberados={liberados} />}
        {passo === "PRECO" && <PassoPreco p={p} />}
        {passo === "EMITIR" && <PassoEmitir p={p} salvar={salvar} emitir={emitir} emitindo={emitindo} />}
      </div>

      <p className="text-[11px] text-torg-gray text-right h-4">
        {salvando ? <span className="inline-flex items-center gap-1"><Loader2 size={11} className="animate-spin" /> salvando…</span> : "salvo"}
      </p>
    </div>
  );
}

// ─── 1. DOCUMENTOS ────────────────────────────────────────────────────────────
function PassoDocumentos({ p, salvar }) {
  const [docs, setDocs] = useState((p.documentos || []).join("\n"));
  const [proj, setProj] = useState((p.projetos || []).join("\n"));
  const linhas = (t) => t.split("\n").map((x) => x.trim()).filter(Boolean);
  return (
    <div className="space-y-5">
      <Cabecalho titulo="O que o cliente mandou"
        ajuda="Sai da pasta do orçamento no SharePoint. É a lista que a proposta cita — e é ela que define, numa discussão futura, o que foi orçado." />
      <div className="grid md:grid-cols-2 gap-4">
        <Campo rotulo="Documentos referentes"
          ajuda="Especificações, PIT e check lists — com código e revisão. Uma linha por documento.">
          <textarea rows={9} value={docs} onChange={(e) => setDocs(e.target.value)}
            onBlur={() => salvar({ documentos: linhas(docs) })}
            className="w-full text-[12.5px] font-mono border border-gray-200 rounded-lg p-2.5 focus:border-torg-blue outline-none" />
        </Campo>
        <Campo rotulo="Projetos referentes" ajuda="Os desenhos que serviram de base, com revisão.">
          <textarea rows={9} value={proj} onChange={(e) => setProj(e.target.value)}
            onBlur={() => salvar({ projetos: linhas(proj) })}
            className="w-full text-[12.5px] font-mono border border-gray-200 rounded-lg p-2.5 focus:border-torg-blue outline-none" />
        </Campo>
      </div>
    </div>
  );
}

// ─── 2. LEVANTAMENTO ──────────────────────────────────────────────────────────
function PassoLevantamento({ p, salvar }) {
  const [areas, setAreas] = useState(p.areas || []);
  const grava = (novas) => { setAreas(novas); salvar({ areas: novas }); };
  const mexer = (iA, fn) => { const c = structuredClone(areas); fn(c[iA]); grava(c); };

  return (
    <div className="space-y-4">
      <Cabecalho titulo="As áreas e o que tem em cada uma"
        ajuda="É daqui que sai a Descrição da obra da proposta. As áreas vêm do estudo LQC quando ele existe — as mesmas do quantitativo, para custo e proposta falarem da mesma obra." />

      {areas.length === 0 && (
        <p className="text-[13px] text-torg-gray py-6 text-center">
          Nenhuma área ainda. {p.estudo ? "O estudo vinculado não tem áreas no quantitativo." : "Sem estudo vinculado, lance as áreas aqui."}
        </p>
      )}

      {areas.map((a, iA) => (
        <div key={iA} className="border border-gray-200 rounded-xl overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 bg-gray-50/70 border-b border-gray-100">
            <input value={a.nome || ""} onChange={(e) => mexer(iA, (x) => { x.nome = e.target.value; })}
              placeholder="Nome da área"
              className="flex-1 text-[13px] font-bold text-torg-dark bg-transparent outline-none" />
            <select value="" onChange={(e) => { if (!e.target.value) return;
                mexer(iA, (x) => { x.elementos = [...(x.elementos || []), { tipo: e.target.value }]; }); e.target.value = ""; }}
              className="text-[11px] border border-gray-200 rounded-lg px-2 py-1 bg-white">
              <option value="">+ elemento</option>
              {ELEMENTOS.map((el) => <option key={el.id} value={el.id}>{el.nome}</option>)}
            </select>
            <button onClick={() => grava(areas.filter((_, k) => k !== iA))}
              className="text-gray-300 hover:text-red-600"><Trash2 size={14} /></button>
          </div>

          <div className="divide-y divide-gray-50">
            {(a.elementos || []).map((el, iE) => {
              const def = ELEMENTO_POR_ID[el.tipo];
              if (!def) return null;
              return (
                <div key={iE} className="px-3 py-2.5">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-[11px] font-bold text-torg-blue uppercase tracking-wide">{def.nome}</span>
                    {def.numerado && (
                      <input type="number" value={el.numero ?? ""} placeholder="nº"
                        onChange={(e) => mexer(iA, (x) => { x.elementos[iE].numero = e.target.value; })}
                        className="w-12 text-[11px] border border-gray-200 rounded px-1.5 py-0.5" />
                    )}
                    {def.eixos && (
                      <input value={el.eixos || ""} placeholder="eixos (ex.: A@C/1@10)"
                        onChange={(e) => mexer(iA, (x) => { x.elementos[iE].eixos = e.target.value; })}
                        className="text-[11px] border border-gray-200 rounded px-1.5 py-0.5 w-44" />
                    )}
                    <button onClick={() => mexer(iA, (x) => { x.elementos.splice(iE, 1); })}
                      className="ml-auto text-gray-300 hover:text-red-600"><Trash2 size={12} /></button>
                  </div>
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {def.campos.map((c) => (
                      <label key={c.k} className="flex items-center gap-1.5">
                        <span className="text-[10.5px] text-torg-gray w-32 shrink-0 truncate" title={c.r}>{c.r}</span>
                        <input value={el[c.k] ?? ""} placeholder={c.un || ""}
                          type={c.texto ? "text" : "number"} step="0.01"
                          onChange={(e) => mexer(iA, (x) => { x.elementos[iE][c.k] = c.texto ? e.target.value : e.target.value; })}
                          className="flex-1 min-w-0 text-[12px] border border-gray-200 rounded px-1.5 py-1 focus:border-torg-blue outline-none" />
                      </label>
                    ))}
                    {/* ⚠ a observação livre existe no modelo ("- XXXXXX.") e é onde entra a
                        especificação que só aquela obra tem — sem ela alguém volta a editar o Word */}
                    <label className="flex items-center gap-1.5 sm:col-span-2 lg:col-span-3">
                      <span className="text-[10.5px] text-torg-gray w-32 shrink-0">Observação</span>
                      <input value={el.observacao || ""} placeholder="linha livre no fim do elemento"
                        onChange={(e) => mexer(iA, (x) => { x.elementos[iE].observacao = e.target.value; })}
                        className="flex-1 text-[12px] border border-gray-200 rounded px-1.5 py-1 focus:border-torg-blue outline-none" />
                    </label>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <button onClick={() => grava([...areas, { nome: "", elementos: [] }])}
        className="text-[12px] font-semibold text-torg-blue hover:underline inline-flex items-center gap-1">
        <Plus size={13} /> nova área
      </button>
    </div>
  );
}

// ─── 3. ESCOPO ────────────────────────────────────────────────────────────────
function PassoEscopo({ p, salvar, disponiveis, liberados }) {
  const escopo = p.escopo || [];
  const selecao = p.selecao || {};
  const alterna = (id) => salvar({ escopo: escopo.includes(id) ? escopo.filter((x) => x !== id) : [...escopo, id] });
  const bloco = (id, campo, valor) => salvar({ selecao: { ...selecao, [id]: { ...(selecao[id] || {}), [campo]: valor } } });
  const frase = fraseDoEscopo(escopo);

  return (
    <div className="space-y-5">
      <Cabecalho titulo="O que entra e o que sai"
        ajuda="O escopo escreve a primeira frase da proposta e destrava as seções correspondentes. Uma proposta que promete no escopo o que não está no preço é a brecha mais cara que existe." />

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
        {ESCOPO_ITENS.map((e) => {
          const on = escopo.includes(e.id);
          return (
            <button key={e.id} onClick={() => alterna(e.id)}
              className={`text-left px-3 py-2 rounded-lg border text-[12.5px] transition-colors ${
                on ? "border-torg-blue bg-torg-blue-50 text-torg-dark font-semibold" : "border-gray-200 text-torg-gray hover:border-gray-300"}`}>
              <span className="inline-flex items-center gap-1.5">
                {on ? <Check size={12} className="text-torg-blue" /> : <span className="w-3" />}
                {e.nome}
              </span>
            </button>
          );
        })}
      </div>

      {frase && (
        <div className="bg-gray-50/70 border border-gray-200 rounded-lg px-3 py-2.5">
          <p className="text-[10px] uppercase tracking-wide text-torg-gray mb-1">Item 1.1, como vai sair</p>
          <p className="text-[12.5px] text-torg-dark">{frase}</p>
        </div>
      )}

      <Campo rotulo="Modalidade da proposta">
        <select value={p.modalidade || "PESO_UNITARIO"} onChange={(e) => salvar({ modalidade: e.target.value })}
          className="text-[12.5px] border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white">
          {MODALIDADES.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
        </select>
      </Campo>

      {/* os trechos, por categoria */}
      <div className="space-y-3">
        <p className="text-[11px] font-semibold text-torg-gray uppercase tracking-wider">Trechos do documento</p>
        {CATEGORIAS.map((cat) => {
          const doCat = disponiveis.filter((b) => b.cat === cat.id);
          if (!doCat.length) return null;
          return (
            <div key={cat.id}>
              <p className="text-[11px] font-semibold text-torg-dark mb-1">{cat.nome}</p>
              <div className="border border-gray-100 rounded-lg divide-y divide-gray-50">
                {doCat.map((b) => {
                  const s = selecao[b.id] || {};
                  const travadoPeloEscopo = ["PREMISSAS_CALCULO", "PRE_MONTAGEM", "MODULARIZACAO"].includes(b.id) && !liberados.has(b.id);
                  return (
                    <div key={b.id} className="px-3 py-2 flex items-start gap-2.5">
                      <input type="checkbox" checked={!!s.incluso} disabled={b.obrigatorio || travadoPeloEscopo}
                        onChange={(e) => bloco(b.id, "incluso", e.target.checked)}
                        className="mt-0.5 accent-torg-blue disabled:opacity-40" />
                      <div className="min-w-0 flex-1">
                        <p className={`text-[12.5px] ${s.incluso ? "text-torg-dark font-medium" : "text-torg-gray"}`}>
                          {b.titulo}
                          {b.obrigatorio && <span className="ml-1.5 text-[10px] text-torg-gray-light">obrigatório</span>}
                        </p>
                        {/* ⚠ trecho travado diz POR QUÊ. Bloco só desmarcado alguém remarca sem
                            pensar; travado com motivo é o que impede a proposta prometer o que o
                            preço não cobre. */}
                        {travadoPeloEscopo && <p className="text-[10.5px] text-amber-600">o escopo não inclui este serviço</p>}
                        {!travadoPeloEscopo && b.nota && <p className="text-[10.5px] text-torg-gray truncate" title={b.nota}>{b.nota}</p>}
                      </div>
                      {b.variantes && (
                        <select value={s.variante || b.variantes[0]} onChange={(e) => bloco(b.id, "variante", e.target.value)}
                          className="text-[11px] border border-gray-200 rounded px-1.5 py-0.5 bg-white shrink-0">
                          {b.variantes.map((v) => <option key={v} value={v}>{v === "PADRAO" ? "padrão Torg" : v.replace("CONFORME_", "conforme ")}</option>)}
                        </select>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── 4. PREÇO ─────────────────────────────────────────────────────────────────
function PassoPreco({ p }) {
  const r = p.estudo?.resultado || {};
  return (
    <div className="space-y-4">
      <Cabecalho titulo="O preço vem do estudo"
        ajuda="A planilha comercial da proposta é a do estudo LQC. Digitar preço aqui criaria uma segunda verdade — e a que vai ao cliente tem que ser a que foi calculada." />
      {!p.estudo && <p className="text-[13px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
        Nenhum estudo LQC vinculado. Sem ele a proposta sai sem a planilha de preço.</p>}
      {p.estudo && (
        <div className="grid sm:grid-cols-4 gap-3">
          {[["Peso", r.pesoTotal ? `${Math.round(r.pesoTotal).toLocaleString("pt-BR")} kg` : "—"],
            ["Custo", r.custo ? `R$ ${n2(r.custo)}` : "—"],
            ["Preço", r.preco ? `R$ ${n2(r.preco)}` : "—"],
            ["R$/kg", r.precoPorKg ? n2(r.precoPorKg) : "—"]].map(([k, v]) => (
            <div key={k} className="border border-gray-200 rounded-lg px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-torg-gray">{k}</p>
              <p className="text-[15px] font-bold text-torg-dark tabular-nums">{v}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── 5. EMITIR ────────────────────────────────────────────────────────────────
function PassoEmitir({ p, salvar, emitir, emitindo }) {
  return (
    <div className="space-y-5">
      <Cabecalho titulo="Emitir o documento"
        ajuda="Cada emissão sobe a revisão e entra no histórico. A PT e a PC revisam no seu próprio ritmo." />
      <div className="flex flex-wrap items-center gap-3">
        <Campo rotulo="Documento">
          <select value={p.tipo} onChange={(e) => salvar({ tipo: e.target.value })}
            className="text-[12.5px] border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white">
            <option value="PTC">PTC — técnica e comercial</option>
            <option value="PT">PT — só técnica</option>
            <option value="PC">PC — só comercial</option>
          </select>
        </Campo>
        <label className="flex items-center gap-2 text-[12.5px] text-torg-dark mt-5">
          <input type="checkbox" checked={p.comMontagem} onChange={(e) => salvar({ comMontagem: e.target.checked })}
            className="accent-torg-blue" />
          escopo inclui montagem em campo
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        <button onClick={() => emitir(p.tipo, "docx")} disabled={emitindo}
          className="px-4 py-2.5 bg-torg-blue text-white rounded-lg text-sm font-semibold hover:bg-torg-dark inline-flex items-center gap-2 disabled:opacity-50">
          {emitindo ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />} Emitir Word
        </button>
        <button onClick={() => emitir(p.tipo, "pdf")} disabled={emitindo}
          className="px-4 py-2.5 border border-torg-blue-100 text-torg-blue rounded-lg text-sm font-semibold hover:bg-torg-blue-50 inline-flex items-center gap-2 disabled:opacity-50">
          <FileText size={15} /> Emitir PDF
        </button>
      </div>
      {(p.emissoes || []).length > 0 && (
        <div>
          <p className="text-[11px] font-semibold text-torg-gray uppercase tracking-wider mb-1.5">Histórico</p>
          <div className="border border-gray-100 rounded-lg divide-y divide-gray-50">
            {[...(p.emissoes || [])].reverse().map((e, i) => (
              <div key={i} className="px-3 py-1.5 flex items-center gap-2 text-[12px]">
                <span className="font-mono font-semibold text-torg-blue">{e.tipo}-R{String(e.revisao).padStart(2, "0")}</span>
                <span className="text-torg-gray truncate">{e.arquivo}</span>
                <span className="ml-auto text-torg-gray-light whitespace-nowrap">
                  {new Date(e.em).toLocaleDateString("pt-BR")} · {e.porNome}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── peças ────────────────────────────────────────────────────────────────────
function Cabecalho({ titulo, ajuda }) {
  return (
    <div>
      <h3 className="text-[17px] font-bold text-torg-dark">{titulo}</h3>
      {ajuda && <p className="text-[12.5px] text-torg-gray mt-0.5 max-w-3xl">{ajuda}</p>}
    </div>
  );
}
function Campo({ rotulo, ajuda, children }) {
  return (
    <div>
      <p className="text-[11px] font-semibold text-torg-dark mb-1">{rotulo}</p>
      {ajuda && <p className="text-[10.5px] text-torg-gray mb-1.5">{ajuda}</p>}
      {children}
    </div>
  );
}
