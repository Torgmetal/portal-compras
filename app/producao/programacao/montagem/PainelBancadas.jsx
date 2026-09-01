"use client";
// ─── REPARTIR OS CONJUNTOS ENTRE AS BANCADAS ──────────────────────────────────
// Vitor (01/09/2026), o fluxo inteiro: "quero que a Larissa selecione todas as marcas que estão
// disponível para montagem de acordo com a liberação dos croquis, com isso ele vai e libera para
// produção (…) deixa ela selecionar quantas bancadas ela vai usar para aquela OP, será uma decisão
// que ela vai tomar junto com o encarregado da fábrica, quando selecionado e dado o ok ele vai
// imprimir os conjuntos (…) e separa na pasta da obra as pastas com os conjuntos de cada bancada".
//
// ⚠⚠ O NÚMERO DE BANCADAS É DECISÃO DE GENTE, NÃO DO PORTAL. A tela mostra o efeito de cada
// escolha (1 a 5) e não sugere nem trava: quem sabe quantos montadores há no turno é a Larissa com
// o encarregado, e essa informação não está em banco nenhum.
//
// ⚠ AS DUAS RÉGUAS APARECEM JUNTAS. A META (p75) é o alvo que o Vitor pediu — "precisa ser mais do
// que esse número" — e o ritmo NORMAL (mediana) é o piso. Mostrar só a meta viraria promessa que a
// fábrica não bate todo dia; mostrar só a mediana desperdiça a capacidade que ela já provou ter.
import { useState, useMemo } from "react";
import { Loader2, Printer, AlertCircle, Flag, Users } from "lucide-react";
import { repartirPorBancada, resumoDoLote, distribuirEmDias, ultimoDia, RITMO_META } from "@/lib/montagem-capacidade";

const fmtKg = (v) => `${(Number(v) || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} kg`;
const fmtDia = (d) => new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
const diaSemana = (d) => new Date(d).toLocaleDateString("pt-BR", { weekday: "short", timeZone: "UTC" }).replace(".", "");
// ⚠ o início sugerido é o PRÓXIMO DIA ÚTIL, não hoje: liberar de manhã para montar hoje à tarde é
// a exceção, não a regra — e a jornada de hoje já está no meio.
function proximoUtilIso() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  do { d.setUTCDate(d.getUTCDate() + 1); } while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
  return d.toISOString().slice(0, 10);
}

