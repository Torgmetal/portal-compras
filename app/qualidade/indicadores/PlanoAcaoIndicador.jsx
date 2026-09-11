"use client";
import { useState, useEffect, useCallback } from "react";
import { Loader2, X, Plus, Trash2, Check, ClipboardList, AlertCircle, FileDown } from "lucide-react";
import { useStore } from "@/lib/store";
import { STATUS_ITEM, STATUS_ITEM_OPCOES, situacaoItem, SITUACAO_ITEM } from "@/lib/plano-acao";

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const novoItem = () => ({ oque: "", porque: "", onde: "", quem: "", quando: "", como: "", quanto: "", status: "A_FAZER", acompanhamento: "" });
// ⚠ Vitor (11/09/2026): "está pequeno para visualizar tanto na geração quanto depois do PDF" — o
// formulário era todo em 10–12 px com campos de uma linha e sem rótulo (só placeholder, que some
// ao digitar). Agora 14 px, rótulo visível em cada campo do 5W2H e caixas de duas linhas.
const inp = "w-full text-sm text-torg-dark border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-torg-blue";
const rot = "block text-xs font-semibold text-torg-gray mb-1";
const Campo = ({ label, hint, children, className = "" }) => (
  <label className={`block ${className}`}>
    <span className={rot}>{label}{hint && <span className="font-normal text-torg-gray-light"> · {hint}</span>}</span>
    {children}
  </label>
);

/**
 * Plano de ação 5W2H de um indicador fora da meta — dentro do painel do setor.
 *
 * Vitor (27/08/2026): "criar um botão para criar plano de ação para os meses que estão abaixo da
 * meta (…) pode ser apenas dentro do painel indicadores de cada setor mesmo, a estrutura do plano
 * de ação é o 5W2H (…) criar dentro desse botão uma aba com os PA em aberto e os encerrados".
 *
 * ⚠ MESMO 5W2H DA RNC. Mudar de estrutura por causa da origem criaria um segundo formulário para a
 * mesma coisa — e quem preenche os dois teria de aprender duas telas para a mesma pergunta.
 */
