"use client";
import { useEffect, useState } from "react";
import { Loader2, AlertTriangle, FileText } from "lucide-react";

/**
 * AS NÃO CONFORMIDADES, NA MÃO DO INSPETOR.
 *
 * Vitor (21/08/2026): "após o login no portal pelo inspetor de campo, crie dois campos RNC /
 * Preenchimento de Relatórios".
 *
 * ⚠ AQUI SE CONSULTA E SE EVIDENCIA, NÃO SE DECIDE. Disposição (retrabalhar, refugar, aprovar por
 * concessão), causa raiz e plano de ação são da Qualidade com a Engenharia. O inspetor vê o que foi
 * apontado, confere na peça e junta foto — que é o que falta na maioria das RNCs quando alguém vai
 * analisar a causa semanas depois.
 */
export default function RNCs({ op, onSair, Tela }) {
  const [lista, setLista] = useState(null);
  const [aberta, setAberta] = useState(null);

  useEffect(() => {
    fetch(`/api/campo/rnc?opNumero=${encodeURIComponent(op.numero)}`)
      .then((r) => r.json()).then((j) => setLista(j.rncs || [])).catch(() => setLista([]));
  }, [op.numero]);

  if (aberta) {
    return (
      <Tela titulo={aberta.titulo} sub={`OP-${op.numero}`} voltar={() => setAberta(null)}>
        <div className="bg-white border border-gray-200 rounded-xl p-3">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <span className={`text-[11px] font-semibold rounded-full px-2 py-0.5 border ${
              aberta.status === "ABERTA" ? "text-red-700 bg-red-50 border-red-200" : "text-amber-700 bg-amber-50 border-amber-200"}`}>
              {aberta.status?.toLowerCase()}
            </span>
            {aberta.relatorioCodigo && (
              <span className="text-[12px] font-mono text-torg-blue">{aberta.relatorioCodigo}</span>
            )}
          </div>
          {aberta.desenhoProjetoMarca && <p className="text-[13px] font-mono text-torg-dark">{aberta.desenhoProjetoMarca}</p>}
          {aberta.processoArea && <p className="text-[12px] text-torg-gray">{aberta.processoArea}</p>}
          <p className="text-[13px] text-torg-dark whitespace-pre-line mt-2 leading-snug">{aberta.descricao || "—"}</p>
          {aberta.disposicao && (
            <p className="text-[12px] text-torg-dark mt-2">
              <strong>Disposição:</strong> {String(aberta.disposicao).replace(/_/g, " ").toLowerCase()}
            </p>
          )}
          {!aberta.disposicao && (
            <p className="text-[12px] text-torg-gray mt-2">Disposição ainda não definida pela Qualidade.</p>
          )}
        </div>
      </Tela>
    );
  }

  return (
    <Tela titulo={`OP-${op.numero}`} sub="Não conformidades" voltar={onSair}>
      {lista === null && <p className="text-sm text-torg-gray inline-flex items-center gap-2"><Loader2 size={15} className="animate-spin" /> buscando…</p>}
      {lista && !lista.length && <p className="text-sm text-torg-gray">Nenhuma RNC aberta nesta OP.</p>}
      <div className="space-y-2">
        {(lista || []).map((r) => (
          <button key={r.id} onClick={() => setAberta(r)}
            className="w-full text-left bg-white border border-gray-200 rounded-xl px-4 py-3.5 active:bg-gray-50">
            <div className="flex items-center justify-between gap-2">
              <span className="font-bold text-torg-dark text-[15px] inline-flex items-center gap-1.5">
                <AlertTriangle size={15} className="text-red-600" /> {r.titulo}
              </span>
              <span className="text-[11px] font-semibold text-red-700 bg-red-50 border border-red-200 rounded-full px-2 py-0.5">
                {r.status?.toLowerCase()}
              </span>
            </div>
            {r.desenhoProjetoMarca && <p className="text-[13px] text-torg-dark font-mono mt-0.5">{r.desenhoProjetoMarca}</p>}
            {r.relatorioCodigo && (
              <p className="text-[12px] text-torg-gray inline-flex items-center gap-1 mt-0.5">
                <FileText size={11} /> aberta pelo {r.relatorioCodigo}
              </p>
            )}
          </button>
        ))}
      </div>
    </Tela>
  );
}
