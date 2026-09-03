"use client";
// ─── DIAS PROGRAMADOS DA PREPARAÇÃO: PLANEJADO × APONTADO ──────────────────────
//
// Vitor (03/09/2026): "após o dia de execução você precisa trazer o status do que foi planejado e
// foi executado de fato; aí sim, caso tenha atendido, a fila já puxa outros projetos (…) ou, se por
// alguma razão não finalizou na data correta, mostrar esse atraso levando todas as outras
// programações para frente. Esse acompanhamento será através do Syneco".
//
// ⚠⚠ O ATRASO NÃO É UM AVISO, É UMA CONTA. O que sobrou de um dia é trabalho que ainda vai ocupar
// máquina: por isso cada dia mostra o que ficou aberto em kg e em peças, e o rodapé soma quantos
// dias de máquina esse resto empurra para a frente. Só dizer "atrasado" deixaria a pergunta que
// importa — quanto isso custa no calendário — sem resposta.
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { fmtOP } from "@/lib/utils";

const fmtN = (n) => new Intl.NumberFormat("pt-BR").format(Math.round(Number(n) || 0));
const fmt1 = (n) => (Math.round((Number(n) || 0) * 10) / 10).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const fmtDia = (d) => {
  if (!d) return "—";
  const dt = new Date(`${d}T00:00:00Z`);
  const sem = dt.toLocaleDateString("pt-BR", { weekday: "short", timeZone: "UTC" }).replace(".", "");
  return `${sem} ${dt.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" })}`;
};

export default function DiasPreparacao({ recarga = 0 }) {
  const [d, setD] = useState(null);

  useEffect(() => {
    let vivo = true;
    setD(null);
    fetch("/api/pcp/programacao-preparacao", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => vivo && setD(j?.dias ? j : { dias: [] }))
      .catch(() => vivo && setD({ dias: [] }));
    return () => { vivo = false; };
  }, [recarga]);

  if (!d) {
    return <p className="px-4 py-3 text-[12.5px] text-torg-gray inline-flex items-center gap-2">
      <Loader2 size={13} className="animate-spin" /> vendo o que foi programado…
    </p>;
  }
  if (!d.dias.length) {
    return <p className="px-4 py-3 text-[12.5px] text-torg-gray">
      Nenhum dia programado na preparação — programe um lote acima e o acompanhamento aparece aqui.
    </p>;
  }

  const meta = d.metaKgDia || 0;
  const abertoTotal = d.dias.filter((x) => x.atrasado).reduce((s, x) => s + x.abertoKg, 0);

  return (
    <div className="px-4 pt-3 pb-3">
      <div className="flex items-baseline gap-2 flex-wrap mb-2">
        <span className="text-[12.5px] font-semibold text-torg-dark">Dias programados — planejado × apontado</span>
        {abertoTotal > 0 && (
          <span className="text-[11.5px] text-red-700">
            {fmtN(abertoTotal)} kg em aberto de dias que já passaram
            {meta > 0 && <> · empurra <b>{fmt1(abertoTotal / meta)} dia(s)</b> de máquina para a frente</>}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {d.dias.map((x) => {
          const pct = x.planejadoKg > 0 ? Math.min(1, x.feitoKg / x.planejadoKg) : 0;
          const cor = x.atrasado ? "bg-red-500" : x.fechou && x.passou ? "bg-emerald-500" : "bg-torg-blue";
          return (
            <div key={x.dia}
              className={`border rounded-lg px-3 py-2 ${x.atrasado ? "border-red-200 bg-red-50/50" : x.dia === d.hoje ? "border-torg-blue-200 bg-torg-blue-50/30" : "border-gray-100"}`}>
              <div className="flex items-baseline gap-1.5">
                <span className="text-[11px] text-torg-gray-light capitalize">{fmtDia(x.dia)}</span>
                {x.dia === d.hoje && <span className="text-[10px] text-torg-blue font-semibold">hoje</span>}
                <span className="ml-auto text-[10.5px] text-torg-gray-light truncate max-w-[120px]">
                  {x.obras.map(fmtOP).join(", ")}
                </span>
              </div>
              <p className="text-[14px] font-bold text-torg-dark tabular-nums leading-tight">
                {fmtN(x.feitoKg)} / {fmtN(x.planejadoKg)} kg
              </p>
              <span className="block h-1.5 rounded-full bg-gray-200 overflow-hidden my-1">
                <span className={`block h-1.5 ${cor}`} style={{ width: `${pct * 100}%` }} />
              </span>
              {x.atrasado ? (
                <p className="text-[11px] text-red-700">
                  {fmtN(x.abertoKg)} kg · {fmtN(x.abertoPc)} peças em aberto
                  {meta > 0 && <> · empurra {fmt1(x.abertoKg / meta)} dia</>}
                </p>
              ) : x.fechou ? (
                <p className="text-[11px] text-emerald-700">fechou o dia · {fmtN(x.planejadoPc)} peças</p>
              ) : (
                <p className="text-[11px] text-torg-gray-light">
                  {fmtN(x.abertoPc)} de {fmtN(x.planejadoPc)} peças ainda abertas
                  {x.adiadas > 0 && <> · {fmtN(x.adiadas)} vieram adiadas</>}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
