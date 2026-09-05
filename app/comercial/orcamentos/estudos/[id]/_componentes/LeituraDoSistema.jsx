"use client";

/**
 * O que a IA leu da planilha do cliente aparece ANTES de valer.
 *
 * Aplicar direto sobrescreveria camadas preenchidas à mão — e numa planilha do cliente, um
 * campo mal lido vira preço errado sem ninguém ver.
 */
export function LeituraDoSistema({
  aplicarLeitura,
  leitura,
  setLeitura,
}) {
  return (
    <div className="mb-3 rounded-lg border-2 border-torg-blue-200 bg-torg-blue-50/40 px-3 py-2.5">
      <p className="text-[12px] font-semibold text-torg-dark">
        Li o sistema de pintura{leitura.fabricante ? ` — fabricante ${leitura.fabricante}` : ""}
      </p>
      <table className="mt-2 w-full text-[11px]">
        <thead className="text-[10px] uppercase text-torg-gray">
          <tr><th className="text-left py-1">Demão</th><th className="text-left py-1">Produto</th>
            <th className="text-right py-1">Película</th><th className="text-right py-1">Sólidos</th>
            <th className="text-left py-1 pl-3">Cor</th></tr>
        </thead>
        <tbody>
          {leitura.camadas.map((cm, i) => (
            <tr key={i} className="border-t border-torg-blue-100/60">
              <td className="py-1 font-semibold text-torg-dark">{cm.demao} · {cm.camada}</td>
              <td className="py-1 text-torg-dark">{cm.produto || "—"}</td>
              <td className="py-1 text-right tabular-nums">{cm.peliculaSeca ?? "—"} µm</td>
              <td className="py-1 text-right tabular-nums">{cm.solidos ?? "—"}%</td>
              <td className="py-1 pl-3 text-torg-dark">
                {cm.camada === "ACABAMENTO" ? (cm.cor || leitura.cores?.[0]?.cor || "—") : (cm.cor || "Cinza")}
                {cm.camada !== "ACABAMENTO" && <span className="text-torg-gray"> (padrão)</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {leitura.cores?.length > 0 && (
        <p className="mt-2 text-[11px] text-torg-dark">
          Cores de acabamento:{" "}
          {leitura.cores.map((c) => `${c.cor}${c.notacao ? ` (${c.notacao})` : ""}`).join(" · ")}
        </p>
      )}
      {leitura.avisos?.map((a2, i) => (
        <p key={i} className="mt-1 text-[11px] text-torg-orange-700">⚠ {a2}</p>
      ))}
      <div className="mt-2 flex flex-wrap gap-2">
        <button onClick={aplicarLeitura}
          className="text-[12px] font-semibold text-white bg-torg-blue rounded-lg px-3 py-1.5 hover:bg-torg-dark">
          Preencher as camadas com isto
        </button>
        <button onClick={() => setLeitura(null)}
          className="text-[12px] font-medium text-torg-gray hover:text-torg-dark px-3 py-1.5">
          Descartar — o arquivo continua anexado
        </button>
      </div>
    </div>
  );
}
