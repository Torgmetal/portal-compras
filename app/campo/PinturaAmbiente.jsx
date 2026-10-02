"use client";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { Txt } from "./controles";
import { leituraNumerica, mediaEspessura, numeroComVirgula } from "@/lib/pintura-campos";

// ─── O QUE A TELA DE PINTURA JULGA, NO CELULAR ───────────────────────────────────────────────
//
// Os quatro números do item 5.4 do PO-05 e o veredito sobre eles — o mesmo bloco para o
// jateamento e para cada demão. Ver `ETAPAS_AMBIENTE` em lib/pintura-campos.js, que é onde mora a
// regra (inclusive a herança da leitura do jato pela demão que não tem a sua).
//
// E as leituras de espessura seca da demão, o outro número que a tela acende em vermelho
// (`LeiturasEspessura`, no fim do arquivo).

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

/**
 * As cinco leituras de espessura seca da demão aberta, e a média.
 *
 * ⚠⚠ SÓ A DEMÃO QUE FECHA A PELÍCULA É JULGADA contra a micragem mínima (`demaoFinal`, em
 * lib/pintura-campos.js). O medidor lê a película TOTAL sobre o aço, e a micragem que nasce do PLP é a
 * do SISTEMA — cada leitura da 1ª e da 2ª demão acendia vermelho à toa (RIP-102-002: fundo de 81 µm
 * contra 220; verificação dos modelos, 02/10/2026). A demão intermediária diz onde o mínimo é conferido.
 * ⚠ Na demão final, o PO-05 item 5.5.3.1 é literal: "nenhuma medição pode ser inferior à espessura
 * mínima definida no PLP" — por isso a leitura acende sozinha, uma a uma.
 */
export function LeiturasEspessura({ leituras, demao, final, minimo, onMudar }) {
  const lista = Array.isArray(leituras) ? leituras : ["", "", "", "", ""];
  const min = parseFloat(String(minimo ?? "").replace(",", "."));
  const temMinimo = Number.isFinite(min) && min > 0;
  const julga = !final || Number(demao) >= Number(final);
  const media = mediaEspessura(lista);
  return (
    <div>
      <p className="text-[12px] text-torg-gray mb-1">
        Espessura seca — 5 leituras (µm){temMinimo && julga ? ` · mínimo ${minimo}` : ""}
      </p>
      {temMinimo && !julga && (
        <p className="text-[12px] text-torg-gray mb-1 leading-tight">
          Leitura acumulada (película sobre o aço): o mínimo de {minimo} µm é conferido na {final}ª demão, a que fecha a película.
        </p>
      )}
      <div className="grid grid-cols-5 gap-1.5">
        {lista.map((v, i) => {
          const n = leituraNumerica(v);
          const baixa = julga && temMinimo && n != null && n < min;
          return (
            <input key={i} type="number" inputMode="decimal" aria-label={`Leitura ${i + 1} de espessura`} aria-invalid={baixa || undefined}
              value={v ?? ""} onChange={(e) => onMudar(i, e.target.value)}
              className={`w-full text-base font-mono text-center border-2 rounded-xl py-2.5 outline-none ${
                baixa ? "border-red-400 bg-red-50 text-red-700" : "border-gray-200 focus:border-torg-blue"}`} />
          );
        })}
      </div>
      {media != null && (
        <p className="text-center text-[13px] mt-1 font-semibold text-torg-dark">média {numeroComVirgula(media)} µm</p>
      )}
    </div>
  );
}
