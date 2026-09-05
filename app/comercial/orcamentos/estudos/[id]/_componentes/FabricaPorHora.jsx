"use client";
import { numeroBr } from "@/lib/lqc";
import { capacidadePorHora } from "@/lib/fabrica-horas";
import { Inp, Kpi } from "./campos";

/**
 * A FÁBRICA POR HORA — quanto ela aguenta, e o que isso faz com o custo.
 *
 * Vitor (23/08/2026): "vamos seguir dessa maneira, por hora — com base nessas análises vamos
 * colocar esses números para o cenário financeiro para vermos o que de fato é".
 *
 * ⚠⚠ A LIÇÃO QUE CUSTOU CARO: HH/t NÃO SE MEDE EM FÁBRICA OCIOSA. Com 4 montadores e só 114 t de
 * serviço na frente deles, a conta devolve 6,2 HH/t seja o trabalho de 1,7 ou de 6,2 — o que se
 * mediu foi EFETIVO ÷ PRODUÇÃO, não conteúdo de trabalho. Por isso a linha "medido" desta tela
 * sempre mostra 100% de ocupação: ela foi derivada da própria produção. É circular, e está
 * escrito na tela para ninguém tomar decisão em cima dela.
 *
 * ⚠ Vitor: "tenho 4 montadores, cada um monta 5 t por dia, só aí daria 440 t". Com essa régua
 * TODOS os postos aparecem entre 17% e 27% de ocupação — consistente demais para ser coincidência.
 * É a assinatura de fábrica limitada por CARTEIRA, não por capacidade. E aí o gargalo é a
 * PINTURA, com 3 pessoas.
 */
export function FabricaPorHora({ fabrica, cfg, mexer, cadencia }) {
  const set = (k, v) => mexer((a) => ({ cenario: { ...(a.cenario || {}), [k]: v } }));
  const rota = fabrica.rota || [];
  if (!rota.length) return null;

  const regua = numeroBr(cfg.kgPessoaDia);
  const cap = capacidadePorHora({
    rota, horasPessoaMes: fabrica.horasPessoaMes, diasUteis: fabrica.diasUteis,
    hhPorTonelada: regua > 0 ? 0 : fabrica.hhPorTRota,
    kgPorPessoaDia: regua,
  });
  const custoMes = fabrica.custoOperacionalMes || 0;
  const porKg = cap.capacidadeKgMes > 0 ? custoMes / cap.capacidadeKgMes : 0;
  const usando = cadencia === cap.capacidadeKgMes;

  return (
    <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100">
        <p className="text-[12px] font-bold text-torg-dark">A fábrica por hora</p>
        <p className="text-[11px] text-torg-gray mt-0.5">
          {fabrica.pessoasChao} pessoas no chão × {fabrica.horasPessoaMes} h/mês.
          A capacidade é a do <strong className="text-torg-dark">posto que aperta primeiro</strong> — não a soma nem a média.
        </p>
        <div className="flex flex-wrap gap-2 mt-3">
          {[{ kg: 5000, r: "5 t/dia por posto", a: "o que você disse do montador" },
            { kg: 2500, r: "2,5 t/dia", a: "meio do caminho" },
            { kg: 0, r: `Medido (${fabrica.hhPorTRota} HH/t)`, a: "⚠ circular: sai da própria produção" }].map((o) => (
            <button key={o.r} type="button" onClick={() => set("kgPessoaDia", o.kg ? String(o.kg) : "")}
              className={`text-left border rounded-lg px-3 py-2 transition ${regua === o.kg ? "border-torg-blue bg-torg-blue-50/50" : "border-gray-200 hover:border-gray-300"}`}>
              <span className="block text-[11px] font-semibold text-torg-dark whitespace-nowrap">{o.r}</span>
              <span className="block text-[10px] text-torg-gray">{o.a}</span>
            </button>
          ))}
          <label className="text-[11px] text-torg-dark border border-gray-200 rounded-lg px-3 py-2">
            <span className="block font-semibold">Outra régua</span>
            <Inp value={cfg.kgPessoaDia ?? ""} placeholder="5000"
              onChange={(e) => set("kgPessoaDia", e.target.value)} className="block mt-0.5 w-24 text-right" />
            <span className="block text-[10px] text-torg-gray mt-0.5">kg por pessoa/dia</span>
          </label>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[12px]" style={{ minWidth: 560 }}>
          <thead className="bg-gray-50 text-[10px] uppercase text-torg-gray">
            <tr><th className="text-left px-4 py-1.5">Posto</th>
              <th className="text-right px-3 py-1.5">Pessoas</th>
              <th className="text-right px-3 py-1.5">Faz hoje</th>
              <th className="text-right px-3 py-1.5">Aguenta</th>
              <th className="text-right px-4 py-1.5">Ocupação</th></tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {cap.postos.map((x) => {
              const eGargalo = cap.gargalo?.chave === x.chave;
              return (
                <tr key={x.chave} className={eGargalo ? "bg-[#FFF7ED] font-semibold" : ""}>
                  <td className="px-4 py-1.5 whitespace-nowrap">{x.setor}
                    {eGargalo ? <span className="ml-2 text-[9px] uppercase tracking-wider text-torg-orange-700">aperta primeiro</span> : null}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{x.pessoas}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap text-torg-gray">{x.kgMes.toLocaleString("pt-BR")}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap">{x.capacidadeKgMes.toLocaleString("pt-BR")}</td>
                  <td className={`px-4 py-1.5 text-right tabular-nums ${x.ocupacaoPct >= 95 ? "text-red-600" : x.ocupacaoPct >= 70 ? "text-torg-dark" : "text-green-700"}`}>{x.ocupacaoPct}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-gray-100 border-t border-gray-100">
        <Kpi r="Capacidade da fábrica" v={`${cap.capacidadeKgMes.toLocaleString("pt-BR")} kg/mês`} />
        <Kpi r="Aperta primeiro" v={cap.gargalo?.setor || "—"} cor="text-torg-orange-700" />
        <Kpi r="Custo da casa por kg" v={`R$ ${porKg.toFixed(2).replace(".", ",")}`} />
        <Kpi r="Horas do chão" v={`${cap.horas.toLocaleString("pt-BR")} h/mês`} />
      </div>

      {regua === 0 && (
        <p className="text-[11px] text-torg-dark bg-[#FFF7ED] border-t border-[#F4801F]/30 px-4 py-2.5">
          ⚠ Esta leitura é <strong>circular</strong>: o HH/t saiu de dividir o efetivo pela produção que a fábrica fez,
          então ela devolve 100% de ocupação por construção. Serve para ver a ordem dos postos, não para decidir preço.
          Escolha uma régua de kg por pessoa/dia para ter uma capacidade de verdade — e confirme essa régua
          cronometrando um posto num conjunto real, anotando <strong>que peça é</strong>.
        </p>
      )}

      <div className="px-4 py-2.5 border-t border-gray-100 flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => mexer((a) => ({ cenario: { ...(a.cenario || {}), cadenciaKgMes: String(cap.capacidadeKgMes) } }))}
          disabled={usando || !cap.capacidadeKgMes}
          className={`text-[11px] rounded-lg px-3 py-1.5 border ${usando ? "border-gray-200 text-torg-gray" : "border-torg-blue text-torg-blue hover:bg-torg-blue-50"}`}>
          {usando ? "Esta capacidade já é a cadência do estudo" : "Usar esta capacidade como cadência do estudo"}
        </button>
        <span className="text-[10px] text-torg-gray">
          a cadência define o prazo da obra e quanto do custo da casa esta obra carrega
        </span>
      </div>
    </div>
  );
}
