"use client";
// Desenhos (projetos) da peça — modal compartilhado (telas de produção + painel do PCP).
// Lista os PDFs da marca na pasta da Engenharia (2.5.2 Fabricação) com o FORMATO de impressão
// (A1/A2/A3/A4 = pasta; croqui = A4) e EMITE o desenho: o portal carimba no PDF a rastreabilidade
// do material daquela marca + quem emitiu, data e hora, arquiva o carimbado no SharePoint e amarra
// o MESMO arquivo na §02 do Data Book. O histórico embaixo é o controle de liberação (GRD).
// (Vitor 18/08: hoje o nº da rastreabilidade é copiado da planilha e escrito no croqui à mão.)
import { useState, useEffect } from "react";
import { X, Loader2, FileText, Printer, ExternalLink, AlertCircle, CheckCircle2, ShieldCheck } from "lucide-react";

const fmtDataHora = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) + " " + new Date(d).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "—");

export default function DesenhoPecaModal({ opNumero, opId, marca, setor, onClose }) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState("");
  const [registrando, setRegistrando] = useState("");

  useEffect(() => {
    setDados(null); setErro("");
    fetch(`/api/producao/desenhos?opNumero=${encodeURIComponent(opNumero)}&marca=${encodeURIComponent(marca)}`)
      .then((r) => r.json())
      .then((j) => { if (j.error) setErro(j.error); else setDados(j); })
      .catch(() => setErro("Não foi possível buscar os desenhos."));
  }, [opNumero, marca]);

  const abrirItem = (itemId, nome) => window.open(`/api/producao/desenhos/arquivo?itemId=${encodeURIComponent(itemId)}&nome=${encodeURIComponent(nome)}`, "_blank");
  const abrir = (a) => abrirItem(a.itemId, a.nome); // original, sem carimbo (só visualizar)

  async function liberar(a) {
    setRegistrando(a.itemId); setErro("");
    try {
      const r = await fetch("/api/producao/desenhos", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opNumero, opId: opId || null, marca, arquivo: a.nome, formato: a.formato || null, itemId: a.itemId, setor: setor || null }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro ao registrar");
      setDados((d) => ({ ...d, liberacoes: [j.liberacao, ...(d?.liberacoes || [])] }));
      if (j.avisoCarimbo) setErro(`Liberação registrada, mas: ${j.avisoCarimbo}`);
      // abre o CARIMBADO (o mesmo que foi pro Data Book); se o carimbo falhou, cai no original
      abrirItem(j.abrirItemId || a.itemId, j.abrirNome || a.nome);
    } catch (e) { setErro(e.message); } finally { setRegistrando(""); }
  }

  const arquivos = dados?.arquivos || [];
  const liberacoes = dados?.liberacoes || [];
  const jaLiberado = (nome) => liberacoes.find((l) => l.arquivo === nome);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="bg-white text-torg-dark rounded-2xl w-full max-w-lg shadow-2xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <h2 className="text-lg font-bold inline-flex items-center gap-2"><FileText size={18} className="text-torg-blue" /> Desenhos — <span className="font-mono">{marca}</span></h2>
          <button onClick={onClose} className="text-torg-gray hover:text-red-600"><X size={20} /></button>
        </div>

        <div className="px-5 py-4 overflow-y-auto space-y-4">
          {erro && <p className="text-sm text-red-600 inline-flex items-center gap-1"><AlertCircle size={14} /> {erro}</p>}
          {dados?.erroSp && <p className="text-[12px] text-amber-600">SharePoint: {dados.erroSp}</p>}

          {dados === null && !erro ? (
            <div className="py-8 text-center text-torg-gray"><Loader2 size={22} className="mx-auto animate-spin" /><p className="text-xs mt-2">Buscando na pasta da Engenharia…</p></div>
          ) : arquivos.length === 0 ? (
            <p className="text-sm text-torg-gray py-4 text-center">Nenhum PDF encontrado pra <b className="font-mono">{marca}</b> em 2.5.2 Fabricação.</p>
          ) : (
            <div className="space-y-2">
              {arquivos.map((a) => {
                const lib = jaLiberado(a.nome);
                return (
                  <div key={a.itemId} className="border border-gray-100 rounded-lg px-3 py-2.5 flex items-center gap-3">
                    <FileText size={16} className="text-red-500 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-semibold truncate">{a.nome}</p>
                      <p className="text-[11px] text-torg-gray">
                        {a.formato ? <span className="font-bold text-torg-blue">Imprimir em {a.formato}</span> : "formato não identificado"} · {a.sizeKb} kb
                        {lib && <span className="text-emerald-700"> · <CheckCircle2 size={10} className="inline -mt-0.5" /> liberado {fmtDataHora(lib.createdAt)} por {lib.liberadoPorNome || "—"}</span>}
                      </p>
                    </div>
                    <button onClick={() => abrir(a)} title="Abrir o PDF (visualizar)"
                      className="text-[11px] font-semibold text-torg-blue border border-torg-blue-100 rounded-lg px-2 py-1.5 hover:bg-blue-50 inline-flex items-center gap-1 shrink-0"><ExternalLink size={12} /> Abrir</button>
                    <button onClick={() => liberar(a)} disabled={registrando === a.itemId} title="Carimba a rastreabilidade do material + quem emitiu, data e hora; registra a GRD, arquiva no SharePoint, amarra na §02 do Data Book e abre pra imprimir"
                      className="text-[11px] font-semibold text-white bg-torg-blue hover:bg-torg-blue/90 rounded-lg px-2 py-1.5 inline-flex items-center gap-1 shrink-0 disabled:opacity-50">
                      {registrando === a.itemId ? <Loader2 size={12} className="animate-spin" /> : <ShieldCheck size={12} />} Emitir rastreado
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {liberacoes.length > 0 && (
            <div>
              <p className="text-[10px] uppercase font-semibold text-torg-gray tracking-wide mb-1">Liberações registradas (GRD)</p>
              <div className="space-y-1">
                {liberacoes.map((l, i) => (
                  <p key={i} className="text-[11px] text-torg-gray">
                    <CheckCircle2 size={10} className="inline text-emerald-600 -mt-0.5" /> {l.arquivo}{l.formato ? ` · ${l.formato}` : ""}{l.setor ? ` · ${l.setor}` : ""} — {l.liberadoPorNome || "—"} em {fmtDataHora(l.createdAt)}
                    {l.impressoItemId && (
                      <button onClick={() => abrirItem(l.impressoItemId, `${marca} rastreado.pdf`)} title="Abrir o PDF carimbado que foi emitido (o mesmo do Data Book)"
                        className="ml-1 text-torg-blue font-semibold hover:underline">ver emitido</button>
                    )}
                  </p>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-gray-100">
          <p className="text-[11px] text-torg-gray">O formato (A1–A4) vem da pasta da Engenharia — imprima no papel indicado. <b>"Emitir rastreado"</b> carimba no PDF a rastreabilidade do material (nº R, corrida, certificado) e quem emitiu com data/hora, registra a GRD, arquiva o carimbado na pasta da OP e amarra o <b>mesmo arquivo</b> na §02 do Data Book. Onde a corrida está indefinida, o carimbo sai com as candidatas e um campo pra anotar a usada. "Abrir" mostra o original, sem carimbo e sem registro.</p>
        </div>
      </div>
    </div>
  );
}
