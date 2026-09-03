"use client";
// ─── O QUE FALTA DESCER PARA O SETOR ──────────────────────────────────────────
//
// Vitor (03/09/2026), sobre a Larissa: "a tela é no PCP, mas a questão é que ela está perdida para
// conseguir descer os desenhos para os setores".
//
// ⚠⚠ A AÇÃO VEM ANTES DA TABELA, NÃO DEPOIS. O botão "Imprimir e liberar" só nasce depois de marcar
// linha na tabela de centenas — quem abre o PCP não via caminho nenhum, só um texto cinza dizendo
// "marque peças". Aqui a pergunta do dia já vem respondida: quantos faltam descer, quantos dão para
// descer agora, e o que trava o resto. A tabela continua abaixo, para escolher a dedo.
//
// ⚠ POR SETOR, TODAS AS OBRAS. Vitor (03/09/2026), sobre onde o painel mora: "ok, suba então".
// Quem trabalha o dia da preparação atende a fábrica inteira; obrigar a abrir obra por obra para
// descobrir onde há trabalho é justamente o que faz perder. Mesma escolha do painel de carga.
//
// ⚠ NENHUMA REGRA NOVA: prontidão, portão do desenho e GRD saem das mesmas fontes que a liberação
// já cobra (ver /api/pcp/descer). Uma segunda régua faria a tela dizer "pode" e o POST responder
// "não pode".
import { useEffect, useState, Fragment } from "react";
import { Loader2, Printer, ChevronRight, AlertCircle } from "lucide-react";
import { fmtOP } from "@/lib/utils";

const SETORES = [
  { key: "PREPARACAO", nome: "Preparação" },
  { key: "MONTAGEM", nome: "Montagem" },
];
const fmtN = (n) => new Intl.NumberFormat("pt-BR").format(Math.round(Number(n) || 0));
const fmtKg = (n) => `${fmtN(n)} kg`;

// ⚠ quem resolve cada motivo. Sem isso a linha amarela é só frustração: ela sabe que não desce e
// não sabe para quem ligar.
const QUEM_RESOLVE = {
  CROQUI: "preparação",
  DESENHO: "Engenharia",
  MATERIAL: "Compras",
};

