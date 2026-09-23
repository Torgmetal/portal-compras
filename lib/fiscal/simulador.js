import { CFOPS, OPERACOES, AMBITO } from "@/lib/fiscal/cfop";
import { CST_IPI } from "@/lib/fiscal/auditoria";

// ─── O SIMULADOR ─────────────────────────────────────────────────────────────
//
// Responde "como sai esta operação?" ANTES de a nota existir. É a metade preventiva da auditoria —
// e é o ponto do módulo inteiro: Matheus (22/09/2026), sobre a NF-e 973, *"o operador não sabia que
// o NCM precisava destacar IPI, por isso estamos criando essa tela, para ajudar ele"*.
//
// ⚠⚠ A REGRA DE IPI É A MESMA DA AUDITORIA, LITERALMENTE O MESMO `CST_IPI`. Se o simulador usasse
// uma cópia, ele abençoaria hoje o que a auditoria condena amanhã — e a pessoa que seguiu a
// orientação da tela levaria o apontamento. Uma regra, dois momentos.
//
// ⚠⚠ E ELE SE CALA ONDE NÃO SABE. O briefing é explícito: *"não aplicar automaticamente 12% de ICMS
// a toda venda interestadual"* e *"não aplicar PIS 1,65% e COFINS 7,6% a todas as operações"*.
// ICMS, PIS e COFINS dependem de regime, benefício, redução de base e destinatário — coisas que o
// portal não tem de fonte estruturada. Então eles saem como NÃO DETERMINADO, com o motivo. Um
// número plausível aqui seria pior que um campo vazio: o vazio manda perguntar; o plausível é
// copiado para a nota.

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const soDigitos = (v) => String(v ?? "").replace(/\D/g, "");

/** ⚠ O âmbito NÃO é escolhido pelo usuário: ele CAI das duas UFs. Deixar escolher é deixar errar. */
export const ambitoDe = (ufOrigem, ufDestino) => {
  const a = String(ufOrigem ?? "").trim().toUpperCase();
  const b = String(ufDestino ?? "").trim().toUpperCase();
  if (!a || !b) return null;
  return a === b ? AMBITO.INTERNA : AMBITO.INTERESTADUAL;
};

/**
 * O QUE A TIPI DIZ, E O QUE ISSO IMPLICA NO CST.
 *
 * ⚠⚠ O CST É CONSEQUÊNCIA DA TABELA, NÃO ESCOLHA. Alíquota positiva → 50 (tributada). Zero → 51
 * (tributada a alíquota zero). NT → 53 (não tributada). Essa é a leitura direta; qualquer outro CST
 * é afirmação de um tratamento ESPECIAL, e tratamento especial exige fundamento — que o portal não
 * tem como inventar.
 */
export function ipiDaTipi(linhaGeral, excecoes = []) {
  if (!linhaGeral) return { determinado: false, motivo: "Este NCM não tem alíquota geral na TIPI de referência." };
  const { aliquotaTipo: tipo, aliquotaValor: valor } = linhaGeral;
  if (tipo === "NT") {
    return { determinado: true, tipo, valor: null, rotulo: "NT — não tributado", cstSugerido: "53",
      nota: "O produto está fora do campo de incidência do IPI segundo a TIPI.", temEx: excecoes.length > 0 };
  }
  if (tipo === "PERCENTUAL") {
    const zero = Number(valor) === 0;
    return {
      determinado: true, tipo, valor: Number(valor),
      rotulo: `${String(valor).replace(".", ",")}%`,
      cstSugerido: zero ? "51" : "50",
      nota: zero ? "A TIPI declara alíquota zero — que é tributação, não ausência dela."
                 : "A TIPI tributa este NCM. A saída do estabelecimento industrial destaca IPI, salvo tratamento específico com fundamento.",
      temEx: excecoes.length > 0,
    };
  }
  return { determinado: false, motivo: "A TIPI não declara alíquota para este código." };
}

/**
 * OS CFOPs CANDIDATOS — filtrados pela operação e pelo âmbito.
 *
 * ⚠ São SUGESTÕES a partir do resumo operacional da TORG, não determinação. O CFOP correto depende
 * de quem é o autor da encomenda, de quem são os insumos e de por onde eles transitaram — por isso
 * cada candidato vem com o que ainda precisa ser respondido.
 */
