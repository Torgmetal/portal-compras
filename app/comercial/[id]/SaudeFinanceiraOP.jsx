"use client";
import { useState, useEffect } from "react";
import { Loader2, AlertCircle, HeartPulse, Info, ChevronDown, ChevronRight, TriangleAlert, FileSpreadsheet } from "lucide-react";

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
  const [exportando, setExportando] = useState(false);

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

  const { familias, totais, receita, estudo, margem, alertas, confrontos, expedicao, op } = data;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 flex items-start justify-between gap-4">
        <div className="min-w-0">
        <h3 className="text-lg font-semibold text-torg-dark inline-flex items-center gap-2">
          <HeartPulse size={18} className="text-torg-blue" /> Saúde financeira
        </h3>
        <p className="text-xs text-torg-gray mt-1">
          O que o orçamento previu contra o que de fato aconteceu. Cada família abre e mostra os itens
          do contrato e os pedidos que formaram os dois lados da conta.
          {op?.estudoArquivo ? <> Base do estudo: <span className="font-medium text-torg-dark">{op.estudoArquivo}</span>.</> : null}
        </p>
        </div>
        {/* Vitor (19/08): "pensei no excel por ser editável" — o setor abre, filtra, escreve ao
            lado o que discorda e devolve. Por isso vai em abas, não num relatório fechado. */}
        <button
          type="button"
          onClick={async () => {
            setExportando(true);
            try { await exportarExcel(data, op?.numero); }
            catch (e) { alert(`Erro ao exportar: ${e.message}`); }
            finally { setExportando(false); }
          }}
          disabled={exportando}
          title="Baixa tudo em Excel — resumo, verba por família, itens, pedidos, orçado × real e o que conferir, cada um numa aba"
          className="shrink-0 inline-flex items-center gap-1.5 text-[12px] font-semibold text-torg-blue border border-torg-blue-200 hover:bg-torg-blue-50 rounded-lg px-3 py-1.5 disabled:opacity-50"
        >
          {exportando ? <Loader2 size={14} className="animate-spin" /> : <FileSpreadsheet size={14} />}
          {exportando ? "Gerando..." : "Exportar Excel"}
        </button>
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

        {/* ── ESTIMADO × REALIZADO NA QUANTIDADE ─────────────────────────────────────────── */}
        {confrontos.length > 0 && (
          <div>
            <p className="text-sm font-semibold text-torg-dark mb-2">
              Orçado × real, na quantidade
            </p>
            <div className="space-y-2">
              {confrontos.map((c) => <Confronto key={c.rotulo} c={c} />)}
            </div>
            <p className="text-[10px] text-torg-gray mt-1.5">
              O real vem da <b>lista de expedição</b>, que traz área e peso de cada marca — contando
              só as <b>peças fabricadas</b>: parafuso, telha, cumeeira e grade de piso estão na lista
              mas não são estrutura nossa nem se pintam
              {expedicao?.listas?.length ? <> ({expedicao.listas.map((l) => l.frente).join(", ")})</> : null}.
              O custo é projetado ao <b>preço que o próprio orçamento usou</b> — mede o erro de
              orçamento sozinho, sem misturar com preço de compra. Desvio de preço se apura na cotação.
            </p>
          </div>
        )}

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

