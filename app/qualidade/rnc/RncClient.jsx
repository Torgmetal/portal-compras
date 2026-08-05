"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { AlertOctagon, Plus, Loader2, X, AlertCircle, CheckCircle2, Building2, User } from "lucide-react";
import { numRNC, TIPOS_RNC, STATUS_RNC, statusRncLabel, diasParaPrazo } from "@/lib/nao-conformidade";

const fmtD = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—");

function PrazoBadge({ prazo, encerradaEm }) {
  const dias = diasParaPrazo(prazo, encerradaEm);
  if (dias == null) return <span className="text-torg-gray">—</span>;
  if (dias < 0) return <span className="text-[11px] font-semibold text-red-700 bg-red-50 rounded-full px-2 py-0.5">vencido {-dias}d</span>;
  if (dias <= 3) return <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 rounded-full px-2 py-0.5">vence em {dias}d</span>;
  return <span className="text-[11px] text-torg-gray">{fmtD(prazo)}</span>;
}

export default function RncClient() {
  const router = useRouter();
  const [aba, setAba] = useState("INTERNA");
  const [itens, setItens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [modal, setModal] = useState(false);

  const carregar = useCallback(() => {
    setLoading(true);
    fetch(`/api/qualidade/rnc?tipo=${aba}`).then((r) => (r.ok ? r.json() : null))
      .then((j) => setItens(j?.rncs || [])).catch(() => setErro("Erro ao carregar")).finally(() => setLoading(false));
  }, [aba]);
  useEffect(() => { carregar(); }, [carregar]);

  const StatusChip = ({ s }) => <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${STATUS_RNC[s]?.cor || "bg-gray-100 text-gray-600"}`}>{statusRncLabel(s)}</span>;

  return (
    <div className="space-y-5 max-w-6xl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-3xl font-extrabold text-torg-dark tracking-tight flex items-center gap-2.5"><AlertOctagon className="text-torg-blue" size={28} /> RNC — Não Conformidades</h2>
          <p className="text-sm text-torg-gray mt-1">Relatório de Não Conformidade (FORM 20). Internas e as recebidas de clientes.</p>
        </div>
        <button onClick={() => setModal(true)} className="px-4 py-2.5 bg-torg-blue text-white rounded-lg hover:bg-torg-dark font-medium flex items-center gap-2"><Plus size={18} /> Nova RNC {TIPOS_RNC[aba].curto.toLowerCase()}</button>
      </div>

      <div className="flex items-center gap-1 border-b border-gray-200">
        {[{ k: "INTERNA", l: "RNC Interna", icon: Building2 }, { k: "CLIENTE", l: "RNC de Cliente", icon: User }].map((t) => {
          const Icon = t.icon;
          return (
            <button key={t.k} onClick={() => setAba(t.k)}
              className={`px-4 py-2.5 text-sm font-medium inline-flex items-center gap-1.5 border-b-2 -mb-px transition-colors ${aba === t.k ? "border-torg-blue text-torg-blue" : "border-transparent text-torg-gray hover:text-torg-dark"}`}>
              <Icon size={15} /> {t.l}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="py-16 text-center text-torg-gray"><Loader2 size={26} className="mx-auto animate-spin mb-2" /> Carregando…</div>
      ) : erro ? (
        <div className="py-10 text-center text-red-600 text-sm">{erro}</div>
      ) : itens.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
          <AlertOctagon size={38} className="mx-auto text-gray-300 mb-3" />
          <p className="text-sm text-torg-gray">Nenhuma RNC {TIPOS_RNC[aba].curto.toLowerCase()} registrada.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead className="bg-gray-50/60 text-torg-gray">
                <tr>
                  <th className="text-left px-3 py-2 font-medium whitespace-nowrap">Nº</th>
                  <th className="text-left px-3 py-2 font-medium whitespace-nowrap">Data</th>
                  <th className="text-left px-3 py-2 font-medium">Cliente</th>
                  <th className="text-left px-3 py-2 font-medium whitespace-nowrap">OP</th>
                  <th className="text-left px-3 py-2 font-medium">Descrição</th>
                  <th className="text-left px-3 py-2 font-medium whitespace-nowrap">Prazo</th>
                  <th className="text-center px-3 py-2 font-medium whitespace-nowrap">Situação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {itens.map((r) => (
                  <tr key={r.id} onClick={() => router.push(`/qualidade/rnc/${r.id}`)} className="hover:bg-torg-blue-50/40 cursor-pointer">
                    <td className="px-3 py-2 font-mono font-semibold text-torg-blue whitespace-nowrap">{numRNC(r.numero, r.ano)}{r.numeroCliente ? <span className="text-[10px] text-torg-gray font-sans ml-1">({r.numeroCliente})</span> : ""}</td>
                    <td className="px-3 py-2 text-torg-dark whitespace-nowrap">{fmtD(r.data)}</td>
                    <td className="px-3 py-2 text-torg-dark">{r.cliente || "—"}</td>
                    <td className="px-3 py-2 text-torg-gray whitespace-nowrap">{r.opNumero || "—"}</td>
                    <td className="px-3 py-2 text-torg-gray max-w-[280px] truncate">{r.descricao || <span className="italic">sem descrição</span>}{r.recorrente && <span className="ml-1.5 text-[9px] font-bold text-amber-700 bg-amber-50 rounded px-1 py-0.5">recorrente</span>}</td>
                    <td className="px-3 py-2 whitespace-nowrap"><PrazoBadge prazo={r.prazoResposta} encerradaEm={r.encerradaEm} /></td>
                    <td className="px-3 py-2 text-center"><StatusChip s={r.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {modal && <ModalNova tipo={aba} onClose={() => setModal(false)} onCriada={(id) => router.push(`/qualidade/rnc/${id}`)} />}
    </div>
  );
}

function ModalNova({ tipo, onClose, onCriada }) {
  const cliente = tipo === "CLIENTE";
  const [f, setF] = useState({ data: new Date().toISOString().slice(0, 10), cliente: "", opNumero: "", descricao: "", prazoResposta: "", numeroCliente: "", programa: "", jobCliente: "" });
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  async function salvar() {
    setErro("");
    if (cliente && !f.cliente.trim()) return setErro("Informe o cliente.");
    if (!f.descricao.trim()) return setErro("Descreva a não conformidade.");
    setSalvando(true);
    try {
      const r = await fetch("/api/qualidade/rnc", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tipo, ...f }) });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error || "Erro ao criar");
      onCriada(j.id);
    } catch (e) { setErro(e.message); setSalvando(false); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 overflow-y-auto" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-xl my-6">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-torg-dark">Nova {TIPOS_RNC[tipo].label}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="px-5 py-4 space-y-3">
          {cliente && <p className="text-[12px] text-torg-gray bg-torg-blue-50/60 rounded-lg px-3 py-2">Cadastre o registro com o prazo. Em seguida, na tela da RNC, você anexa o documento do cliente e a IA converte tudo (descrição, causa, plano de ação e resposta).</p>}
          <div className="grid grid-cols-2 gap-3">
            <Campo label={cliente ? "Cliente *" : "Cliente"}><input value={f.cliente} onChange={(e) => set("cliente", e.target.value)} className="inp" /></Campo>
            <Campo label="OP / Obra"><input value={f.opNumero} onChange={(e) => set("opNumero", e.target.value)} placeholder="T69" className="inp" /></Campo>
            <Campo label="Data"><input type="date" value={f.data} onChange={(e) => set("data", e.target.value)} className="inp" /></Campo>
            <Campo label="Prazo para resposta"><input type="date" value={f.prazoResposta} onChange={(e) => set("prazoResposta", e.target.value)} className="inp" /></Campo>
            {cliente && <>
              <Campo label="Nº da RNC do cliente"><input value={f.numeroCliente} onChange={(e) => set("numeroCliente", e.target.value)} placeholder="RTNC-010" className="inp" /></Campo>
              <Campo label="Programa"><input value={f.programa} onChange={(e) => set("programa", e.target.value)} placeholder="ASME" className="inp" /></Campo>
            </>}
          </div>
          <Campo label="Descrição da não conformidade *"><textarea value={f.descricao} onChange={(e) => set("descricao", e.target.value)} rows={3} className="inp" placeholder={cliente ? "Pode deixar em branco — a IA preenche do anexo depois." : "O que foi constatado"} /></Campo>
          {erro && <p className="text-[12px] text-red-600 flex items-center gap-1"><AlertCircle size={13} /> {erro}</p>}
        </div>
        <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex justify-end gap-2 rounded-b-xl">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-torg-gray border border-gray-300 rounded-lg hover:bg-gray-100">Cancelar</button>
          <button onClick={salvar} disabled={salvando} className="px-4 py-1.5 bg-torg-blue text-white text-sm rounded-lg hover:bg-torg-dark font-medium flex items-center gap-1.5 disabled:opacity-50">{salvando ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Criar</button>
        </div>
      </div>
      <style jsx>{`.inp{width:100%;font-size:13px;border:1px solid #d1d5db;border-radius:8px;padding:8px 12px}`}</style>
    </div>
  );
}
function Campo({ label, children }) {
  return <div><label className="block text-xs font-medium text-torg-dark mb-1">{label}</label>{children}</div>;
}
