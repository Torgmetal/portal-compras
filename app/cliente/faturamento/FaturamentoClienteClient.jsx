"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { LogOut, Loader2, AlertCircle, ArrowLeft, Eye, FileText, Download } from "lucide-react";
import { rotuloComCodigo } from "@/lib/cliente-faturamento";

// A aba "Pedidos de compra e faturamento" como o cliente vê.
// Vitor (16/09/2026), sobre a 1ª versão: "está um pouco confuso" — três dinheiros numa célula e as
// notas dentro do "Objeto". Agora: cada valor na sua coluna (Contratado · Faturado · A faturar),
// as notas numa linha própria, e nada de "Omie" no texto — o cliente vê "pedido nº".
const fmtR$ = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtInt = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const fmtD = (iso) => (iso ? new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR") : "—");
const CHIP = {
  FATURADO: "bg-emerald-50 text-emerald-700 border-emerald-100", PARCIAL: "bg-sky-50 text-sky-700 border-sky-100", VENCIDO: "bg-red-50 text-red-700 border-red-100",
  AGUARDANDO: "bg-gray-100 text-gray-600 border-gray-200", CANCELADO: "bg-gray-100 text-gray-500 border-gray-200", SEM_OMIE: "bg-amber-50 text-amber-800 border-amber-100",
};
const ROTULO = { FATURADO: "Faturado", PARCIAL: "Faturado em parte", VENCIDO: "Saldo vencido", AGUARDANDO: "Aguardando", CANCELADO: "Cancelado", SEM_OMIE: "Sem pedido ainda" };

export default function FaturamentoClienteClient({ como = "" }) {
  const [d, setD] = useState(null);
  const [erro, setErro] = useState("");
  useEffect(() => {
    fetch(`/api/cliente/faturamento${como ? `?como=${encodeURIComponent(como)}` : ""}`, { cache: "no-store" })
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error || "Não consegui carregar."); return j; })
      .then(setD).catch((e) => setErro(e.message));
  }, [como]);

  const t = d?.totais;
  const proxima = (d?.obras || []).flatMap((o) => o.linhas.filter((l) => l.proximaPrevisao && l.aFaturar > 0 && l.situacao.codigo !== "VENCIDO").map((l) => ({ data: l.proximaPrevisao, oc: l.oc, op: o.opNumero }))).sort((a, b) => a.data.localeCompare(b.data))[0];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-[#0D1F3C]">
        <div className="max-w-5xl mx-auto px-5 py-5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/torg-logo-white.png" alt="Torg Metal" className="h-7 shrink-0" />
            <div className="min-w-0">
              <p className="text-white font-semibold text-sm truncate">Pedidos de compra e faturamento</p>
              <p className="text-[11px] text-white/60 truncate">{d?.email || ""}{d?.como ? " · visto como este contato" : ""}</p>
            </div>
          </div>
          <div className="flex items-center gap-4 shrink-0">
            <Link href="/cliente" className="text-[12px] text-white/70 hover:text-white inline-flex items-center gap-1.5"><ArrowLeft size={14} /> meus documentos</Link>
            <button onClick={() => signOut({ callbackUrl: "/entrar" })} className="text-[12px] text-white/70 hover:text-white inline-flex items-center gap-1.5"><LogOut size={14} /> sair</button>
          </div>
        </div>
        <div className="h-1 bg-[#F4801F]" />
      </div>

      <div className="max-w-5xl mx-auto px-5 py-6 space-y-4">
        {erro && (
          <div className="bg-white border border-gray-200 rounded-xl p-6 text-center">
            <AlertCircle size={26} className="text-amber-500 mx-auto mb-2" />
            <p className="text-[13.5px] font-medium text-torg-dark">{erro}</p>
            <p className="text-[12px] text-torg-gray mt-1">Se você precisa acompanhar pedidos e notas, peça à Torg para liberar o seu acesso.</p>
          </div>
        )}
        {!d && !erro && <p className="text-sm text-torg-gray inline-flex items-center gap-2"><Loader2 size={15} className="animate-spin" /> carregando…</p>}

        {d?.como && (
          <p className="text-[12px] text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 inline-flex items-center gap-2"><Eye size={13} /> Você está vendo exatamente o que <b>{d.email}</b> vê. Este acesso ficou registrado.</p>
        )}

        {t && (
          <>
            <div className="flex items-start justify-between gap-3 flex-wrap">
            <p className="text-[12.5px] text-torg-gray">Um pedido seu por linha: o valor contratado, o que a Torg já faturou e o que falta, com a data prevista da próxima nota.{d.sincronizadoEm ? ` Atualizado em ${new Date(d.sincronizadoEm).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}.` : ""}</p>
            <a href={`/api/cliente/faturamento/excel${como ? `?como=${encodeURIComponent(como)}` : ""}`} className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 text-[12.5px] font-medium rounded-lg border border-gray-200 bg-white text-torg-dark hover:bg-gray-50" title="Extrato em Excel: uma folha de pedidos e uma de notas emitidas">
              <Download size={14} /> Exportar Excel
            </a>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <Cartao rot="Contratado" val={fmtInt(t.contratado)} sub={`${t.pedidos} pedido${t.pedidos === 1 ? "" : "s"} em ${d.obras.length} obra${d.obras.length === 1 ? "" : "s"}`} />
              <Cartao rot="Faturado" val={fmtInt(t.faturado)} cor="text-emerald-700" sub={t.contratado ? `${Math.round((t.faturado / t.contratado) * 100)}% do contratado` : ""} />
              <Cartao rot="A faturar" val={fmtInt(t.aFaturar)} sub={proxima ? `próxima nota ${fmtD(proxima.data)} · OP-${proxima.op}` : "sem nota prevista"} />
              <Cartao rot="Saldo vencido" val={fmtInt(t.vencido)} cor={t.vencido > 0 ? "text-red-700" : "text-torg-dark"} alerta={t.vencido > 0} sub={t.vencido > 0 ? "previsto e ainda sem nota" : "nada em atraso"} />
            </div>

            {d.obras.map((o) => (
              <section key={o.opNumero} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <header className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-4 flex-wrap">
                  <div className="min-w-0">
                    <h2 className="text-[15px] font-semibold text-torg-dark">OP-{o.opNumero} · {o.obra || o.cliente}</h2>
                    <Identificacao id={o.identificacao} />
                  </div>
                  <div className="flex items-center gap-3 text-[12px] text-torg-gray">
                    <span>faturado <b className="text-torg-dark">{fmtInt(o.totais.faturado)}</b> de {fmtInt(o.totais.contratado)}</span>
                    <span className="inline-block w-28 h-2 rounded-full bg-gray-100 overflow-hidden" title={`${o.pctFaturado}% faturado`}><span className="block h-full bg-emerald-500" style={{ width: `${Math.min(100, o.pctFaturado)}%` }} /></span>
                    <span className="font-mono">{o.pctFaturado}%</span>
                  </div>
                </header>
                {o.linhas.length === 0 ? (
                  <p className="px-4 py-4 text-sm text-torg-gray">Nenhum pedido lançado ainda para esta obra.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-[13.5px] min-w-[860px]">
                      <thead className="bg-gray-50/70 text-[10.5px] uppercase tracking-wider text-torg-gray">
                        <tr>
                          <th className="text-left px-4 py-2 font-semibold">Seu pedido</th>
                          <th className="text-left px-3 py-2 font-semibold">Descrição</th>
                          <th className="text-right px-3 py-2 font-semibold">Contratado</th>
                          <th className="text-right px-3 py-2 font-semibold">Faturado</th>
                          <th className="text-right px-3 py-2 font-semibold">A faturar</th>
                          <th className="text-left px-3 py-2 font-semibold whitespace-nowrap">Próxima nota</th>
                          <th className="text-left px-3 py-2 font-semibold">Situação</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {o.linhas.map((l, i) => {
                          const vencido = l.situacao.codigo === "VENCIDO";
                          return (
                            <Fragmento key={i}>
                              <tr className="align-top">
                                <td className="px-4 py-3 whitespace-nowrap">
                                  {l.oc ? <span className="font-mono font-semibold text-torg-dark">{rotuloComCodigo(l.rotulo, l.oc)}</span> : <span className="font-mono font-semibold text-torg-dark">Pedido nº {l.pedidosOmie[0]?.numero || "—"}</span>}
                                  {l.aditivo != null && <span className="ml-2 text-[10.5px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-800 font-medium align-middle">aditivo {l.aditivo}</span>}
                                  <div className="text-[11px] text-torg-gray mt-0.5">{l.oc ? `pedido Torg nº ${l.pedidosOmie.map((p) => p.numero).join(", ") || "—"}` : "OC não informada"}</div>
                                </td>
                                <td className="px-3 py-3">
                                  <div className="text-torg-dark">{l.descricao || "Estruturas metálicas"}</div>
                                  {(l.itens.length > 0 || l.tags.length > 0) && <div className="text-[12px] text-torg-gray mt-0.5">{[...l.itens, ...l.tags].join(", ")}</div>}
                                  {!l.descricao && l.referenciaNF && <div className="text-[12px] text-torg-gray mt-0.5">{l.referenciaNF}</div>}
                                </td>
                                <td className="px-3 py-3 text-right font-mono whitespace-nowrap">{fmtR$(l.contratado)}</td>
                                <td className={`px-3 py-3 text-right font-mono whitespace-nowrap ${l.faturado > 0 ? "text-emerald-700" : "text-gray-400"}`}>{l.faturado > 0 ? fmtR$(l.faturado) : "—"}</td>
                                <td className={`px-3 py-3 text-right font-mono whitespace-nowrap ${vencido ? "text-red-700 font-semibold" : l.aFaturar > 0 ? "text-torg-dark" : "text-gray-400"}`}>{l.aFaturar > 0 ? fmtR$(l.aFaturar) : "—"}</td>
                                <td className="px-3 py-3 whitespace-nowrap">
                                  {l.aFaturar > 0 ? (vencido ? <span className="text-red-700">{fmtD(l.vencidaDesde || l.proximaPrevisao)}<div className="text-[11px]">prevista, sem nota</div></span> : fmtD(l.proximaPrevisao)) : <span className="text-gray-400">—</span>}
                                </td>
                                <td className="px-3 py-3"><span className={`inline-block text-[11.5px] font-semibold rounded-full border px-2.5 py-0.5 whitespace-nowrap ${CHIP[l.situacao.codigo] || CHIP.AGUARDANDO}`}>{ROTULO[l.situacao.codigo] || l.situacao.rotulo}</span></td>
                              </tr>
                              {(l.notas.length > 0 || l.avisos.length > 0) && (
                                <tr className="bg-gray-50/40">
                                  <td colSpan={7} className="px-4 pb-3 pt-0 text-[12px]">
                                    {l.notas.length > 0 && (
                                      <div className="text-torg-gray">
                                        <p className="inline-flex items-center gap-1 font-semibold text-torg-dark mb-1"><FileText size={12} /> {l.notas.length === 1 ? "Nota emitida" : `${l.notas.length} notas emitidas`} <span className="font-normal text-torg-gray">— {l.oc ? rotuloComCodigo(l.rotulo, l.oc) : `pedido nº ${l.pedidosOmie[0]?.numero || ""}`}</span></p>
                                        <ul className="grid gap-y-0.5" style={{ gridTemplateColumns: "max-content max-content max-content", columnGap: "1.25rem" }}>
                                          {l.notas.map((n, k) => (
                                            <li key={k} className="contents" title={n.chave ? `chave ${n.chave}` : undefined}>
                                              <span className="font-mono font-semibold text-torg-dark">{n.numero ? `NF ${n.numero}${n.serie && n.serie !== "1" ? `/${n.serie}` : ""}` : "NF (nº a confirmar)"}</span>
                                              <span>{fmtD(n.data)}</span>
                                              <span className="font-mono text-torg-dark text-right">{fmtR$(n.valor)}</span>
                                            </li>
                                          ))}
                                        </ul>
                                        {l.canceladas > 0 && <p className="text-gray-400 mt-1">{l.canceladas} parcela{l.canceladas > 1 ? "s" : ""} cancelada{l.canceladas > 1 ? "s" : ""} — não conta no faturado.</p>}
                                      </div>
                                    )}
                                    {l.avisos.map((a, k) => <p key={k} className="text-amber-800 mt-1">ⓘ {a}</p>)}
                                  </td>
                                </tr>
                              )}
                            </Fragmento>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            ))}
            <p className="text-[12px] text-torg-gray">Contratado = valor do pedido de venda na Torg. Faturado = notas já emitidas. Dúvidas sobre um pedido: fale com o Comercial da Torg pela aba "Meus documentos".</p>
          </>
        )}
      </div>
    </div>
  );
}

function Fragmento({ children }) { return <>{children}</>; }

// Tudo que identifica a obra para o cliente, em chips por tipo: projeto (TPR), pedidos (OC), itens
// (ETC), TAGs, outros códigos; depois o texto livre da OP e o que está gravado nas notas.
function Identificacao({ id }) {
  if (!id) return null;
  const grupos = [
    ["projetos", "bg-amber-50 text-amber-900 border-amber-100"], ["pedidos", "bg-blue-50 text-blue-900 border-blue-100"],
    ["itens", "bg-gray-100 text-gray-700 border-gray-200"], ["tags", "bg-sky-50 text-sky-800 border-sky-100"], ["outros", "bg-gray-100 text-gray-700 border-gray-200"],
  ];
  const chips = grupos.flatMap(([k, cor]) => (id[k] || []).map((r, i) => <span key={`${k}-${i}`} className={`inline-block font-mono text-[11px] px-2 py-0.5 rounded-full border ${cor}`}>{r.rotulo} {r.codigo}</span>));
  const textoJaCoberto = id.texto && chips.length > 0 && id.projetos.concat(id.pedidos).some((r) => id.texto.includes(r.codigo));
  const extras = [
    !textoJaCoberto && id.texto ? id.texto : null,
    id.pedidoKickoff && !id.pedidos.some((p) => id.pedidoKickoff.includes(p.codigo)) ? `Pedido: ${id.pedidoKickoff}` : null,
    ...id.nosPedidos.filter((t) => !id.pedidos.some((p) => t.includes(p.codigo)) && !(id.texto || "").includes(t)),
  ].filter(Boolean);
  if (!chips.length && !extras.length) return null;
  return (
    <div className="mt-1 space-y-1">
      {chips.length > 0 && <div className="flex flex-wrap gap-1.5">{chips}</div>}
      {extras.length > 0 && <p className="text-[11.5px] text-torg-gray leading-snug">{extras.join(" · ")}</p>}
    </div>
  );
}

function Cartao({ rot, val, sub, cor = "text-torg-dark", alerta = false }) {
  return (
    <div className={`rounded-xl border p-3 ${alerta ? "border-red-200 bg-red-50/60" : "border-gray-200 bg-white"}`}>
      <p className="text-[10.5px] uppercase tracking-wider text-torg-gray font-semibold">{rot}</p>
      <p className={`font-mono text-[18px] font-semibold mt-0.5 ${cor}`}>{val}</p>
      {sub && <p className="text-[11.5px] text-torg-gray mt-0.5 truncate">{sub}</p>}
    </div>
  );
}
