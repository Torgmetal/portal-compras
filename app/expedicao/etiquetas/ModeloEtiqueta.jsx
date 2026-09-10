"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, Check, Loader2, Upload } from "lucide-react";
import * as XLSX from "xlsx";
import { lerJson } from "@/lib/ler-json";

// ESCOLHA DO MODELO DA ETIQUETA + a planilha que alimenta o modelo do cliente.
//
// Matheus (10/09/2026): "vou precisar criar um modelo específico para um cliente da OP 102, eles
// pedem informações extras conforme a planilha".
//
// ⚠ A PLANILHA APARECE SÓ NO MODELO QUE PRECISA DELA. No padrão ela não existe — e é o ponto da
// tela de etiquetas não ter upload nenhum: marca, peso e quantidade já estão no portal. O que a
// planilha do cliente traz são os códigos DELE (TAG Petrobras, referência de desenho), que o
// portal não tem de onde saber.

export const MODELOS = [
  { valor: "padrao", nome: "Padrão Torg", ajuda: "O desenho de sempre: cliente, obra, TAG e descrição." },
  { valor: "qws", nome: "QWS / Petrobras", ajuda: "TAG Petrobras em destaque, referência do desenho e TAG FOR." },
];

/** A matriz de células, lida no navegador — o arquivo em si nunca sobe (limite de 4,5 MB da Vercel). */
async function lerPlanilha(arquivo) {
  const wb = XLSX.read(await arquivo.arrayBuffer(), { type: "array", cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) throw new Error("A planilha está vazia.");
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, blankrows: false });
}

function Planilha({ opId, quantos, recarregar }) {
  const input = useRef(null);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [erro, setErro] = useState("");

  const enviar = async (arquivo) => {
    if (!arquivo) return;
    setEnviando(true); setErro(""); setResultado(null);
    try {
      const rows = await lerPlanilha(arquivo);
      const j = await lerJson(await fetch("/api/expedicao/etiquetas/campos-extras", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opId, rows }),
      }), "Importação da planilha");
      setResultado(j);
      recarregar();
    } catch (e) { setErro(e.message); } finally {
      setEnviando(false);
      // Zera o input: reimportar o MESMO arquivo (corrigido) não dispara `change` se o valor ficar.
      if (input.current) input.current.value = "";
    }
  };

  return (
    <div className="mt-3 pt-3 border-t border-gray-100">
      <div className="flex flex-wrap items-center gap-3">
        <div className="text-[12.5px] text-torg-gray flex-1 min-w-[240px]">
          Este modelo lê <b>TAG Petrobras</b>, <b>referência</b> e <b>posição</b> da planilha
          &quot;Lista Equivalência de Marcas&quot; do cliente.{" "}
          {quantos == null ? null : quantos > 0 ? (
            <span className="text-emerald-700 font-semibold inline-flex items-center gap-1">
              <Check size={13} /> {quantos} marca(s) já importada(s)
            </span>
          ) : (
            <span className="text-amber-700 font-semibold">
              Nenhuma marca importada — a etiqueta sairia com &quot;—&quot; nesses campos.
            </span>
          )}
        </div>
        <input ref={input} type="file" accept=".xlsx,.xls" className="hidden"
          onChange={(e) => enviar(e.target.files?.[0])} />
        <button onClick={() => input.current?.click()} disabled={enviando || !opId}
          className="border border-torg-blue text-torg-blue text-[13px] font-semibold rounded-lg px-3 py-1.5 flex items-center gap-2 disabled:opacity-40">
          {enviando ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
          {enviando ? "Importando…" : "Importar planilha"}
        </button>
      </div>
      {resultado && (
        <div className="mt-2 text-[12.5px] text-emerald-700">
          Planilha lida: {resultado.linhas} linha(s) em {resultado.marcas} marca(s) —{" "}
          {resultado.criados} nova(s), {resultado.atualizados} atualizada(s).
          {resultado.linhas > resultado.marcas && (
            <> Marca repetida vira unidade: cada etiqueta leva a TAG da linha dela.</>
          )}
        </div>
      )}
      {erro && (
        <div className="mt-2 text-[12.5px] text-red-700 flex items-center gap-1">
          <AlertCircle size={13} /> {erro}
        </div>
      )}
    </div>
  );
}

export default function ModeloEtiqueta({ opId, modelo, setModelo }) {
  const [quantos, setQuantos] = useState(null);

  const contar = useCallback(async () => {
    if (!opId) return setQuantos(null);
    try {
      const j = await lerJson(await fetch(
        `/api/expedicao/etiquetas/campos-extras?opId=${encodeURIComponent(opId)}`, { cache: "no-store" }),
      "Campos extras");
      setQuantos(j.total ?? 0);
    } catch { setQuantos(null); /* não saber quantos não impede escolher o modelo */ }
  }, [opId]);

  useEffect(() => { if (modelo === "qws") contar(); }, [modelo, contar]);

  const atual = MODELOS.find((m) => m.valor === modelo) || MODELOS[0];

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-5">
      <label className="block text-[11px] font-bold uppercase tracking-wide text-torg-gray mb-1.5">
        Modelo da etiqueta
      </label>
      <select value={modelo} onChange={(e) => setModelo(e.target.value)}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
        {MODELOS.map((m) => <option key={m.valor} value={m.valor}>{m.nome}</option>)}
      </select>
      <p className="text-[12.5px] text-torg-gray mt-1.5">{atual.ajuda}</p>
      {modelo === "qws" && <Planilha opId={opId} quantos={quantos} recarregar={contar} />}
    </div>
  );
}