export function cfopsCandidatos(operacaoId, ambito) {
  const op = OPERACOES.find((o) => o.id === operacaoId);
  if (!op) return { erro: "Operação não reconhecida." };
  const doAmbito = op.cfops
    .map((c) => CFOPS.find((x) => x.codigo === c))
    .filter(Boolean)
    .filter((c) => !ambito || c.ambito === ambito || !op.cfops.some((o) => CFOPS.find((x) => x.codigo === o)?.ambito === ambito));
  // ⚠ Quando a operação só tem CFOP interno cadastrado e o âmbito é interestadual, devolvemos o que
  // há e AVISAMOS — melhor do que uma lista vazia que parece "não existe caminho".
  return { operacao: op, candidatos: doAmbito.length ? doAmbito : op.cfops.map((c) => CFOPS.find((x) => x.codigo === c)).filter(Boolean) };
}

/**
 * ⚠⚠ O QUE O PORTAL NÃO DETERMINA — e por quê, item a item.
 *
 * Escrito como DADO e não como texto solto porque a tela precisa mostrar cada um com o seu motivo.
 * Dizer "não calculado" sem dizer por que faz a pessoa achar que é bug e procurar o número em outro
 * lugar; dizer o motivo manda ela perguntar a quem sabe.
 */
export const NAO_DETERMINADOS = [
  { tributo: "ICMS", motivo: "Depende do regime, de benefícios do estado, de redução de base e de o destinatário ser ou não contribuinte. A alíquota interestadual varia conforme a origem da mercadoria (nacional ou importada) e o destino — não existe um valor único aplicável a toda venda." },
  { tributo: "PIS/COFINS", motivo: "Depende do regime de apuração da receita e do enquadramento da operação. Aplicar 1,65% e 7,6% a tudo é a suposição que o próprio escopo deste módulo proíbe." },
  { tributo: "IBS/CBS", motivo: "As notas de 2026 já carregam os grupos da reforma, mas as regras de transição ainda não estão estruturadas no portal." },
];

/**
 * A SIMULAÇÃO INTEIRA.
 *
 * @param {object} entrada  { ncm, operacao, ufOrigem, ufDestino, destinatarioContribuinte, valor, cstPretendido }
 * @param {{geral:object|null, excecoes:object[]}|undefined} daTipi
 */
