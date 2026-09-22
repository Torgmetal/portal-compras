"use client";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { Txt } from "./controles";

// ─── A CONDIÇÃO AMBIENTAL, NO CELULAR ────────────────────────────────────────────────────────
//
// Os quatro números do item 5.4 do PO-05 e o veredito sobre eles — o mesmo bloco para o
// jateamento e para cada demão. Ver `ETAPAS_AMBIENTE` em lib/pintura-campos.js, que é onde mora a
// regra (inclusive a herança da leitura do jato pela demão que não tem a sua).

/**
 * Os quatro números do item 5.4 — o MESMO bloco para o jateamento e para cada demão.
 *
 * ⚠ Um componente só porque as duas etapas medem a mesma coisa: duplicado, o dia em que a regra
 * mudar de lado ela muda num lugar e fica velha no outro.
 */
export function CamposAmbiente({ valores, onMudar }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <Txt rot="Temp. ambiente (°C)" tipo="number" v={valores?.tAmb} onMudar={(v) => onMudar("tAmb", v)} />
      <Txt rot="Temp. superfície (°C)" tipo="number" v={valores?.tSup} onMudar={(v) => onMudar("tSup", v)} />
      <Txt rot="Ponto de orvalho (°C)" tipo="number" v={valores?.orvalho} onMudar={(v) => onMudar("orvalho", v)} />
      <Txt rot="Umidade relativa (%)" tipo="number" v={valores?.umidade} onMudar={(v) => onMudar("umidade", v)} />
    </div>
  );
}

/**
 * O veredito do item 5.4 — o mesmo desenho para o jato e para cada demão.
 *
 * ⚠ Um por etapa, porque a decisão é por etapa: o jato pode ter sido num dia perfeito e o fundo,
 * aplicado à tarde, com 92% de umidade. Um veredito só, no topo da tela, diria "pode pintar" sobre
 * uma medição que não é da aplicação.
 */
export function Veredito({ amb }) {
  if (!amb?.avaliado) return null;
  return (
    <div className={`mt-2 rounded-xl px-3 py-2.5 ${amb.permitido ? "bg-emerald-50 border-2 border-emerald-300" : "bg-red-50 border-2 border-red-300"}`}>
      <p className={`text-[13px] font-bold inline-flex items-center gap-1.5 ${amb.permitido ? "text-emerald-800" : "text-red-700"}`}>
        {amb.permitido ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
        {amb.permitido ? "Condições permitem pintar" : "NÃO PODE PINTAR"}
      </p>
      {!amb.permitido && (
        <ul className="text-[12px] text-red-700 mt-1 space-y-0.5">
          {amb.impedimentos.map((im, i) => <li key={i}>· {im}</li>)}
        </ul>
      )}
    </div>
  );
}
