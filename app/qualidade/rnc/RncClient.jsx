"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertOctagon, Plus, Loader2, X, AlertCircle, CheckCircle2, Building2, User, Upload, FileSpreadsheet, ListChecks } from "lucide-react";
import { numRNC, STATUS_RNC, statusRncLabel, diasParaPrazo } from "@/lib/nao-conformidade";
import PlanosAcaoLista from "../auditorias-internas/PlanosAcaoLista";

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
  const searchParams = useSearchParams();
  const abaUrl = searchParams.get("aba");
  const [aba, setAba] = useState(["INTERNA", "PLANOS"].includes(abaUrl) ? abaUrl : "INTERNA");
  const [itens, setItens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [modal, setModal] = useState(false);
  const [modalImport, setModalImport] = useState(false);

  const carregar = useCallback(() => {
    if (aba === "PLANOS") { setLoading(false); return; } // aba renderiza o componente de planos
    setLoading(true);
    fetch(`/api/qualidade/rnc`).then((r) => (r.ok ? r.json() : null)) // lista todas (internas + de cliente)
      .then((j) => setItens(j?.rncs || [])).catch(() => setErro("Erro ao carregar")).finally(() => setLoading(false));
  }, [aba]);
  useEffect(() => { carregar(); }, [carregar]);

  const StatusChip = ({ s }) => <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${STATUS_RNC[s]?.cor || "bg-gray-100 text-gray-600"}`}>{statusRncLabel(s)}</span>;

  return (
    <div className="space-y-5 max-w-6xl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-3xl font-extrabold text-torg-dark tracking-tight flex items-center gap-2.5"><AlertOctagon className="text-torg-blue" size={28} /> RNC — Não Conformidades</h2>
          <p className="text-sm text-torg-gray mt-1">Relatório de Não Conformidade (FORM 20).</p>
        </div>
        {aba !== "PLANOS" && (
          <div className="flex items-center gap-2">
            <button onClick={() => setModalImport(true)} className="px-3.5 py-2.5 border border-gray-300 text-torg-dark rounded-lg hover:bg-gray-50 font-medium flex items-center gap-2"><Upload size={17} /> Importar</button>
            <button onClick={() => setModal(true)} className="px-4 py-2.5 bg-torg-blue text-white rounded-lg hover:bg-torg-dark font-medium flex items-center gap-2"><Plus size={18} /> Nova RNC</button>
          </div>
        )}
      </div>

      <div className="flex items-center gap-1 border-b border-gray-200">
        {[{ k: "INTERNA", l: "RNC", icon: Building2 }, { k: "PLANOS", l: "Plano de Ação", icon: ListChecks }].map((t) => {
          const Icon = t.icon;
          return (
            <button key={t.k} onClick={() => setAba(t.k)}
              className={`px-4 py-2.5 text-sm font-medium inline-flex items-center gap-1.5 border-b-2 -mb-px transition-colors ${aba === t.k ? "border-torg-blue text-torg-blue" : "border-transparent text-torg-gray hover:text-torg-dark"}`}>
              <Icon size={15} /> {t.l}
            </button>
          );
        })}
      </div>

      {aba === "PLANOS" ? (
        <PlanosAcaoLista fonte="rnc" />
      ) : loading ? (
        <div className="py-16 text-center text-torg-gray"><Loader2 size={26} className="mx-auto animate-spin mb-2" /> Carregando…</div>
      ) : erro ? (
        <div className="py-10 text-center text-red-600 text-sm">{erro}</div>
      ) : itens.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
          <AlertOctagon size={38} className="mx-auto text-gray-300 mb-3" />
          <p className="text-sm text-torg-gray">Nenhuma RNC registrada.</p>
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
                    <td className="px-3 py-2 font-mono font-semibold text-torg-blue whitespace-nowrap">{numRNC(r.numero, r.ano)}<span className={`ml-1.5 text-[9px] font-sans font-bold rounded px-1 py-0.5 align-middle ${r.tipo === "CLIENTE" ? "text-torg-blue bg-torg-blue-50" : "text-gray-500 bg-gray-100"}`}>{r.tipo === "CLIENTE" ? "cliente" : "interna"}</span></td>
                    <td className="px-3 py-2 text-torg-dark whitespace-nowrap">{fmtD(r.data)}</td>
                    <td className="px-3 py-2 text-torg-dark">{r.cliente || "—"}</td>
                    <td className="px-3 py-2 text-torg-gray whitespace-nowrap">{r.opNumero ? r.opNumero.replace(/^[Tt]\s*/, "") : "—"}</td>
                    <td className="px-3 py-2 text-torg-gray max-w-[280px] truncate">{r.descricao || <span className="italic">sem descrição</span>}{r.tipo === "CLIENTE" && r.pertinente === false && <span className="ml-1.5 text-[9px] font-bold text-gray-600 bg-gray-100 rounded px-1 py-0.5">improcedente</span>}{r.recorrente && <span className="ml-1.5 text-[9px] font-bold text-amber-700 bg-amber-50 rounded px-1 py-0.5">recorrente</span>}</td>
                    <td className="px-3 py-2 whitespace-nowrap"><PrazoBadge prazo={r.prazoResposta} encerradaEm={r.encerradaEm} /></td>
                    <td className="px-3 py-2 text-center"><StatusChip s={r.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {modal && <ModalNova onClose={() => setModal(false)} onCriada={(id) => router.push(`/qualidade/rnc/${id}`)} />}
      {modalImport && <ModalImportar onClose={() => setModalImport(false)} onFim={carregar} />}
    </div>
  );
}

// Importador do FORM 20 (.xls) — parse no navegador (os .xls têm fotos pesadas; só o
// JSON pequeno sobe). Cria a RNC com o número original, o plano e o encerramento.
function ModalImportar({ onClose, onFim }) {
  const [files, setFiles] = useState([]);
  const [enviando, setEnviando] = useState(false);
  const [res, setRes] = useState(null);
  const [erro, setErro] = useState("");

  async function importar() {
    if (!files.length) return setErro("Selecione os arquivos .xls das RNCs.");
    setErro(""); setEnviando(true);
    try {
      const { parseRncForm20 } = await import("@/lib/parse-rnc-form20");
      const registros = [], errosParse = [];
      for (const f of files) {
        try { registros.push({ ...parseRncForm20(await f.arrayBuffer()), arquivo: f.name }); }
        catch { errosParse.push({ arquivo: f.name, resultado: "erro", erro: "não consegui ler o arquivo" }); }
      }
      let j = { criadas: 0, jaExistem: 0, erros: 0, resultados: [] };
      if (registros.length) {
        const r = await fetch("/api/qualidade/rnc/importar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ registros }) });
        j = await r.json();
        if (!r.ok || !j.success) throw new Error(j.error || "Falha na importação");
      }
      setRes({ ...j, erros: (j.erros || 0) + errosParse.length, total: files.length, resultados: [...(j.resultados || []), ...errosParse] });
      onFim();
    } catch (e) { setErro(e.message); } finally { setEnviando(false); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 overflow-y-auto" onClick={(e) => e.target === e.currentTarget && !enviando && onClose()}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg my-6">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-torg-dark flex items-center gap-2"><Upload size={15} className="text-torg-blue" /> Importar RNCs (FORM 20)</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        {res ? (
          <div className="px-5 py-4 space-y-3">
            <div className="flex gap-2.5">
              <span className="flex-1 text-center bg-emerald-50 text-emerald-700 rounded-lg py-2"><b className="text-lg block">{res.criadas}</b><span className="text-[11px] uppercase tracking-wide">importadas</span></span>
              <span className="flex-1 text-center bg-gray-100 text-gray-600 rounded-lg py-2"><b className="text-lg block">{res.jaExistem}</b><span className="text-[11px] uppercase tracking-wide">já existiam</span></span>
              {res.erros > 0 && <span className="flex-1 text-center bg-red-50 text-red-700 rounded-lg py-2"><b className="text-lg block">{res.erros}</b><span className="text-[11px] uppercase tracking-wide">com erro</span></span>}
            </div>
            <div className="max-h-64 overflow-y-auto divide-y divide-gray-50 text-[12px]">
              {res.resultados.map((r, i) => (
                <div key={i} className="py-1.5 flex items-center justify-between gap-2">
                  <span className="text-torg-gray truncate">{r.arquivo}</span>
                  {r.resultado === "criada" ? <span className="text-emerald-700 font-semibold whitespace-nowrap">✓ RNC-{String(r.numero).padStart(3, "0")}/{String(r.ano).slice(-2)}</span>
                    : r.resultado === "ja_existe" ? <span className="text-gray-400 whitespace-nowrap">já existe</span>
                      : <span className="text-red-600 whitespace-nowrap" title={r.erro}>erro</span>}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="px-5 py-4 space-y-3">
            <p className="text-[12px] text-torg-gray">Selecione os arquivos <b>.xls</b> das RNCs (o FORM 20 da Torg). O portal lê cada documento e cria a RNC com o número original, o plano de ação e o encerramento. As que já existem são puladas.</p>
            <label className={`border-2 border-dashed border-gray-300 rounded-xl p-6 flex flex-col items-center justify-center gap-2 hover:border-torg-blue hover:bg-torg-blue-50/30 ${enviando ? "opacity-60 pointer-events-none" : "cursor-pointer"}`}>
              <FileSpreadsheet size={26} className="text-torg-gray" />
              <span className="text-[13px] text-torg-dark font-medium">{files.length ? `${files.length} arquivo(s) selecionado(s)` : "Clique para selecionar os .xls"}</span>
              <input type="file" accept=".xls,.xlsx" multiple disabled={enviando} className="hidden" onChange={(e) => { setFiles(Array.from(e.target.files || [])); setErro(""); }} />
            </label>
            {erro && <p className="text-[12px] text-red-600 flex items-center gap-1"><AlertCircle size={13} /> {erro}</p>}
          </div>
        )}
        <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex justify-end gap-2 rounded-b-xl">
          {res ? (
            <button onClick={onClose} className="px-4 py-1.5 bg-torg-blue text-white text-sm rounded-lg hover:bg-torg-dark font-medium">Concluir</button>
          ) : (
            <>
              <button onClick={onClose} disabled={enviando} className="px-3 py-1.5 text-sm text-torg-gray border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-50">Cancelar</button>
              <button onClick={importar} disabled={enviando || !files.length} className="px-4 py-1.5 bg-torg-blue text-white text-sm rounded-lg hover:bg-torg-dark font-medium flex items-center gap-1.5 disabled:opacity-50">{enviando ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} Importar {files.length || ""}</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ModalNova({ onClose, onCriada }) {
  const [tipo, setTipo] = useState("INTERNA");
  const cliente = tipo === "CLIENTE";
  const [f, setF] = useState({ data: new Date().toISOString().slice(0, 10), cliente: "", opNumero: "", descricao: "", prazoResposta: "", numeroCliente: "", programa: "" });
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  async function salvar() {
    setErro("");
    if (cliente && !f.cliente.trim()) return setErro("Informe o cliente.");
    if (!cliente && !f.descricao.trim()) return setErro("Descreva a não conformidade.");
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
          <h3 className="text-sm font-semibold text-torg-dark">Nova RNC</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-torg-dark mb-1.5">Tipo</label>
            <div className="grid grid-cols-2 gap-2">
              {[{ k: "INTERNA", l: "Interna", icon: Building2, d: "Detectada pela Torg" }, { k: "CLIENTE", l: "De cliente", icon: User, d: "Recebida de um cliente" }].map((t) => {
                const Icon = t.icon; const on = tipo === t.k;
                return (
                  <button key={t.k} type="button" onClick={() => setTipo(t.k)}
                    className={`text-left rounded-lg border px-3 py-2.5 transition-colors ${on ? "border-torg-blue bg-torg-blue-50/50 ring-1 ring-torg-blue" : "border-gray-200 hover:border-gray-300"}`}>
                    <div className={`flex items-center gap-1.5 text-sm font-semibold ${on ? "text-torg-blue" : "text-torg-dark"}`}><Icon size={15} /> {t.l}</div>
                    <p className="text-[11px] text-torg-gray mt-0.5">{t.d}</p>
                  </button>
                );
              })}
            </div>
          </div>
          {cliente && <p className="text-[12px] text-torg-gray bg-torg-blue-50/60 rounded-lg px-3 py-2">Cadastre o registro. Na tela da RNC você define a <b>procedência</b> (procedente/improcedente), anexa o PDF/imagens do cliente e — se procedente — monta a análise de causa e o plano de ação.</p>}
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
          <Campo label={cliente ? "Descrição da não conformidade" : "Descrição da não conformidade *"}><textarea value={f.descricao} onChange={(e) => set("descricao", e.target.value)} rows={3} className="inp" placeholder={cliente ? "Pode deixar em branco — anexe o PDF na tela da RNC e a IA preenche." : "O que foi constatado"} /></Campo>
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
