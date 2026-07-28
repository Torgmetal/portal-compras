"use client";
import { useState, useRef, useEffect } from "react";
import { Upload, Loader2, CheckCircle2, AlertCircle, ListChecks, FileSpreadsheet, Info, Send } from "lucide-react";

const fmt = (n) => Number(n || 0).toLocaleString("pt-BR");

// base64 em chunks (spread de array grande estoura a pilha)
function bufToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  return btoa(bin);
}

// Lê a resposta como JSON; se vier HTML (timeout/413/500), mostra o motivo real
// em vez do críptico "Unexpected token < in JSON".
async function lerResposta(r) {
  const txt = await r.text();
  try { return JSON.parse(txt); }
  catch {
    const dica = r.status === 413 ? " — arquivo/lista grande demais pro envio"
      : (r.status === 504 || r.status === 502) ? " — o servidor demorou demais (lista grande); tente de novo"
      : r.status >= 500 ? " — erro no servidor"
      : "";
    throw new Error(`O servidor não respondeu em JSON (HTTP ${r.status}${dica}).`);
  }
}

function CardImport({ titulo, sigla, desc, endpoint, cor, destinatarios = [], ops = [] }) {
  const [op, setOp] = useState("");
  const [sobrescrever, setSobrescrever] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [res, setRes] = useState(null);
  const [erro, setErro] = useState("");
  const [servidor, setServidor] = useState(null); // { estado:"salvando"|"ok"|"erro", ... }
  const [sel, setSel] = useState(() => new Set()); // destinatários do aviso de revisão
  const [enviandoAviso, setEnviandoAviso] = useState(false);
  const [avisoRes, setAvisoRes] = useState(null);
  const [avisoErro, setAvisoErro] = useState("");
  const [revArquivo, setRevArquivo] = useState(null); // { num: number|null } — revisão lida do nome
  const [mudancas, setMudancas] = useState("");
  const inputRef = useRef(null);

  const revLabel = revArquivo && revArquivo.num != null ? "R" + String(revArquivo.num).padStart(2, "0") : null;

  async function importar(file) {
    if (!file) return;
    setCarregando(true); setErro(""); setRes(null); setServidor(null); setAvisoRes(null); setSel(new Set()); setAvisoErro(""); setMudancas("");
    // Lê o número da revisão do NOME do arquivo (R1/R01/R2/R02…). Avisa se não achar.
    const mRev = (file.name || "").match(/(?:^|[\s._-])r0*(\d{1,3})(?=[\s._-]|\.[a-z0-9]+$|$)/i);
    setRevArquivo({ num: mRev ? parseInt(mRev[1], 10) : null });
    try {
      const XLSX = await import("xlsx");
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array", cellDates: true });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, blankrows: false });
      const r = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows, opNumero: op.trim() || null, sobrescrever }),
      });
      const j = await lerResposta(r);
      if (!r.ok) throw new Error(j.error || "Erro ao importar");
      setRes(j);

      // Salva o arquivo no servidor (SharePoint), na pasta da OP importada.
      const opFinal = j.opNumero || op.trim();
      if (opFinal) {
        setServidor({ estado: "salvando" });
        try {
          const b64 = bufToBase64(buffer);
          const sr = await fetch("/api/engenharia/listas/servidor", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tipo: sigla, opNumero: String(opFinal), fileNome: file.name, fileBase64: b64 }),
          });
          const sj = await lerResposta(sr);
          if (!sr.ok) throw new Error(sj.error || "Falha ao salvar no servidor");
          setServidor({ estado: "ok", ...sj });
        } catch (e2) {
          setServidor({ estado: "erro", erro: e2.message });
        }
      }
    } catch (e) {
      setErro(e.message);
    } finally {
      setCarregando(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  // R00 = lista NOVA da OP (aviso calmo, "importada"); R01+ = revisão (alerta de
  // obsoleto). Sem nº de revisão no nome, cai no heurístico "a OP já tinha a lista".
  const ehRevisao = revArquivo && revArquivo.num != null
    ? revArquivo.num >= 1
    : !!(res && Number(res.atualizados) > 0);

  // Na revisão, já vem todos os destinatários marcados (Vitor: "deixe todos,
  // porém deixar pra selecionar").
  useEffect(() => {
    if (ehRevisao && destinatarios.length && sel.size === 0 && !avisoRes) {
      setSel(new Set(destinatarios.map((d) => d.email)));
    }
  }, [ehRevisao, destinatarios]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleSel = (email) =>
    setSel((s) => { const n = new Set(s); n.has(email) ? n.delete(email) : n.add(email); return n; });

  async function enviarAviso() {
    if (sel.size === 0) { setAvisoErro("Selecione ao menos um destinatário."); return; }
    setEnviandoAviso(true); setAvisoErro("");
    try {
      const r = await fetch("/api/engenharia/listas/avisar-revisao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo: sigla, opNumero: String(res.opNumero || op.trim()), obra: res.obra || null, revisao: revLabel, ehRevisao: !!ehRevisao, mudancas: mudancas.trim() || null, destinatarios: [...sel] }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Falha ao enviar");
      setAvisoRes({ enviados: j.enviados });
    } catch (e) {
      setAvisoErro(e.message);
    } finally {
      setEnviandoAviso(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-start gap-3">
        <span className={`flex items-center justify-center w-10 h-10 rounded-lg ${cor}`}><FileSpreadsheet size={18} /></span>
        <div className="flex-1">
          <h3 className="text-base font-semibold text-torg-dark">{titulo} <span className="text-torg-gray font-normal">({sigla})</span></h3>
          <p className="text-[13px] text-torg-gray mt-0.5">{desc}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <select value={op} onChange={(e) => setOp(e.target.value)} className="text-sm border border-gray-300 rounded-lg px-3 py-2 max-w-[320px]" title="Escolha a OP (direciona o arquivo pra pasta certa). Em branco, o portal detecta a OP pela própria lista.">
          <option value="">OP — detectar automaticamente</option>
          {ops.map((o) => (
            <option key={o.nome || o.numero} value={o.numero}>{o.nome || `OP ${o.numero}`}</option>
          ))}
        </select>
        <label className="inline-flex items-center gap-1.5 text-[12px] text-torg-gray">
          <input type="checkbox" checked={sobrescrever} onChange={(e) => setSobrescrever(e.target.checked)} className="accent-torg-blue" /> sobrescrever
        </label>
        <label className={`ml-auto inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium ${carregando ? "bg-gray-100 text-gray-400 cursor-not-allowed" : "bg-torg-blue text-white hover:bg-torg-dark cursor-pointer"}`}>
          {carregando ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
          {carregando ? "Importando…" : "Importar xlsx"}
          <input ref={inputRef} type="file" accept=".xlsx,.xls" disabled={carregando} className="hidden" onChange={(e) => importar(e.target.files?.[0])} />
        </label>
      </div>

      {erro && <p className="mt-3 text-[13px] text-red-600 flex items-start gap-1.5"><AlertCircle size={14} className="mt-0.5 flex-shrink-0" /> {erro}</p>}

      {res && (
        <div className="mt-3 rounded-lg border border-emerald-100 bg-emerald-50/60 p-3 text-[13px]">
          <p className="text-emerald-700 font-semibold flex items-center gap-1.5"><CheckCircle2 size={14} /> Importado{res.opNumero ? ` — OP ${res.opNumero}` : ""}{res.obra ? ` · ${res.obra}` : ""}</p>
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-torg-gray tabular-nums">
            {res.criados != null && <span>Novos: <b className="text-torg-dark">{fmt(res.criados)}</b></span>}
            {res.atualizados != null && <span>Atualizados: <b className="text-torg-dark">{fmt(res.atualizados)}</b></span>}
            {res.conjuntos != null && <span>Conjuntos: {fmt(res.conjuntos)}</span>}
            {res.croquis != null && <span>Croquis: {fmt(res.croquis)}</span>}
            {res.marcas != null && <span>Marcas: {fmt(res.marcas)}</span>}
            {res.pesoTotal != null && <span>Peso: {fmt(Math.round(res.pesoTotal))} kg</span>}
          </div>
          {revArquivo && (
            revLabel
              ? <p className="mt-2 text-[12px] text-torg-gray">Revisão do arquivo: <b className="text-torg-dark">{revLabel}</b>. Reenviar a mesma revisão substitui o arquivo no servidor.</p>
              : <p className="mt-2 text-[12px] text-amber-700 flex items-start gap-1.5"><AlertCircle size={13} className="mt-0.5 flex-shrink-0" /> O nome do arquivo não traz o número da revisão (ex.: R01) — confira se é a versão certa.</p>
          )}
          {res && (
            <div className="mt-2.5 rounded-lg border border-amber-200 bg-amber-50/60 p-3">
              <p className="text-[12px] text-amber-800 flex items-start gap-1.5"><Info size={13} className="mt-0.5 flex-shrink-0" /> <span>{ehRevisao ? <>Esta OP já tinha lista — é uma <b>revisão</b>. Avise os setores:</> : <><b>Avise os setores</b> que a lista foi importada:</>}</span></p>
              {avisoRes ? (
                <p className="mt-2 text-[12px] text-emerald-700 flex items-center gap-1.5"><CheckCircle2 size={13} /> Aviso enviado a {avisoRes.enviados} pessoa(s).</p>
              ) : (
                <>
                  <textarea value={mudancas} onChange={(e) => setMudancas(e.target.value)} rows={2} placeholder="Observação / o que mudou (opcional — vai junto no aviso)" className="mt-2 w-full text-[13px] border border-amber-200 rounded-md px-2.5 py-2 bg-white" />
                  <div className="mt-2 flex items-center gap-3 text-[11px]">
                    <button type="button" onClick={() => setSel(new Set(destinatarios.map((d) => d.email)))} className="text-torg-blue hover:underline">todos</button>
                    <button type="button" onClick={() => setSel(new Set())} className="text-torg-gray hover:underline">nenhum</button>
                    <span className="text-torg-gray">{sel.size} de {destinatarios.length} selecionado(s)</span>
                  </div>
                  <div className="mt-2 max-h-40 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 pr-1">
                    {destinatarios.map((d) => (
                      <label key={d.email} className="flex items-center gap-2 text-[12px] text-torg-dark cursor-pointer">
                        <input type="checkbox" checked={sel.has(d.email)} onChange={() => toggleSel(d.email)} className="accent-torg-blue flex-shrink-0" />
                        <span className="truncate">{d.nome}{d.setor ? <span className="text-torg-gray"> · {d.setor}</span> : null}</span>
                      </label>
                    ))}
                  </div>
                  {avisoErro && <p className="mt-1.5 text-[12px] text-red-600">{avisoErro}</p>}
                  <button onClick={enviarAviso} disabled={enviandoAviso || sel.size === 0} className="mt-2 px-3.5 py-1.5 bg-amber-600 text-white text-[13px] rounded-lg hover:bg-amber-700 font-medium inline-flex items-center gap-1.5 disabled:opacity-50">
                    {enviandoAviso ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Enviar aviso aos setores
                  </button>
                </>
              )}
            </div>
          )}
          {servidor && (
            <p className={`mt-2 text-[12px] flex items-start gap-1.5 ${servidor.estado === "ok" ? "text-emerald-700" : servidor.estado === "erro" ? "text-red-600" : "text-torg-gray"}`}>
              {servidor.estado === "salvando" && <><Loader2 size={13} className="mt-0.5 animate-spin flex-shrink-0" /> Salvando o arquivo no servidor…</>}
              {servidor.estado === "ok" && <><CheckCircle2 size={13} className="mt-0.5 flex-shrink-0" /> Arquivo salvo no servidor · {servidor.pastaOp}</>}
              {servidor.estado === "erro" && <><AlertCircle size={13} className="mt-0.5 flex-shrink-0" /> Importado, mas não salvou no servidor: {servidor.erro}</>}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default function ListasClient() {
  const [destinatarios, setDestinatarios] = useState([]);
  const [ops, setOps] = useState([]);
  useEffect(() => {
    fetch("/api/engenharia/listas/destinatarios")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setDestinatarios(j?.destinatarios || []))
      .catch(() => {});
    fetch("/api/engenharia/listas/ops")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setOps(j?.ops || []))
      .catch(() => {});
  }, []);

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-5">
      <header className="flex items-center gap-3">
        <span className="flex items-center justify-center w-11 h-11 rounded-xl bg-torg-blue-50 text-torg-blue"><ListChecks size={22} /></span>
        <div>
          <h1 className="text-2xl font-bold text-torg-dark">Listas — LE / LPC</h1>
          <p className="text-sm text-torg-gray">Importe as listas exportadas do Tekla. Quando já existir uma lista da mesma obra, o portal registra a revisão.</p>
        </div>
      </header>

      <CardImport
        titulo="Lista de Peças por Conjunto"
        sigla="LPC"
        desc="Marcas, conjuntos e croquis por frente/OP. Alimenta a carteira de Engenharia e o corte."
        endpoint="/api/producao/pecas/importar-lpc"
        cor="bg-sky-100 text-sky-700"
        destinatarios={destinatarios}
        ops={ops}
      />
      <CardImport
        titulo="Lista de Expedição"
        sigla="LE"
        desc="Marcas a expedir por obra (FORM 21). Base da expedição e do status da obra."
        endpoint="/api/producao/pecas/importar-le"
        cor="bg-teal-100 text-teal-700"
        destinatarios={destinatarios}
        ops={ops}
      />

      <div className="rounded-xl border border-torg-blue-100 bg-torg-blue-50/40 p-4 text-[13px] text-torg-dark flex items-start gap-2">
        <Info size={16} className="mt-0.5 flex-shrink-0 text-torg-blue" />
        <div>
          <p className="font-semibold">Como funciona</p>
          <p className="mt-0.5">Ao importar, o arquivo é <b>salvo automático no servidor</b> (pasta da OP no SharePoint). Quando a OP já tinha a lista, é uma <b>revisão</b> — aí aparece o seletor pra <b>avisar por e-mail</b> quem você quiser (todos vêm marcados; é só desmarcar quem não precisa).</p>
        </div>
      </div>
    </div>
  );
}
