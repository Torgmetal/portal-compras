"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { NotebookPen, Plus, Loader2, AlertCircle, X, Trash2, Users, CheckCircle2, Clock, Sparkles } from "lucide-react";

const SETORES = ["COMERCIAL", "ENGENHARIA", "COMPRAS", "PRODUCAO", "PCP", "PLANEJAMENTO", "EXPEDICAO", "QUALIDADE", "ALMOXARIFADO", "FINANCEIRO", "RH", "DIRETORIA"];
const SETOR_LABEL = { COMERCIAL: "Comercial", ENGENHARIA: "Engenharia", COMPRAS: "Compras", PRODUCAO: "Produção", PCP: "PCP", PLANEJAMENTO: "Planejamento", EXPEDICAO: "Expedição", QUALIDADE: "Qualidade", ALMOXARIFADO: "Almoxarifado", FINANCEIRO: "Financeiro", RH: "RH", DIRETORIA: "Diretoria" };
const STATUS = { RASCUNHO: { l: "Rascunho", c: "bg-gray-100 text-gray-700" }, ENVIADA: { l: "Enviada", c: "bg-blue-100 text-blue-700" }, CONCLUIDA: { l: "Concluída", c: "bg-emerald-100 text-emerald-700" } };
const numAta = (n) => `ATA-${String(n).padStart(3, "0")}`;
const rev = (n) => `R${String(n).padStart(2, "0")}`;
const fmtD = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—");

