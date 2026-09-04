"use client";
// ─── KANBAN DA CARGA DA PRODUÇÃO ───────────────────────────────────────────────
//
// Vitor (03/09/2026): "no painel do PCP você consegue criar o kanban para termos ideia da carga da
// produção?".
//
// ⚠⚠ A COLUNA É LIDA EM DIAS, NÃO EM QUILOS — é o que muda a decisão. Medido em 03/09/2026, jato e
// pintura tinham exatamente o mesmo peso na fila (82.244 kg cada) e um levava 12,9 dias e o outro
// 3,6, porque a pintura faz 23 t/dia e o jato 6,4. Um quadro só de quilos diria que os dois estão
// igualmente carregados — e mandaria empurrar trabalho para o lugar errado.
//
// ⚠⚠ ESTA TELA SÓ LÊ. É um retrato da fila; quem move trabalho continua sendo o Planejamento e as
// telas de cada setor.
//
// ⚠ A ORDEM DAS COLUNAS É A DO FLUXO da fábrica (preparação → montagem → solda → jato → pintura →
// acabamento): o quadro se lê da esquerda para a direita como a peça anda.
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { fmtOP } from "@/lib/utils";

const fmtN = (n) => new Intl.NumberFormat("pt-BR").format(Math.round(Number(n) || 0));
const fmt1 = (n) => (Math.round((Number(n) || 0) * 10) / 10).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export default function CargaProducao() {
  const [todas, setTodas] = useState(false);
  const [d, setD] = useState(null);

  useEffect(() => {
    let vivo = true;
    setD(null);
    fetch(`/api/pcp/carga-producao${todas ? "?todas=1" : ""}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => vivo && setD(j?.colunas ? j : { colunas: [] }))
      .catch(() => vivo && setD({ colunas: [] }));
    return () => { vivo = false; };
  }, [todas]);

  const colunas = d?.colunas || [];
  const comCarga = colunas.filter((c) => c.kg > 0);
  // ⚠ a barra compara as colunas ENTRE SI, em dias: é a leitura de "onde está o acúmulo".
  const maiorDias = Math.max(0.1, ...comCarga.map((c) => c.dias || 0));

  return (
    <div className="bg-white rounded-xl border border-torg-blue-100 overflow-hidden mb-4">
      <div className="flex items-center gap-2.5 flex-wrap px-4 py-2.5 border-b border-gray-100 bg-gray-50/60">
        <span className="text-[13px] font-bold text-torg-dark">Carga da produção</span>
        <div className="flex items-center gap-1">
          {/* ⚠ o padrão é a fila do PCP (obra com liberação ativa, a mesma régua da lista abaixo).
              Com "todas" entra obra parada, e a escala do quadro muda de patamar — a preparação
              saltava de 112 t para 1.884 t em 03/09/2026. */}
          <button onClick={() => setTodas(false)}
            className={`text-[11.5px] font-semibold px-2.5 py-1 rounded-md border ${
              !todas ? "bg-torg-blue text-white border-torg-blue" : "bg-white border-gray-200 text-torg-gray hover:border-torg-blue-300"}`}>
            obras do PCP{d?.obrasNaFila ? ` (${d.obrasNaFila})` : ""}
          </button>
          <button onClick={() => setTodas(true)}
            className={`text-[11.5px] font-semibold px-2.5 py-1 rounded-md border ${
              todas ? "bg-torg-blue text-white border-torg-blue" : "bg-white border-gray-200 text-torg-gray hover:border-torg-blue-300"}`}>
            todas
          </button>
        </div>
        <span className="ml-auto text-[11px] text-torg-gray-light">
          fila aberta no Syneco · dias no ritmo medido de cada setor
        </span>
      </div>

      {!d ? (
        <p className="px-4 py-4 text-[12.5px] text-torg-gray inline-flex items-center gap-2">
          <Loader2 size={13} className="animate-spin" /> somando a fila de cada setor…
        </p>
      ) : !comCarga.length ? (
        <p className="px-4 py-4 text-[12.5px] text-torg-gray">
          Nenhuma ordem em aberto no Syneco {todas ? "nas obras vivas." : "nas obras que o Planejamento colocou na fila."}
        </p>
      ) : (
        <div className="px-4 py-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-2 items-start">
          {colunas.map((c) => {
            const ehGargalo = c.setor === d.gargalo && c.kg > 0;
            const pct = c.dias != null ? Math.min(1, c.dias / maiorDias) : 0;
            return (
              <div key={c.setor}
                className={`border rounded-lg overflow-hidden ${ehGargalo ? "border-red-300" : "border-gray-100"}`}>
                <div className={`px-3 py-2 border-b ${ehGargalo ? "bg-red-50 border-red-100" : "bg-gray-50/70 border-gray-100"}`}>
                  <p className={`text-[12px] font-semibold ${ehGargalo ? "text-red-800" : "text-torg-dark"}`}>
                    {c.setor}{ehGargalo && <span className="font-normal"> · gargalo</span>}
                  </p>
                  <p className={`text-[17px] font-bold tabular-nums leading-tight ${ehGargalo ? "text-red-700" : "text-torg-dark"}`}>
                    {c.dias != null ? <>{fmt1(c.dias)} <span className="text-[12px] font-normal text-torg-gray">dias</span></> : "—"}
                  </p>
                  <p className={`text-[11px] ${ehGargalo ? "text-red-700" : "text-torg-gray"}`}>
                    {fmtN(c.kg)} kg{c.ritmoKgDia > 0
                      ? ` · ${fmtN(c.ritmoKgDia)} kg/dia`
                      : " · sem apontamento para medir o ritmo"}
                  </p>
                  <span className="block h-1.5 rounded-full bg-white/70 overflow-hidden mt-1.5">
                    <span className={`block h-1.5 ${ehGargalo ? "bg-red-500" : "bg-torg-blue"}`} style={{ width: `${pct * 100}%` }} />
                  </span>
                </div>
                {!c.obras.length ? (
                  <p className="px-3 py-2 text-[11.5px] text-torg-gray-light">sem fila</p>
                ) : c.obras.slice(0, 8).map((o) => (
                  <div key={o.opNumero} className="px-3 py-1.5 border-b border-gray-50 last:border-0 flex items-center gap-2">
                    <span className="text-[12px] font-mono text-torg-blue whitespace-nowrap">{fmtOP(o.opNumero)}</span>
                    <span className="ml-auto text-[12px] tabular-nums text-torg-gray whitespace-nowrap">{fmtN(o.kg)}</span>
                  </div>
                ))}
                {c.obras.length > 8 && (
                  <p className="px-3 py-1.5 text-[11px] text-torg-gray-light">
                    + {fmtN(c.obras.length - 8)} obras · {fmtN(c.obras.slice(8).reduce((s, o) => s + o.kg, 0))} kg
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
