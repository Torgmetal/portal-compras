"use client";
import { useState, useRef } from "react";
import { Upload, Loader2, CheckCircle2, AlertCircle, ListChecks, FileSpreadsheet, Info } from "lucide-react";

const fmt = (n) => Number(n || 0).toLocaleString("pt-BR");

function CardImport({ titulo, sigla, desc, endpoint, cor }) {
  const [op, setOp] = useState("");
  const [sobrescrever, setSobrescrever] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [res, setRes] = useState(null);
  const [erro, setErro] = useState("");
  const inputRef = useRef(null);

  async function importar(file) {
    if (!file) return;
    setCarregando(true); setErro(""); setRes(null);
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
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro ao importar");
      setRes(j);
    } catch (e) {
      setErro(e.message);
    } finally {
      setCarregando(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const ehRevisao = res && Number(res.atualizados) > 0;

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
        <input value={op} onChange={(e) => setOp(e.target.value.toUpperCase())} placeholder="OP (opcional)" className="w-28 text-sm border border-gray-300 rounded-lg px-3 py-2" />
        <label className="inline-flex items-center gap-1.5 text-[12px] text-torg-gray">
          <input type="checkbox" checked={sobrescrever} onChange={(e) => setSobrescrever(e.target.checked)} className="accent-torg-blue" /> sobrescrever
        </label>
        <label className={`ml-auto inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium cursor-pointer ${carregando ? "bg-gray-100 text-gray-400" : "bg-torg-blue text-white hover:bg-torg-dark"}`}>
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
          {ehRevisao && (
            <p className="mt-2 text-[12px] text-amber-700 flex items-start gap-1.5"><Info size={13} className="mt-0.5 flex-shrink-0" /> Esta OP já tinha lista importada — é uma <b>revisão</b>. O aviso por e-mail aos setores e o salvamento no servidor entram no próximo passo (ver nota abaixo).</p>
          )}
        </div>
      )}
    </div>
  );
}

export default function ListasClient() {
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
      />
      <CardImport
        titulo="Lista de Expedição"
        sigla="LE"
        desc="Marcas a expedir por obra (FORM 21). Base da expedição e do status da obra."
        endpoint="/api/producao/pecas/importar-le"
        cor="bg-teal-100 text-teal-700"
      />

      <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 text-[13px] text-amber-800 flex items-start gap-2">
        <Info size={16} className="mt-0.5 flex-shrink-0" />
        <div>
          <p className="font-semibold">Em alinhamento com o Vitor</p>
          <p className="mt-0.5">Falta ligar duas coisas nesta aba: (1) <b>e-mail automático aos setores</b> quando a lista for revisada, e (2) <b>salvar o arquivo no servidor</b> (SharePoint) no caminho certo de cada lista. Preciso das pastas corretas da LE e da LPC pra alinhar os caminhos.</p>
        </div>
      </div>
    </div>
  );
}
