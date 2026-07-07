"use client";
import { useState, useEffect } from "react";
import { FileBarChart2, CheckCircle2, ExternalLink, Copy } from "lucide-react";

const fmtDH = (d) => (d ? new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");

// Histórico dos Relatórios de Status vinculados à OP (painel do Comercial):
// rastreia tudo que foi enviado ao cliente e o aceite. Some se a OP não tiver
// nenhum relatório (não polui a tela).
export default function RelatoriosOPSection({ opId }) {
  const [rels, setRels] = useState([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    if (!opId) return;
    let vivo = true;
    (async () => {
      try {
        const r = await fetch(`/api/relatorios?opId=${opId}`);
        const d = await r.json();
        if (vivo && r.ok) setRels(d.relatorios || []);
      } catch { /* silencioso */ }
      finally { if (vivo) setCarregando(false); }
    })();
    return () => { vivo = false; };
  }, [opId]);

  if (carregando || !rels.length) return null;

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const copiarLink = (token) => { if (token && navigator?.clipboard) navigator.clipboard.writeText(`${origin}/relatorio/aceite/${token}`); };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2 flex-wrap">
        <FileBarChart2 size={18} className="text-torg-blue" />
        <h3 className="text-lg font-semibold text-torg-dark">Relatórios de Status ({rels.length})</h3>
        <span className="text-xs text-torg-gray">— tudo que foi enviado ao cliente</span>
      </div>
      <ul className="divide-y divide-gray-100">
        {rels.map((r) => {
          const ult = r.envios?.length ? r.envios[r.envios.length - 1] : null;
          return (
            <li key={r.id} className="px-6 py-3">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <a href={`/relatorios/${r.id}`} className="font-medium text-torg-dark hover:text-torg-blue">{r.titulo}</a>
                  <div className="text-xs text-torg-gray mt-0.5">
                    {r.nEnvios > 0 ? <>Enviado {r.nEnvios}× · último {fmtDH(r.ultimoEnvio)}{r.criadoPorNome ? ` · ${r.criadoPorNome}` : ""}</> : <span className="text-amber-600">ainda não enviado ao cliente</span>}
                  </div>
                  {ult && (
                    <div className="text-[11px] text-torg-gray mt-0.5 break-words">
                      Para: {(ult.para || []).join(", ")}{ult.cc?.length ? ` · cc: ${ult.cc.join(", ")}` : ""}
                    </div>
                  )}
                </div>
                <div className="text-right shrink-0">
                  {r.aceitoEm ? (
                    <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-50 rounded-full px-2 py-0.5 font-medium"><CheckCircle2 size={12} /> Aceito pelo cliente</span>
                  ) : r.nEnvios > 0 ? (
                    <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-50 rounded-full px-2 py-0.5 font-medium">Aguardando aceite</span>
                  ) : null}
                  {r.aceitoEm && <div className="text-[11px] text-torg-gray mt-1">{r.aceitoNome} · {fmtDH(r.aceitoEm)}</div>}
                </div>
              </div>
              <div className="flex items-center gap-3 mt-1.5">
                <a href={`/api/relatorios/${r.id}/pdf`} target="_blank" rel="noreferrer" className="text-[11px] text-torg-blue hover:underline inline-flex items-center gap-1"><ExternalLink size={11} /> PDF</a>
                {r.token && <button onClick={() => copiarLink(r.token)} className="text-[11px] text-torg-gray hover:text-torg-dark inline-flex items-center gap-1"><Copy size={11} /> copiar link de aceite</button>}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
