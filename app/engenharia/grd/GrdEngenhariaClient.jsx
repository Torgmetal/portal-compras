"use client";
import { useState, useEffect, useCallback } from "react";
import { Loader2, RefreshCw, FileSpreadsheet, ChevronRight, ChevronDown, Search, AlertTriangle } from "lucide-react";
import { fmtOP } from "@/lib/utils";

// ─── GRD DA ENGENHARIA, POR OP ────────────────────────────────────────────────────────────────
// Vitor (31/08/2026): "hoje não separamos por OP e sim por ordem numérica (…) no portal vc separe
// igual estamos fazendo na aba de GRD do PCP, por OP (…) esse controle basicamente se faz
// necessário para controlarmos o que foi liberado pelo setor, data e a revisão atual".
//
// ⚠ A OP É A LINHA, a GRD é o detalhe — invertido do que a pasta faz. Na pasta, achar tudo que foi
// liberado para uma obra exige abrir 485 arquivos numerados em sequência; aqui a obra é o que se
// procura e as GRDs dela vêm juntas, na ordem em que saíram.
//
// ⚠⚠ REVISÃO SUPERADA CONTINUA À VISTA, marcada. O procedimento pede a revisão ATUAL, e o instinto
// seria só mostrar essa — mas a GRD é o documento que prova o que o PCP recebeu naquele dia. Sumir
// com a R00 apagaria a entrega que aconteceu de fato.
const fmtData = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—");
const fmtKg = (v) => (v ? `${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} kg` : "—");

