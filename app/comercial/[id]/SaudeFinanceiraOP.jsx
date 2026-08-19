"use client";
import { useState, useEffect } from "react";
import { Loader2, AlertCircle, HeartPulse, Info, ChevronDown, ChevronRight, TriangleAlert } from "lucide-react";

const fmtMoeda = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });
const fmtCurto = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const fmtPct = (v) => (v == null ? "—" : `${Number(v).toFixed(1)}%`);

/**
 * SAÚDE FINANCEIRA DA OP — previsto × realizado, pra auditar depois.
 *
 * Vitor (19/08/2026): "na aba da OP no financeiro você deve trazer todos os cenários — verbas
 * estimadas × realizadas, custos informados na planilha. Precisa trazer o resumo da saúde
 * financeira para podermos auditar esses números posteriormente".
 *
 * Cada família abre e mostra de onde veio cada lado da conta: os itens do contrato que formaram a
 * estimativa e os pedidos que formaram o realizado. É o que faz o número ser auditável em vez de
 * apenas exibido.
 */
export default function SaudeFinanceiraOP({ opId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [aberta, setAberta] = useState(null);

  useEffect(() => {
    setLoading(true); setErro("");
    fetch(`/api/comercial/op/${opId}/saude-financeira`)
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error || "Erro"); return j; })
      .then(setData).catch((e) => setErro(e.message)).finally(() => setLoading(false));
  }, [opId]);

  if (loading) return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center">
      <Loader2 size={20} className="mx-auto animate-spin text-torg-blue mb-2" />
      <p className="text-sm text-torg-gray">Levantando previsto × realizado...</p>
    </div>
  );
  if (erro) return (
    <div className="bg-white rounded-xl shadow-sm border border-red-100 p-6">
      <div className="flex items-start gap-2 text-red-600 text-sm"><AlertCircle size={16} className="mt-0.5" />
        <div><p className="font-medium">Erro ao montar a saúde financeira</p><p className="text-xs mt-1">{erro}</p></div></div>
    </div>
  );
  if (!data) return null;

  const { familias, totais, receita, estudo, margem, alertas, op } = data;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100">
        <h3 className="text-lg font-semibold text-torg-dark inline-flex items-center gap-2">
          <HeartPulse size={18} className="text-torg-blue" /> Saúde financeira
        </h3>
        <p className="text-xs text-torg-gray mt-1">
          O que o orçamento previu contra o que de fato aconteceu. Cada família abre e mostra os itens
          do contrato e os pedidos que formaram os dois lados da conta.
          {op?.estudoArquivo ? <> Base do estudo: <span className="font-medium text-torg-dark">{op.estudoArquivo}</span>.</> : null}
        </p>
      </div>

      {/* ── OS TRÊS CENÁRIOS DE MARGEM ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-gray-100 border-b border-gray-100">
        <Cenario
          rotulo="Margem do estudo"
          valor={margem.estudo}
          pct={margem.estudoPct != null ? margem.estudoPct * 100 : null}
          nota="o que o Comercial previu no BDI"
        />
        <Cenario
          rotulo="Margem da OP (verba estimada)"
          valor={margem.prevista}
          pct={margem.previstaPct != null ? margem.previstaPct * 100 : null}
          nota="receita líquida − verba dos itens"
        />
        <Cenario
          rotulo="Margem corrente"
          valor={margem.corrente}
          pct={margem.correntePct != null ? margem.correntePct * 100 : null}
          nota="já considerando o que foi comprado acima da verba"
          destaque
        />
      </div>

      {/* ── VERBA POR FAMÍLIA: ESTIMADO × REALIZADO ──────────────────────────────────────── */}
      <div className="p-6 space-y-4">
        <div>
          <p className="text-sm font-semibold text-torg-dark mb-2">Verba estimada × realizada, por família</p>
          {familias.length === 0 ? (
            <p className="text-sm text-torg-gray">Sem itens de contrato e sem pedidos nesta OP.</p>
          ) : (
            <div className="rounded-lg border border-gray-200 overflow-x-auto">
              <table className="w-full text-[13px] min-w-[640px]">
                <thead className="bg-gray-50 text-torg-gray">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Família</th>
                    <th className="px-3 py-2 text-right font-medium">Estimado</th>
                    <th className="px-3 py-2 text-right font-medium">Realizado</th>
                    <th className="px-3 py-2 text-right font-medium">Saldo</th>
                    <th className="px-3 py-2 text-right font-medium">Consumo</th>
                    <th className="px-3 py-2 w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {familias.map((f) => {
                    const ab = aberta === f.categoria;
                    return (
                      <FamiliaLinhas key={f.categoria} f={f} aberta={ab} onToggle={() => setAberta(ab ? null : f.categoria)} />
                    );
                  })}
                  {totais.naoAtribuido > 0 && (
                    <tr className="bg-amber-50/60">
                      <td className="px-3 py-2 text-amber-800 inline-flex items-center gap-1.5">
                        <TriangleAlert size={13} /> Sem família identificada
                      </td>
                      <td className="px-3 py-2 text-right text-torg-gray tabular-nums">—</td>
                      <td className="px-3 py-2 text-right font-semibold text-amber-800 tabular-nums">{fmtMoeda(totais.naoAtribuido)}</td>
                      <td className="px-3 py-2 text-right text-torg-gray tabular-nums">—</td>
                      <td className="px-3 py-2 text-right text-torg-gray tabular-nums">—</td>
                      <td />
                    </tr>
                  )}
                  <tr className="bg-gray-50 font-bold">
                    <td className="px-3 py-2 text-torg-dark">Total</td>
                    <td className="px-3 py-2 text-right text-torg-dark tabular-nums">{fmtMoeda(totais.estimado)}</td>
                    <td className="px-3 py-2 text-right text-torg-orange-700 tabular-nums">{fmtMoeda(totais.realizado)}</td>
                    <td className={`px-3 py-2 text-right tabular-nums ${totais.saldo < 0 ? "text-red-600" : "text-green-700"}`}>{fmtMoeda(totais.saldo)}</td>
                    <td className="px-3 py-2 text-right text-torg-dark tabular-nums">{fmtPct(totais.pct)}</td>
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>
          )}
          <p className="text-[10px] text-torg-gray mt-1.5">
            Realizado = pedidos que consomem verba (criados no Omie, mais os FD avulsos com NF emitida).
            Cancelados ficam de fora. O total de cada pedido é rateado entre as famílias das suas linhas
            — assim frete e desconto do pedido não somem da conta.
          </p>
        </div>

        {/* ── CUSTOS INFORMADOS NA PLANILHA ──────────────────────────────────────────────── */}
        {estudo ? (
          <div>
            <p className="text-sm font-semibold text-torg-dark mb-2">Custos informados na planilha do Comercial</p>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
              <Caixa rotulo="Venda do estudo" valor={estudo.venda} forte />
              <Caixa rotulo="Custo de compra" valor={estudo.custoDeCompra} nota="material + serviço terceirizado" />
              <Caixa rotulo="Industrialização" valor={estudo.industrializacao} nota="fabricação nossa — não se compra" />
              <Caixa rotulo="BDI" valor={estudo.bdi} nota="impostos, risco, margem" />
              <Caixa rotulo="Material" valor={estudo.material} />
              <Caixa rotulo="Serviço terceirizado" valor={estudo.mdoTerceirizada} />
              <Caixa rotulo="Imposto na nota" valor={estudo.impostoNota} />
              <Caixa
                rotulo="Imposto líquido"
                valor={estudo.impostoLiquido}
                nota={estudo.credito ? `depois de ${fmtCurto(estudo.credito)} de crédito` : null}
              />
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-2 text-amber-700 bg-amber-50 rounded-lg p-3 text-sm">
            <Info size={15} className="mt-0.5 shrink-0" />
            <p>Esta OP não tem planilha de estudo vinculada — sem ela não há custo do Comercial pra comparar com o realizado.</p>
          </div>
        )}

        {/* ── RECEITA ────────────────────────────────────────────────────────────────────── */}
        <div>
          <p className="text-sm font-semibold text-torg-dark mb-2">Receita</p>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
            <Caixa rotulo="Contrato" valor={receita.contrato} nota={receita.contratoExplicito ? "informado na OP" : "soma das receitas"} forte />
            <Caixa rotulo="Receita bruta" valor={receita.bruta} />
            <Caixa rotulo="Impostos" valor={-receita.impostos} />
            <Caixa rotulo="Receita líquida" valor={receita.liquida} forte />
            <Caixa rotulo="Já faturado" valor={receita.faturado} nota={receita.faturadoPct != null ? `${fmtPct(receita.faturadoPct)} do contrato` : null} />
          </div>
        </div>

        {/* ── PONTOS PRA AUDITAR ─────────────────────────────────────────────────────────── */}
        {alertas.length > 0 && (
          <div>
            <p className="text-sm font-semibold text-torg-dark mb-2">Pontos pra conferir</p>
            <ul className="space-y-1">
              {alertas.map((a, i) => (
                <li
                  key={i}
                  className={`text-[12px] rounded-lg px-3 py-2 flex items-start gap-2 ${
                    a.nivel === "alerta" ? "bg-red-50 text-red-700"
                      : a.nivel === "atencao" ? "bg-amber-50 text-amber-800"
                      : "bg-gray-50 text-torg-gray"
                  }`}
                >
                  {a.nivel === "info" ? <Info size={13} className="mt-0.5 shrink-0" /> : <TriangleAlert size={13} className="mt-0.5 shrink-0" />}
                  <span>{a.texto}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function Cenario({ rotulo, valor, pct, nota, destaque }) {
  const negativo = valor != null && valor < 0;
  return (
    <div className="bg-white p-4">
      <p className="text-[10px] font-medium text-torg-gray uppercase tracking-wider mb-1">{rotulo}</p>
      <p className={`text-lg font-extrabold tabular-nums ${valor == null ? "text-torg-gray" : negativo ? "text-red-600" : destaque ? "text-torg-blue" : "text-torg-dark"}`}>
        {valor == null ? "—" : fmtCurto(valor)}
        {pct != null && <span className="text-[11px] font-semibold text-torg-gray ml-1.5">({fmtPct(pct)})</span>}
      </p>
      <p className="text-[10px] text-torg-gray mt-1">{nota}</p>
    </div>
  );
}

function Caixa({ rotulo, valor, nota, forte }) {
  return (
    <div className={`bg-white border rounded-lg px-3 py-2 ${forte ? "border-torg-blue-200" : "border-gray-100"}`}>
      <p className="text-[10px] text-torg-gray">{rotulo}</p>
      <p className={`font-bold tabular-nums ${valor == null ? "text-torg-gray" : forte ? "text-torg-blue" : "text-torg-dark"}`}>
        {valor == null ? "—" : fmtMoeda(valor)}
      </p>
      {nota && <p className="text-[10px] text-torg-gray mt-0.5">{nota}</p>}
    </div>
  );
}

/** Linha da família + a gaveta que mostra de onde vieram os dois lados. */
function FamiliaLinhas({ f, aberta, onToggle }) {
  const cor = f.semEstimativa ? "text-red-600" : f.estourou ? "text-red-600" : f.saldo >= 0 ? "text-green-700" : "text-red-600";
  return (
    <>
      <tr className={`cursor-pointer hover:bg-gray-50 ${aberta ? "bg-gray-50" : ""}`} onClick={onToggle}>
        <td className="px-3 py-2 text-torg-dark">
          <span className="font-medium">{f.label}</span>
          {f.semEstimativa && <span className="ml-2 text-[10px] bg-red-100 text-red-700 rounded px-1.5 py-0.5 align-middle">sem verba prevista</span>}
          {f.estourou && <span className="ml-2 text-[10px] bg-red-100 text-red-700 rounded px-1.5 py-0.5 align-middle">estourou</span>}
        </td>
        <td className="px-3 py-2 text-right text-torg-dark tabular-nums">{f.estimado > 0 ? fmtMoeda(f.estimado) : "—"}</td>
        <td className="px-3 py-2 text-right text-torg-orange-700 tabular-nums">{f.realizado > 0 ? fmtMoeda(f.realizado) : "—"}</td>
        <td className={`px-3 py-2 text-right tabular-nums ${cor}`}>{f.estimado > 0 ? fmtMoeda(f.saldo) : "—"}</td>
        <td className="px-3 py-2 text-right tabular-nums">
          {f.pct == null ? "—" : (
            <span className="inline-flex items-center gap-1.5">
              <span className={f.estourou ? "text-red-600 font-semibold" : "text-torg-dark"}>{fmtPct(f.pct)}</span>
              <span className="w-10 h-1.5 bg-gray-100 rounded-full overflow-hidden hidden sm:inline-block align-middle">
                <span className={`block h-full rounded-full ${f.estourou ? "bg-red-500" : "bg-torg-orange"}`} style={{ width: `${Math.min(f.pct, 100)}%` }} />
              </span>
            </span>
          )}
        </td>
        <td className="px-3 py-2 text-torg-gray">{aberta ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</td>
      </tr>
      {aberta && (
        <tr className="bg-gray-50/60">
          <td colSpan={6} className="px-3 pb-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-[11px] font-semibold text-torg-gray uppercase tracking-wide mb-1">Estimado — itens do contrato</p>
                {f.itens.length === 0 ? <p className="text-[12px] text-torg-gray">Nenhum item previu esta família.</p> : (
                  <ul className="space-y-0.5">
                    {f.itens.map((i, n) => (
                      <li key={n} className="text-[12px] flex justify-between gap-3">
                        <span className="text-torg-dark min-w-0">
                          {i.descricao}
                          {i.origem !== "base" && <span className="text-torg-gray"> · {i.origem}</span>}
                          {i.fd && <span className="text-torg-gray"> · faturamento direto</span>}
                        </span>
                        <span className="text-torg-dark tabular-nums whitespace-nowrap">{fmtMoeda(i.valor)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <p className="text-[11px] font-semibold text-torg-gray uppercase tracking-wide mb-1">Realizado — pedidos</p>
                {f.pedidos.length === 0 ? <p className="text-[12px] text-torg-gray">Nada comprado nesta família ainda.</p> : (
                  <ul className="space-y-0.5">
                    {f.pedidos.map((p, n) => (
                      <li key={n} className="text-[12px] flex justify-between gap-3">
                        <span className="text-torg-dark min-w-0">
                          {p.pedido ? `Pedido ${p.pedido}` : "Pedido"}
                          {p.fornecedor && <span className="text-torg-gray"> · {p.fornecedor}</span>}
                          {p.rm && <span className="text-torg-gray"> · RM {p.rm}</span>}
                          {p.rateado && <span className="text-torg-gray"> · parte do pedido</span>}
                        </span>
                        <span className="text-torg-dark tabular-nums whitespace-nowrap">{fmtMoeda(p.valor)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
