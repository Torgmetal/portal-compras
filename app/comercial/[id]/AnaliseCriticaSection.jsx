"use client";
// Análise Crítica de Projeto (PO-13) — bloco da aba Engenharia da OP. Um registro por OP,
// sete blocos, cada linha com situação. O FORM 08 (PDF) e o envio ao SharePoint saem daqui.
// Vitor (10/09/2026): "vamos buildar da forma que vc fez na prévia, e vamos vendo como será no
// dia a dia" — por isso o formato é simples de mexer: cada bloco é uma lista de linhas editada
// num modal genérico (CAMPOS abaixo), e a situação troca direto na tabela.
import { useEffect, useState, useCallback } from "react";
import { Search, Plus, Pencil, Trash2, Loader2, History, Download, CloudUpload, CheckCircle2, AlertTriangle, XCircle, ShieldCheck, X } from "lucide-react";
import { useStore } from "@/lib/store";
import { SITUACOES, SITUACAO_ACAO, STATUS_REGISTRO, nivelRisco } from "@/lib/analise-critica";

const novoId = () => Math.random().toString(36).slice(2, 10);
const Badge = ({ cls, children }) => <span className={`inline-block text-[10px] px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${cls}`}>{children}</span>;
const Chip = ({ children }) => <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-torg-gray font-medium">{children}</span>;
const dataCurta = (s) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s.slice(8, 10)}/${s.slice(5, 7)}` : s || "");
const th = "px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap";
const td = "px-4 py-2 text-xs align-top";

// campos de cada bloco — o modal genérico monta o formulário a partir daqui
const SIT = Object.entries(SITUACOES).map(([v, s]) => ({ v, l: s.label }));
const CAMPOS = {
  entradas: [{ k: "documento", l: "Documento", w: "full" }, { k: "revisao", l: "Revisão" }, { k: "analisadoPor", l: "Analisado por" }, { k: "data", l: "Data", t: "date" }, { k: "achado", l: "Achado", t: "textarea", w: "full" }, { k: "situacao", l: "Situação", t: "select", o: SIT }],
  requisitos: [{ k: "codigo", l: "Código (R-01)" }, { k: "origem", l: "Origem (pedido, espec., norma)" }, { k: "requisito", l: "Requisito", t: "textarea", w: "full" }, { k: "evidencia", l: "Evidência no projeto", t: "textarea", w: "full" }, { k: "dono", l: "Dono" }, { k: "situacao", l: "Situação", t: "select", o: SIT }],
  areas: [{ k: "area", l: "Área" }, { k: "setor", l: "Setor" }, { k: "procedimento", l: "Procedimento" }, { k: "responsavel", l: "Responsável" }, { k: "parecer", l: "Parecer", t: "textarea", w: "full" }, { k: "situacao", l: "Situação", t: "select", o: SIT }],
  riscos: [{ k: "risco", l: "Risco", t: "textarea", w: "full" }, { k: "probabilidade", l: "Probabilidade (1–4)", t: "number" }, { k: "impacto", l: "Impacto (1–4)", t: "number" }, { k: "tratativa", l: "Tratativa / ação", t: "textarea", w: "full" }],
  saidas: [{ k: "documento", l: "Saída", w: "full" }, { k: "revisao", l: "Revisão" }, { k: "verificadoPor", l: "Verificado por" }, { k: "data", l: "Data", t: "date" }, { k: "verificacao", l: "O que foi verificado", t: "textarea", w: "full" }, { k: "situacao", l: "Situação", t: "select", o: SIT }],
  comentarios: [{ k: "data", l: "Data", t: "date" }, { k: "origem", l: "Origem (cliente · GRD, Torg)" }, { k: "texto", l: "Comentário / alteração", t: "textarea", w: "full" }, { k: "analise", l: "Análise", t: "textarea", w: "full" }, { k: "impacto", l: "Impacto (prazo, custo → PO-09)" }, { k: "situacao", l: "Situação", t: "select", o: SIT }],
  reunioes: [{ k: "codigo", l: "Código (ACP-01)" }, { k: "data", l: "Data", t: "date" }, { k: "participantes", l: "Participantes (áreas e nomes)", t: "textarea", w: "full" }, { k: "pauta", l: "Pauta", t: "textarea", w: "full" }, { k: "decisoes", l: "Decisões", t: "textarea", w: "full" }, { k: "ataAceita", l: "Ata aceita por todos", t: "check" }],
  acoes: [{ k: "codigo", l: "Código (A-01)" }, { k: "acao", l: "Ação", t: "textarea", w: "full" }, { k: "quem", l: "Quem" }, { k: "quando", l: "Quando", t: "date" }, { k: "situacao", l: "Situação", t: "select", o: Object.entries(SITUACAO_ACAO).map(([v, s]) => ({ v, l: s.label })) }],
};
const NOVA = { entradas: { situacao: "PENDENTE" }, requisitos: { situacao: "PENDENTE" }, areas: { situacao: "PENDENTE" }, riscos: { probabilidade: 2, impacto: 2 }, saidas: { situacao: "PENDENTE" }, comentarios: { situacao: "PENDENTE" }, reunioes: { ataAceita: false }, acoes: { situacao: "A_FAZER" } };

function ModalLinha({ bloco, linha, onSalvar, onFechar }) {
  const [v, setV] = useState({ ...NOVA[bloco], ...(linha || {}) });
  const set = (k, x) => setV((p) => ({ ...p, [k]: x }));
  const campos = CAMPOS[bloco];
  const obrig = campos[0].k === "codigo" ? campos.find((c) => c.w === "full")?.k : campos[0].k;
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center overflow-y-auto p-4" onClick={onFechar}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl my-10" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100"><h4 className="text-sm font-semibold text-torg-dark">{linha ? "Editar linha" : "Nova linha"}</h4><button onClick={onFechar} className="text-torg-gray hover:text-torg-dark"><X size={16} /></button></div>
        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {campos.map((c) => (
            <label key={c.k} className={`text-xs text-torg-gray ${c.w === "full" ? "sm:col-span-2" : ""}`}>{c.l}
              {c.t === "textarea" ? <textarea rows={3} value={v[c.k] ?? ""} onChange={(e) => set(c.k, e.target.value)} className="mt-1 w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm text-torg-dark" />
                : c.t === "select" ? <select value={v[c.k] ?? ""} onChange={(e) => set(c.k, e.target.value)} className="mt-1 w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm text-torg-dark bg-white">{c.o.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}</select>
                : c.t === "check" ? <div className="mt-1"><input type="checkbox" checked={!!v[c.k]} onChange={(e) => set(c.k, e.target.checked)} /></div>
                : <input type={c.t === "number" ? "number" : c.t === "date" ? "date" : "text"} min={c.t === "number" ? 1 : undefined} max={c.t === "number" ? 4 : undefined} value={v[c.k] ?? ""} onChange={(e) => set(c.k, c.t === "number" ? Number(e.target.value) : e.target.value)} className="mt-1 w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm text-torg-dark" />}
            </label>
          ))}
        </div>
        <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-2">
          <button onClick={onFechar} className="text-xs text-torg-gray border border-gray-300 rounded-lg px-3 py-2 font-medium">Cancelar</button>
          <button onClick={() => { if (!String(v[obrig] || "").trim()) return; onSalvar({ id: linha?.id || novoId(), ...v }); }} className="px-3.5 py-2 bg-torg-blue text-white text-xs rounded-lg hover:bg-torg-blue-700 font-medium">Salvar linha</button>
        </div>
      </div>
    </div>
  );
}

const SitSelect = ({ valor, opcoes, onChange, podeEditar }) => {
  const s = opcoes[valor] || { label: valor || "—", cls: "bg-gray-100 text-torg-gray" };
  if (!podeEditar) return <Badge cls={s.cls}>{s.label}</Badge>;
  return <select value={valor || ""} onChange={(e) => onChange(e.target.value)} className={`text-[10px] px-2 py-0.5 rounded-full font-medium border-0 ${s.cls}`}>{Object.entries(opcoes).map(([v, o]) => <option key={v} value={v}>{o.label}</option>)}</select>;
};

export default function AnaliseCriticaSection({ opId, isDiretoria = false }) {
  const { showToast } = useStore();
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState(null);
  const [sujo, setSujo] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [modal, setModal] = useState(null); // { bloco, linha }
  const [aberto, setAberto] = useState(true);
  const [mostrarTudo, setMostrarTudo] = useState({});

  const carregar = useCallback(() => {
    setErro(null);
    return fetch(`/api/comercial/op/${opId}/analise-critica`).then((r) => r.json()).then((d) => { if (!d.success) throw new Error(d.error || "Falha ao carregar"); setDados(d); setSujo(false); }).catch((e) => setErro(e.message));
  }, [opId]);
  useEffect(() => { carregar(); }, [carregar]);

  const reg = dados?.registro;
  const podeEditar = !!dados?.podeEditar;
  const mudar = (bloco, lista) => { setDados((p) => ({ ...p, registro: { ...p.registro, [bloco]: lista } })); setSujo(true); };
  const salvarLinha = (bloco, linha) => { const lista = reg[bloco] || []; const i = lista.findIndex((x) => x.id === linha.id); mudar(bloco, i >= 0 ? lista.map((x) => (x.id === linha.id ? linha : x)) : [...lista, linha]); setModal(null); };
  const remover = (bloco, id) => mudar(bloco, (reg[bloco] || []).filter((x) => x.id !== id));
  const mudarSit = (bloco, id, situacao) => mudar(bloco, (reg[bloco] || []).map((x) => (x.id === id ? { ...x, situacao } : x)));

  const enviar = async (acao, extra = {}) => {
    setSalvando(true);
    try {
      const r = await fetch(`/api/comercial/op/${opId}/analise-critica`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao, registro: reg, ...extra }) });
      const d = await r.json();
      if (!d.success) throw new Error(d.error || "Falha ao salvar");
      setDados(d); setSujo(false);
      showToast(acao === "aprovar" ? "Análise crítica aprovada." : acao === "nova-revisao" ? `Revisão R${d.registro.revisao} aberta; a anterior ficou no histórico.` : acao === "verificada" ? "Análise marcada como verificada." : "Análise crítica salva.", "sucesso");
    } catch (e) { showToast(e.message, "erro"); } finally { setSalvando(false); }
  };
  const salvarSharePoint = async () => {
    if (sujo) { showToast("Salve a análise antes de enviar ao SharePoint.", "erro"); return; }
    setSalvando(true);
    try {
      const r = await fetch(`/api/comercial/op/${opId}/analise-critica/sharepoint`, { method: "POST" });
      const d = await r.json();
      if (!d.success) throw new Error(d.error || "Falha ao salvar no SharePoint");
      setDados((p) => ({ ...p, registro: d.registro })); showToast(`FORM 08 salvo em ${d.pasta.split("/").slice(-2).join("/")}.`, "sucesso");
    } catch (e) { showToast(e.message, "erro"); } finally { setSalvando(false); }
  };

  if (erro) return <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 text-sm text-red-700 flex items-center justify-between"><span>Análise crítica: {erro}</span><button onClick={carregar} className="text-xs border border-gray-300 rounded-lg px-2.5 py-1.5">Tentar novamente</button></div>;
  if (!dados) return <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 text-sm text-torg-gray flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Carregando análise crítica…</div>;

  const st = STATUS_REGISTRO[reg.status] || STATUS_REGISTRO.EM_ANALISE, res = dados.resumo, verif = dados.verificacoes || [];
  const codigo = `ACP-${String(reg.opNumero || "").replace(/^0+/, "").padStart(3, "0")} · R${reg.revisao || 0}`;
  const linhas = (bloco, filtro) => { const l = reg[bloco] || []; if (mostrarTudo[bloco] || !filtro) return l; return l.filter(filtro); };
  const Acoes = ({ bloco, linha }) => podeEditar ? <span className="inline-flex gap-1.5 whitespace-nowrap"><button onClick={() => setModal({ bloco, linha })} className="text-torg-gray hover:text-torg-blue" title="Editar"><Pencil size={13} /></button><button onClick={() => remover(bloco, linha.id)} className="text-torg-gray hover:text-red-600" title="Remover"><Trash2 size={13} /></button></span> : null;
  const Titulo = ({ n, t, chip, sub, bloco }) => (
    <div className="px-6 pt-5 pb-2 flex items-start justify-between gap-3 flex-wrap">
      <div><h4 className="text-sm font-semibold text-torg-dark flex items-center gap-2"><span className="w-5 h-5 rounded-md bg-torg-blue-50 text-torg-blue text-[11px] font-bold grid place-items-center">{n}</span> {t} {chip && <Chip>{chip}</Chip>}</h4>{sub && <p className="text-xs text-torg-gray mt-0.5">{sub}</p>}</div>
      {podeEditar && bloco && <button onClick={() => setModal({ bloco })} className="text-xs text-torg-blue font-medium inline-flex items-center gap-1"><Plus size={13} /> Adicionar</button>}
    </div>
  );
  const Ocultas = ({ bloco, n, oq }) => n > 0 ? <div className="px-6 py-2 text-[11px] text-torg-gray">{n} {oq} ocultas · <button onClick={() => setMostrarTudo((p) => ({ ...p, [bloco]: !p[bloco] }))} className="text-torg-blue">{mostrarTudo[bloco] ? "ocultar" : "mostrar todas"}</button></div> : null;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-6 pt-5 pb-4 flex items-start justify-between gap-3 flex-wrap border-b border-gray-100">
        <div>
          <h3 className="text-lg font-semibold text-torg-dark flex items-center gap-2 flex-wrap"><Search size={18} className="text-torg-blue" /> Análise Crítica de Projeto <Badge cls="bg-torg-blue-50 text-torg-blue">PO-13 Rev.3</Badge><Badge cls={st.cls}>{codigo} · {st.label}</Badge>{reg.novo && <Chip>ainda não salva</Chip>}</h3>
          <p className="text-sm text-torg-gray mt-1 max-w-3xl">Um registro por OP, com revisões. Cada bloco responde a uma pergunta do PO-13 com evidência; o FORM 08 sai daqui.{reg.aprovadoPorNome ? ` Aprovada por ${reg.aprovadoPorNome}.` : ""}</p>
          {/* Responsável editável — Vitor (11/09/2026): quem cria o registro não é necessariamente o Eng.º de Projeto que assina */}
          <label className="mt-2 flex items-center gap-2 text-xs text-torg-gray max-w-md">Responsável (Eng.º de Projeto)
            {podeEditar
              ? <input value={reg.responsavelNome || ""} onChange={(e) => { setDados((p) => ({ ...p, registro: { ...p.registro, responsavelNome: e.target.value } })); setSujo(true); }} placeholder="nome de quem assina a verificação" className="flex-1 border border-gray-200 rounded-lg px-2.5 py-1 text-sm text-torg-dark" />
              : <span className="text-sm text-torg-dark">{reg.responsavelNome || "—"}</span>}
          </label>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setAberto((a) => !a)} className="text-xs text-torg-gray border border-gray-300 rounded-lg px-2.5 py-1.5 font-medium">{aberto ? "Recolher" : "Expandir"}</button>
          {podeEditar && !reg.novo && <button disabled={salvando} onClick={() => { const motivo = window.prompt("Motivo da nova revisão (o que mudou no projeto)?"); if (motivo !== null) enviar("nova-revisao", { motivo }); }} className="text-xs text-torg-gray border border-gray-300 rounded-lg px-2.5 py-1.5 font-medium inline-flex items-center gap-1.5"><History size={13} /> Nova revisão</button>}
          {!reg.novo && <a href={`/api/comercial/op/${opId}/analise-critica/pdf`} target="_blank" rel="noreferrer" className="text-xs text-torg-gray border border-gray-300 rounded-lg px-2.5 py-1.5 font-medium inline-flex items-center gap-1.5"><Download size={13} /> FORM 08 (PDF)</a>}
          {podeEditar && !reg.novo && <button disabled={salvando} onClick={salvarSharePoint} className="px-3.5 py-2 bg-torg-orange text-white text-xs rounded-lg font-medium inline-flex items-center gap-1.5 disabled:opacity-50"><CloudUpload size={13} /> Salvar em 2. Engenharia</button>}
          {podeEditar && <button disabled={salvando || (!sujo && !reg.novo)} onClick={() => enviar("salvar")} className="px-3.5 py-2 bg-torg-blue text-white text-xs rounded-lg hover:bg-torg-blue-700 font-medium inline-flex items-center gap-1.5 disabled:opacity-50">{salvando ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />} {sujo ? "Salvar alterações" : reg.novo ? "Criar registro" : "Salvo"}</button>}
        </div>
      </div>

      {aberto && (<>
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-px bg-gray-100 border-b border-gray-100">
        <div className="bg-white p-4"><p className="text-[10px] font-medium text-torg-gray uppercase tracking-wider mb-1">Situação</p><p className="text-sm font-extrabold text-torg-dark">{st.label}</p><p className="text-[11px] text-torg-gray">{reg.sharepointEm ? `FORM 08 no SharePoint · R${reg.revisao}` : "FORM 08 ainda não salvo na pasta"}</p></div>
        <div className="bg-white p-4"><p className="text-[10px] font-medium text-torg-gray uppercase tracking-wider mb-1">Entradas</p><p className="text-lg font-extrabold text-torg-dark tabular-nums">{res.entradas.ok}<span className="text-sm text-torg-gray font-semibold">/{res.entradas.total}</span></p><p className="text-[11px] text-torg-gray">{res.entradas.conflito ? `${res.entradas.conflito} em conflito` : "adequadas"}</p></div>
        <div className="bg-white p-4"><p className="text-[10px] font-medium text-torg-gray uppercase tracking-wider mb-1">Requisitos</p><p className="text-lg font-extrabold text-torg-dark tabular-nums">{res.requisitos.total}</p><p className="text-[11px]"><span className="text-emerald-700">{res.requisitos.ok} ok</span> · <span className="text-amber-700">{res.requisitos.pendentes} pend.</span> · <span className="text-red-700">{res.requisitos.conflito} conflito</span></p></div>
        <div className="bg-white p-4"><p className="text-[10px] font-medium text-torg-gray uppercase tracking-wider mb-1">Saídas verificadas</p><p className="text-lg font-extrabold text-torg-dark tabular-nums">{res.saidas.ok}<span className="text-sm text-torg-gray font-semibold">/{res.saidas.total}</span></p><p className="text-[11px] text-torg-gray">{verif.length} automáticas</p></div>
        <div className="bg-white p-4"><p className="text-[10px] font-medium text-torg-gray uppercase tracking-wider mb-1">Riscos</p><p className="text-lg font-extrabold text-torg-dark tabular-nums">{res.riscos.total}</p><p className="text-[11px]"><span className="text-red-700">{res.riscos.altos} altos</span> · <span className="text-amber-700">{res.riscos.medios} médios</span></p></div>
        <div className="bg-white p-4"><p className="text-[10px] font-medium text-torg-gray uppercase tracking-wider mb-1">Ações</p><p className="text-lg font-extrabold text-torg-dark tabular-nums">{res.acoes.total}</p><p className="text-[11px]"><span className="text-red-700">{res.acoes.atrasadas} atrasadas</span> · {res.acoes.abertas} abertas</p></div>
      </div>

      {/* 1 Entradas */}
      <Titulo n={1} t="Entradas do projeto" chip="PO-13 §5.2 · Nota 1" sub="Documento, revisão, quem analisou e o achado. Incompleto, ambíguo ou conflitante vira pendência com o cliente; se muda prazo ou custo, vai ao PO-09." bloco="entradas" />
      <div className="overflow-x-auto"><table className="w-full text-sm min-w-[720px]"><thead className="bg-gray-50"><tr><th className={th}>Documento</th><th className={th}>Rev.</th><th className={th}>Analisado por</th><th className={th}>Achado</th><th className={th}>Situação</th><th className={th}></th></tr></thead>
        <tbody className="divide-y divide-gray-50">{(reg.entradas || []).map((l) => <tr key={l.id} className="hover:bg-gray-50"><td className={`${td} text-torg-dark`}>{l.documento}</td><td className={`${td} font-mono`}>{l.revisao || "—"}</td><td className={`${td} text-torg-gray whitespace-nowrap`}>{l.analisadoPor || "—"}{l.data ? ` · ${dataCurta(l.data)}` : ""}</td><td className={td}>{l.achado || <span className="text-torg-gray">—</span>}</td><td className={td}><SitSelect valor={l.situacao} opcoes={SITUACOES} podeEditar={podeEditar} onChange={(v) => mudarSit("entradas", l.id, v)} /></td><td className={td}><Acoes bloco="entradas" linha={l} /></td></tr>)}</tbody></table></div>

      {/* 2 Requisitos */}
      <Titulo n={2} t="Requisitos extraídos" chip="PO-13 Nota 1 · Nota 2 (a)" sub="O que o projeto tem de atender, com origem, dono e evidência." bloco="requisitos" />
      <div className="overflow-x-auto"><table className="w-full text-sm min-w-[720px]"><thead className="bg-gray-50"><tr><th className={th}>#</th><th className={th}>Requisito</th><th className={th}>Origem</th><th className={th}>Evidência</th><th className={th}>Dono</th><th className={th}>Situação</th><th className={th}></th></tr></thead>
        <tbody className="divide-y divide-gray-50">{linhas("requisitos", (r) => r.situacao !== "OK").map((l) => <tr key={l.id} className="hover:bg-gray-50"><td className={`${td} font-mono text-torg-dark`}>{l.codigo || "—"}</td><td className={td}>{l.requisito}</td><td className={`${td} text-torg-gray`}>{l.origem || "—"}</td><td className={td}>{l.evidencia || "—"}</td><td className={td}>{l.dono || "—"}</td><td className={td}><SitSelect valor={l.situacao} opcoes={SITUACOES} podeEditar={podeEditar} onChange={(v) => mudarSit("requisitos", l.id, v)} /></td><td className={td}><Acoes bloco="requisitos" linha={l} /></td></tr>)}
        {!(reg.requisitos || []).length && <tr><td colSpan={7} className="px-6 py-4 text-xs text-torg-gray text-center">Nenhum requisito ainda. Extraia da proposta, do pedido e da especificação do cliente.</td></tr>}</tbody></table></div>
      <Ocultas bloco="requisitos" n={mostrarTudo.requisitos ? 0 : (reg.requisitos || []).filter((r) => r.situacao === "OK").length} oq="atendidas" />

      {/* 3 e 4 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-px bg-gray-100 border-y border-gray-100">
        <div className="bg-white">
          <Titulo n={3} t="Análise por área" chip="PO-13 §5.3" sub="Cada área que o §5.3 chama para a reunião registra o seu parecer antes de liberar a frente." bloco="areas" />
          <div className="px-6 pb-4 divide-y divide-gray-50">{(reg.areas || []).map((l) => { const Ico = l.situacao === "OK" ? CheckCircle2 : l.situacao === "CONFLITO" ? XCircle : AlertTriangle; const cor = l.situacao === "OK" ? "text-emerald-600" : l.situacao === "CONFLITO" ? "text-red-600" : l.situacao === "PENDENTE" && !l.parecer ? "text-gray-300" : "text-amber-600";
            return <div key={l.id} className="flex items-start gap-3 py-2.5"><Ico size={16} className={`${cor} mt-0.5 flex-none`} /><div className="flex-1 min-w-0"><div className="text-sm font-medium text-torg-dark flex items-center gap-2 flex-wrap">{l.area} <span className="text-[11px] text-torg-gray font-normal">· {[l.setor, l.procedimento].filter(Boolean).join(" · ")}{l.responsavel ? ` · ${l.responsavel}` : ""}</span><Acoes bloco="areas" linha={l} /></div><div className="text-xs text-torg-gray">{l.parecer || "Sem parecer ainda."}</div></div><SitSelect valor={l.situacao} opcoes={SITUACOES} podeEditar={podeEditar} onChange={(v) => mudarSit("areas", l.id, v)} /></div>; })}</div>
        </div>
        <div className="bg-white">
          <Titulo n={4} t="Riscos e ações" chip="FORM 06 Rev.01" sub="Probabilidade × impacto (1 a 4). Risco 9 ou mais exige ação antes de liberar a frente." bloco="riscos" />
          <div className="px-6 pb-4 space-y-2.5">{[...(reg.riscos || [])].sort((a, b) => nivelRisco(b) - nivelRisco(a)).map((l) => { const n = nivelRisco(l); const cor = n >= 9 ? "bg-red-600" : n >= 4 ? "bg-amber-500" : "bg-emerald-600";
            return <div key={l.id} className="flex items-start gap-3"><span className={`w-8 h-8 rounded-lg ${cor} text-white text-xs font-extrabold grid place-items-center flex-none`}>{n}</span><div className="flex-1 min-w-0"><div className="text-sm font-medium text-torg-dark flex items-center gap-2">{l.risco} <Acoes bloco="riscos" linha={l} /></div><div className="text-xs text-torg-gray">{l.tratativa || `P ${l.probabilidade} × I ${l.impacto}`}</div></div></div>; })}
            {!(reg.riscos || []).length && <p className="text-xs text-torg-gray">Nenhum risco registrado.</p>}</div>
        </div>
      </div>

      {/* 5 Saídas */}
      <Titulo n={5} t="Verificação das saídas" chip="as linhas do FORM 08" sub="Revisão, o que foi verificado, por quem e quando. As primeiras linhas o portal confere sozinho." bloco="saidas" />
      <div className="overflow-x-auto"><table className="w-full text-sm min-w-[720px]"><thead className="bg-gray-50"><tr><th className={th}>Saída</th><th className={th}>Rev.</th><th className={th}>Verificação</th><th className={th}>Por / data</th><th className={th}>Situação</th><th className={th}></th></tr></thead>
        <tbody className="divide-y divide-gray-50">
          {verif.map((v) => <tr key={v.chave} className="bg-torg-blue-50/30"><td className={`${td} text-torg-dark`}>{v.titulo} <Chip>automática</Chip></td><td className={`${td} font-mono`}>—</td><td className={td}>{v.resultado}<div className="text-[10px] text-torg-gray">↳ {v.fonte}</div></td><td className={`${td} text-torg-gray`}>portal</td><td className={td}><Badge cls={SITUACOES[v.situacao]?.cls}>{SITUACOES[v.situacao]?.label}</Badge></td><td className={td}></td></tr>)}
          {linhas("saidas", (s) => s.situacao !== "OK" && s.situacao !== "NA").map((l) => <tr key={l.id} className="hover:bg-gray-50"><td className={`${td} text-torg-dark`}>{l.documento}</td><td className={`${td} font-mono`}>{l.revisao || "—"}</td><td className={td}>{l.verificacao || <span className="text-torg-gray">—</span>}</td><td className={`${td} text-torg-gray whitespace-nowrap`}>{l.verificadoPor || "—"}{l.data ? ` · ${dataCurta(l.data)}` : ""}</td><td className={td}><SitSelect valor={l.situacao} opcoes={SITUACOES} podeEditar={podeEditar} onChange={(v) => mudarSit("saidas", l.id, v)} /></td><td className={td}><Acoes bloco="saidas" linha={l} /></td></tr>)}
        </tbody></table></div>
      <Ocultas bloco="saidas" n={mostrarTudo.saidas ? 0 : (reg.saidas || []).filter((s) => s.situacao === "OK" || s.situacao === "NA").length} oq="saídas OK ou não aplicáveis" />

      {/* 6 Comentários */}
      <Titulo n={6} t="Comentários do cliente e alterações de projeto" chip="Nota 3 · §5.7" bloco="comentarios" />
      <div className="overflow-x-auto"><table className="w-full text-sm min-w-[720px]"><thead className="bg-gray-50"><tr><th className={th}>Data</th><th className={th}>Origem</th><th className={th}>Comentário / alteração</th><th className={th}>Análise</th><th className={th}>Impacto</th><th className={th}>Situação</th><th className={th}></th></tr></thead>
        <tbody className="divide-y divide-gray-50">{(reg.comentarios || []).map((l) => <tr key={l.id} className="hover:bg-gray-50"><td className={`${td} whitespace-nowrap`}>{dataCurta(l.data) || "—"}</td><td className={`${td} text-torg-gray`}>{l.origem || "—"}</td><td className={td}>{l.texto}</td><td className={td}>{l.analise || "—"}</td><td className={td}>{l.impacto || "—"}</td><td className={td}><SitSelect valor={l.situacao} opcoes={SITUACOES} podeEditar={podeEditar} onChange={(v) => mudarSit("comentarios", l.id, v)} /></td><td className={td}><Acoes bloco="comentarios" linha={l} /></td></tr>)}
        {!(reg.comentarios || []).length && <tr><td colSpan={7} className="px-6 py-4 text-xs text-torg-gray text-center">Nenhum comentário do cliente ou alteração registrada.</td></tr>}</tbody></table></div>

      {/* 7 Reuniões e ações */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-px bg-gray-100 border-t border-gray-100">
        <div className="bg-white">
          <Titulo n={7} t="Reuniões de análise crítica" chip="FORM 10" bloco="reunioes" />
          <div className="px-6 pb-4 space-y-2">{(reg.reunioes || []).map((l) => <div key={l.id} className="border border-gray-100 rounded-lg px-3 py-2.5"><div className="flex items-center justify-between gap-2 flex-wrap"><span className="text-sm font-medium text-torg-dark">{l.codigo || "Reunião"} · {dataCurta(l.data) || "sem data"}</span><span className="inline-flex items-center gap-2">{l.ataAceita ? <Badge cls="bg-emerald-50 text-emerald-700">Ata aceita</Badge> : <Badge cls="bg-torg-blue-50 text-torg-blue">Convocada</Badge>}<Acoes bloco="reunioes" linha={l} /></span></div><div className="text-xs text-torg-gray mt-0.5">{l.participantes}{l.pauta ? ` · ${l.pauta}` : ""}</div>{l.decisoes && <div className="text-xs text-torg-dark mt-1 whitespace-pre-line">{l.decisoes}</div>}</div>)}
            {!(reg.reunioes || []).length && <p className="text-xs text-torg-gray">Nenhuma reunião registrada.</p>}</div>
        </div>
        <div className="bg-white">
          <Titulo n="" t="Ações" chip="5W2H" bloco="acoes" />
          <div className="px-6 pb-4 divide-y divide-gray-50 text-sm">{(reg.acoes || []).map((l) => { const hoje = new Date().toISOString().slice(0, 10); const atras = l.situacao !== "CONCLUIDA" && l.quando && l.quando < hoje; const s = atras ? { label: "Atrasada", cls: "bg-red-50 text-red-700" } : SITUACAO_ACAO[l.situacao] || SITUACAO_ACAO.A_FAZER;
            return <div key={l.id} className="flex items-center justify-between gap-2 py-2"><div className="min-w-0"><div className="text-torg-dark">{l.codigo ? `${l.codigo} · ` : ""}{l.acao}</div><div className="text-[11px] text-torg-gray">{l.quem || "—"}{l.quando ? ` · ${dataCurta(l.quando)}` : ""}</div></div><span className="inline-flex items-center gap-2"><SitSelect valor={l.situacao} opcoes={atras ? { ...SITUACAO_ACAO, [l.situacao]: s } : SITUACAO_ACAO} podeEditar={podeEditar} onChange={(v) => mudarSit("acoes", l.id, v)} /><Acoes bloco="acoes" linha={l} /></span></div>; })}
            {!(reg.acoes || []).length && <p className="text-xs text-torg-gray py-2">Nenhuma ação.</p>}</div>
        </div>
      </div>

      <div className="px-6 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between gap-3 flex-wrap text-[11px] text-torg-gray">
        <span className="inline-flex items-center gap-1.5"><ShieldCheck size={13} /> {codigo}{reg.abertoEm ? ` · aberto em ${new Date(reg.abertoEm).toLocaleDateString("pt-BR")}` : ""}{reg.aprovadoPorNome ? ` · aprovado por ${reg.aprovadoPorNome} em ${new Date(reg.aprovadoEm).toLocaleDateString("pt-BR")}` : " · aprovação do Diretor Técnico pendente"}{Array.isArray(reg.historico) && reg.historico.length ? ` · ${reg.historico.length} revisão(ões) no histórico` : ""}</span>
        <span className="inline-flex items-center gap-2 flex-wrap">{reg.sharepointPath ? <span>Salvo em <span className="font-mono">{reg.sharepointPath.split("/").slice(-3).join("/")}</span></span> : <span>FORM 08 Rev.02 · retenção 2 anos (PO-13 §7)</span>}
          {podeEditar && !reg.novo && reg.status === "EM_ANALISE" && <button disabled={salvando || sujo} onClick={() => enviar("verificada")} className="text-torg-blue font-medium disabled:opacity-50">Marcar como verificada</button>}
          {isDiretoria && dados.podeAprovar && !reg.novo && reg.status !== "APROVADA" && <button disabled={salvando || sujo} onClick={() => { if (window.confirm("Aprovar esta revisão da análise crítica?")) enviar("aprovar"); }} className="text-emerald-700 font-semibold disabled:opacity-50">Aprovar (Diretoria)</button>}</span>
      </div>
      </>)}

      {modal && <ModalLinha bloco={modal.bloco} linha={modal.linha} onSalvar={(l) => salvarLinha(modal.bloco, l)} onFechar={() => setModal(null)} />}
    </div>
  );
}
