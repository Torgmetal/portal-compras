"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import { Ruler, Plus, Loader2, X, AlertCircle, CheckCircle2, Search, FileText, Image as ImageIcon, Paperclip, Upload } from "lucide-react";
import { numRAC, CONCLUSAO, conclusaoLabel } from "@/lib/calibracao";

const fmtD = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—");

export default function CalibracaoClient() {
  const router = useRouter();
  const [itens, setItens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState("TODOS");
  const [modal, setModal] = useState(false);

  const carregar = useCallback(() => {
    setLoading(true);
    fetch("/api/qualidade/calibracao").then((r) => (r.ok ? r.json() : null))
      .then((j) => setItens(j?.itens || [])).catch(() => setErro("Erro ao carregar")).finally(() => setLoading(false));
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const dados = itens.filter((d) => {
    if (filtro !== "TODOS" && d.conclusao !== filtro) return false;
    if (busca.trim()) { const q = busca.toLowerCase(); return [d.nome, d.numeroDocumento, d.norma].some((v) => (v || "").toLowerCase().includes(q)); }
    return true;
  });

  const cont = { PENDENTE: itens.filter((d) => d.conclusao === "PENDENTE").length, APROVADO: itens.filter((d) => d.conclusao === "APROVADO").length, REPROVADO: itens.filter((d) => d.conclusao === "REPROVADO").length };
  const Chip = ({ s }) => <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${CONCLUSAO[s]?.cor || "bg-gray-100 text-gray-600"}`}>{conclusaoLabel(s)}</span>;

  return (
    <div className="space-y-5 max-w-6xl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-extrabold text-torg-dark tracking-tight flex items-center gap-2"><Ruler className="text-torg-blue" /> Calibração</h1>
          <p className="text-xs text-torg-gray mt-0.5">Avalie os certificados de calibração dos equipamentos (PO-20) e emita o relatório de avaliação (aprovado/reprovado).</p>
        </div>
        <button onClick={() => setModal(true)} className="px-4 py-2.5 bg-torg-blue text-white rounded-lg hover:bg-torg-dark font-medium flex items-center gap-2"><Plus size={18} /> Novo certificado</button>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar equipamento, nº do certificado, norma…" className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg" />
        </div>
        {[{ k: "TODOS", l: `Todos (${itens.length})` }, { k: "PENDENTE", l: `Pendentes (${cont.PENDENTE})` }, { k: "APROVADO", l: `Aprovados (${cont.APROVADO})` }, { k: "REPROVADO", l: `Reprovados (${cont.REPROVADO})` }].map((f) => (
          <button key={f.k} onClick={() => setFiltro(f.k)} className={`px-3 py-2 text-xs font-medium rounded-lg border ${filtro === f.k ? "bg-torg-blue text-white border-torg-blue" : "bg-white text-torg-gray border-gray-300 hover:bg-gray-50"}`}>{f.l}</button>
        ))}
      </div>

      {loading ? (
        <div className="py-16 text-center text-torg-gray"><Loader2 size={26} className="mx-auto animate-spin mb-2" /> Carregando…</div>
      ) : erro ? (
        <div className="py-10 text-center text-red-600 text-sm">{erro}</div>
      ) : dados.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
          <Ruler size={38} className="mx-auto text-gray-300 mb-3" />
          <p className="text-sm text-torg-gray">{itens.length === 0 ? "Nenhum certificado de calibração ainda. Cadastre o primeiro ou importe pelos Equipamentos no Controle de Documentos." : "Nenhum resultado para o filtro."}</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead className="bg-gray-50/60 text-torg-gray">
                <tr>
                  <th className="text-left px-3 py-2 font-medium whitespace-nowrap">Nº</th>
                  <th className="text-left px-3 py-2 font-medium">Equipamento</th>
                  <th className="text-left px-3 py-2 font-medium whitespace-nowrap">Nº certificado</th>
                  <th className="text-left px-3 py-2 font-medium whitespace-nowrap">Emissão</th>
                  <th className="text-left px-3 py-2 font-medium whitespace-nowrap">Validade</th>
                  <th className="text-center px-3 py-2 font-medium whitespace-nowrap">Anexos</th>
                  <th className="text-center px-3 py-2 font-medium whitespace-nowrap">Situação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {dados.map((d) => (
                  <tr key={d.id} onClick={() => router.push(`/qualidade/calibracao/${d.id}`)} className="hover:bg-torg-blue-50/40 cursor-pointer">
                    <td className="px-3 py-2 font-mono font-semibold text-torg-blue whitespace-nowrap">{d.numero ? numRAC(d.numero) : "—"}</td>
                    <td className="px-3 py-2 text-torg-dark font-medium">{d.nome}{d.norma ? <span className="block text-[10px] text-torg-gray font-normal">{d.norma}</span> : null}</td>
                    <td className="px-3 py-2 text-torg-gray whitespace-nowrap">{d.numeroDocumento || "—"}</td>
                    <td className="px-3 py-2 text-torg-gray whitespace-nowrap">{fmtD(d.dataEmissao)}</td>
                    <td className="px-3 py-2 text-torg-gray whitespace-nowrap">{d.dataValidade ? fmtD(d.dataValidade) : <span className="text-gray-400">sem validade</span>}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-center gap-1.5">
                        <ImageIcon size={14} className={d.temFoto ? "text-emerald-600" : "text-gray-300"} title="Foto do equipamento" />
                        <FileText size={14} className={d.temRelatorio ? "text-emerald-600" : "text-gray-300"} title="Relatório" />
                      </div>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <Chip s={d.conclusao} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {modal && <ModalNovo onClose={() => setModal(false)} onCriado={(id) => router.push(`/qualidade/calibracao/${id}`)} />}
    </div>
  );
}

const inp = "w-full text-sm border border-gray-300 rounded-lg px-3 py-2";
function Campo({ label, children }) { return <div><label className="block text-xs font-medium text-torg-dark mb-1">{label}</label>{children}</div>; }

function CampoArquivo({ label, accept, hint, arquivo, onPick, onClear, enviando }) {
  return (
    <div>
      <label className="block text-xs font-medium text-torg-dark mb-1">{label}</label>
      {arquivo ? (
        <div className="flex items-center gap-2 text-sm border border-emerald-200 bg-emerald-50 rounded-lg px-3 py-2">
          <Paperclip size={14} className="text-emerald-600 shrink-0" />
          <span className="truncate text-torg-dark flex-1">{arquivo.nome}</span>
          <button type="button" onClick={onClear} className="text-gray-400 hover:text-red-500"><X size={15} /></button>
        </div>
      ) : (
        <label className={`flex items-center gap-2 text-sm border border-dashed border-gray-300 rounded-lg px-3 py-2 cursor-pointer hover:border-torg-blue ${enviando ? "opacity-60 pointer-events-none" : ""}`}>
          {enviando ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} className="text-torg-gray" />}
          <span className="text-torg-gray">{enviando ? "Enviando…" : hint || "Selecionar arquivo"}</span>
          <input type="file" accept={accept} className="hidden" onChange={(e) => e.target.files?.[0] && onPick(e.target.files[0])} />
        </label>
      )}
    </div>
  );
}

function ModalNovo({ onClose, onCriado }) {
  const [f, setF] = useState({ nome: "", numeroDocumento: "", laboratorio: "", identificacao: "", faixaUso: "", norma: "", dataEmissao: "", dataValidade: "" });
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const [cert, setCert] = useState(null);
  const [foto, setFoto] = useState(null);
  const [rel, setRel] = useState(null);
  const [enviando, setEnviando] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  async function subir(file, prefixo, setter) {
    setErro(""); setEnviando(prefixo);
    try {
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const blob = await upload(`qualidade-calibracao/${prefixo}/${Date.now()}-${safe}`, file, { access: "public", handleUploadUrl: "/api/qualidade/documentos/upload-token" });
      setter({ url: blob.url, nome: file.name, tamanho: file.size, tipo: file.type || "application/octet-stream" });
    } catch (e) { setErro("Falha no upload: " + (e.message || "erro")); } finally { setEnviando(""); }
  }

  async function salvar() {
    setErro("");
    if (!f.nome.trim()) return setErro("Informe o equipamento.");
    if (!cert) return setErro("Anexe o certificado de calibração.");
    setSalvando(true);
    try {
      const r = await fetch("/api/qualidade/calibracao", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...f, certificado: cert, fotoEquipamento: foto, relatorio: rel }),
      });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error || "Erro ao cadastrar");
      onCriado(j.id);
    } catch (e) { setErro(e.message); setSalvando(false); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 overflow-y-auto" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl my-6">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-torg-dark">Novo certificado de calibração</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2"><Campo label="Equipamento *"><input value={f.nome} onChange={(e) => set("nome", e.target.value)} placeholder="Ex.: Paquímetro Digital 0-300mm Mitutoyo" className={inp} /></Campo></div>
            <Campo label="Identificação (tag / nº série)"><input value={f.identificacao} onChange={(e) => set("identificacao", e.target.value)} placeholder="PAQ-07 / série 9241155" className={inp} /></Campo>
            <Campo label="Faixa de uso"><input value={f.faixaUso} onChange={(e) => set("faixaUso", e.target.value)} placeholder="0 a 300 mm" className={inp} /></Campo>
            <Campo label="Laboratório"><input value={f.laboratorio} onChange={(e) => set("laboratorio", e.target.value)} placeholder="Laboratório acreditado (RBC)" className={inp} /></Campo>
            <Campo label="Nº do certificado"><input value={f.numeroDocumento} onChange={(e) => set("numeroDocumento", e.target.value)} placeholder="CAL-2026-0472" className={inp} /></Campo>
            <Campo label="Data de calibração"><input type="date" value={f.dataEmissao} onChange={(e) => set("dataEmissao", e.target.value)} className={inp} /></Campo>
            <Campo label="Validade"><input type="date" value={f.dataValidade} onChange={(e) => set("dataValidade", e.target.value)} className={inp} /></Campo>
            <div className="sm:col-span-2"><Campo label="Norma / referência"><input value={f.norma} onChange={(e) => set("norma", e.target.value)} placeholder="ISO/IEC 17025 · NBR ISO 10012" className={inp} /></Campo></div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1 border-t border-gray-100">
            <CampoArquivo label="Certificado (PDF) *" accept="application/pdf" hint="PDF do certificado" arquivo={cert} enviando={enviando === "certificado"} onPick={(file) => subir(file, "certificado", setCert)} onClear={() => setCert(null)} />
            <CampoArquivo label="Foto do equipamento" accept="image/*" hint="Foto (JPG/PNG)" arquivo={foto} enviando={enviando === "foto"} onPick={(file) => subir(file, "foto", setFoto)} onClear={() => setFoto(null)} />
            <CampoArquivo label="Relatório" accept="application/pdf,image/*" hint="Relatório" arquivo={rel} enviando={enviando === "relatorio"} onPick={(file) => subir(file, "relatorio", setRel)} onClear={() => setRel(null)} />
          </div>
          <p className="text-[11px] text-torg-gray">Foto e relatório são opcionais — podem ser anexados agora ou depois como evidência.</p>
          {erro && <p className="text-[12px] text-red-600 flex items-center gap-1"><AlertCircle size={13} /> {erro}</p>}
        </div>
        <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex justify-end gap-2 rounded-b-xl">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-torg-gray border border-gray-300 rounded-lg hover:bg-gray-100">Cancelar</button>
          <button onClick={salvar} disabled={salvando || !!enviando} className="px-4 py-1.5 bg-torg-blue text-white text-sm rounded-lg hover:bg-torg-dark font-medium flex items-center gap-1.5 disabled:opacity-50">{salvando ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Cadastrar</button>
        </div>
      </div>
    </div>
  );
}
