"use client";
import { APRESENTACAO_FRETE, FATURAMENTO, FATURAMENTO_ROTULO, MODOS_FRETE, numeroBr } from "@/lib/lqc";
import { CargasPorClasse } from "./CargasPorClasse";
import { Campo, Inp, Kpi, Sel } from "./campos";
import { fmtKg, fmtR$ } from "../_lib/formatos";

/**
 * FRETE — aba própria, com o seletor de apresentação.
 *
 * Vitor (23/08/2026): "frete precisa ter uma aba dedicada para ele, e um seletor para apresentar
 * ele separado do preço por kg ou diluído no preço unitário, pois isso cada cliente pede essa
 * informação".
 *
 * ⚠ A APRESENTAÇÃO NÃO MUDA O CUSTO — MUDA O QUE O CLIENTE VÊ, e isso vale dinheiro. Diluído, o
 * R$/kg da estrutura fica mais alto e o frete não vira alvo de corte; separado, o cliente compara
 * o nosso frete com o transportador dele — e às vezes leva o frete por conta. A proposta tem de
 * sair dos dois jeitos sem refazer conta nenhuma.
 */
export function Frete({ c, res, setComp }) {
  const f = c.frete || {};
  const set = (k, v) => setComp({ frete: { ...f, [k]: v } });
  const r = res.frete || {};
  const modo = r.modo || "kg";

  return (
    <div className="space-y-4">
      <div className="bg-white border border-gray-100 rounded-xl p-5">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Campo r="Origem"><Inp value={f.origem ?? ""} onChange={(e) => set("origem", e.target.value)} className="w-full" /></Campo>
          <Campo r="Destino" ajuda="cidade / UF da obra">
            <Inp value={f.destino ?? ""} onChange={(e) => set("destino", e.target.value)} className="w-full" /></Campo>
          <Campo r="Cobrança">
            <Sel value={modo} onChange={(e) => set("modo", e.target.value)} opcoes={MODOS_FRETE.map((x) => x.key)}
              rotulos={Object.fromEntries(MODOS_FRETE.map((x) => [x.key, x.nome]))} className="w-full" /></Campo>
          <Campo r="Faturamento" ajuda="direto = o cliente contrata o transporte">
            <Sel value={f.faturamento || "TORG"} onChange={(e) => set("faturamento", e.target.value)}
              opcoes={FATURAMENTO} rotulos={FATURAMENTO_ROTULO} className="w-full" /></Campo>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3 pt-3 border-t border-gray-100">
          {modo === "kg" && (
            <Campo r="Preço por kg (R$)"><Inp value={f.precoKg ?? ""} onChange={(e) => set("precoKg", e.target.value)} className="w-full text-right" /></Campo>
          )}
          {modo === "viagem" && (<>
            <Campo r="Preço por viagem (R$)"><Inp value={f.precoViagem ?? ""} onChange={(e) => set("precoViagem", e.target.value)} className="w-full text-right" /></Campo>
            <Campo r="Capacidade da carreta (kg)" ajuda="vazio usa 27.000">
              <Inp value={f.capacidadeKg ?? ""} placeholder="27000" onChange={(e) => set("capacidadeKg", e.target.value)} className="w-full text-right" /></Campo>
            <Campo r="Viagens" ajuda="vazio usa as cargas por classe">
              <Inp value={f.viagens ?? ""} placeholder={String(r.viagens || 0)} onChange={(e) => set("viagens", e.target.value)} className="w-full text-right" /></Campo>
          </>)}
          {modo === "verba" && (
            <Campo r="Valor fechado (R$)"><Inp value={f.verba ?? ""} onChange={(e) => set("verba", e.target.value)} className="w-full text-right" /></Campo>
          )}
        </div>

        {/* ⚠ DE ONDE VEIO O NÚMERO DO FRETE — E ISSO NÃO É BUROCRACIA. Vitor (23/08/2026): "no frete
            precisamos um campo para colocarmos o valor orçado para ficar registrado, e informar o
            nome da transportadora ou se foi apenas na tabela de fretes".
            Seis meses depois, olhando uma proposta perdida, a pergunta é sempre a mesma: esse frete
            era cotação de verdade ou chute de tabela? Sem o registro, ninguém sabe — e o comercial
            defende na reunião um número que não tem dono. Com o registro, dá para cobrar a
            transportadora do que ela prometeu, e dá para saber se a tabela está velha. */}
        <div className="mt-3 pt-3 border-t border-gray-100">
          <p className="text-[11px] font-semibold text-torg-dark">De onde veio este valor</p>
          <div className="flex flex-wrap gap-2 mt-2">
            {[{ k: "COTACAO", r: "Cotado com transportadora", a: "tem nome e valor de quem cotou" },
              { k: "TABELA", r: "Tabela de fretes", a: "referência interna, sem cotação" }].map((o) => (
              <button key={o.k} type="button" onClick={() => set("fonte", o.k)}
                className={`text-left border rounded-lg px-3 py-2 transition ${(f.fonte || "TABELA") === o.k ? "border-torg-blue bg-torg-blue-50/50" : "border-gray-200 hover:border-gray-300"}`}>
                <span className="block text-[11px] font-semibold text-torg-dark whitespace-nowrap">{o.r}</span>
                <span className="block text-[10px] text-torg-gray">{o.a}</span>
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-3">
            {f.fonte === "COTACAO" && (<>
              <Campo r="Transportadora"><Inp value={f.transportadora ?? ""} onChange={(e) => set("transportadora", e.target.value)} className="w-full" /></Campo>
              <Campo r="Data da cotação"><Inp type="date" value={f.dataOrcamento ?? ""} onChange={(e) => set("dataOrcamento", e.target.value)} className="w-full" /></Campo>
            </>)}
            {/* ⚠ o ORÇADO fica guardado como veio, mesmo quando a composição usa outro número —
                é o que permite, depois, saber se a obra andou por cima ou por baixo da cotação. */}
            <Campo r="Valor orçado (R$)" ajuda="como veio da cotação, mesmo que a composição use outro">
              <Inp value={f.orcado ?? ""} onChange={(e) => set("orcado", e.target.value)} className="w-full text-right" /></Campo>
          </div>
          {numeroBr(f.orcado) > 0 && r.total > 0 && (() => {
            const dif = r.total - numeroBr(f.orcado);
            const pct = (dif / numeroBr(f.orcado)) * 100;
            return (
              <p className={`text-[11px] rounded-lg px-3 py-2 mt-3 ${Math.abs(pct) < 0.5 ? "text-torg-gray bg-gray-50 border border-gray-100" : "text-torg-dark bg-[#FFF7ED] border border-[#F4801F]/30"}`}>
                Orçado <strong>{fmtR$(numeroBr(f.orcado))}</strong>
                {f.fonte === "COTACAO" && f.transportadora ? <> com <strong>{f.transportadora}</strong></> : f.fonte === "COTACAO" ? " (transportadora não informada)" : " pela tabela de fretes"}.
                A composição está usando <strong>{fmtR$(r.total)}</strong>
                {Math.abs(pct) < 0.5 ? " — igual." : <>, {dif > 0 ? "acima" : "abaixo"} em <strong className={dif > 0 ? "text-red-600" : "text-green-700"}>{fmtR$(Math.abs(dif))}</strong> ({Math.abs(pct).toFixed(1)}%).</>}
              </p>
            );
          })()}
          {(f.fonte || "TABELA") === "TABELA" && (
            <p className="text-[11px] text-torg-gray mt-2">
              Sem cotação, o frete entra como estimativa. Vale cotar antes de fechar preço em obra
              longe: é a linha da composição que mais se move entre o estudo e a entrega.
            </p>
          )}
        </div>

        {/* ⚠ DESMARCAR É EXCLUIR. Vitor (23/08/2026): "quando eu desmarcar uma área do quantitativo
            é como se eu tivesse excluído ela do escopo, só não estou fazendo isso para garantir o
            histórico". Então valor digitado vale para o levantamento inteiro e encolhe junto —
            frete é fisicamente proporcional ao que embarca. Quem já cotou para o escopo reduzido
            trava aqui. */}
        {(modo === "verba" || (modo === "viagem" && f.viagens)) && (
          <label className="flex items-start gap-2.5 mt-3 pt-3 border-t border-gray-100 cursor-pointer">
            <input type="checkbox" checked={!!f.escopoFixo} onChange={(e) => set("escopoFixo", e.target.checked)}
              className="mt-0.5 rounded border-gray-300 text-torg-blue focus:ring-torg-blue" />
            <span className="min-w-0">
              <span className="block text-[12px] font-semibold text-torg-dark">Travar o valor — já cotado para este escopo</span>
              <span className="block text-[11px] text-torg-gray">
                Sem travar, o valor digitado vale para o levantamento inteiro e encolhe na proporção
                do peso quando você desmarca uma área.
              </span>
            </span>
          </label>
        )}

        {r.fracaoEscopo < 0.999 && !r.escopoFixo && r.valorCheio > 0 && (
          <p className="text-[11px] text-torg-dark bg-torg-blue-50 border border-torg-blue/20 rounded-lg px-3 py-2 mt-3">
            Lançado <strong>{fmtR$(r.valorCheio)}</strong> para o levantamento inteiro. No escopo de{" "}
            <strong>{fmtKg(res.pesoTotal)}</strong> ({(r.fracaoEscopo * 100).toFixed(0)}% do peso),
            equivale a <strong>{fmtR$(r.total)}</strong>.
          </p>
        )}
        {r.escopoFixo && r.fracaoEscopo < 0.999 && (
          <p className="text-[11px] text-torg-orange-700 bg-[#FFF7ED] border border-[#F4801F]/30 rounded-lg px-3 py-2 mt-3">
            Travado: o valor não encolheu com o corte de escopo. Confira se a cotação é mesmo deste escopo.
          </p>
        )}
      </div>

      <CargasPorClasse c={c} res={res} setComp={setComp} />

      {/* ⚠ DESLIGADA POR ORA. Vitor (23/08/2026): "vamos deixar o cálculo da QualP por hora, vamos
          retirar a opção da tela do frete por hora". A consulta depende de assinatura paga
          (R$ 390 a R$ 702/mês), e botão que não funciona é pior que botão que não existe — quem
          abre a tela tenta, não vai, e passa a duvidar do resto.
          O código está pronto e intacto: <ConsultaQualp /> logo abaixo, lib/qualp.js e a rota
          /api/comercial/frete/qualp. Contratado o plano, é descomentar esta linha e pôr a chave
          em QUALP_TOKEN. */}
      {/* <ConsultaQualp c={c} res={res} setComp={setComp} /> */}

      <div className="bg-white border border-gray-100 rounded-xl p-5">
        <p className="text-[12px] font-bold text-torg-dark mb-1">Como o frete aparece na proposta</p>
        <p className="text-[11px] text-torg-gray mb-3">Não muda o custo — muda o que o cliente vê, e o que ele consegue cortar.</p>
        <div className="grid sm:grid-cols-2 gap-2">
          {APRESENTACAO_FRETE.map((a) => (
            <label key={a.key} className={`flex items-start gap-2.5 border rounded-lg px-3 py-2.5 cursor-pointer ${r.apresentacao === a.key ? "border-torg-blue bg-torg-blue-50" : "border-gray-200"}`}>
              <input type="radio" name="apres" checked={r.apresentacao === a.key} onChange={() => set("apresentacao", a.key)} className="mt-0.5" />
              <span className="min-w-0">
                <span className="block text-[13px] font-semibold text-torg-dark">{a.nome}</span>
                <span className="block text-[11px] text-torg-gray">{a.ajuda}</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-gray-100 border border-gray-100 rounded-xl overflow-hidden">
        <Kpi r="Peso do escopo" v={fmtKg(res.pesoTotal)} />
        {modo === "viagem" && <Kpi r="Viagens" v={`${r.viagens || 0} × ${fmtKg(r.capacidadeKg)}`} />}
        <Kpi r="Frete total" v={fmtR$(r.total)} />
        <Kpi r="Equivale a" v={`${fmtR$(r.porKg)}/kg`} />
        <Kpi r="Na proposta" v={r.apresentacao === "separado" ? "Item separado" : "No R$/kg"} cor="text-torg-blue" />
      </div>

      {r.total > 0 && (
        <p className="text-[12px] text-torg-gray bg-white border border-gray-100 rounded-xl px-4 py-3">
          {r.apresentacao === "diluido"
            ? <>O R$/kg de cada área carrega <strong className="text-torg-dark">{fmtR$(r.porKg)}</strong> de frete.
               O cliente não vê o transporte na proposta — e também não tem como cortá-lo.</>
            : <>O frete sai como item próprio de <strong className="text-torg-dark">{fmtR$(r.total)}</strong>, e o
               R$/kg das áreas fica <strong className="text-torg-dark">{fmtR$(r.porKg)}</strong> mais baixo.
               O cliente consegue comparar com o transportador dele.</>}
        </p>
      )}
    </div>
  );
}