export default function DescerDesenhos({ onDescer, ocupado }) {
  const [setor, setSetor] = useState("PREPARACAO");
  const [dados, setDados] = useState(null);
  const [aberta, setAberta] = useState(null); // obra expandida (o que trava)
  const [recarga, setRecarga] = useState(0);

  useEffect(() => {
    let vivo = true;
    setDados(null);
    fetch(`/api/pcp/descer?setor=${setor}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => vivo && setDados(j?.obras ? j : { obras: [], total: {} }))
      .catch(() => vivo && setDados({ obras: [], total: {} }));
    return () => { vivo = false; };
  }, [setor, recarga]);

  const total = dados?.total || {};
  // ⚠ obra sem nada pronto E sem nada travado não tem o que dizer — sai da lista em vez de virar
  // linha zerada, que é o que faz a lista parecer maior do que o trabalho.
  const obras = (dados?.obras || []).filter((o) => o.prontos.length > 0 || o.travados.length > 0);

  async function descer(o) {
    const marcas = o.prontos.map((p) => p.marca);
    if (!marcas.length) return;
    await onDescer?.({ opNumero: o.opNumero, opId: o.opId, setor, marcas });
    setRecarga((v) => v + 1);
  }

  return (
    <div className="bg-white rounded-xl border border-torg-blue-100 overflow-hidden mb-4">
      <div className="flex items-center gap-2 flex-wrap px-4 py-2.5 border-b border-gray-100 bg-gray-50/60">
        <span className="text-[11px] uppercase tracking-wide text-torg-gray-light font-bold">Falta descer</span>
        <span className="text-[11.5px] text-torg-gray">desenhos que ainda não foram para o setor · a fábrica inteira</span>
        <div className="ml-auto flex items-center gap-1">
          {SETORES.map((s) => (
            <button key={s.key} onClick={() => { setSetor(s.key); setAberta(null); }}
              className={`text-[11.5px] font-semibold px-2.5 py-1 rounded-md border ${
                setor === s.key ? "bg-torg-blue text-white border-torg-blue"
                  : "border-gray-200 text-torg-gray hover:border-torg-blue-300 hover:text-torg-blue"}`}>
              {s.nome}
            </button>
          ))}
        </div>
      </div>

      {!dados ? (
        <p className="px-4 py-4 text-[12.5px] text-torg-gray inline-flex items-center gap-2">
          <Loader2 size={13} className="animate-spin" /> vendo o que falta descer…
        </p>
      ) : !obras.length ? (
        <p className="px-4 py-4 text-[12.5px] text-torg-gray">
          Nada esperando para descer neste setor — tudo que está lá já tem GRD.
        </p>
      ) : (
        <>
          <div className="flex items-center gap-5 flex-wrap px-4 py-2.5 border-b border-gray-100 text-[12px]">
            <span className="text-emerald-700">
              <b className="text-[15px] tabular-nums">{fmtN(total.prontos)}</b> prontos para descer
              {total.kgProntos > 0 && <span className="text-torg-gray"> · {fmtKg(total.kgProntos)}</span>}
            </span>
            {total.travados > 0 && (
              <span className="text-amber-700"><b className="text-[15px] tabular-nums">{fmtN(total.travados)}</b> travados</span>
            )}
            <span className="text-torg-gray-light"><b className="text-[15px] tabular-nums">{fmtN(total.jaDesceram)}</b> já desceram</span>
          </div>

          <table className="w-full text-[12px]">
            <tbody>
              {obras.map((o) => (
                <Fragment key={o.opId || o.opNumero}>
                  <tr className="border-b border-gray-50 last:border-0">
                    <td className="px-4 py-2 whitespace-nowrap font-bold text-torg-dark">{fmtOP(o.opNumero)}</td>
                    <td className="py-2 text-torg-gray truncate max-w-[220px]">{o.cliente || ""}{o.obra ? ` · ${o.obra}` : ""}</td>
                    <td className="py-2 text-right tabular-nums whitespace-nowrap w-[150px]">
                      {o.prontos.length > 0
                        ? <span className="text-emerald-700 font-semibold">{fmtN(o.prontos.length)} prontos</span>
                        : <span className="text-torg-gray-light">—</span>}
                      {o.kgProntos > 0 && <span className="text-torg-gray-light"> · {fmtKg(o.kgProntos)}</span>}
                    </td>
                    <td className="py-2 pl-3 whitespace-nowrap w-[130px]">
                      {o.travados.length > 0 && (
                        <button onClick={() => setAberta(aberta === o.opId ? null : o.opId)}
                          className="text-[11.5px] text-amber-700 hover:text-amber-900 font-semibold inline-flex items-center gap-1">
                          <ChevronRight size={12} className={aberta === o.opId ? "rotate-90 transition-transform" : "transition-transform"} />
                          {fmtN(o.travados.length)} travados
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right w-[190px]">
                      {o.prontos.length > 0 && (
                        <button onClick={() => descer(o)} disabled={ocupado}
                          title={`Imprime carimbado e registra a GRD de ${o.prontos.length} marca(s)`}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11.5px] font-semibold rounded-lg bg-torg-orange text-white hover:opacity-90 disabled:opacity-40">
                          {ocupado ? <Loader2 size={12} className="animate-spin" /> : <Printer size={12} />}
                          Descer os {o.prontos.length}
                        </button>
                      )}
                    </td>
                  </tr>
                  {aberta === o.opId && (
                    <tr className="bg-amber-50/50 border-b border-gray-100">
                      <td colSpan={5} className="px-4 py-2.5">
                        <p className="text-[11px] text-amber-900 font-semibold mb-1.5 inline-flex items-center gap-1.5">
                          <AlertCircle size={12} /> o que segura — e quem resolve
                        </p>
                        <div className="space-y-1.5">
                          {o.travadosPorMotivo.map((m) => (
                            <div key={m.porque} className="text-[11.5px] text-amber-900">
                              <b>{fmtN(m.n)}</b> — {m.porque}
                              {QUEM_RESOLVE[o.travados.find((t) => t.porque === m.porque)?.motivo] && (
                                <span className="text-amber-700"> · falar com {QUEM_RESOLVE[o.travados.find((t) => t.porque === m.porque)?.motivo]}</span>
                              )}
                              <div className="font-mono text-[10.5px] text-amber-800 mt-0.5">
                                {m.marcas.slice(0, 14).join(", ")}{m.marcas.length > 14 ? ` … e mais ${m.marcas.length - 14}` : ""}
                              </div>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