export default function PainelBancadas({ conjuntos, onLiberar, ocupado }) {
  const [n, setN] = useState(4);
  const [inicio, setInicio] = useState(proximoUtilIso);

  const distrib = useMemo(() => repartirPorBancada(conjuntos, n, { curva: RITMO_META }), [conjuntos, n]);
  // ⚠⚠ A JANELA É CONSEQUÊNCIA, NÃO ENTRADA. Vitor (01/09/2026): "não é programar um único dia, ela
  // poderia muito bem já estar programando a montagem de dias para frente". Ela dá o INÍCIO; até
  // onde vai é o que a capacidade das bancadas devolve. Pedir a data de fim deixaria escolher um
  // prazo que a fábrica não alcança.
  const porDia = useMemo(
    () => (inicio ? distribuirEmDias(distrib, new Date(inicio + "T00:00:00Z")) : []),
    [distrib, inicio]
  );
  const fim = useMemo(() => ultimoDia(porDia), [porDia]);
  const diasCorridos = useMemo(() => {
    const s = new Set();
    for (const b of porDia) for (const d of b.dias) s.add(d.dia.toISOString().slice(0, 10));
    return [...s].sort();
  }, [porDia]);
  const resumo = useMemo(() => resumoDoLote(conjuntos, n), [conjuntos, n]);
  const comPrioridade = useMemo(() => conjuntos.filter((c) => c.prioridade != null).length, [conjuntos]);

  if (!conjuntos.length) return null;

  return (
    <div className="bg-white rounded-xl border border-torg-blue-100 p-4 space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <h3 className="font-bold text-torg-dark inline-flex items-center gap-2 text-sm">
          <Users size={16} className="text-torg-blue" /> Repartir entre as bancadas
        </h3>
        <span className="text-[12px] text-torg-gray">
          {conjuntos.length} conjunto(s) · <b className="text-torg-dark">{resumo.un} peças</b> · {fmtKg(resumo.kg)}
          {comPrioridade > 0 && (
            <span className="ml-2 text-red-700 font-semibold inline-flex items-center gap-1">
              <Flag size={11} /> {comPrioridade} com prioridade
            </span>
          )}
        </span>
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          <label className="text-[11px] text-torg-gray">começa em</label>
          <input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)}
            className="px-2 py-1 text-[12px] border border-gray-200 rounded-lg" />
          <span className="text-[11px] text-torg-gray ml-1">bancadas:</span>
          {[1, 2, 3, 4, 5].map((k) => (
            <button key={k} onClick={() => setN(k)}
              className={`w-8 h-8 rounded-lg text-sm font-bold ${n === k
                ? "bg-torg-blue text-white" : "bg-gray-50 text-torg-gray hover:bg-torg-blue-50"}`}>
              {k}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
        <Cx rot="na meta" val={`${resumo.diasMeta.toFixed(1)} dias`} sub={`${resumo.diasBancadaMeta.toFixed(1)} dias-bancada`} forte />
        <Cx rot="ritmo normal" val={`${resumo.diasNormal.toFixed(1)} dias`} sub={`${resumo.diasBancadaNormal.toFixed(1)} dias-bancada`} />
        <Cx rot="por bancada / dia" val={`${Math.round(resumo.un / Math.max(0.1, resumo.diasMeta) / n)} peças`} sub="alvo da meta" />
        <Cx rot="fecha em" val={fim ? `${diaSemana(fim)} ${fmtDia(fim)}` : "—"}
          sub={`${diasCorridos.length} dia(s) úteis a partir de ${fmtDia(inicio + "T00:00:00Z")}`} />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[12px] min-w-[560px]">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-torg-gray border-b border-gray-100">
              <th className="text-left py-1.5">Bancada</th>
              <th className="text-right py-1.5">Conjuntos</th>
              <th className="text-right py-1.5">Peças</th>
              <th className="text-right py-1.5">Peso</th>
              <th className="text-right py-1.5">Dias (meta)</th>
              <th className="text-left py-1.5 pl-3">Quando</th>
              <th className="text-left py-1.5 pl-3">Prioridade</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {distrib.map((b) => {
              const prio = b.itens.filter((i) => i.prioridade != null);
              return (
                <tr key={b.bancada}>
                  <td className="py-1.5 font-semibold text-torg-dark">{b.bancada}</td>
                  <td className="py-1.5 text-right tabular-nums">{b.itens.length}</td>
                  {/* ⚠⚠ PEÇAS E PESO SAEM DESIGUAIS DE PROPÓSITO. O que se equilibra é o TRABALHO:
                      uma bancada pode levar 21 peças de 3.843 kg e outra 71 de 1.408 kg e as duas
                      terminarem juntas. Igualar peso ou contagem é o que faz uma acabar em 3 dias e
                      a outra em 9. */}
                  <td className="py-1.5 text-right tabular-nums font-semibold text-torg-dark">{b.un}</td>
                  <td className="py-1.5 text-right tabular-nums">{fmtKg(b.kg)}</td>
                  <td className="py-1.5 text-right tabular-nums font-semibold">{b.dias.toFixed(1)}</td>
                  {/* ⚠ dia a dia, com a carga de cada um: é o que a bancada vê como jornada */}
                  <td className="py-1.5 pl-3 text-[11px] text-torg-gray whitespace-nowrap">
                    {(porDia.find((x) => x.bancada === b.bancada)?.dias || []).map((d) => (
                      <span key={d.dia.toISOString()} className="inline-block mr-2">
                        <b className="text-torg-dark">{fmtDia(d.dia)}</b> {d.itens.length}c
                      </span>
                    ))}
                  </td>
                  <td className="py-1.5 pl-3 text-red-700 font-medium">
                    {prio.length ? prio.map((i) => i.marca).join(", ") : <span className="text-gray-300">—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-2 flex-wrap pt-1">
        <button
          onClick={() => onLiberar(distrib, porDia)}
          disabled={ocupado}
          className="px-4 py-2 bg-torg-blue text-white text-sm font-medium rounded-lg hover:bg-torg-blue-700 inline-flex items-center gap-2 disabled:opacity-50">
          {ocupado ? <Loader2 size={15} className="animate-spin" /> : <Printer size={15} />}
          Liberar e imprimir por bancada
        </button>
        <span className="text-[11px] text-torg-gray inline-flex items-center gap-1">
          <AlertCircle size={12} />
          libera para produção, carimba com o R dos croquis e baixa um ZIP com uma pasta por bancada
        </span>
      </div>
    </div>
  );
}

function Cx({ rot, val, sub, forte }) {
  return (
    <div className={`rounded-lg px-2 py-2 ${forte ? "bg-torg-blue-50" : "bg-gray-50"}`}>
      <p className="text-[10px] uppercase tracking-wider text-torg-gray">{rot}</p>
      <p className={`text-base font-extrabold leading-tight ${forte ? "text-torg-blue" : "text-torg-dark"}`}>{val}</p>
      <p className="text-[10px] text-torg-gray">{sub}</p>
    </div>
  );
}