export default function ReunioesClient() {
  const router = useRouter();
  const [atas, setAtas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [modal, setModal] = useState(false);

  const carregar = useCallback(() => {
    setLoading(true);
    fetch("/api/reunioes").then((r) => (r.ok ? r.json() : null)).then((j) => setAtas(j?.atas || [])).catch(() => setErro("Erro ao carregar")).finally(() => setLoading(false));
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-torg-dark tracking-tight flex items-center gap-2"><NotebookPen className="text-torg-blue" /> Atas de Reunião</h2>
          <p className="text-xs text-torg-gray mt-0.5">Ata semanal sequencial (padrão ISO com revisão) — envie aos envolvidos e acompanhe as respostas por setor.</p>
        </div>
        <button onClick={() => setModal(true)} className="px-4 py-2.5 bg-torg-blue text-white rounded-lg hover:bg-torg-blue-700 font-medium flex items-center gap-2"><Plus size={18} /> Nova ata</button>
      </div>

      {loading ? (
        <div className="py-16 text-center text-torg-gray"><Loader2 size={26} className="mx-auto animate-spin mb-2" /> Carregando…</div>
      ) : erro ? (
        <div className="py-10 text-center text-red-600 text-sm">{erro}</div>
      ) : atas.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
          <NotebookPen size={38} className="mx-auto text-gray-300 mb-3" />
          <p className="text-sm text-torg-gray">Nenhuma ata ainda. Crie a primeira ata da semana.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead className="bg-gray-50/60 text-torg-gray">
                <tr>
                  <th className="text-left px-3 py-2 font-medium whitespace-nowrap">Ata</th>
                  <th className="text-left px-3 py-2 font-medium whitespace-nowrap">Semana</th>
                  <th className="text-left px-3 py-2 font-medium">Título</th>
                  <th className="text-center px-3 py-2 font-medium whitespace-nowrap">Status</th>
                  <th className="text-center px-3 py-2 font-medium whitespace-nowrap">Confirmados</th>
                  <th className="text-center px-3 py-2 font-medium whitespace-nowrap">Atividades</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {atas.map((a) => (
                  <tr key={a.id} onClick={() => router.push(`/reunioes/${a.id}`)} className="hover:bg-torg-blue-50/40 cursor-pointer align-middle">
                    <td className="px-3 py-2 font-mono font-semibold text-torg-blue whitespace-nowrap">{numAta(a.numero)} <span className="text-torg-gray font-normal">{rev(a.revisao)}</span></td>
                    <td className="px-3 py-2 text-torg-gray whitespace-nowrap">S{a.semanaIso}/{a.ano}</td>
                    <td className="px-3 py-2 text-torg-dark max-w-[280px] truncate" title={a.titulo}>{a.titulo}</td>
                    <td className="px-3 py-2 text-center whitespace-nowrap"><span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${STATUS[a.status]?.c || "bg-gray-100"}`}>{STATUS[a.status]?.l || a.status}</span></td>
                    <td className="px-3 py-2 text-center text-torg-gray whitespace-nowrap">{a.status === "RASCUNHO" ? "—" : `${a.confirmados}/${a.totalEnvolvidos}`}</td>
                    <td className="px-3 py-2 text-center text-torg-gray whitespace-nowrap">{a.atividadesRespondidas}/{a.totalAtividades}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {modal && <ModalNovaAta onClose={() => setModal(false)} onCriada={(id) => router.push(`/reunioes/${id}`)} />}
    </div>
  );
}

function ModalNovaAta({ onClose, onCriada }) {
  const [titulo, setTitulo] = useState("");
  const [dataReuniao, setDataReuniao] = useState(new Date().toISOString().slice(0, 10));
  const [pauta, setPauta] = useState("");
  const [envolvidos, setEnvolvidos] = useState([{ nome: "", email: "", setor: "" }]);
  const [atividades, setAtividades] = useState([{ op: "", descricao: "", setor: "", responsavel: "", prazo: "" }]);
  const [rascunho, setRascunho] = useState("");
  const [organizando, setOrganizando] = useState(false);
  const [erroIA, setErroIA] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const setEnv = (i, k, v) => setEnvolvidos((p) => p.map((e, j) => (j === i ? { ...e, [k]: v } : e)));
  const setAtv = (i, k, v) => setAtividades((p) => p.map((a, j) => (j === i ? { ...a, [k]: v } : a)));

  async function organizar() {
    if (!rascunho.trim()) return;
    setOrganizando(true); setErroIA("");
    try {
      const r = await fetch("/api/reunioes/parse-rascunho", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rascunho, envolvidos: envolvidos.filter((e) => e.nome.trim() || e.email.trim()) }) });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error || "Erro ao organizar");
      const novas = (j.atividades || []).map((a) => ({ op: a.op || "", descricao: a.descricao || "", setor: a.setor || "", responsavel: a.responsavel || "", prazo: a.prazo || "" }));
      if (!novas.length) { setErroIA("A IA não encontrou atividades no rascunho."); return; }
      setAtividades((prev) => [...prev.filter((a) => a.descricao.trim()), ...novas]);
      setRascunho("");
    } catch (e) { setErroIA(e.message); } finally { setOrganizando(false); }
  }

  async function salvar() {
    setErro("");
    if (!titulo.trim()) return setErro("Informe o título da ata.");
    const envs = envolvidos.filter((e) => e.nome.trim() && e.email.trim());
    const atvs = atividades.filter((a) => a.descricao.trim());
    if (!envs.length) return setErro("Adicione ao menos um envolvido (nome + e-mail).");
    setSalvando(true);
    try {
      const r = await fetch("/api/reunioes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ titulo: titulo.trim(), dataReuniao, pauta: pauta.trim() || null, envolvidos: envs, atividades: atvs }) });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error || "Erro ao criar");
      onCriada(j.id);
    } catch (e) { setErro(e.message); setSalvando(false); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 overflow-y-auto" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl my-6">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white rounded-t-xl">
          <h3 className="text-sm font-semibold text-torg-dark">Nova ata de reunião</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-torg-dark mb-1">Título *</label>
              <input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: Reunião semanal de produção" className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2" />
            </div>
            <div>
              <label className="block text-xs font-medium text-torg-dark mb-1">Data</label>
              <input type="date" value={dataReuniao} onChange={(e) => setDataReuniao(e.target.value)} className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-torg-dark mb-1">Pauta / observações</label>
            <textarea value={pauta} onChange={(e) => setPauta(e.target.value)} rows={2} placeholder="Assuntos gerais da reunião (opcional)" className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2" />
          </div>

          <div>
            <label className="block text-xs font-semibold text-torg-dark mb-1.5">Envolvidos *</label>
            <div className="space-y-2">
              {envolvidos.map((e, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input value={e.nome} onChange={(ev) => setEnv(i, "nome", ev.target.value)} placeholder="Nome" className="flex-1 text-[12px] border border-gray-200 rounded px-2 py-1.5" />
                  <input value={e.email} onChange={(ev) => setEnv(i, "email", ev.target.value)} placeholder="e-mail" className="flex-1 text-[12px] border border-gray-200 rounded px-2 py-1.5" />
                  <select value={e.setor} onChange={(ev) => setEnv(i, "setor", ev.target.value)} className="text-[12px] border border-gray-200 rounded px-2 py-1.5 bg-white">
                    <option value="">Setor</option>
                    {SETORES.map((s) => <option key={s} value={s}>{SETOR_LABEL[s]}</option>)}
                  </select>
                  <button onClick={() => setEnvolvidos((p) => (p.length === 1 ? p : p.filter((_, j) => j !== i)))} className="text-gray-300 hover:text-red-500 p-1"><Trash2 size={13} /></button>
                </div>
              ))}
            </div>
            <button onClick={() => setEnvolvidos((p) => [...p, { nome: "", email: "", setor: "" }])} className="mt-1.5 text-[12px] text-torg-blue hover:text-torg-dark inline-flex items-center gap-1 font-medium"><Plus size={13} /> Adicionar envolvido</button>
          </div>

          <div>
            <label className="block text-xs font-semibold text-torg-dark mb-1.5">Atividades</label>

            {/* Rascunho → IA */}
            <div className="bg-torg-blue-50/50 border border-torg-blue-100 rounded-lg p-3 mb-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Sparkles size={14} className="text-torg-blue" />
                <span className="text-[12px] font-semibold text-torg-dark">Organizar rascunho com IA</span>
              </div>
              <p className="text-[11px] text-torg-gray mb-2">Cole o rascunho da reunião (texto livre). A IA separa as atividades, agrupa por OP e já traz o setor/responsável quando dá pra deduzir dos envolvidos — o que ela não souber fica em branco pra você completar.</p>
              <textarea value={rascunho} onChange={(e) => setRascunho(e.target.value)} rows={4} placeholder={"Ex.:\nOP 085 — engenharia precisa terminar o detalhamento das marcas até sexta\nComprar chapa A572 pra obra 112 (Matheus)\nAgendar carga da 067"} className="w-full text-[12px] border border-gray-200 rounded px-2 py-1.5 mb-2" />
              <div className="flex items-center gap-2">
                <button onClick={organizar} disabled={organizando || !rascunho.trim()} className="px-3 py-1.5 bg-torg-blue text-white text-[12px] rounded-lg hover:bg-torg-dark font-medium inline-flex items-center gap-1.5 disabled:opacity-50">{organizando ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />} Organizar com IA</button>
                {erroIA && <span className="text-[11px] text-red-600 flex items-center gap-1"><AlertCircle size={12} /> {erroIA}</span>}
              </div>
            </div>

            <div className="space-y-2">
              {atividades.map((a, i) => (
                <div key={i} className="flex items-start gap-1.5">
                  <input value={a.op || ""} onChange={(ev) => setAtv(i, "op", ev.target.value)} placeholder="OP" className="w-14 text-[12px] border border-gray-200 rounded px-2 py-1.5" title="OP" />
                  <input value={a.descricao} onChange={(ev) => setAtv(i, "descricao", ev.target.value)} placeholder="Descrição da atividade" className="flex-1 min-w-0 text-[12px] border border-gray-200 rounded px-2 py-1.5" />
                  <select value={a.setor || ""} onChange={(ev) => setAtv(i, "setor", ev.target.value)} className="w-28 text-[12px] border border-gray-200 rounded px-1.5 py-1.5 bg-white">
                    <option value="">Setor…</option>
                    {SETORES.map((s) => <option key={s} value={s}>{SETOR_LABEL[s]}</option>)}
                  </select>
                  <input value={a.responsavel || ""} onChange={(ev) => setAtv(i, "responsavel", ev.target.value)} placeholder="Resp." className="w-24 text-[12px] border border-gray-200 rounded px-2 py-1.5" title="Responsável" />
                  <input type="date" value={a.prazo || ""} onChange={(ev) => setAtv(i, "prazo", ev.target.value)} className="w-32 text-[12px] border border-gray-200 rounded px-1.5 py-1.5" title="Prazo" />
                  <button onClick={() => setAtividades((p) => (p.length === 1 ? p : p.filter((_, j) => j !== i)))} className="text-gray-300 hover:text-red-500 p-1 mt-1"><Trash2 size={13} /></button>
                </div>
              ))}
            </div>
            <button onClick={() => setAtividades((p) => [...p, { op: "", descricao: "", setor: "", responsavel: "", prazo: "" }])} className="mt-1.5 text-[12px] text-torg-blue hover:text-torg-dark inline-flex items-center gap-1 font-medium"><Plus size={13} /> Adicionar atividade</button>
          </div>

          {erro && <p className="text-[12px] text-red-600 flex items-center gap-1"><AlertCircle size={13} /> {erro}</p>}
        </div>
        <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex justify-end gap-2 rounded-b-xl">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-torg-gray border border-gray-300 rounded-lg hover:bg-gray-100">Cancelar</button>
          <button onClick={salvar} disabled={salvando} className="px-4 py-1.5 bg-torg-blue text-white text-sm rounded-lg hover:bg-torg-dark font-medium flex items-center gap-1.5 disabled:opacity-50">
            {salvando ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Criar ata
          </button>
        </div>
      </div>
    </div>
  );
}
