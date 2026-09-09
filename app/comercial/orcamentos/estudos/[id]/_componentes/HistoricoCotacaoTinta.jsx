"use client";
import {fmtR$} from "../_lib/formatos";
export default function HistoricoCotacaoTinta({cotacoes=[],marcarVencedor}) {return <div>
      {cotacoes.map((ct) => (
        <div key={ct.id} className="mt-3 border-t border-gray-100 pt-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-torg-gray mb-1.5">
            Mapa · consulta de {new Date(ct.enviadoEm).toLocaleDateString("pt-BR")}
            {ct.enviadoPorNome ? ` · ${ct.enviadoPorNome}` : ""}
            {ct.snapshot?.areaM2 ? ` · ${Number(ct.snapshot.areaM2).toLocaleString("pt-BR")} m²${ct.snapshot.perda != null ? ` · perda ${ct.snapshot.perda}%` : ""}` : ""}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px] min-w-[560px]">
              <thead className="text-[10px] uppercase text-torg-gray">
                <tr>
                  <th className="text-left py-1">Fabricante</th>
                  <th className="text-left py-1">Situação</th>
                  <th className="text-right py-1">Galões</th>
                  <th className="text-right py-1">Total</th>
                  <th className="text-left py-1 pl-3">Prazo</th>
                  <th className="py-1" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {ct.fornecedores.map((f) => {
                  const r = f.resposta;
                  const galoes = (r?.camadas || []).reduce((s2, c2) => s2 + (Number(c2.galoes) || 0), 0);
                  return (
                    <tr key={f.id} className={f.vencedor ? "bg-emerald-50/60" : undefined}>
                      <td className="py-1.5 font-medium text-torg-dark">{f.nome}</td>
                      <td className="py-1.5">
                        {f.erroEnvio
                          ? <span className="text-red-600" title={f.erroEnvio}>e-mail falhou</span>
                          : f.respondidoEm
                            ? <span className="text-emerald-700">respondeu {new Date(f.respondidoEm).toLocaleDateString("pt-BR")}</span>
                            : <span className="text-torg-gray">aguardando</span>}
                      </td>
                      <td className="py-1.5 text-right tabular-nums">{galoes || "—"}</td>
                      <td className="py-1.5 text-right tabular-nums font-semibold text-torg-dark">
                        {f.valorTotal > 0 ? fmtR$(f.valorTotal) : "—"}
                      </td>
                      <td className="py-1.5 pl-3">{r?.prazo || "—"}</td>
                      <td className="py-1.5 text-right">
                        {f.valorTotal > 0 && (
                          <button onClick={() => marcarVencedor(f.id)}
                            className={`text-[11px] font-semibold rounded px-2 py-0.5 ${
                              f.vencedor ? "bg-emerald-600 text-white" : "text-torg-blue border border-torg-blue-200 hover:bg-torg-blue-50"}`}>
                            {f.vencedor ? "vencedor" : "marcar"}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {ct.fornecedores.some((f) => f.resposta?.observacao) && (
            <div className="mt-1.5 space-y-0.5">
              {ct.fornecedores.filter((f) => f.resposta?.observacao).map((f) => (
                <p key={f.id} className="text-[11px] text-torg-gray"><strong>{f.nome}:</strong> {f.resposta.observacao}</p>
              ))}
            </div>
          )}
        </div>
      ))}
</div>;}
