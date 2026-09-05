"use client";
import { useState } from "react";
import { fluxoDeCaixa, impostosDoCenario, numeroBr } from "@/lib/lqc";
import { Inp, Kpi } from "./campos";
import { fmtKg, fmtR$ } from "../_lib/formatos";
import { TabelaFluxoMes } from "./TabelaFluxoMes";

/**
 * O DINHEIRO — quem paga o material até o cliente pagar.
 *
 * Vitor (23/08/2026): "só que você levou em consideração que vamos precisar comprar o material
 * todo dessa obra?".
 *
 * ⚠ MATERIAL NÃO É SÓ VALOR, É MOMENTO. Os R$ 20,3 milhões de aço, tinta e fixador saem do nosso
 * caixa antes de o cliente medir a primeira peça. A conta de prazo tratava isso como um custo
 * qualquer, subtraído da receita — e um custo subtraído não mostra quanto tempo o dinheiro fica
 * fora.
 *
 * ⚠ E O BDI JÁ RESERVA UMA LINHA PARA ISSO ("despesas financeiras / factoring"). Se ela for menor
 * que o juro real do período, a diferença sai do lucro sem aparecer em lugar nenhum. É esse
 * confronto que a tabela faz.
 */
export function FluxoDoDinheiro({ res, base, fabrica, cfg, mexer, c }) {
  const set = (k, v) => mexer((a) => ({ cenario: { ...(a.cenario || {}), [k]: v } }));
  const meses = numeroBr(cfg.mesesFabricacao) || Math.max(1, Math.round((res.pesoTotal / fabrica.capacidadeKgMes) * 10) / 10);
  const projeto = cfg.mesesProjeto == null || cfg.mesesProjeto === "" ? 1 : Math.max(0, Math.round(numeroBr(cfg.mesesProjeto)));
  // ⚠ QUANTO DA FÁBRICA ESTA OBRA OCUPA. Vitor (23/08/2026): "nos meses que de fato eu começo a
  // produção, o ideal não seria trazer os custos da operação integral nesse caso?". Depende de a
  // fábrica ser dedicada: se o contrato dá 4 meses e a obra come 2,4, a diferença é fábrica livre
  // para outra obra — ou ociosidade que esta obra vai pagar sozinha.
  const mesesConsumo = fabrica.capacidadeKgMes > 0 ? Math.round((res.pesoTotal / fabrica.capacidadeKgMes) * 10) / 10 : meses;
  const ocupacao = cfg.ocupacaoPct == null || cfg.ocupacaoPct === ""
    ? (meses > 0 ? Math.min(1, mesesConsumo / meses) : 1)
    : Math.max(0, numeroBr(cfg.ocupacaoPct) / 100);
  const reserva = (base?.preco || 0) * ((numeroBr(base?.alavancas?.factoring) || 0) / 100);
  const receita = Array.isArray(cfg.receitaPorMes) ? cfg.receitaPorMes : [];
  // ⚠ "28/42/56" é como o comprador fala e como vem no pedido — o campo aceita assim e a conta
  // faz o resto. Pedir três campos numerados seria transcrever o que ele já sabe de cor.
  const parcelasFornecedor = String(cfg.parcelasFornecedor ?? "28/42/56").split(/[^\d]+/).map(Number).filter((d) => d >= 0 && Number.isFinite(d));
  const semMedicao = Array.isArray(cfg.mesesSemMedicao) ? cfg.mesesSemMedicao.map(Number) : [];
  const kgPorMes = Array.isArray(cfg.kgPorMes) ? cfg.kgPorMes : [];
  const kgMedidoPorMes = Array.isArray(cfg.kgMedidoPorMes) ? cfg.kgMedidoPorMes : [];
  // ⚠ A RECEITA É RESULTADO, NÃO CAMPO. Vitor (23/08/2026): "você não puxou o valor unitário para
  // dentro do cenário financeiro, você me fez preencher à mão o valor — quero colocar o peso e
  // você já transformar na receita". A conta existia, mas a coluna era uma caixa vazia com o valor
  // em cinza de sugestão: quem olha entende que ainda tem trabalho a fazer, e digita o que o
  // portal já sabia. Agora o número aparece pronto; ajustar é a exceção, e é preciso clicar.
  const [ajustando, setAjustando] = useState(null);
  const f = fluxoDeCaixa({
    meses, mesesProjeto: projeto,
    mesInicioFabricacao: numeroBr(cfg.mesInicioFabricacao),
    custoProjetoMes: numeroBr(cfg.custoProjetoMes),
    preco: base?.preco || 0, pesoKg: res.pesoTotal,
    // ⚠ IMPOSTO CALCULADO, NÃO A ALAVANCA DO BDI. Vitor (23/08/2026): "os impostos não estão sendo
    // calculados". Estavam — na cascata. Aqui o fluxo usava o campo `impostos` do BDI, que é uma
    // RESERVA de projeto: se estiver em branco o caixa rodava sem imposto nenhum, e o pior mês
    // saía otimista justamente na obra em que o imposto pesa mais.
    impostos: impostosDoCenario(res, (base?.preco || 0) - (res.custoDireto || 0)).total,
    material: res.totais?.material?.subtotal || 0,
    terceiros: res.totais?.mdo?.subtotal || 0,
    custoOperacionalMes: fabrica.custoOperacionalMes * ocupacao,
    reservaFinanceira: reserva,
  }, {
    pagamento: c.pagamento || {},
    prazoFornecedorDias: cfg.prazoFornecedorDias ?? 30,
    taxaMensalPct: cfg.taxaMensalPct ?? 1.5,
    mesesCompraMaterial: cfg.mesesCompraMaterial,
    compraMesesAntes: cfg.compraMesesAntes == null || cfg.compraMesesAntes === "" ? 1 : numeroBr(cfg.compraMesesAntes),
    parcelasFornecedor,
    mesesSemMedicao: semMedicao,
    kgPorMes: kgPorMes.map((v) => numeroBr(v)),
    kgMedidoPorMes: kgMedidoPorMes.map((v) => numeroBr(v)),
    receitaPorMes: receita.map((v) => numeroBr(v)),
  });
  const setKg = (m, v) => {
    const novo = Array.from({ length: tamanho }, (_, i) => kgPorMes[i] ?? "");
    novo[m] = v;
    mexer((atual) => ({ cenario: { ...(atual.cenario || {}), kgPorMes: novo } }));
  };
  // ⚠ o que se PRODUZ e o que se MEDE são duas coisas. Vitor (23/08/2026): "nos meses que eu marcar
  // como não mede, você deve deixar esse valor em aberto e eu posso distribuir isso em um mês ou em
  // alguns meses". Digitar aqui ganha da caixinha — e nunca se mede mais do que está em aberto.
  const setKgMedido = (m, v) => {
    const novo = Array.from({ length: tamanho }, (_, i) => kgMedidoPorMes[i] ?? "");
    novo[m] = v;
    mexer((atual) => ({ cenario: { ...(atual.cenario || {}), kgMedidoPorMes: novo } }));
  };
  // ⚠ marcar/desmarcar é por mês DA FABRICAÇÃO (1, 2, 3...), não por mês do contrato — é assim
  // que a obra é falada no chão: "no primeiro mês de fabricação não tem medição".
  const alternaMedicao = (mesFab) => {
    const tem = semMedicao.includes(mesFab);
    mexer((atual) => ({ cenario: { ...(atual.cenario || {}), mesesSemMedicao: tem ? semMedicao.filter((x) => x !== mesFab) : [...semMedicao, mesFab].sort((x, y) => x - y) } }));
  };
  // ⚠ A TABELA TERMINA COM A OBRA. Vitor (23/08/2026): "hoje estamos repetindo até 57 meses,
  // deixar a projeção apenas até o mês que finaliza a obra, não ficar repetido".
  //
  // ⚠⚠ E O MOTIVO ERA UM LAÇO MEU: o tamanho da tabela vinha de `Math.max(prazo, receita.length)`,
  // e cada tecla digitada gravava um array UM maior — que na volta esticava a tabela, que esticava
  // o array. Vinte edições, vinte meses a mais. O tamanho agora sai só do fluxo, que já sabe onde
  // a obra acaba: último mês com movimento, e nada depois.
  const ultimoMes = f.fluxo.reduce((a, x) => (x.entrada || x.saida ? x.mes : a), 0);
  const linhas = f.fluxo.slice(0, ultimoMes + 1);
  const tamanho = f.fluxo.length;
  const setReceita = (m, v) => {
    const novo = Array.from({ length: tamanho }, (_, i) => receita[i] ?? "");
    novo[m] = v;
    mexer((atual) => ({ cenario: { ...(atual.cenario || {}), receitaPorMes: novo } }));
  };

  return (
    <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100">
        <p className="text-[12px] font-bold text-torg-dark">O dinheiro: comprar o material antes de receber</p>
        <p className="text-[11px] text-torg-gray mt-0.5">
          São <strong className="text-torg-dark">{fmtR$(res.totais?.material?.subtotal)}</strong> de aço, tinta e
          fixador que saem do nosso caixa antes de o cliente medir a primeira peça.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-3">
          {[["mesesProjeto", "Projeto (meses)", "1"],
            ["custoProjetoMes", "Custo do projeto (R$/mês)", "0"],
            // ⚠ o início da fabricação é campo PRÓPRIO, e pode cair dentro do projeto: a engenharia
            // libera um pacote e a fábrica já corta enquanto o resto é detalhado.
            ["mesInicioFabricacao", "Fabricação começa no mês", String(projeto + 1)],
            ["mesesFabricacao", "Fabricação (meses)", String(meses)],
            ["compraMesesAntes", "Compra começa (meses antes)", "1"],
            ["mesesCompraMaterial", "Compra dura (meses)", ""],
            ["parcelasFornecedor", "Pagamento do material (dias)", "28/42/56"],
            ["taxaMensalPct", "Custo do dinheiro (% a.m.)", "1,5"]].map(([k, r, ph]) => (
            <label key={k} className="text-[11px] text-torg-dark">{r}
              <Inp value={cfg[k] ?? ""} placeholder={ph} onChange={(e) => set(k, e.target.value)} className="block mt-1 w-full text-right" /></label>
          ))}
        </div>
        {/* ⚠ OBRA NÃO COMEÇA PRODUZINDO. Vitor (23/08/2026): "no primeiro mês vamos fazer projeto
            apenas, no segundo é que vamos começar a produzir, e daí é que começa nosso prazo de
            fabricação". Um mês de erro no início desloca o pior mês inteiro do caixa. */}
        <div className="mt-3 pt-3 border-t border-gray-100">
          <p className="text-[11px] font-semibold text-torg-dark">Quanto da fábrica esta obra ocupa</p>
          <div className="flex flex-wrap gap-2 mt-2 items-stretch">
            {/* ⚠⚠ RATEADA É O PADRÃO, E TEM DE SER. Vitor (05/09/2026): "nessa parte sempre prever
                como rateada". Cobrar a casa inteira de uma obra que ocupa metade da fábrica infla
                o preço e perde a concorrência; e a folga não é prejuízo desta obra — é fábrica que
                o Comercial tem para vender. Dedicada só quando o contrato realmente reserva a
                fábrica (turno exclusivo, obra que trava a linha).
                ⚠ E o rateio é POR CONSUMO REAL, não por peso puro: `mesesConsumo` já usa a cadência
                do MIX da obra, então guarda-corpo, que come mais fábrica por quilo, carrega mais
                casa que estrutura pesada do mesmo peso. */}
            {[{ v: "", r: "Rateada", pad: true, a: `${Math.round(Math.min(1, meses > 0 ? mesesConsumo / meses : 1) * 100)}% — os meses de fábrica que a obra consome` },
              { v: "100", r: "Fábrica dedicada", a: "só quando o contrato reserva a linha" }].map((o) => (
              <button key={o.r} type="button" onClick={() => set("ocupacaoPct", o.v)}
                className={`text-left border rounded-lg px-3 py-2 transition ${(cfg.ocupacaoPct ?? "") === o.v ? "border-torg-blue bg-torg-blue-50/50" : "border-gray-200 hover:border-gray-300"}`}>
                <span className="block text-[11px] font-semibold text-torg-dark whitespace-nowrap">
                  {o.r}{o.pad ? <span className="ml-1 text-[9px] uppercase tracking-wider text-torg-orange-700">padrão</span> : null}
                </span>
                <span className="block text-[10px] text-torg-gray">{o.a}</span>
              </button>
            ))}
            <label className="text-[11px] text-torg-dark border border-gray-200 rounded-lg px-3 py-2">
              <span className="block font-semibold">Outra</span>
              <Inp value={cfg.ocupacaoPct ?? ""} placeholder={String(Math.round(ocupacao * 100))}
                onChange={(e) => set("ocupacaoPct", e.target.value)} className="block mt-0.5 w-16 text-right" />
              <span className="block text-[10px] text-torg-gray mt-0.5">% da fábrica</span>
            </label>
          </div>
          <p className="text-[11px] text-torg-gray mt-2">
            A obra come <strong className="text-torg-dark">{mesesConsumo} meses</strong> de fábrica e o contrato dá{" "}
            <strong className="text-torg-dark">{meses}</strong>.
            {meses - mesesConsumo > 0.05
              ? <> Sobram {Math.round((meses - mesesConsumo) * 10) / 10} meses de fábrica no prazo: <strong className="text-torg-dark">rateada</strong>,
                  essa folga fica livre para outra obra e esta paga só o que consome; <strong className="text-torg-dark">dedicada</strong>, esta obra
                  banca a ociosidade sozinha — {fmtR$(fabrica.custoOperacionalMes * (meses - mesesConsumo))} a mais no custo.</>
              : <> A obra enche o prazo, então rateada e dedicada dão no mesmo.</>}
          </p>
          {/* ⚠ O RATEIO SÓ SE JULGA EM R$/kg. Em reais totais ninguém sabe se está caro; ao lado do
              que a tabela de industrialização cobra, a pergunta vira simples: esta obra paga a
              fábrica que usa? */}
          {res.pesoTotal > 0 && fabrica?.custoOperacionalMes > 0 && (() => {
            const casaObra = meses * fabrica.custoOperacionalMes * ocupacao;
            const casaPorKg = casaObra / res.pesoTotal;
            const cobraPorKg = res.pesoTotal > 0 ? (res.totais?.industrializacao?.subtotal || 0) / res.pesoTotal : 0;
            const dif = cobraPorKg - casaPorKg;
            return (
              <p className={`text-[11px] mt-2 rounded-lg px-3 py-2 border ${dif >= 0 ? "text-torg-dark bg-green-50 border-green-200" : "text-torg-dark bg-[#FFF7ED] border-[#F4801F]/30"}`}>
                Rateio desta obra: <strong>{fmtR$(casaObra)}</strong> de casa, ou <strong>{fmtR$(casaPorKg)}/kg</strong>.
                A tabela de industrialização cobra <strong>{fmtR$(cobraPorKg)}/kg</strong> —{" "}
                {dif >= 0
                  ? <>sobra {fmtR$(dif)}/kg para o resultado.</>
                  : <>faltam {fmtR$(Math.abs(dif))}/kg, que hoje saem do BDI sem aparecer.</>}
              </p>
            );
          })()}
        </div>

        <p className="text-[11px] text-torg-gray mt-2">
          O aço é comprado a partir do <strong className="text-torg-dark">mês {f.compra.inicio}</strong> — antes de a
          fábrica cortar — em {f.compra.meses} {f.compra.meses === 1 ? "mês" : "meses"}, e cada compra é paga em{" "}
          {f.compra.parcelas.map((x) => `${x.dias} dias`).join(" · ")}
          {" "}(no fluxo mensal isso cai {f.compra.parcelas.map((x) => `+${x.mes}`).join(" · ")} {f.compra.parcelas.length > 1 ? "meses" : "mês"} depois de cada compra).
        </p>
        <p className="text-[11px] text-torg-dark mt-2">
          Contrato de <strong>{f.meses} meses</strong>: {f.mesesProjeto > 0 ? <>{f.mesesProjeto} de projeto, a fábrica corta a partir do <strong>mês {f.mesInicioFabricacao}</strong> e </> : null}
          entrega no <strong>mês {f.mesEntrega}</strong>. A medição acompanha a produção, então ela começa no mês {f.mesInicioFabricacao} — não na assinatura.
          {f.mesesSobrepostos > 0 && (
            <span className="block mt-1">
              ⚠ {f.mesesSobrepostos} {f.mesesSobrepostos === 1 ? "mês roda" : "meses rodam"} com projeto e fabricação ao
              mesmo tempo — {f.mesesSobrepostos === 1 ? "esse mês carrega" : "esses meses carregam"} os dois custos, que é o
              certo: a engenharia ainda detalha enquanto a fábrica já corta o pacote liberado.
            </span>
          )}
        </p>
        <p className="text-[10px] text-torg-gray mt-1.5">
          O recebimento vem da aba <strong className="text-torg-dark">Forma de pagamento</strong>:{" "}
          {(f.pagamento?.parcelas || []).map((p) => `${p.pct}% ${String(p.nome).toLowerCase()}`).join(" · ")}.
          {f.mesesAjustados?.length ? <> {f.mesesAjustados.length} {f.mesesAjustados.length === 1 ? "mês foi ajustado" : "meses foram ajustados"} à mão (mês {f.mesesAjustados.join(", ")}).</> : null}
        </p>
        {f.receitaForaDoPrazo > 1 && (
          <p className="text-[11px] text-torg-dark bg-[#FFF7ED] border border-[#F4801F]/30 rounded-lg px-3 py-2 mt-2">
            Há <strong>{fmtR$(f.receitaForaDoPrazo)}</strong> digitados em meses que não existem mais no prazo da obra —
            provavelmente sobra de um prazo maior. Esse valor saiu da conta.
          </p>
        )}
        {Math.abs(f.diferencaFaturamento) > 1 && (
          <p className="text-[11px] text-torg-dark bg-[#FFF7ED] border border-[#F4801F]/30 rounded-lg px-3 py-2 mt-2">
            O faturamento do cronograma soma <strong>{fmtR$(f.faturado)}</strong> e o preço da proposta é <strong>{fmtR$(base?.preco || 0)}</strong> —
            {f.diferencaFaturamento > 0 ? " sobrando " : " faltando "}
            <strong className={f.diferencaFaturamento > 0 ? "text-green-700" : "text-red-600"}>{fmtR$(Math.abs(f.diferencaFaturamento))}</strong>.
            Enquanto não fechar, o fluxo está medindo outro contrato.
          </p>
        )}
      </div>

      {/* ⚠ MEDIÇÃO É O QUE SE PRODUZIU, NÃO FATIA IGUAL DO CONTRATO. Vitor (23/08/2026): "pegue o
          valor que falta faturar e divida por kg — esse é o preço por kg fabricado, e aí nos meses
          que marco que tem medição já teríamos o valor por mês". Entrada, projeto, entrega e
          retenção saem por cima; o que sobra passa pela balança. */}
      {f.medicao?.saldoAFaturar > 0 && (
        <div className="px-4 py-3 border-t border-gray-100 bg-gray-50">
          <p className="text-[11px] text-torg-dark">
            Fora da medição (entrada, projeto, entrega e retenção): <strong>{fmtR$(f.medicao.foraDaMedicao)}</strong>.
            Sobram <strong>{fmtR$(f.medicao.saldoAFaturar)}</strong> para faturar por medição —
            {" "}÷ <strong>{fmtKg(f.medicao.pesoKg)}</strong> dá{" "}
            <strong className="text-torg-dark">{fmtR$(f.medicao.precoPorKg)}/kg fabricado</strong>.
          </p>
          <p className="text-[11px] text-torg-gray mt-1">
            {f.medicao.porKgDigitado
              ? <>Cada mês fatura o <strong className="text-torg-dark">kg que produziu</strong> × esse preço. O que fica pronto
                 em mês sem medição não se perde: acumula e entra na medição seguinte.</>
              : <>Preencha o <strong className="text-torg-dark">kg produzido</strong> mês a mês na tabela abaixo para o
                 faturamento seguir a produção. Sem isso, a medição é dividida por partes iguais.</>}
          </p>
          {/* ⚠ O CRONOGRAMA DE PRODUÇÃO NÃO ACOMPANHA O ESCOPO. Vitor (23/08/2026): "você está
              considerando o valor de faturamento de 37 milhões". Desmarcada uma área, o preço e o
              peso caem — mas o kg digitado mês a mês continua o do levantamento inteiro, e a
              receita (kg × saldo ÷ peso) estoura duas vezes. A conta agora trava no peso da obra,
              e o botão aqui do lado reajusta o cronograma na proporção. */}
          {f.medicao.porKgDigitado && Math.abs(f.medicao.kgFaltando) > 1 && (
            <div className="text-[11px] text-torg-dark bg-[#FFF7ED] border border-[#F4801F]/30 rounded-lg px-3 py-2 mt-2 flex flex-wrap items-center gap-3">
              <span className="flex-1 min-w-[260px]">
                O cronograma de produção soma <strong>{fmtKg(f.medicao.kgInformado)}</strong> e a obra tem <strong>{fmtKg(f.medicao.pesoKg)}</strong> —
                {f.medicao.kgFaltando > 0
                  ? <> faltam <strong className="text-red-600">{fmtKg(f.medicao.kgFaltando)}</strong> sem mês para produzir, e esse pedaço não vai ser faturado por medição.</>
                  : <> sobram <strong className="text-red-600">{fmtKg(Math.abs(f.medicao.kgFaltando))}</strong>. Provavelmente o escopo encolheu depois que o cronograma foi preenchido.</>}
                {f.medicao.kgExcedente > 1 && (
                  <span className="block mt-0.5">
                    <strong className="text-red-600">{fmtKg(f.medicao.kgExcedente)}</strong> ficaram de fora do faturamento: a medição não fatura quilo que a obra não tem.
                  </span>
                )}
              </span>
              <button type="button" onClick={() => {
                const soma = f.medicao.kgInformado;
                if (!(soma > 0)) return;
                const fator = f.medicao.pesoKg / soma;
                mexer((atual) => ({ cenario: { ...(atual.cenario || {}), kgPorMes: Array.from({ length: tamanho }, (_, i) => (numeroBr(kgPorMes[i]) > 0 ? String(Math.round(numeroBr(kgPorMes[i]) * fator)) : "")) } }));
              }}
                className="text-[11px] rounded-lg px-3 py-1.5 border border-torg-blue text-torg-blue hover:bg-torg-blue-50 whitespace-nowrap">
                Ajustar ao peso da obra
              </button>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-gray-100">
        <Kpi r={`Capital de giro — pior mês (${f.mesDoPico})`} v={fmtR$(f.capitalDeGiro)} cor="text-torg-orange-700" />
        <Kpi r="Custo financeiro do período" v={fmtR$(f.custoFinanceiro)} />
        <Kpi r="Reservado no BDI" v={fmtR$(f.reservadoNoBdi)} />
        <Kpi r={f.diferenca >= 0 ? "Sobra da reserva" : "Falta na reserva"} v={fmtR$(Math.abs(f.diferenca))}
          cor={f.diferenca >= 0 ? "text-green-700" : "text-red-600"} />
      </div>

      {f.diferenca < 0 && (
        <p className="text-[11px] text-torg-dark bg-[#FFF7ED] border-t border-[#F4801F]/30 px-4 py-2.5">
          A linha de despesas financeiras do BDI reservou <strong>{fmtR$(f.reservadoNoBdi)}</strong> e o dinheiro
          parado custa <strong>{fmtR$(f.custoFinanceiro)}</strong> em {meses} meses.
          A diferença de <strong className="text-red-600">{fmtR$(Math.abs(f.diferenca))}</strong> sai do lucro
          sem aparecer na composição — subir o factoring no BDI é o que traz esse custo para o preço.
        </p>
      )}

      {/* ⚠ A RECEITA É DIGITÁVEL AQUI, mês a mês. Vitor (23/08/2026): "mais as receitas nos meses
          para que aí sim você calcule o cenário financeiro real". Quando o cronograma de medição
          já foi negociado, distribuir por regra é palpite ao lado do que está no contrato. */}
      <TabelaFluxoMes
        ajustando={ajustando}
        alternaMedicao={alternaMedicao}
        f={f}
        kgMedidoPorMes={kgMedidoPorMes}
        kgPorMes={kgPorMes}
        linhas={linhas}
        receita={receita}
        semMedicao={semMedicao}
        setAjustando={setAjustando}
        setKg={setKg}
        setKgMedido={setKgMedido}
        setReceita={setReceita}
      />
      {f.totais && (
        <p className="text-[11px] text-torg-dark px-4 py-2 border-t border-gray-100 bg-gray-50">
          Somando o fluxo: material <strong>{fmtR$(f.totais.material)}</strong> · fábrica e projeto{" "}
          <strong>{fmtR$(f.totais.fabrica + f.totais.projeto)}</strong> · impostos <strong>{fmtR$(f.totais.impostos)}</strong>.
          {Math.abs(f.totais.material - (res.totais?.material?.subtotal || 0)) > 1 && (
            <span className="block text-torg-gray mt-0.5">
              A composição tem {fmtR$(res.totais?.material?.subtotal)} de material — a diferença é o que a janela de
              compra ainda não alcançou.
            </span>
          )}
        </p>
      )}
      <p className="text-[10px] text-torg-gray px-4 py-2 border-t border-gray-100">
        Preencha só o <strong className="text-torg-dark">kg produzido</strong>: o recebimento sai dele, pelo preço por
        quilo do quadro acima. Desmarque os meses de fabricação que <strong className="text-torg-dark">não medem</strong> —
        no primeiro mês normalmente ainda não há peça pronta, e o que ficou feito acumula para a medição seguinte.
        O que ficou pronto e não foi medido aparece em <strong className="text-torg-dark">Em aberto</strong>: digite
        em <strong className="text-torg-dark">kg medido</strong> quanto entra na medição de cada mês para repartir esse
        saldo como o cliente aprova — num mês só ou em vários. O que sobrar no fim fecha na entrega.
        Se um mês tiver valor combinado diferente, clique no recebimento para ajustar à mão; ele fica marcado como
        ajustado e passa a mandar na frente da conta.
      </p>
    </div>
  );
}
