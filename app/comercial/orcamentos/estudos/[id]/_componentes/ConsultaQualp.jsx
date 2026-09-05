"use client";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useStore } from "@/lib/store";
import { Inp, Kpi } from "./campos";
import { fmtR$ } from "../_lib/formatos";

/**
 * CONSULTA NA QUALP — distância, pedágio e o piso da ANTT.
 *
 * Vitor (23/08/2026): "conseguimos deixar uma forma de linkar com o site qualp.com.br para
 * podermos fazer o cálculo para informar o valor do frete".
 *
 * ⚠ O PISO DA ANTT NÃO É ESTIMATIVA, É LEI. O transporte rodoviário de carga tem piso mínimo por
 * distância, eixos e tipo de carga — é o número com que o transportador negocia. Orçar frete "por
 * quilo, de cabeça" pode cair abaixo do piso, e aí ou a proposta é refeita ou a margem paga a
 * diferença.
 *
 * ⚠ PRECISA DE ASSINATURA. A API é paga e a chave sai do painel da QualP.
 *
 * ⚠ NÃO ESTÁ NA TELA HOJE. Vitor (23/08/2026) pediu para tirar a opção enquanto a assinatura não
 * existe — botão que não funciona é pior que botão que não existe. Fica aqui inteiro: contratado
 * o plano, é descomentar a chamada na aba de Frete e pôr a chave em QUALP_TOKEN.
 */
// eslint-disable-next-line no-unused-vars
export function ConsultaQualp({ c, res, setComp }) {
  const { showToast } = useStore();
  const f = c.frete || {};
  const [carregando, setCarregando] = useState(false);
  const [r, setR] = useState(null);

  const consultar = async () => {
    if (!f.origem || !f.destino) { showToast("Preencha origem e destino.", "error"); return; }
    setCarregando(true);
    try {
      const resp = await fetch("/api/comercial/frete/qualp", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ origem: f.origem, destino: f.destino, eixos: f.eixos || 6, cargaKg: res.pesoTotal }),
      });
      const j = await resp.json();
      setR(j);
      if (!j.ok) showToast(j.erro || "Não consegui consultar.", "error");
    } catch (e) { showToast(e.message, "error"); }
    finally { setCarregando(false); }
  };

  return (
    <div className="bg-white border border-gray-100 rounded-xl p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[12px] font-bold text-torg-dark">Consultar na QualP</p>
          <p className="text-[11px] text-torg-gray mt-0.5">
            Traz distância, pedágio e o piso mínimo da ANTT para a rota — o número com que o
            transportador negocia.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-[11px] text-torg-dark">Eixos
            <Inp value={f.eixos ?? ""} placeholder="6" onChange={(e) => setComp({ frete: { ...f, eixos: e.target.value } })} className="block mt-1 w-16 text-right" /></label>
          <button onClick={consultar} disabled={carregando}
            className="text-[12px] font-semibold text-torg-blue border border-torg-blue/30 rounded-lg px-3 py-1.5 hover:bg-torg-blue-50 disabled:opacity-50 inline-flex items-center gap-1.5">
            {carregando ? <Loader2 size={13} className="animate-spin" /> : null} Consultar rota
          </button>
        </div>
      </div>

      {r?.semChave && (
        <p className="text-[11px] text-torg-dark bg-[#FFF7ED] border border-[#F4801F]/30 rounded-lg px-3 py-2.5 mt-3">
          A consulta precisa de uma assinatura da QualP (planos a partir de R$ 390/mês em
          api.qualp.com.br). Contratado, a chave vai na variável <strong>QUALP_TOKEN</strong> e o
          botão passa a funcionar — o resto já está pronto.
        </p>
      )}

      {r?.ok && (
        <div className="mt-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-gray-100 border border-gray-100 rounded-lg overflow-hidden">
            <Kpi r="Distância" v={r.distanciaKm ? `${Number(r.distanciaKm).toLocaleString("pt-BR")} km` : "—"} />
            <Kpi r="Pedágio" v={r.pedagio ? fmtR$(r.pedagio) : "—"} />
            <Kpi r="Piso ANTT" v={r.pisoAntt ? fmtR$(r.pisoAntt) : "—"} />
            <Kpi r="Equivale a" v={r.porKg ? `${fmtR$(r.porKg)}/kg` : "—"} />
          </div>
          {r.pisoAntt > 0 && (
            <div className="flex flex-wrap items-center gap-2 mt-3">
              <button onClick={() => setComp({ frete: { ...f, modo: "verba", verba: r.pisoAntt, consulta: { em: r.consultadoEm, distanciaKm: r.distanciaKm, pedagio: r.pedagio } } })}
                className="text-[11px] font-semibold text-torg-blue hover:underline">usar o piso como valor fechado</button>
              {r.porKg > 0 && (<>
                <span className="text-gray-300">·</span>
                <button onClick={() => setComp({ frete: { ...f, modo: "kg", precoKg: r.porKg, consulta: { em: r.consultadoEm, distanciaKm: r.distanciaKm, pedagio: r.pedagio } } })}
                  className="text-[11px] font-semibold text-torg-blue hover:underline">usar como R$/kg</button>
              </>)}
            </div>
          )}
          {/* ⚠ o piso é MÍNIMO legal, não o preço do transportador: pedágio, retorno vazio e
              carga especial entram por cima. Adotar sem conferir é orçar no piso. */}
          <p className="text-[11px] text-torg-gray mt-2">
            O piso da ANTT é o mínimo legal, não a cotação: pedágio, retorno vazio e carga especial
            entram por cima. Use como base e confira com o transportador.
          </p>
          {!r.pisoAntt && (
            <p className="text-[11px] text-torg-orange-700 mt-2">
              A resposta veio sem a tabela de frete — pode ser o plano contratado (a tabela é
              recurso de plano) ou nome de campo diferente. A resposta crua está guardada para eu
              ajustar a leitura.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
