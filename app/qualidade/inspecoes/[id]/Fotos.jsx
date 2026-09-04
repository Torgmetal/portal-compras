"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { Camera, Loader2, X, AlertTriangle } from "lucide-react";
import { reduzImagem } from "@/lib/imagem-cliente";
import { lerJson } from "@/lib/resposta-json";
import { evidenciasDoTipo } from "@/lib/fotos-evidencia";

// ─── AS FOTOS DO ENSAIO, EM QUALQUER RELATÓRIO ────────────────────────────────
// Vitor (22/08/2026): "estou sentindo falta de um campo para anexar as fotos dos
// testes, tanto para o computador quanto para o celular; posso colocar foto em
// qualquer relatório — alguns têm campos específicos, e para os que não têm você cria
// uma página para anexar essas imagens".
//
// No celular a captura já existia; no computador, não existia em lugar nenhum — quem
// monta o relatório na mesa não tinha como juntar a foto do ensaio. Agora é o mesmo
// componente para os quatro tipos, e no PDF a folha de fotos sai no mesmo formato das
// demais (ver paginaDeFotos em lib/relatorio-evs-pdf.js).
//
// ⚠ A foto nasce AMARRADA ao relatório (`relatorioId`), não solta na fila da OP. Foto
// solta obriga alguém a juntá-la depois, e evidência de ensaio reprovado é justamente
// o que não pode se perder no caminho.
//
// ── UMA ÁREA DE EVIDÊNCIA POR ENSAIO ────────────────────────────────────────
// Vitor (04/09/2026): "precisa ter campo de fotos específico para cada área; hoje você
// permite a inclusão mas cria campos novos, precisa ficar em cada área de tipo de
// evidência, pode conter mais de 1 foto".
//
// Quando o tipo tem áreas (hoje a pintura, lib/fotos-evidencia.js), a tela vira um bloco
// por ensaio, cada um com o SEU botão de anexar e quantas fotos precisar — e é a área que
// leva a foto para a moldura certa da folha 2 do PDF. Sem áreas definidas, segue o balde
// único de antes.
export default function Fotos({ rel, travado }) {
  const [fotos, setFotos] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const inputRef = useRef(null);

  const carregar = useCallback(async () => {
    try {
      const r = await fetch(`/api/campo/foto?relatorioId=${encodeURIComponent(rel.id)}`);
      const j = await r.json();
      setFotos(j.fotos || []);
    } catch { setFotos([]); }
  }, [rel.id]);

  useEffect(() => { carregar(); }, [carregar]);

  async function receber(e, evidencia = null) {
    const arquivos = [...(e.target.files || [])];
    e.target.value = "";
    if (!arquivos.length) return;
    setEnviando(true); setErro("");
    try {
      for (const arq of arquivos) {
        const blob = await reduzImagem(arq);
        const fd = new FormData();
        fd.append("file", new File([blob], "foto.jpg", { type: "image/jpeg" }));
        fd.append("opNumero", rel.opNumero);
        fd.append("tipo", rel.tipo);
        fd.append("relatorioId", rel.id);
        if (evidencia) fd.append("evidencia", evidencia);
        const r = await fetch("/api/campo/foto", { method: "POST", body: fd });
        // ⚠ erro de plataforma vem em HTML, não em JSON — ver lib/resposta-json.js
        const j = await lerJson(r);
        if (!r.ok) throw new Error(j.error || "Falha ao enviar a foto.");
      }
      await carregar();
    } catch (e2) { setErro(e2.message); } finally { setEnviando(false); }
  }

  // reclassificar: a foto antiga (sem área) e a que foi anexada no bloco errado
  async function mover(id, evidencia) {
    setErro("");
    try {
      const r = await fetch("/api/campo/foto", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, evidencia: evidencia || null }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Não foi possível mover a foto.");
      await carregar();
    } catch (e) { setErro(e.message); }
  }

  async function remover(id) {
    if (!confirm("Remover esta foto do relatório?")) return;
    try {
      const r = await fetch(`/api/campo/foto?id=${id}`, { method: "DELETE" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Não foi possível remover.");
      await carregar();
    } catch (e) { setErro(e.message); }
  }

  const areas = evidenciasDoTipo(rel.tipo);
  const daArea = (k) => (fotos || []).filter((f) => (f.evidencia || null) === k);

  return (
    <div className="bg-white border border-gray-100 rounded-xl p-3 shadow-sm">
      <div className="flex items-center justify-between gap-3 mb-2">
        <p className="text-[12px] font-bold text-torg-dark">
          Fotos do ensaio {fotos?.length ? <span className="text-torg-gray font-normal">· {fotos.length}</span> : null}
        </p>
        {!travado && !areas.length && (
          <>
            <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={receber} />
            <button onClick={() => inputRef.current?.click()} disabled={enviando}
              className="text-[11px] font-semibold text-torg-blue border border-torg-blue-300 rounded-lg px-2.5 py-1 hover:bg-torg-blue-50 disabled:opacity-50 inline-flex items-center gap-1.5">
              {enviando ? <Loader2 size={12} className="animate-spin" /> : <Camera size={12} />} Anexar foto
            </button>
          </>
        )}
      </div>

      {erro && <p className="text-[11px] text-red-600 mb-2 inline-flex items-center gap-1.5"><AlertTriangle size={12} /> {erro}</p>}

      {fotos === null ? (
        <p className="text-[11px] text-torg-gray inline-flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> carregando…</p>
      ) : areas.length ? (
        <div className="space-y-2">
          {areas.map((a) => (
            <BlocoArea key={a.k} rot={a.rot} lista={daArea(a.k)} areas={areas} atual={a.k}
              travado={travado} enviando={enviando} onEnviar={(e) => receber(e, a.k)}
              onMover={mover} onRemover={remover} />
          ))}
          {/* ⚠ o acervo: foto anexada antes de existir área (e a que veio do celular) fica aqui até
              alguém dizer de que ensaio ela é — some sozinha do bloco quando classificada. */}
          {daArea(null).length > 0 && (
            <BlocoArea rot="Sem área — classifique para entrar na moldura certa" lista={daArea(null)}
              areas={areas} atual="" travado={travado} enviando={enviando} onEnviar={(e) => receber(e, null)}
              onMover={mover} onRemover={remover} semBotao alerta />
          )}
          <p className="text-[10px] text-torg-gray">
            Cada área sai na sua moldura na folha do registro fotográfico. Pode ter mais de uma foto por área:
            a primeira vai na moldura, as outras saem na folha de fotos com o nome do ensaio na legenda.
          </p>
        </div>
      ) : fotos.length ? (
        <Grade lista={fotos} travado={travado} onRemover={remover} />
      ) : (
        <p className="text-[11px] text-torg-gray">
          Nenhuma foto. {travado ? "" : "As que você anexar saem numa folha própria no fim do PDF, no mesmo formato do relatório."}
        </p>
      )}
    </div>
  );
}

function BlocoArea({ rot, lista, areas, atual, travado, enviando, onEnviar, onMover, onRemover, semBotao = false, alerta = false }) {
  const ref = useRef(null);
  return (
    <div className={`border rounded-lg p-2 ${alerta ? "border-amber-200 bg-amber-50/40" : "border-gray-100"}`}>
      <div className="flex items-center justify-between gap-3 mb-1.5">
        <p className="text-[11px] font-semibold text-torg-dark">
          {rot} {lista.length ? <span className="text-torg-gray font-normal">· {lista.length}</span> : null}
        </p>
        {!travado && !semBotao && (
          <>
            <input ref={ref} type="file" accept="image/*" multiple className="hidden" onChange={onEnviar} />
            <button onClick={() => ref.current?.click()} disabled={enviando}
              className="text-[10px] font-semibold text-torg-blue border border-torg-blue-300 rounded-lg px-2 py-0.5 hover:bg-torg-blue-50 disabled:opacity-50 inline-flex items-center gap-1">
              {enviando ? <Loader2 size={11} className="animate-spin" /> : <Camera size={11} />} Anexar
            </button>
          </>
        )}
      </div>
      {lista.length ? (
        <Grade lista={lista} travado={travado} onRemover={onRemover} onMover={onMover} areas={areas} atual={atual} />
      ) : (
        <p className="text-[10px] text-torg-gray">sem foto</p>
      )}
    </div>
  );
}

function Grade({ lista, travado, onRemover, onMover = null, areas = [], atual = "" }) {
  return (
    <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
      {lista.map((f) => (
        <div key={f.id} className="relative group">
          <a href={f.url} target="_blank" rel="noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={f.url} alt={f.marca || "foto do ensaio"} className="w-full h-20 object-cover rounded-lg border border-gray-200" />
          </a>
          {f.marca && <p className="text-[9px] text-torg-gray truncate mt-0.5">{f.marca}</p>}
          {!travado && onMover && areas.length > 0 && (
            <select value={atual} onChange={(e) => onMover(f.id, e.target.value)}
              title="Área de evidência"
              className="mt-0.5 w-full text-[9px] border border-gray-200 rounded px-1 py-0.5 text-torg-gray">
              <option value="">sem área</option>
              {areas.map((a) => <option key={a.k} value={a.k}>{a.rot}</option>)}
            </select>
          )}
          {!travado && (
            <button onClick={() => onRemover(f.id)} title="Remover"
              className="absolute top-1 right-1 bg-white/90 rounded-full p-0.5 text-torg-gray hover:text-red-600 opacity-0 group-hover:opacity-100">
              <X size={12} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
