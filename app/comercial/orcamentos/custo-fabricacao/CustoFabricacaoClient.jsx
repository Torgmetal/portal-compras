"use client";
import { useEffect, useState } from "react";
import { Factory, Loader2, AlertCircle, Info } from "lucide-react";

/* CUSTO DE FABRICAÇÃO — o que custa transformar um quilo, medido na empresa.
 *
 * ⚠ SÓ CUSTO. Vitor (09/09/2026): "na parte de fabricação apenas os custos, e na aba de impostos e
 * BDI você pega essas". Preço, imposto e BDI moram no estudo; aqui é o parâmetro da casa, com data
 * e período — para o estudo herdar em vez de cada um digitar o seu.
 *
 * ⚠ TINTA NÃO ESTÁ AQUI. "Tinta é o material, na fabricação é o custo operacional da aplicação" —
 * o que esta tela precifica é jato, preparação de superfície e aplicação por demão. O material sai
 * do rendimento das camadas, na aba Pintura do estudo.
 */
const brl = (v) => (v == null ? "—" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
const num = (v, d = 2) => Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
const kg = (v) => `${Math.round(v || 0).toLocaleString("pt-BR")} kg`;

export default function CustoFabricacaoClient() {
  const [d, setD] = useState(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [demaos, setDemaos] = useState(1);

  const carregar = () => {
    setCarregando(true); setErro("");
    fetch("/api/comercial/custo-fabricacao")
      .then((r) => r.json())
      .then((j) => { if (!j.success) throw new Error(j.error); setD(j.dados); })
      .catch((e) => setErro(e.message))
      .finally(() => setCarregando(false));
  };
  useEffect(carregar, []);

  if (carregando) return <Centro><Loader2 className="animate-spin text-torg-blue" size={26} /><p className="text-sm text-torg-gray mt-3">Medindo o custo nos pagamentos e nos apontamentos…</p></Centro>;
  if (erro) return <Centro><AlertCircle className="text-rose-500" size={26} /><p className="text-sm text-torg-dark mt-3">{erro}</p>
    <button onClick={carregar} className="mt-4 px-4 py-2 bg-torg-blue text-white text-sm rounded-lg">Tentar novamente</button></Centro>;
  if (!d) return null;

  const c = d.composicao;
  const iDem = Math.max(0, Math.min(2, demaos - 1));

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <header className="flex items-start gap-3">
        <div className="p-2 bg-torg-blue/10 rounded-lg"><Factory className="text-torg-blue" size={20} /></div>
        <div>
          <h1 className="text-xl font-bold text-torg-dark">Custo de Fabricação</h1>
          <p className="text-[13px] text-torg-gray">
            O que custa transformar um quilo — medido no que a empresa pagou e no que a fábrica apontou.
            Sem imposto, sem BDI e sem margem: esses moram no estudo.
          </p>
        </div>
      </header>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <p className="text-[12px] font-bold text-torg-dark mb-3">Composição — média de {d.meses} meses ({d.periodo})</p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {[["Folha da fábrica", c.folhaFabrica, "rota + engenharia, PCP, qualidade, almoxarifado e expedição"],
            ["Energia, manutenção, consumível", c.despesaFabrica, "EPI e refeição de produção incluídos"],
            ["Rescisão de produção", c.rescisaoProducao, "provisão: aconteceu nos 12 meses"],
            ["Depreciação das máquinas", c.depreciacao, "capex ÷ 10 anos"],
            ["Total mensal", c.mensal, `÷ ${kg(d.kgMes)}/mês`]].map(([rot, val, ajuda], i) => (
            <div key={rot} className={`rounded-lg border p-3 ${i === 4 ? "border-torg-blue bg-torg-blue/5" : "border-gray-100"}`}>
              <p className="text-[10.5px] uppercase tracking-wide text-torg-gray">{rot}</p>
              <p className={`text-[15px] font-bold ${i === 4 ? "text-torg-blue" : "text-torg-dark"} tabular-nums`}>{brl(val)}</p>
              <p className="text-[10.5px] text-torg-gray mt-0.5">{ajuda}</p>
            </div>
          ))}
        </div>
        <p className="text-[12px] text-torg-dark mt-4">
          <b className="text-torg-blue text-[15px]">R$ {num(d.porKg)}/kg</b> — sendo{" "}
          <b>R$ {num(d.fabricacaoPorKg)}</b> de fabricação e <b>R$ {num(d.aplicacaoPorKg)}</b> de aplicação
          (jato e pintura, {num(d.fracaoAplicacao, 0)}% da folha da fábrica).
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[12px] font-bold text-torg-dark">Custo por classe de peso</p>
            <p className="text-[11px] text-torg-gray">
              A proporção entre classes é a da LQC — peça leve custa mais por quilo, é física.
              O nível é o medido: fator {num(d.fatorFab)}× na fabricação e {num(d.fatorApl)}× na aplicação.
            </p>
          </div>
          {/* ⚠ o seletor muda a coluna de aplicação, não a de fabricação: demão é aplicação */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-torg-gray">Demãos</span>
            {[1, 2, 3].map((n) => (
              <button key={n} onClick={() => setDemaos(n)}
                className={`text-[12px] font-semibold rounded-lg px-3 py-1.5 border ${demaos === n ? "border-torg-blue bg-torg-blue text-white" : "border-gray-200 text-torg-gray hover:border-torg-blue/40"}`}>
                {n}
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50/60 border-b border-gray-100">
              <tr>
                <th className="px-5 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Classe</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Faixa</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 uppercase">% do peso</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 uppercase">Fabricação</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 uppercase">Aplicação ({demaos}d)</th>
                <th className="px-5 py-2.5 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {d.classes.map((cl) => (
                <tr key={cl.key} className="hover:bg-gray-50">
                  <td className="px-5 py-2.5 font-medium text-torg-dark">{cl.nome}</td>
                  <td className="px-4 py-2.5 text-torg-gray text-xs">{cl.faixa}</td>
                  <td className="px-4 py-2.5 text-right text-torg-gray tabular-nums">{num(cl.pesoDoMix * 100, 1)}%</td>
                  <td className="px-4 py-2.5 text-right text-torg-dark tabular-nums">{num(cl.fabricacao)}</td>
                  <td className="px-4 py-2.5 text-right text-torg-dark tabular-nums">{num(cl.aplicacao[iDem])}</td>
                  <td className="px-5 py-2.5 text-right font-semibold text-torg-blue tabular-nums">{num(cl.fabricacao + cl.aplicacao[iDem])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="px-5 py-3 text-[11px] text-torg-gray bg-gray-50/40 border-t border-gray-100 flex items-start gap-2">
          <Info size={13} className="mt-0.5 shrink-0" />
          <span>
            <b>O % do peso vem das peças da LPC</b>, classificadas pelo kg/m de cada uma — não dos estudos.
            Calibrar o estudo com o próprio estudo seria circular.
          </span>
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <p className="text-[12px] font-bold text-torg-dark mb-2">O que está fora deste número</p>
        <p className="text-[11.5px] text-torg-gray leading-relaxed">
          Cada linha abaixo é cobrada em outro lugar — somá-las aqui cobraria duas vezes:
          <b> terceiros de fabricação</b> (aba Terceiros, com o comparativo Torg × terceiro),
          <b> frete de entrega</b> e <b>inspeção de qualidade</b> (linhas próprias no estudo),
          <b> comissão</b> (% por obra), <b>montagem de campo</b> (cobrada à parte; a ociosidade dela vai no BDI),
          e <b>diretoria, administrativo, aluguel, consultoria e juros</b> (BDI).
          <b> Tinta</b> também não está aqui: é material, e sai do rendimento das camadas na aba Pintura —
          o que esta tela mede é o custo de <b>aplicar</b>.
        </p>
      </div>
    </div>
  );
}

const Centro = ({ children }) => (
  <div className="flex flex-col items-center justify-center py-24 text-center">{children}</div>
);
