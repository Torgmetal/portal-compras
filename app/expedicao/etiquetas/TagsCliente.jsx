"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, Check, Loader2, Upload } from "lucide-react";
import * as XLSX from "xlsx";
import { lerJson } from "@/lib/ler-json";

// A "LISTA DE EQUIVALÊNCIA DE TAG" DO CLIENTE — a TAG que sai na frente da DESCRIÇÃO.
//
// Matheus (14/09/2026): *"o excel tem 3 abas e cada ABA tem uma TAG na última coluna e suas marcas;
// essas TAGs têm que sair na frente da descrição de cada MARCA"* — e *"tem que ser no nosso modelo,
// só acrescentar a TAG na frente. MODELO TORG"*.
//
// ⚠⚠ TODAS AS ABAS SOBEM, e é a coisa mais importante deste arquivo. Cada aba é uma TAG, e a MESMA
// marca aparece em mais de uma (51 das 96 na OP-105): as quantidades por aba SOMAM a quantidade da
// Lista de Expedição. Mandando só a primeira aba, metade da obra ficaria sem destino e a outra
// metade com o destino errado.

/** As matrizes de células de TODAS as abas — o arquivo em si nunca sobe (limite de 4,5 MB). */
async function lerAbas(arquivo) {
  const wb = XLSX.read(await arquivo.arrayBuffer(), { type: "array", cellDates: true });
  if (!wb.SheetNames.length) throw new Error("A planilha está vazia.");
  return wb.SheetNames.map((nome) => ({
    nome,
    rows: XLSX.utils.sheet_to_json(wb.Sheets[nome], { header: 1, defval: null, blankrows: false }),
  }));
}

/** O que falta — em uma frase que diz quantas etiquetas sairiam sem TAG, e de quais marcas. */
function Pendencias({ cobertura }) {
  const { semTag = [], foraDaLista = [], sobrando = [] } = cobertura;
  if (!semTag.length && !foraDaLista.length && !sobrando.length) return null;
  const faltando = semTag.reduce((n, m) => n + (m.qte - m.comTag), 0);
  return (
    <div className="mt-2 text-[12.5px] text-amber-700">
      {faltando > 0 && (
        <div className="flex items-start gap-1">
          <AlertCircle size={13} className="mt-0.5 shrink-0" />
          <span>
            <b>{faltando} etiqueta(s) sairão sem TAG</b> —{" "}
            {semTag.slice(0, 5).map((m) => `${m.marca} (${m.qte - m.comTag} de ${m.qte})`).join(", ")}
            {semTag.length > 5 && ` e mais ${semTag.length - 5} marca(s)`}.
          </span>
        </div>
      )}
      {/* ⚠ Marca na planilha e fora da lista: ou a L.E. foi revisada, ou a planilha é de outra obra.
          Sumir com isso em silêncio esconderia as duas. */}
      {foraDaLista.length > 0 && (
        <div className="mt-1">{foraDaLista.length} marca(s) da planilha não estão na Lista de Expedição.</div>
      )}
      {sobrando.length > 0 && (
        <div className="mt-1">{sobrando.length} marca(s) têm mais peças na planilha do que na Lista.</div>
      )}
    </div>
  );
}

/** Quanto da obra está coberto — ou o convite a importar. */
const Resumo = ({ estado }) => (estado?.temMapa ? (
  <span className="block mt-0.5 text-emerald-700 font-semibold">
    <Check size={13} className="inline mb-0.5" /> {estado.cobertas} de {estado.total} peça(s) com TAG
    {estado.tags?.length ? ` · ${estado.tags.join(" · ")}` : ""}
  </span>
) : (
  <span className="block mt-0.5">Nenhuma importada — a descrição sai como sempre.</span>
));

export default function TagsCliente({ opId }) {
  const input = useRef(null);
  const [estado, setEstado] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");

  const carregar = useCallback(async () => {
    if (!opId) return setEstado(null);
    try {
      const j = await lerJson(await fetch(
        `/api/expedicao/etiquetas/tags-cliente?opId=${encodeURIComponent(opId)}`, { cache: "no-store" }), "TAGs do cliente");
      setEstado(j);
    } catch { setEstado(null); /* não saber a cobertura não impede imprimir */ }
  }, [opId]);

  useEffect(() => { carregar(); }, [carregar]);

  const enviar = async (arquivo) => {
    if (!arquivo) return;
    setEnviando(true); setErro("");
    try {
      const abas = await lerAbas(arquivo);
      const j = await lerJson(await fetch("/api/expedicao/etiquetas/tags-cliente", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opId, abas }),
      }), "Importação das TAGs");
      setEstado(j);
    } catch (e) { setErro(e.message); } finally {
      setEnviando(false);
      // Zera o input: reimportar o MESMO arquivo (corrigido) não dispara `change` se o valor ficar.
      if (input.current) input.current.value = "";
    }
  };

  return (
    <div className="mt-3 pt-3 border-t border-gray-100">
      <div className="flex flex-wrap items-center gap-3">
        <div className="text-[12.5px] text-torg-gray flex-1 min-w-[260px]">
          Uma planilha com <b>uma aba por TAG</b> põe a TAG do cliente{" "}
          <b>na frente da descrição</b> de cada peça.
          <Resumo estado={estado} />
        </div>
        <input ref={input} type="file" accept=".xlsx,.xls" className="hidden"
          onChange={(e) => enviar(e.target.files?.[0])} />
        <button onClick={() => input.current?.click()} disabled={enviando || !opId}
          className="border border-torg-blue text-torg-blue text-[13px] font-semibold rounded-lg px-3 py-1.5 flex items-center gap-2 disabled:opacity-40">
          {enviando ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
          {enviando ? "Importando…" : estado?.temMapa ? "Trocar planilha" : "Importar TAGs"}
        </button>
      </div>

      {/* ⚠⚠ REIMPORTAR SUBSTITUI O MAPA DA OBRA INTEIRA, e a tela diz isso antes. Somando, a unidade
          que a planilha nova não traz mais seguiria imprimindo a TAG velha e ninguém veria. */}
      {estado?.temMapa && (
        <p className="mt-2 text-[12px] text-torg-gray">
          Trocar a planilha <b>substitui</b> todas as TAGs desta obra.
        </p>
      )}
      {estado?.temMapa && <Pendencias cobertura={estado} />}
      {erro && (
        <div className="mt-2 text-[12.5px] text-red-700 flex items-center gap-1">
          <AlertCircle size={13} /> {erro}
        </div>
      )}
    </div>
  );
}