export function simular(entrada, daTipi, referencia = {}) {
  const ncm = soDigitos(entrada.ncm);
  const alertas = [];
  const perguntas = [];

  const ambito = ambitoDe(entrada.ufOrigem, entrada.ufDestino);
  if (!ambito) perguntas.push("Informe a UF de origem e a de destino — é o que separa o CFOP 5.xxx do 6.xxx.");

  // ── IPI: a única parte que sai de fonte oficial estruturada ────────────────
  const ipi = ncm.length === 8
    ? (daTipi ? ipiDaTipi(daTipi.geral, daTipi.excecoes) : { determinado: false, motivo: `O NCM ${ncm} não existe na TIPI de referência — a classificação precisa ser revista antes.` })
    : { determinado: false, motivo: "Informe um NCM de 8 dígitos." };

  if (ipi.determinado && ipi.temEx) {
    alertas.push({
      nivel: "atencao",
      texto: `Este NCM tem ${daTipi.excecoes.length} tratamento(s) de Ex TIPI. Se o produto se enquadrar em algum, a alíquota é outra — e com o NCM sozinho não dá para saber qual.`,
    });
  }

  // ⚠⚠ ESTE É O ALERTA QUE A NF-e 973 TERIA RECEBIDO. Mesma regra do motor de auditoria, aplicada
  // ANTES: a pessoa escolhe um CST que afirma não tributação sobre um NCM que a TIPI tributa.
  const pretendido = entrada.cstPretendido ? String(entrada.cstPretendido) : null;
  if (pretendido && ipi.determinado && ipi.tipo === "PERCENTUAL" && Number(ipi.valor) > 0) {
    const regra = CST_IPI[pretendido];
    if (regra && !regra.tributa) {
      alertas.push({
        nivel: "alto",
        texto: `O CST ${pretendido} (${regra.rotulo}) afirma ${regra.afirma ?? "ausência de tributação"}, mas a TIPI tributa o ${ncm} a ${ipi.rotulo}.`
             + (regra.exigeFundamento ? ` Esse CST exige fundamento legal identificado — não basta não destacar.` : ""),
      });
    }
  }

  // ── CFOP: sugestão a partir do resumo operacional ──────────────────────────
  const cfop = entrada.operacao ? cfopsCandidatos(entrada.operacao, ambito) : { candidatos: [] };
  if (!entrada.operacao) perguntas.push("Escolha a natureza da operação — é ela que define o CFOP, não o NCM.");
  const pedir = (t) => { if (t && !perguntas.includes(t) && !jaRespondida(t, entrada, ambito)) perguntas.push(t); };
  for (const c of cfop.candidatos ?? []) for (const e of c.exige ?? []) pedir(e);
  for (const p of cfop.operacao?.perguntas ?? []) pedir(p);
  if (cfop.operacao?.alerta) alertas.push({ nivel: "atencao", texto: cfop.operacao.alerta });

  // ⚠ Destinatário sem inscrição muda o tratamento do ICMS — e é dado que a OP já tem.
  if (entrada.destinatarioContribuinte === false) {
    alertas.push({ nivel: "atencao", texto: "Destinatário não contribuinte: o tratamento do ICMS na operação interestadual é diferente, e o diferencial de alíquota pode ser devido ao estado de destino." });
  }

  const valor = Number(entrada.valor) || 0;
  return {
    entrada: { ...entrada, ncm, ambito },
    ipi: {
      ...ipi,
      // ⚠ O valor é ESTIMATIVA sobre o que foi digitado — não base de cálculo apurada.
      estimativa: ipi.determinado && ipi.tipo === "PERCENTUAL" && valor > 0
        ? { base: r2(valor), aliquota: ipi.valor, valor: r2(valor * Number(ipi.valor) / 100) }
        : null,
      cstRotulo: ipi.cstSugerido ? CST_IPI[ipi.cstSugerido]?.rotulo ?? null : null,
      // ⚠⚠ cEnq NÃO É SUGERIDO. O briefing proíbe atribuir 999 automaticamente, e o portal não tem
      // tabela de enquadramentos aprovada — sugerir um código aqui seria inventar fundamento legal.
      cEnq: null,
      cEnqNota: "O código de enquadramento depende do fundamento legal da operação e não é sugerido automaticamente.",
    },
    cfop: {
      ambito,
      candidatos: (cfop.candidatos ?? []).map((c) => ({ codigo: c.codigo, codigoFormatado: c.codigoFormatado, resumo: c.resumo, familia: c.familia, nota: c.nota ?? null })),
      operacao: cfop.operacao ? { id: cfop.operacao.id, titulo: cfop.operacao.titulo, fluxo: cfop.operacao.fluxo, cliente: cfop.operacao.cliente } : null,
      ressalva: "Sugestão a partir do resumo operacional da TORG, ainda pendente de conferência contra a tabela oficial. O CFOP correto depende de quem é o autor da encomenda e de por onde os insumos transitaram.",
    },
    naoDeterminados: NAO_DETERMINADOS,
    alertas,
    perguntas,
    referencia,
  };
}

/**
 * ⚠⚠ NÃO PERGUNTAR O QUE JÁ FOI RESPONDIDO. Os `exige` de cada CFOP são estáticos — pedem "UF de
 * destino" mesmo depois de o campo estar preenchido. Uma lista de pendências que repete o que a
 * pessoa acabou de digitar ensina a IGNORAR a lista, e aí a pergunta que importa some junto com as
 * outras. Foi o que a primeira validação da tela mostrou.
 *
 * ⚠ O casamento é por palavra-chave contra o que a entrada de fato trouxe. É deliberadamente
 * CONSERVADOR: na dúvida a pergunta FICA. Perguntar de novo é ruído; deixar de perguntar é o
 * defeito que o módulo existe para evitar.
 */
function jaRespondida(texto, entrada, ambito) {
  const t = String(texto).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (ambito && /(uf de (origem|destino)|dentro ou fora de sp)/.test(t)) return true;
  if (entrada.destinatarioContribuinte != null && /contribuinte/.test(t)) return true;
  return false;
}