/** Uma grandeza confrontada: quanto se orçou, quanto a obra tem de verdade, e o que isso custa. */
function Confronto({ c }) {
  if (c.semComparacao) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2 text-[12px] text-amber-800 flex items-start gap-2">
        <TriangleAlert size={13} className="mt-0.5 shrink-0" />
        <span>
          <b>{c.rotulo}</b> — o item do contrato está em <b>{c.unidadeErrada}</b>, não em {c.unidade}.
          Sem unidade comparável não dá pra confrontar com a lista de expedição.
        </span>
      </div>
    );
  }

  const pra_cima = c.desvioPct > 0;
  const relevante = Math.abs(c.desvioPct) >= 10;
  const parcial = c.cobertura?.pct != null && c.cobertura.pct < 99;
  const num = (v, casas = 0) => Number(v || 0).toLocaleString("pt-BR", { maximumFractionDigits: casas });

  return (
    <div className={`rounded-lg border px-3 py-2.5 ${relevante ? (pra_cima ? "border-red-200 bg-red-50/40" : "border-amber-200 bg-amber-50/40") : "border-gray-200"}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-[13px] font-semibold text-torg-dark">
          {c.rotulo}
          {c.fonte && <span className="font-normal text-torg-gray text-[11px]"> · orçado no {c.fonte}</span>}
        </p>
        <p className={`text-[13px] font-bold tabular-nums ${relevante ? (pra_cima ? "text-red-600" : "text-amber-700") : "text-torg-dark"}`}>
          {pra_cima ? "+" : ""}{c.desvioPct.toFixed(0)}%
        </p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 mt-1.5 text-[12px]">
        <div><span className="text-torg-gray">Orçado</span><br /><b className="tabular-nums">{num(c.estimado)} {c.unidade}</b></div>
        <div><span className="text-torg-gray">Na lista</span><br /><b className="tabular-nums">{num(c.real)} {c.unidade}</b></div>
        <div><span className="text-torg-gray">Verba</span><br /><b className="tabular-nums">{fmtMoeda(c.verba)}</b></div>
        <div>
          <span className="text-torg-gray">Custo na quantidade real</span><br />
          <b className="tabular-nums">{c.custoProjetado == null ? "—" : fmtMoeda(c.custoProjetado)}</b>
          {c.faltaDeVerba != null && Math.abs(c.faltaDeVerba) > 1 && (
            <span className={`ml-1 text-[11px] font-semibold ${c.faltaDeVerba > 0 ? "text-red-600" : "text-green-700"}`}>
              ({c.faltaDeVerba > 0 ? "falta " : "sobra "}{fmtCurto(Math.abs(c.faltaDeVerba))})
            </span>
          )}
        </div>
      </div>
      {c.foraDaConta?.length > 0 && (
        <p className="text-[11px] text-torg-gray mt-1.5">
          Fora desta conta, na mesma família:{" "}
          {c.foraDaConta.map((i) => `${i.descricao}${i.qtd ? ` (${Number(i.qtd).toLocaleString("pt-BR")} ${i.unidade || ""})` : ""} ${fmtCurto(i.valor)}`).join(" · ")}
          {" "}— outra unidade, não entra no preço por {c.unidade}.
        </p>
      )}
      {parcial && (
        <p className="text-[11px] text-torg-gray mt-1.5">
          A lista tem <b>{c.cobertura.comArea} de {c.cobertura.pecas}</b> peças fabricadas medidas —{" "}
          {pra_cima
            ? "o desvio real é maior que o mostrado."
            : "parte da diferença pode ser medição que falta, não orçamento sobrando."}
        </p>
      )}
    </div>
  );
}

/**
 * EXPORTA A SAÚDE FINANCEIRA PRA EXCEL, no padrão de planilha da casa.
 *
 * Vitor (19/08/2026): "na aba do financeiro é possível criar um botão para podermos exportar
 * todas as informações em um excel para podermos apresentar aos setores e verificar as
 * informações? Eu pensei no excel por ser editável".
 *
 * Editável é o ponto: a planilha não é um retrato pra arquivar, é material de reunião — o setor
 * abre, filtra, escreve ao lado o que discorda e devolve. Por isso vai em ABAS separadas, cada
 * uma uma tabela limpa com autofiltro, em vez de um relatório único e bonito que ninguém consegue
 * mexer.
 *
 * As abas de detalhe (itens e pedidos) são o que torna o número discutível: sem elas o setor vê
 * "Tinta estourou 155%" e não tem como conferir de onde veio.
 */
async function exportarExcel(data, opNumero) {
  const { criarRelatorioTorg, adicionarHeaderTabela, adicionarLinhaTabela, adicionarLinhaTotais, downloadWorkbook, CORES: _CORES } =
    await import("@/lib/excel-relatorio");
  const { familias, totais, receita, estudo, margem, alertas, confrontos, expedicao, op } = data;
  const D = (n) => (n == null ? "—" : Number(n));
  const pctTxt = (v) => (v == null ? "—" : `${Number(v).toFixed(1)}%`);

  const { workbook: wb, sheet: ws, linhaInicio } = await criarRelatorioTorg({
    titulo: `Saúde Financeira — OP-${opNumero}`,
    subtitulo: op?.estudoArquivo ? `Base do estudo: ${op.estudoArquivo}` : "Sem planilha de estudo vinculada",
    nomePlanilha: "Resumo",
    codigoDoc: "REL-FIN-001",
    totalColunas: 4,
    kpis: [
      `Receita líquida: ${fmtMoeda(receita.liquida)}  |  Verba estimada: ${fmtMoeda(totais.estimado)}  |  Já comprado: ${fmtMoeda(totais.realizado)}  |  Margem corrente: ${fmtMoeda(margem.corrente)}`,
    ],
  });
  [34, 20, 20, 46].forEach((w, i) => { ws.getColumn(i + 1).width = w; });

  let r = linhaInicio;
  const secao = (titulo) => {
    adicionarLinhaTabela(ws, r, [titulo, "", "", ""], { bold: true, fillColor: "EEF2F7", fontSize: 10 });
    r++;
  };
  const linha = (rot, valor, nota = "") => {
    adicionarLinhaTabela(ws, r, [rot, valor, "", nota], { alinhamento: ["left", "right", "left", "left"] });
    r++;
  };

  secao("MARGEM — os três cenários");
  linha("Margem do estudo (BDI)", D(margem.estudo), "o que o Comercial previu");
  linha("Margem da OP na abertura", D(margem.prevista), "receita líquida − verba dos itens");
  linha("Margem corrente", D(margem.corrente), "já com o que foi comprado acima da verba");
  r++;

  secao("RECEITA — o que se fatura");
  linha("Contrato", D(receita.contrato), receita.contratoExplicito ? "informado na OP" : "soma das receitas");
  linha("Receita bruta", D(receita.bruta));
  linha("Impostos", D(-receita.impostos));
  linha("Receita líquida", D(receita.liquida));
  linha("Já faturado", D(receita.faturado), receita.faturadoPct != null ? `${pctTxt(receita.faturadoPct)} do contrato` : "");
  r++;

  secao("VERBA — o que se compra");
  linha("Verba estimada", D(totais.estimado));
  linha("Já em pedidos", D(totais.realizado), totais.pct != null ? `${pctTxt(totais.pct)} consumido` : "");
  linha("Saldo", D(totais.saldo));
  if (totais.naoAtribuido > 0) linha("Pedidos sem família identificada", D(totais.naoAtribuido), "conferir — não se amarram a nenhum item da OP");
  r++;

  if (estudo) {
    secao("CUSTOS INFORMADOS NA PLANILHA DO COMERCIAL");
    linha("Venda do estudo", D(estudo.venda));
    linha("Custo de compra", D(estudo.custoDeCompra), "material + serviço terceirizado");
    linha("  · Material", D(estudo.material));
    linha("  · Serviço terceirizado", D(estudo.mdoTerceirizada));
    linha("Industrialização", D(estudo.industrializacao), "fabricação nossa — não se compra");
    linha("BDI", D(estudo.bdi), "impostos, risco, margem");
    linha("Imposto destacado na nota", D(estudo.impostoNota));
    linha("Crédito recuperável nas compras", D(estudo.credito));
    linha("Imposto líquido da obra", D(estudo.impostoLiquido), estudo.impostoLiquidoPct ? pctTxt(estudo.impostoLiquidoPct * 100) : "");
  }

  // ── ABA: verba por família ───────────────────────────────────────────────────────────────
  const wsFam = wb.addWorksheet("Verba por família");
  [28, 18, 18, 18, 12, 30].forEach((w, i) => { wsFam.getColumn(i + 1).width = w; });
  adicionarHeaderTabela(wsFam, 1, ["Família", "Estimado", "Realizado", "Saldo", "Consumo", "Situação"]);
  let rf = 2;
  for (const f of familias) {
    adicionarLinhaTabela(wsFam, rf, [
      f.label, D(f.estimado), D(f.realizado), f.estimado > 0 ? D(f.saldo) : "—", pctTxt(f.pct),
      f.semEstimativa ? "compra sem verba prevista" : f.estourou ? "ESTOUROU a verba" : "",
    ], {
      alinhamento: ["left", "right", "right", "right", "right", "left"],
      fontColors: f.estourou || f.semEstimativa ? { 5: "C0392B" } : undefined,
    });
    rf++;
  }
  if (totais.naoAtribuido > 0) {
    adicionarLinhaTabela(wsFam, rf, ["Sem família identificada", "—", D(totais.naoAtribuido), "—", "—", "conferir a origem"], { alinhamento: ["left", "right", "right", "right", "right", "left"] });
    rf++;
  }
  adicionarLinhaTotais(wsFam, rf, ["TOTAL", D(totais.estimado), D(totais.realizado), D(totais.saldo), pctTxt(totais.pct), ""]);

  // ── ABA: itens do contrato (o lado ESTIMADO, aberto) ─────────────────────────────────────
  const wsIt = wb.addWorksheet("Itens do contrato");
  [24, 52, 18, 16, 16].forEach((w, i) => { wsIt.getColumn(i + 1).width = w; });
  adicionarHeaderTabela(wsIt, 1, ["Família", "Descrição", "Verba", "Origem", "Faturamento"]);
  let ri = 2;
  for (const f of familias) {
    for (const i of f.itens) {
      adicionarLinhaTabela(wsIt, ri, [f.label, i.descricao || "", D(i.valor), i.origem === "base" ? "contrato base" : i.origem, i.fd ? "direto ao cliente" : "Torg"], { alinhamento: ["left", "left", "right", "left", "left"] });
      ri++;
    }
  }

  // ── ABA: pedidos (o lado REALIZADO, aberto) ──────────────────────────────────────────────
  const wsPd = wb.addWorksheet("Pedidos");
  [24, 14, 34, 14, 18, 22].forEach((w, i) => { wsPd.getColumn(i + 1).width = w; });
  adicionarHeaderTabela(wsPd, 1, ["Família", "Pedido", "Fornecedor", "RM", "Valor", "Como foi atribuído"]);
  let rp = 2;
  for (const f of familias) {
    for (const p of f.pedidos) {
      adicionarLinhaTabela(wsPd, rp, [f.label, p.pedido || "—", p.fornecedor || "—", p.rm || "—", D(p.valor), `${p.via || ""}${p.rateado ? " · rateado entre famílias" : ""}`], { alinhamento: ["left", "left", "left", "left", "right", "left"] });
      rp++;
    }
  }
  for (const p of totais.pedidosSemFamilia || []) {
    adicionarLinhaTabela(wsPd, rp, ["(sem família)", p.pedido || "—", p.fornecedor || "—", "—", D(p.valor), "não se amarra a nenhum item da OP"], { alinhamento: ["left", "left", "left", "left", "right", "left"] });
    rp++;
  }

  // ── ABA: orçado × real na quantidade ─────────────────────────────────────────────────────
  if (confrontos?.length) {
    const wsQt = wb.addWorksheet("Orçado x real");
    [22, 8, 14, 14, 10, 16, 18, 18, 34].forEach((w, i) => { wsQt.getColumn(i + 1).width = w; });
    adicionarHeaderTabela(wsQt, 1, ["Grandeza", "Un.", "Orçado", "Na lista", "Desvio", "Verba", "Preço orçado", "Custo na qtd real", "Observação"]);
    let rq = 2;
    for (const c of confrontos) {
      if (c.semComparacao) {
        adicionarLinhaTabela(wsQt, rq, [c.rotulo, c.unidade, "—", "—", "—", "—", "—", "—", `item do contrato está em ${c.unidadeErrada} — unidade não comparável`], { alinhamento: ["left", "center", "right", "right", "right", "right", "right", "right", "left"] });
      } else {
        const cob = c.cobertura?.pct != null && c.cobertura.pct < 99
          ? `${c.cobertura.comArea} de ${c.cobertura.pecas} peças fabricadas medidas`
          : "";
        adicionarLinhaTabela(wsQt, rq, [
          c.rotulo, c.unidade, D(c.estimado), D(c.real), `${c.desvioPct > 0 ? "+" : ""}${c.desvioPct.toFixed(0)}%`,
          D(c.verba), D(c.precoOrcado), D(c.custoProjetado),
          [c.faltaDeVerba > 0 ? `faltam ${fmtCurto(c.faltaDeVerba)} de verba` : c.faltaDeVerba < 0 ? `sobram ${fmtCurto(-c.faltaDeVerba)}` : "", cob].filter(Boolean).join(" · "),
        ], {
          alinhamento: ["left", "center", "right", "right", "right", "right", "right", "right", "left"],
          fontColors: Math.abs(c.desvioPct) >= 10 ? { 4: "C0392B" } : undefined,
        });
      }
      rq++;
    }
    if (expedicao) {
      rq++;
      adicionarLinhaTabela(wsQt, rq, [
        "Lista de expedição", "", `${expedicao.pecas} peças fabricadas`, `${Math.round(expedicao.pesoKg)} kg`, `${expedicao.areaM2.toFixed(2)} m²`, "", "", "",
        `${expedicao.compradas} itens comprados (${Math.round(expedicao.compradasKg)} kg) ficam fora da conta · frentes: ${(expedicao.listas || []).map((l) => l.frente).join(", ")}`,
      ], { fontSize: 8, alinhamento: ["left", "left", "left", "left", "left", "left", "left", "left", "left"] });
    }
  }

  // ── ABA: pontos pra conferir ─────────────────────────────────────────────────────────────
  if (alertas?.length) {
    const wsAl = wb.addWorksheet("Conferir");
    [16, 120].forEach((w, i) => { wsAl.getColumn(i + 1).width = w; });
    adicionarHeaderTabela(wsAl, 1, ["Nível", "O que conferir"]);
    let ra = 2;
    for (const a of alertas) {
      adicionarLinhaTabela(wsAl, ra, [a.nivel === "alerta" ? "ALERTA" : a.nivel === "atencao" ? "Atenção" : "Informação", a.texto], {
        wrapText: true,
        fontColors: a.nivel === "alerta" ? { 0: "C0392B" } : undefined,
      });
      ra++;
    }
  }

  // formato de moeda nas colunas de dinheiro (é planilha pra editar — número tem de ser número)
  const moeda = '"R$" #,##0.00';
  for (const [sheet, cols] of [[ws, [2]], [wsFam, [2, 3, 4]], [wsIt, [3]], [wsPd, [5]]]) {
    for (const c of cols) sheet.getColumn(c).numFmt = moeda;
  }

  await downloadWorkbook(wb, `Torg_SaudeFinanceira_OP-${opNumero}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}