export default function GrdEngenhariaClient() {
  const [d, setD] = useState(null);
  const [erro, setErro] = useState("");
  const [busca, setBusca] = useState("");
  const [aberta, setAberta] = useState(null);
  const [detalhe, setDetalhe] = useState(null);
  const [sincronizando, setSincronizando] = useState(false);
  const [aviso, setAviso] = useState("");

  const carregar = useCallback(async () => {
    try {
      const r = await fetch("/api/engenharia/grd");
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro");
      setD(j);
    } catch (e) { setErro(e.message); }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  async function sincronizar() {
    setSincronizando(true); setAviso("");
    try {
      const r = await fetch("/api/engenharia/grd/sincronizar", { method: "POST" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro");
      setAviso(
        j.lidas === 0
          ? "Nada novo na pasta."
          : `${j.novas} nova(s) e ${j.revisoes} revisão/alteração importadas.` +
            (j.avisado ? " A Engenharia foi avisada por e-mail." : "") +
            (j.erros?.length ? ` ${j.erros.length} arquivo(s) não deram para ler.` : "")
      );
      await carregar();
    } catch (e) { setAviso("Falha: " + e.message); } finally { setSincronizando(false); }
  }

  if (erro) return <div className="py-16 text-center text-red-600 text-sm">{erro}</div>;
  if (!d) return <div className="py-16 text-center text-torg-gray"><Loader2 size={24} className="mx-auto animate-spin mb-2" /> Carregando…</div>;

  const q = busca.trim().toLowerCase();
  const ops = !q ? d.ops : d.ops.filter((o) =>
    [o.opNumero, o.opCodigo, o.referencia, ...o.grds.map((g) => g.numero)]
      .some((v) => String(v ?? "").toLowerCase().includes(q)));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-torg-dark">GRD da Engenharia</h1>
          <p className="text-[13px] text-torg-gray mt-0.5">
            O que a Engenharia liberou, por obra — {d.total} GRD(s), {d.comRevisao} com revisão.
            Vem da pasta <span className="font-mono text-[12px]">13. GRD</span> do SharePoint.
          </p>
        </div>
        <button onClick={sincronizar} disabled={sincronizando}
          className="text-[13px] font-semibold text-torg-blue border border-torg-blue-200 rounded-lg px-3 py-2 hover:bg-torg-blue-50 disabled:opacity-50 inline-flex items-center gap-2">
          {sincronizando ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          {sincronizando ? "Lendo a pasta…" : "Buscar novas"}
        </button>
      </div>

      {aviso && <p className="rounded-lg border border-torg-blue-100 bg-torg-blue-50/50 px-3 py-2 text-[12px] text-torg-dark">{aviso}</p>}

      <div className="relative max-w-sm">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-torg-gray" />
        <input value={busca} onChange={(e) => setBusca(e.target.value)}
          placeholder="OP, obra ou número da GRD…"
          className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-torg-blue focus:ring-1 focus:ring-torg-blue" />
      </div>

      <div className="rounded-xl border border-gray-100 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-gray-100 bg-gray-50/60 px-4 py-2.5 text-xs text-torg-gray">
          {ops.length} obra{ops.length !== 1 ? "s" : ""}
        </div>
        <div className="divide-y divide-gray-50">
          {ops.map((o) => {
            const k = o.opNumero || "SEM_OP";
            const ab = aberta === k;
            return (
              <div key={k}>
                <button onClick={() => setAberta(ab ? null : k)}
                  className="w-full flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-left hover:bg-torg-blue-50/40">
                  {ab ? <ChevronDown size={15} className="text-torg-blue shrink-0" /> : <ChevronRight size={15} className="text-gray-300 shrink-0" />}
                  <span className="font-mono text-sm font-semibold text-torg-blue">
                    {o.opNumero ? fmtOP(o.opNumero) : "sem OP"}
                  </span>
                  {o.opCodigo && <span className="text-[11px] text-torg-gray font-mono">{o.opCodigo}</span>}
                  <span className="text-sm text-torg-dark truncate max-w-[280px]">{o.referencia || "—"}</span>
                  <span className="ml-auto text-[12px] text-torg-gray tabular-nums whitespace-nowrap">
                    {o.grds.length} GRD · {o.docs} doc · {fmtKg(o.pesoKg)}
                  </span>
                  <span className="text-[12px] text-torg-gray whitespace-nowrap">últ. {fmtData(o.ultima)}</span>
                </button>

                {ab && (
                  <div className="bg-gray-50/60 px-4 pb-3">
                    <table className="w-full text-[12px]">
                      <thead className="text-[10px] uppercase text-torg-gray">
                        <tr>
                          <th className="text-left py-1.5">GRD</th><th className="text-left py-1.5">Data</th>
                          <th className="text-left py-1.5">Para</th><th className="text-left py-1.5">Área</th>
                          <th className="text-right py-1.5">Peso</th><th className="text-right py-1.5">Docs</th>
                          <th className="text-left py-1.5 pl-3">Emitido</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {o.grds.map((g) => (
                          <tr key={g.id} className={g.vigente ? "" : "opacity-55"}>
                            <td className="py-1.5">
                              <button onClick={() => setDetalhe(g)} className="font-semibold text-torg-blue hover:underline">
                                GRD-{g.numero}
                              </button>
                              {g.revisao > 0 && (
                                <span className="ml-1 text-[10px] font-bold rounded px-1 py-0.5 bg-amber-100 text-amber-700">
                                  R{String(g.revisao).padStart(2, "0")}
                                </span>
                              )}
                              {!g.vigente && <span className="ml-1 text-[10px] text-torg-gray">superada</span>}
                            </td>
                            <td className="py-1.5 whitespace-nowrap">{fmtData(g.data)}</td>
                            <td className="py-1.5">{g.para || "—"}</td>
                            <td className="py-1.5 max-w-[220px] truncate" title={g.area || ""}>{g.area || "—"}</td>
                            <td className="py-1.5 text-right tabular-nums whitespace-nowrap">{fmtKg(g.pesoKg)}</td>
                            <td className="py-1.5 text-right tabular-nums">{g.qtdDocs}</td>
                            <td className="py-1.5 pl-3">{g.emitidoPor || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
          {!ops.length && (
            <p className="px-4 py-10 text-center text-sm text-torg-gray">
              <AlertTriangle size={24} className="mx-auto mb-2 text-gray-300" />
              Nenhuma GRD com esse filtro. Use “Buscar novas” para ler a pasta.
            </p>
          )}
        </div>
      </div>

      {detalhe && <ModalGrd g={detalhe} onClose={() => setDetalhe(null)} />}
    </div>
  );
}

function ModalGrd({ g, onClose }) {
  const itens = Array.isArray(g.itens) ? g.itens : [];
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-3xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-gray-100">
          <p className="text-sm font-bold text-torg-dark inline-flex items-center gap-2">
            <FileSpreadsheet size={15} className="text-torg-blue" />
            GRD-{g.numero}{g.revisao > 0 ? ` · R${String(g.revisao).padStart(2, "0")}` : ""}
          </p>
          <p className="text-[12px] text-torg-gray mt-0.5">
            {fmtData(g.data)} · {g.opCodigo || "sem OP"} · {g.referencia || "—"} · {g.area || "—"} ·
            emitido por {g.emitidoPor || "—"} para {g.para || "—"}
          </p>
        </div>
        <div className="overflow-auto px-5 py-3">
          <table className="w-full text-[12px]">
            <thead className="text-[10px] uppercase text-torg-gray sticky top-0 bg-white">
              <tr>
                <th className="text-left py-1">#</th><th className="text-left py-1">Documento</th>
                <th className="text-left py-1">Rev.</th><th className="text-left py-1">Descrição</th>
                <th className="text-center py-1">F</th><th className="text-center py-1">S</th>
                <th className="text-right py-1">Cópias</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {itens.map((it, i) => (
                <tr key={i}>
                  <td className="py-1 text-torg-gray">{it.item}</td>
                  <td className="py-1 font-mono text-torg-dark">{it.documento || "—"}</td>
                  <td className="py-1 tabular-nums">{it.revisao ?? "—"}</td>
                  <td className="py-1 max-w-[240px] truncate" title={it.descricao || ""}>{it.descricao || "—"}</td>
                  <td className="py-1 text-center">{it.finalidade || "—"}</td>
                  <td className="py-1 text-center">{it.situacao || "—"}</td>
                  <td className="py-1 text-right tabular-nums">{it.copias ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-3 border-t border-gray-100 flex justify-between items-center">
          <span className="text-[12px] text-torg-gray">{itens.length} documento(s) · {fmtKg(g.pesoKg)}</span>
          <button onClick={onClose} className="text-sm font-medium text-torg-gray hover:text-torg-dark px-3 py-1.5">Fechar</button>
        </div>
      </div>
    </div>
  );
}