export default function PlanoAcaoIndicador({ ind, processo, ano, mes, valor, onFechar }) {
  const { showToast } = useStore();
  const [aba, setAba] = useState("ABERTOS");
  const [planos, setPlanos] = useState(null);
  const [aberto, setAberto] = useState(null); // plano em edição
  const [itens, setItens] = useState([]);
  const [cab, setCab] = useState({ responsavel: "", status: "EM_ANDAMENTO" });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const carregar = useCallback(async () => {
    setErro("");
    try {
      // ⚠ sem indicador (aberto pelo cabeçalho) lista os planos do SETOR inteiro — é como se vê o
      // que está em aberto sem depender de qual cartão está vermelho hoje.
      const q = new URLSearchParams({ ano: String(ano), ...(ind.id ? { indicador: ind.id } : { processo }) });
      const r = await fetch(`/api/indicadores/plano-acao?${q}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Não consegui ler os planos.");
      setPlanos(j.planos || []);
    } catch (e) { setErro(e.message); setPlanos([]); }
  }, [ind.id, processo, ano]);
  useEffect(() => { carregar(); }, [carregar]);

  const abrir = (p) => {
    setAberto(p);
    setItens((p.itens || []).map((i) => ({ ...novoItem(), ...i })));
    setCab({ responsavel: p.responsavel || "", status: p.status || "EM_ANDAMENTO" });
  };

  async function criar() {
    setSalvando(true); setErro("");
    try {
      const r = await fetch("/api/indicadores/plano-acao", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ indicador: ind.id, processo, ano, mes: mes ?? null, valor: valor ?? null, metaValor: ind.meta?.valor ?? null }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro ao criar o plano.");
      await carregar();
      abrir(j.plano);
    } catch (e) { setErro(e.message); } finally { setSalvando(false); }
  }

  async function salvar() {
    setSalvando(true); setErro("");
    try {
      const r = await fetch("/api/indicadores/plano-acao", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: aberto.id, ...cab, itens: itens.filter((i) => (i.oque || "").trim() || (i.porque || "").trim()) }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro ao salvar.");
      setPlanos((anteriores) => (anteriores || []).map((p) => p.id === j.plano.id ? j.plano : p));
      abrir(j.plano);
      setAba(j.plano.status === "EM_ANDAMENTO" ? "ABERTOS" : "ENCERRADOS");
      showToast("Plano salvo com sucesso.", "success");
    } catch (e) { setErro(e.message); } finally { setSalvando(false); }
  }

  const setIt = (i, k, v) => setItens((x) => x.map((it, j) => (j === i ? { ...it, [k]: v } : it)));
  const lista = (planos || []).filter((p) => (aba === "ABERTOS" ? p.status === "EM_ANDAMENTO" : p.status !== "EM_ANDAMENTO"));
  const doMes = (planos || []).find((p) => p.ano === ano && (mes == null ? p.mes == null : p.mes === mes));

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 overflow-y-auto" onClick={onFechar}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-6xl my-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3 px-5 py-4 border-b border-gray-100">
          <ClipboardList size={22} className="text-torg-blue mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-lg font-bold text-torg-dark">
              {ind.id ? `Plano de ação · ${ind.nome}` : `Planos de ação · ${ind.nome}`}
            </p>
            <p className="text-sm text-torg-gray">
              {ind.id ? (
                <>
                  {mes == null ? `Acumulado ${ano}` : `${MESES[mes]}/${ano}`}
                  {valor != null && ` · ${valor.toLocaleString("pt-BR")}${ind.meta?.unidade || ""} contra a meta de ${ind.meta?.valor}${ind.meta?.unidade || ""}`}
                </>
              ) : `Todos os planos deste setor em ${ano} — abra pelo cartão do indicador para criar um novo.`}
            </p>
          </div>
          <button onClick={onFechar} className="text-torg-gray hover:text-torg-dark"><X size={20} /></button>
        </div>

        {/* ── abas: em aberto × encerrados ── */}
        <div className="flex items-center gap-1 px-5 pt-3">
          {[["ABERTOS", "Em aberto"], ["ENCERRADOS", "Encerrados"]].map(([id, rot]) => (
            <button key={id} onClick={() => { setAba(id); setAberto(null); }}
              className={`text-sm font-semibold px-3.5 py-2 rounded-lg ${aba === id ? "bg-torg-blue text-white" : "text-torg-gray hover:bg-gray-100"}`}>
              {rot} {planos && `(${(planos || []).filter((p) => (id === "ABERTOS" ? p.status === "EM_ANDAMENTO" : p.status !== "EM_ANDAMENTO")).length})`}
            </button>
          ))}
          <div className="flex-1" />
          {/* ⚠ um plano por mês: se já existe, o botão leva a ele em vez de criar um segundo. */}
          {aba === "ABERTOS" && ind.id && (
            doMes
              ? <button onClick={() => abrir(doMes)} className="text-sm font-semibold text-torg-blue hover:underline">abrir o plano deste mês</button>
              : <button onClick={criar} disabled={salvando}
                  className="text-sm font-semibold text-white bg-torg-blue rounded-lg px-4 py-2 hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-1.5">
                  {salvando ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Novo plano para {mes == null ? ano : `${MESES[mes]}/${ano}`}
                </button>
          )}
        </div>

        <div className="px-5 py-4">
          {erro && <p className="text-sm text-red-600 mb-2 inline-flex items-start gap-1.5"><AlertCircle size={15} className="mt-0.5 shrink-0" /> {erro}</p>}
          {planos === null && <p className="text-sm text-torg-gray inline-flex items-center gap-2"><Loader2 size={15} className="animate-spin" /> carregando…</p>}

          {planos !== null && !aberto && (
            lista.length ? (
              <div className="space-y-1.5">
                {lista.map((p) => (
                  <button key={p.id} onClick={() => abrir(p)}
                    className="w-full text-left border border-gray-200 rounded-lg px-4 py-3 hover:border-torg-blue hover:bg-torg-blue-50/40">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-sm font-bold text-torg-blue">PA-{String(p.numero).padStart(3, "0")}</span>
                      <span className="text-base font-semibold text-torg-dark flex-1 truncate">{p.titulo}</span>
                      <span className="text-sm text-torg-gray">{p.concluidos}/{p.total} ações</span>
                      {p.atrasados > 0 && <span className="text-xs font-semibold text-red-700 bg-red-50 rounded px-1.5 py-0.5">{p.atrasados} atrasada(s)</span>}
                    </div>
                    {p.responsavel && <p className="text-sm text-torg-gray mt-0.5">{p.responsavel}</p>}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-torg-gray">
                {aba === "ABERTOS" ? "Nenhum plano em aberto para este indicador." : "Nenhum plano encerrado."}
              </p>
            )
          )}

          {/* ── o 5W2H ── */}
          {aberto && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 flex-wrap">
                <button onClick={() => setAberto(null)} className="text-sm text-torg-blue hover:underline">← voltar à lista</button>
                <span className="font-mono text-sm font-bold text-torg-blue">PA-{String(aberto.numero).padStart(3, "0")}</span>
                <span className="text-base font-semibold text-torg-dark flex-1 truncate">{aberto.titulo}</span>
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <label className="block">
                  <span className={rot}>Responsável pelo plano</span>
                  <input value={cab.responsavel} onChange={(e) => setCab((c) => ({ ...c, responsavel: e.target.value }))} className={inp} />
                </label>
                <label className="block">
                  <span className={rot}>Situação do plano</span>
                  <select value={cab.status} onChange={(e) => setCab((c) => ({ ...c, status: e.target.value }))} className={inp}>
                    <option value="EM_ANDAMENTO">Em andamento</option>
                    <option value="CONCLUIDO">Concluído</option>
                    <option value="CANCELADO">Cancelado</option>
                  </select>
                </label>
              </div>

              <div className="space-y-3">
                {itens.map((it, i) => {
                  const sit = situacaoItem({ ...it, quando: it.quando || null });
                  const c = SITUACAO_ITEM[sit] || STATUS_ITEM.A_FAZER;
                  return (
                    <div key={i} className="border border-gray-200 rounded-xl p-4 space-y-3 bg-gray-50/40">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-torg-dark">Ação {i + 1}</span>
                        <span className="text-xs font-semibold rounded px-2 py-0.5" style={{ color: c.cor, background: c.bg }}>{c.label}</span>
                        <div className="flex-1" />
                        <button onClick={() => setItens((x) => x.filter((_, j) => j !== i))} className="text-torg-gray-light hover:text-red-600" title="Remover ação"><Trash2 size={16} /></button>
                      </div>
                      <div className="grid sm:grid-cols-2 gap-3">
                        <Campo label="O quê" hint="What"><textarea value={it.oque} onChange={(e) => setIt(i, "oque", e.target.value)} rows={2} placeholder="O que será feito" className={inp} /></Campo>
                        <Campo label="Por quê" hint="Why"><textarea value={it.porque} onChange={(e) => setIt(i, "porque", e.target.value)} rows={2} placeholder="Por que fazer" className={inp} /></Campo>
                      </div>
                      <div className="grid sm:grid-cols-4 gap-3">
                        <Campo label="Onde" hint="Where"><input value={it.onde} onChange={(e) => setIt(i, "onde", e.target.value)} placeholder="Local / setor" className={inp} /></Campo>
                        <Campo label="Quem" hint="Who"><input value={it.quem} onChange={(e) => setIt(i, "quem", e.target.value)} placeholder="Responsável" className={inp} /></Campo>
                        <Campo label="Quando" hint="When"><input type="date" value={it.quando || ""} onChange={(e) => setIt(i, "quando", e.target.value)} className={inp} /></Campo>
                        <Campo label="Quanto" hint="How much"><input value={it.quanto} onChange={(e) => setIt(i, "quanto", e.target.value)} placeholder="Custo (R$)" className={inp} /></Campo>
                      </div>
                      <div className="grid sm:grid-cols-[2fr_1fr] gap-3">
                        <Campo label="Como" hint="How"><textarea value={it.como} onChange={(e) => setIt(i, "como", e.target.value)} rows={2} placeholder="Como será feito" className={inp} /></Campo>
                        <Campo label="Situação da ação"><select value={it.status} onChange={(e) => setIt(i, "status", e.target.value)} className={inp}>
                          {STATUS_ITEM_OPCOES.map((s) => <option key={s} value={s}>{STATUS_ITEM[s].label}</option>)}
                        </select></Campo>
                      </div>
                    </div>
                  );
                })}
                <button onClick={() => setItens((x) => [...x, novoItem()])}
                  className="text-sm font-semibold text-torg-blue hover:underline inline-flex items-center gap-1"><Plus size={14} /> Adicionar ação</button>
              </div>

              <div className="flex items-center gap-2">
                <button onClick={salvar} disabled={salvando}
                  className="text-sm font-semibold text-white bg-torg-blue rounded-lg px-4 py-2 hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-1.5">
                  {salvando ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Salvar plano
                </button>
                {/* O PDF usa os dados já salvos e exige acesso ao setor do indicador. */}
                {aberto?.id && (
                  <a href={`/api/qualidade/planos-acao/${aberto.id}/pdf`} target="_blank" rel="noopener noreferrer"
                    title="Abre o PDF do plano — só para quem tem login da Torg"
                    className="text-sm font-semibold text-torg-blue border border-torg-blue-200 rounded-lg px-4 py-2 hover:bg-torg-blue-50 inline-flex items-center gap-1.5">
                    <FileDown size={14} /> PDF do plano
                  </a>
                )}
                <span className="text-xs text-torg-gray">
                  Fica no painel deste setor — não entra na aba Planos de Ação da Qualidade.
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
