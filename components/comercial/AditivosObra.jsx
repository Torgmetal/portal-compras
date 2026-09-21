"use client";
import { FilePlus2, Rocket, Plus, Users, CalendarRange, Hash, Coins } from "lucide-react";
import ReferenciasClienteResumo from "./ReferenciasClienteResumo";
import { agruparReferencias } from "@/lib/referencias-cliente";

// Os aditivos da obra, na aba Obra, com cara de aditivo. Vitor (17/09/2026): "os usuários estão
// reclamando que não conseguem ver de forma clara os aditivos (…) pode colocar na aba de obras (…)
// só precisa ficar de uma forma evidente que se trata de um aditivo". Antes o aditivo só existia
// no fim da aba Resumo, atrás da tabela de itens — e a verba (itens, solicitações) continua lá,
// que é assunto do Comercial/Compras. Aqui é o que TODO setor precisa: o que entrou, com que
// pedido, TAGs, prazo, quem já confirmou — e a receita do aditivo (Vitor, 17/09: "onde eu descrevo
// a receita?"), que só chega aqui para quem vê financeiro (a página apaga `op.receitas` dos outros).
const fmtMoeda = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtNum = (v) => Number(v || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
const fmtData = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : null);
const STATUS = {
  RASCUNHO: { rotulo: "Não comunicado aos setores", cls: "bg-amber-100 text-amber-900 border-amber-200" },
  DIVULGADO: { rotulo: "Divulgado aos setores", cls: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  EM_EXECUCAO: { rotulo: "Em execução", cls: "bg-blue-100 text-blue-800 border-blue-200" },
  ENCERRADO: { rotulo: "Encerrado", cls: "bg-gray-100 text-gray-600 border-gray-200" },
};

export default function AditivosObra({ op, podeGerenciar = false, encerrada = false, onNovo, onDivulgar }) {
  const aditivos = op?.aditivos || [];
  const refs = op?.referencias || [];
  return (
    <section className="rounded-xl border-2 border-[#F4801F] bg-white shadow-sm overflow-hidden" aria-label="Aditivos da obra">
      <div className="px-5 py-3 bg-[#F4801F] flex items-center justify-between gap-3 flex-wrap">
        <h3 className="text-white font-extrabold tracking-wide flex items-center gap-2 text-base"><FilePlus2 size={18} /> ADITIVOS DO CONTRATO <span className="font-semibold opacity-90">({aditivos.length})</span></h3>
        {podeGerenciar && !encerrada && onNovo && (
          <button onClick={onNovo} className="text-xs font-semibold bg-white text-[#c2610f] rounded-lg px-3 py-1.5 inline-flex items-center gap-1 hover:bg-orange-50"><Plus size={14} /> Novo aditivo</button>
        )}
      </div>
      {aditivos.length === 0 ? (
        <p className="px-5 py-4 text-sm text-torg-gray">Nenhum aditivo nesta obra. Quando o cliente emitir um pedido novo (OC, AF, PC…), ele entra aqui como aditivo e é comunicado aos setores.</p>
      ) : (
        <div className="divide-y divide-orange-100">
          {aditivos.map((ad) => {
            const st = STATUS[ad.status] || STATUS.RASCUNHO;
            const aceites = ad.aceites || [];
            const ok = aceites.filter((a) => a.aceitoEm).length;
            const arvore = agruparReferencias(refs.filter((r) => r.aditivoId === ad.id));
            const temRefs = arvore.pedidos.length + arvore.projetos.length + arvore.outros.length > 0;
            const receitas = (op?.receitas || []).filter((r) => r.aditivoId === ad.id);
            const totalReceita = receitas.reduce((s, r) => s + (Number(r.valor) || 0), 0);
            return (
              <article key={ad.id} id={`aditivo-${ad.numero}`} className="px-5 py-4 space-y-3 scroll-mt-24">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="inline-flex items-center justify-center rounded-lg bg-orange-100 text-[#c2610f] font-black text-lg px-3 py-1 border border-orange-200">ADITIVO {ad.numero}</span>
                    <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${st.cls}`}>{st.rotulo}</span>
                    {ad.valor != null && <span className="text-sm font-mono font-semibold text-torg-dark">{fmtMoeda(ad.valor)}</span>}
                  </div>
                  <div className="text-[11.5px] text-torg-gray text-right">
                    aberto por {ad.createdBy?.name || "—"} em {fmtData(ad.createdAt)}
                    {ad.divulgadoEm && <div>divulgado em {fmtData(ad.divulgadoEm)} · aceites <b className={ok === aceites.length ? "text-emerald-700" : "text-amber-800"}>{ok}/{aceites.length}</b></div>}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="rounded-lg border border-gray-100 p-3 md:col-span-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-torg-gray mb-1 flex items-center gap-1"><Hash size={11} /> Pedido do cliente</p>
                    {temRefs ? <ReferenciasClienteResumo arvore={arvore} /> : <p className="text-sm text-torg-gray">Sem OC/TAG cadastradas — informe na abertura do aditivo ou peça ao Comercial.</p>}
                  </div>
                  <div className="rounded-lg border border-gray-100 p-3 space-y-1.5 text-sm">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-torg-gray flex items-center gap-1"><CalendarRange size={11} /> Prazo</p>
                    <p className="text-torg-dark">{ad.dataInicio || ad.dataFimPrevista ? `${fmtData(ad.dataInicio) || "—"} → ${fmtData(ad.dataFimPrevista) || "—"}` : "não informado"}</p>
                    {ad.orcamentoRef && <p className="text-[12px] text-torg-gray">orçamento {ad.orcamentoRef}</p>}
                    {aceites.length > 0 && (
                      <p className="text-[12px] text-torg-gray flex items-start gap-1" title={aceites.map((a) => `${a.email}${a.aceitoEm ? " ✓" : " (pendente)"}`).join("\n")}><Users size={12} className="mt-0.5 shrink-0" /> {ok} de {aceites.length} confirmaram o comunicado</p>
                    )}
                  </div>
                </div>

                {receitas.length > 0 && (
                  <div className="rounded-lg border border-gray-100 p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-torg-gray mb-1 flex items-center gap-1"><Coins size={11} /> Receita do aditivo</p>
                    <ul className="text-sm text-torg-dark divide-y divide-gray-50">
                      {receitas.map((r) => (
                        <li key={r.id} className="flex justify-between gap-3 py-1">
                          <span>{r.descricao}{r.tipoPreco === "POR_UNIDADE" && r.quantidade ? <span className="text-torg-gray"> — {fmtNum(r.quantidade)} {r.unidade || ""} × {fmtMoeda(r.valorUnitario)}</span> : null}</span>
                          <span className="font-mono tabular-nums whitespace-nowrap">{fmtMoeda(r.valor)}</span>
                        </li>
                      ))}
                    </ul>
                    {receitas.length > 1 && <p className="text-right text-sm font-semibold text-torg-dark mt-1 tabular-nums">Total {fmtMoeda(totalReceita)}</p>}
                  </div>
                )}

                <div className="rounded-lg bg-orange-50/60 border border-orange-100 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[#c2610f] mb-1">O que muda com este aditivo</p>
                  <p className="text-sm text-torg-dark whitespace-pre-line leading-relaxed">{ad.descricao || "—"}</p>
                </div>

                {(ad.itens || []).length > 0 && (
                  <div className="text-[12.5px] text-torg-gray">
                    <span className="font-semibold text-torg-dark">Itens de verba:</span>{" "}
                    {ad.itens.map((it, i) => <span key={it.id || i}>{i > 0 ? " · " : ""}{it.descricao}{it.qtdContratada ? ` (${Number(it.qtdContratada).toLocaleString("pt-BR")} ${it.unidade || ""})` : ""}</span>)}
                    <span className="text-torg-gray"> — valores e solicitações de verba na aba Resumo.</span>
                  </div>
                )}

                {podeGerenciar && !encerrada && onDivulgar && (
                  <div className="flex justify-end">
                    <button onClick={() => onDivulgar({ id: ad.id, numero: ad.numero })}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 ${ad.status === "RASCUNHO" ? "bg-[#F4801F] text-white hover:bg-[#dd7119]" : "bg-white border border-orange-200 text-[#c2610f] hover:bg-orange-50"}`}
                      title="Manda o comunicado do aditivo (PDF + aceite) aos setores">
                      <Rocket size={14} /> {ad.status === "RASCUNHO" ? "Divulgar aos setores" : "Reenviar comunicado"}
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
