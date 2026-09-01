"use client";
import { useState, useEffect, useCallback } from "react";
import { CalendarClock, Loader2, AlertCircle, RefreshCw, Send, Wrench } from "lucide-react";
import LiberarFrentes from "./LiberarFrentes";
import MontagemConjuntos from "./MontagemConjuntos";


export default function DatasSetorClient() {
  const [dados, setDados] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [opSel, setOpSel] = useState("");
  // ⚠ duas abas na MESMA obra: liberar o corte para o PCP e marcar o dia da montagem. Vitor
  // (01/09/2026): "não era isso, queria dentro da aba de datas por setor" — a primeira versão
  // ficou numa tela própria e obrigava a escolher a obra de novo, longe do marco que a justifica.
  const [aba, setAba] = useState("PCP");

  const carregar = useCallback(async () => {
    setLoading(true); setErro("");
    try {
      const res = await fetch("/api/planejamento/datas-setor", { cache: "no-store" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Erro ao carregar");
      setDados(j);
    } catch (e) { setErro(e.message); } finally { setLoading(false); }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const ops = dados?.ops || [];
  const op = ops.find((o) => o.opNumero === opSel) || null;

  // ⚠ o dia de hoje em ISO, para dizer qual marco já venceu
  const hojeISO = new Date().toISOString().slice(0, 10);

  return (
    <div className="max-w-6xl">
      <div className="flex items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="bg-torg-blue-50 p-2.5 rounded-xl"><CalendarClock size={24} className="text-torg-blue" /></div>
          <div>
            <h1 className="text-2xl font-bold text-torg-dark">Programação PCP</h1>
            <p className="text-sm text-torg-gray">Escolha a obra e libere o que desce para o PCP — o corte por frente e o dia de cada conjunto na montagem</p>
          </div>
        </div>
        <button onClick={carregar} className="p-2.5 rounded-xl bg-white border border-torg-blue-100 hover:border-torg-blue-300 text-torg-dark"><RefreshCw size={18} className={loading ? "animate-spin" : ""} /></button>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-32 text-torg-gray"><Loader2 size={40} className="animate-spin mb-3 text-torg-blue" /> <p>Carregando…</p></div>
      ) : erro ? (
        <div className="flex flex-col items-center justify-center py-24 text-center"><AlertCircle size={40} className="text-red-500 mb-3" /><p className="text-red-600 mb-3">{erro}</p><button onClick={carregar} className="text-sm bg-white border border-torg-blue-100 px-4 py-2 rounded-lg inline-flex items-center gap-2"><RefreshCw size={14} /> Tentar de novo</button></div>
      ) : (
        <div className="space-y-6">
          {/* Seletor + formulário */}
          <div className="bg-white rounded-xl border border-torg-blue-100 p-5">
            <div className="flex flex-wrap items-end gap-3 mb-4">
              <div className="flex-1 min-w-[240px]">
                <label className="block text-xs font-medium text-torg-gray mb-1">Obra (OP)</label>
                <select value={opSel} onChange={(e) => setOpSel(e.target.value)} className="w-full border border-torg-blue-100 rounded-lg px-3 py-2 text-sm">
                  <option value="">Selecione uma OP…</option>
                  {ops.map((o) => <option key={o.opNumero} value={o.opNumero}>OP-{o.opNumero} — {o.obra}</option>)}
                </select>
              </div>
            </div>

            {!op ? (
              <p className="text-sm text-torg-gray py-6 text-center">Escolha uma OP acima (ou clique numa linha da tabela) para ver os marcos e liberar para o PCP.</p>
            ) : (
              <>
                {/* ⚠ A GRADE DOS SETE MARCOS SAIU (Vitor, 01/09/2026: "pode tirar essa parte
                    tbm"). Ela repetia, em sete cartões, o que a "Visão geral das obras" logo
                    abaixo já mostra em tabela — e empurrava para baixo o que a pessoa vem fazer
                    aqui, que é liberar. O DADO continua: o marco do cronograma segue alimentando a
                    data sugerida da montagem (`datasSetorCrono.MONTAGEM`) e o desvio da liberação.

                    ⚠ A data digitada à mão também continua no banco e mandando na TV de
                    Prioridades — ela não dependia desta tela para existir. */}

                {/* ── liberar para o PCP, por frente ── */}
                {/* ⚠ a data acima é MARCO, não gatilho: quem libera é alguém, aqui, e o desvio
                    entre o marco e o dia da liberação fica gravado com o motivo. */}
                <div className="mt-6 pt-5 border-t border-gray-100">
                  <div className="flex items-center gap-1 mb-3 border-b border-gray-100">
                    {[
                      { k: "PCP", icone: Send, rotulo: "Liberar para o PCP" },
                      { k: "MONTAGEM", icone: Wrench, rotulo: "Montagem — conjuntos" },
                    ].map(({ k, icone: Icone, rotulo }) => (
                      <button key={k} onClick={() => setAba(k)}
                        className={`px-3 py-2 text-sm font-semibold inline-flex items-center gap-2 border-b-2 -mb-px ${
                          aba === k ? "border-torg-blue text-torg-blue" : "border-transparent text-torg-gray hover:text-torg-dark"}`}>
                        <Icone size={15} /> {rotulo}
                      </button>
                    ))}
                  </div>

                  {aba === "PCP" ? (
                    <>
                      <p className="text-[12px] text-torg-gray mb-3">
                        As datas acima são o <b>marco</b> de início. Liberar é decisão — pode ser antes ou
                        depois, e o desvio fica registrado.
                      </p>
                      <LiberarFrentes opId={op.opId} opNumero={op.opNumero} onMudou={carregar} />
                    </>
                  ) : (
                    <>
                      <p className="text-[12px] text-torg-gray mb-3">
                        O dia em que cada <b>conjunto</b> entra na montagem. Entram no plano os que têm
                        <b> todas as sub peças cortadas</b>; o resto fica separado, para você ver e decidir.
                      </p>
                      {/* ⚠ o marco do cronograma vira a data sugerida — é ele que o planejamento
                          veio olhar; abrir o campo em "hoje" convidaria a ignorar o combinado. */}
                      <MontagemConjuntos
                        opId={op.opId}
                        marcoMontagem={op.datasSetorCrono?.MONTAGEM || op.datasSetor?.MONTAGEM || ""}
                      />
                    </>
                  )}
                </div>
              </>
            )}
          </div>

          {/* ⚠ A "VISÃO GERAL DAS OBRAS" SAIU (Vitor, 01/09/2026: "essa parte não faz mais
              sentido"). Ela era a leitura da grade de marcos que acabou de sair: uma tabela de 30
              obras × 7 setores para consultar data, numa tela em que a pessoa entra para LIBERAR
              uma obra. Quem precisa da visão do prazo tem o Cronograma; aqui o que vale é a obra
              aberta. */}
        </div>
      )}
    </div>
  );
}
