"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, TriangleAlert } from "lucide-react";
import ConferirGantt from "./ConferirGantt";

function doPlano(plano) {
  const avisos = plano.divergencias?.avisos || [];
  const pendentes = plano.divergencias?.pendentes || [];
  return {
    avisos, pendentes,
    unidades: plano.unidades || [],
    tudo: [...avisos, ...pendentes.map((p) => `${p.marca}: ${p.motivo}`)],
  };
}

/** Um plano já importado. Fechado por padrão: a lista cresce rápido e o que se procura é o de hoje. */
export default function Plano({ plano, recursos = [] }) {
  const [aberto, setAberto] = useState(false);
  const { unidades, tudo } = doPlano(plano);

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
      <button onClick={() => setAberto((v) => !v)} className="flex w-full items-center gap-3 px-5 py-3.5 text-left">
        {aberto ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold">{plano.nome}</p>
          <p className="truncate text-xs text-torg-gray">
            {plano.origem} · obra {plano.opNumero || "—"} · {unidades.length}{" "}
            {unidades[0]?.tipo === "CHAPA" ? "chapa(s)" : "barra(s)"}
            {plano.descricao ? ` · ${plano.descricao}` : ""}
          </p>
        </div>
        {tudo.length > 0 ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-amber-50 px-2 py-1 text-[11px] font-bold text-amber-800">
            <TriangleAlert size={12} /> {tudo.length}
          </span>
        ) : null}
      </button>

      {aberto ? (
        <div className="border-t border-gray-100 px-5 py-4">
          {tudo.map((a) => (
            <p key={a} className="mb-1 text-xs font-semibold text-amber-800">⚠ {a}</p>
          ))}
          <div className="mt-2 space-y-2">
            {unidades.map((u) => (
              <div key={u.id} className="rounded-xl bg-gray-50/60 px-3 py-2">
                <p className="text-xs font-bold">
                  {u.tipo === "CHAPA" ? "Chapa" : "Barra"} {u.indice} · {u.pecas} peças
                </p>
                <p className="mt-1 text-xs text-torg-gray">
                  {(u.itens || []).map((i) => `${i.qtd}× ${i.marca}`).join("  ·  ")}
                </p>
              </div>
            ))}
          </div>
          {recursos.length ? <ConferirGantt planoId={plano.id} recursos={recursos} /> : null}

          {/* ⚠ O hash é o que amarra a versão do plano: mesmo nome com conteúdo diferente é plano
              NOVO, não uma atualização deste (§12.3). */}
          <p className="mt-3 text-[11px] text-torg-gray-light">
            {plano.arquivoRelatorio}
            {plano.arquivoMaquina ? ` · ${plano.arquivoMaquina}` : ""} · hash{" "}
            {String(plano.hashRelatorio).slice(0, 12)}
          </p>
        </div>
      ) : null}
    </div>
  );
}
