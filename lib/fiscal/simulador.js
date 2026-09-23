import { CFOPS, AMBITO, operacoesDoCfop } from "@/lib/fiscal/cfop";
import { CST_IPI } from "@/lib/fiscal/auditoria";
import { estimarPisCofins, REGIME, ehReceita } from "@/lib/fiscal/regime";
import { estimarIcms } from "@/lib/fiscal/icms";
import { cenarioDoCfop } from "@/lib/fiscal/cenarios";
import { ORIGEM } from "@/lib/fiscal/cst";

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
// ⚠⚠ E ELE SE CALA ONDE NÃO SABE — mas "não saber" e "ninguém ter dito" são coisas diferentes. O
// briefing proíbe *"aplicar PIS 1,65% e COFINS 7,6% a TODAS as operações"*: a proibição é contra a
// SUPOSIÇÃO. Em 22/09/2026 o Matheus DECLAROU o regime (*"base PIS/COFINS da TORG é LUCRO REAL,
// então é 1,65 e 7,6"*), e as NF-e 959, 973 e 979 confirmaram — CRT 3, CST 01 em 100% dos itens,
// total batendo ao centavo. Com o regime declarado por quem responde por ele, a alíquota básica
// deixa de ser chute e vira a regra geral, com as exceções nomeadas em `RESSALVAS_PIS_COFINS`.
//
// ⚠⚠ O ICMS CONTINUA NÃO DETERMINADO, e não é teimosia. Ele depende da UF de destino, de benefício
// estadual, de redução de base e de o destinatário ser contribuinte — não de um regime que alguém
// possa declarar numa linha. Um número plausível ali seria pior que um campo vazio: o vazio manda
// perguntar; o plausível é copiado para a nota.
//
// ⚠⚠ E O HISTÓRICO NÃO SERVE DE REGRA. Deduzir tributação do que as notas antigas trazem herdaria o
// erro delas — a 973 saiu com 22 itens no CST de IPI errado, e um portal que aprendesse com ela
// abençoaria exatamente o defeito que este módulo existe para pegar. Nota serve para CONFERIR um
// fato declarado, nunca para inventá-lo.

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
      nota: "O produto está fora do campo de incidência do IPI segundo a TIPI.",
      temEx: excecoes.length > 0, inconclusivo: excecoes.length > 0,
      ...(excecoes.length > 0 ? { cstSugerido: null } : {}) };
  }
  if (tipo === "PERCENTUAL") {
    const zero = Number(valor) === 0;
    // ⚠⚠ COM Ex TIPI, O CST NÃO É SUGERIDO (achado do Codex, 22/09/2026). A auditoria já marcava
    // esse cenário como INCONCLUSIVO; o simulador seguia entregando CST e estimativa pela alíquota
    // geral. Compartilhar o `CST_IPI` não é compartilhar a DECISÃO — e era exatamente a incoerência
    // que o módulo promete não ter ("uma regra, dois momentos").
    if (excecoes.length > 0) {
      return {
        determinado: true, tipo, valor: Number(valor), inconclusivo: true, temEx: true,
        rotulo: `${String(valor).replace(".", ",")}%`,
        cstSugerido: null,
        nota: `A TIPI traz ${excecoes.length} tratamento(s) de Ex para este NCM. A alíquota geral é ${String(valor).replace(".", ",")}%, mas só quem conhece o produto sabe se ele se enquadra em algum Ex — e por isso o CST não é sugerido aqui.`,
      };
    }
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
 * O CFOP ESCOLHIDO, E O QUE ELE ARRASTA JUNTO.
 *
 * ⚠⚠ QUEM ESCOLHE É O CFOP, NÃO UM "NOME DE OPERAÇÃO". Matheus (22/09/2026): *"na natureza de
 * operação tire os nomes, deixe os CFOPs e a descrição do CFOP"*. E ele tem razão sobre o fluxo:
 * quem emite pensa no código que vai na nota, não numa etiqueta interna — e um rótulo como
 * "Venda à ordem (ex.: TMSA)" fazia parecer que a operação é DAQUELE cliente.
 *
 * ⚠⚠ O CÓDIGO PODE VIR COMO PAR ("5101/6101"), e aí quem decide é o âmbito. Isso não enfraquece a
 * verificação de baixo: ela continua valendo para quem manda um código único (a API, a auditoria,
 * quem digita direto) — o par apenas IMPEDE o erro em vez de detectá-lo, que é sempre melhor.
 *
 * ⚠ As perguntas e os alertas das operações reais não se perdem: eles voltam pelo caminho inverso,
 * a partir das operações em que aquele CFOP aparece (`operacoesDoCfop`). O exemplo continua sendo
 * exemplo; só deixou de ser a porta de entrada.
 */
export function daEscolhaDoCfop(codigo, ambito = null) {
  const partes = String(codigo ?? "").split("/").map((p) => p.replace(/\D/g, "")).filter(Boolean);
  const achados = partes.map((p) => CFOPS.find((c) => c.codigo === p)).filter(Boolean);
  if (achados.length !== partes.length || !achados.length) return { erro: "CFOP não reconhecido." };

  // ⚠⚠ O PAR NÃO É UMA ESCOLHA PENDENTE DO USUÁRIO — é uma escolha que as UFs fazem. Enquanto elas
  // não estiverem preenchidas, não há o que resolver, e a pergunta que falta é a das UFs (que a
  // simulação já está fazendo), não "qual dos dois códigos você quis dizer".
  if (achados.length > 1) {
    if (!ambito) return { par: achados, pendente: "ambito" };
    const cfop = achados.find((c) => c.ambito === ambito);
    if (!cfop) return { erro: "CFOP não reconhecido." };
    return { cfop, operacoes: operacoesDoCfop(cfop.codigo), doPar: achados.map((c) => c.codigoFormatado).join(" / ") };
  }
  return { cfop: achados[0], operacoes: operacoesDoCfop(achados[0].codigo) };
}

/**
 * ⚠⚠ O QUE O PORTAL NÃO DETERMINA — e por quê, item a item.
 *
 * Escrito como DADO e não como texto solto porque a tela precisa mostrar cada um com o seu motivo.
 * Dizer "não calculado" sem dizer por que faz a pessoa achar que é bug e procurar o número em outro
 * lugar; dizer o motivo manda ela perguntar a quem sabe.
 */
// ⚠ O ICMS SAIU DAQUI porque passou a ter alíquota de REFERÊNCIA (art. 52 do RICMS/SP), e ele
// carrega o próprio `estado` e o próprio motivo — inclusive o "não determinado" da operação
// interna. Mantê-lo nos dois lugares faria a tela dizer duas coisas sobre o mesmo tributo.
export const NAO_DETERMINADOS = [
  { tributo: "IBS/CBS", motivo: "As notas de 2026 já carregam os grupos da reforma, mas as regras de transição ainda não estão estruturadas no portal." },
];

/**
 * AS NOTAS QUE A OPERAÇÃO COSTUMA EXIGIR.
 *
 * ⚠⚠ É A PERGUNTA QUE VEM ANTES DO CST. Matheus (22/09/2026): *"a simulação deve informar
 * previamente quais notas devem ser emitidas geralmente nesse tipo de operação do cliente"*. Numa
 * venda à ordem, quem emite só a 5.118 deixou o caminhão sair sem documento; quem emite a 5.923
 * cobrando de novo faturou duas vezes o mesmo aço. O CST certo numa nota que não deveria existir
 * sozinha não salva ninguém.
 *
 * ⚠ Vem das operações REAIS em que o CFOP aparece — o mesmo caminho das perguntas. Um CFOP que
 * apareça em duas operações traz as duas sequências, porque são caminhos alternativos e escolher
 * entre eles é decisão de quem conhece o negócio, não do portal.
 *
 * ⚠⚠ A DEDUPLICAÇÃO É DENTRO DE CADA CENÁRIO, NUNCA ENTRE ELES (achado do Codex, 22/09/2026). A
 * versão anterior usava um conjunto global: o retorno 5.902 emitido pela TORG, na industrialização
 * com insumo do cliente, APAGAVA o retorno 5.902 emitido pelo TERCEIRO na terceirização — mesmo
 * CFOP, mesmo papel, EMITENTE DIFERENTE. O cenário aparecia mutilado, e mutilado em silêncio.
 *
 * ⚠ Cada cenário é uma alternativa completa; ele só faz sentido inteiro. A chave leva o emitente
 * junto, para o caso de a mesma operação repetir uma linha idêntica.
 */
export function notasDaOperacao(operacoes) {
  const saida = [];
  for (const o of operacoes) {
    const vistas = new Set();
    const linhas = (o.notas ?? []).filter((n) => {
      const k = `${n.quem}|${n.cfop ?? "-"}|${n.papel}`;
      if (vistas.has(k)) return false;
      vistas.add(k);
      return true;
    });
    if (linhas.length) saida.push({ operacaoId: o.id, operacao: o.titulo, notas: linhas });
  }
  return saida;
}

/**
 * A SIMULAÇÃO INTEIRA.
 *
 * @param {object} entrada  { ncm, cfop, ufOrigem, ufDestino, destinatarioContribuinte, valor, cstPretendido }
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

  // ── CFOP: o que o código escolhido exige, e o que ele contradiz ────────────
  const escolha = entrada.cfop ? daEscolhaDoCfop(entrada.cfop, ambito) : null;
  const pedir = (t) => { if (t && !perguntas.includes(t) && !jaRespondida(t, entrada, ambito)) perguntas.push(t); };
  if (!escolha || escolha.erro) {
    perguntas.push("Escolha o CFOP da operação — é ele que define o tratamento, não o NCM.");
  } else if (escolha.pendente === "ambito") {
    // A pergunta das UFs já está na lista — repeti-la aqui com outras palavras seria ruído.
  } else {
    for (const e of escolha.cfop.exige ?? []) pedir(e);
    for (const o of escolha.operacoes) {
      for (const p of o.perguntas ?? []) pedir(p);
      if (o.alerta) alertas.push({ nivel: "atencao", texto: o.alerta });
    }
    // ⚠⚠ O CFOP CONTRA AS UFs — a verificação que só existe porque o usuário escolhe o código.
    // 5.xxx é operação INTERNA e 6.xxx é INTERESTADUAL: o primeiro dígito não é decoração. Escolher
    // 5.101 numa venda para o RS é um erro que a SEFAZ rejeita, e é exatamente o tipo de coisa que
    // o operador não tem como saber de cabeça.
    if (ambito && escolha.cfop.ambito !== ambito) {
      // ⚠ O par equivalente casa pelos TRÊS ÚLTIMOS DÍGITOS (5.101 ↔ 6.101), não pela descrição:
      // os textos diferem de propósito ("Venda de produção" × "Venda INTERESTADUAL de produção").
      // ⚠ Nem todo par existe (5.902 e 5.124 não têm 6.xxx na lista da TORG) — por isso a sugestão
      // só entra quando o equivalente é achado.
      const esperado = CFOPS.find((c) => c.ambito === ambito && c.codigo.slice(1) === escolha.cfop.codigo.slice(1));
      alertas.push({
        nivel: "alto",
        texto: `O CFOP ${escolha.cfop.codigoFormatado} é de operação ${escolha.cfop.ambito === "INTERNA" ? "INTERNA (dentro de SP)" : "INTERESTADUAL"}, `
             + `mas ${entrada.ufOrigem} → ${entrada.ufDestino} é ${ambito === "INTERNA" ? "interna" : "interestadual"}.`
             + (esperado ? ` O código equivalente é o ${esperado.codigoFormatado}.` : ""),
      });
    }
  }

  // ⚠⚠ O COMERCIAL JÁ RESPONDEU DE QUEM É A MATÉRIA-PRIMA, e o simulador estava perguntando de
  // novo. Matheus (22/09/2026): *"no Comercial eles já definem se a matéria-prima vai ser a TORG
  // quem compra ou Faturamento Direto quando o cliente vai comprar — então já tem a resposta"*.
  //
  // ⚠⚠ MAS O FD RESPONDE *DE QUEM SÃO*, NUNCA *POR ONDE TRANSITARAM*. É o trânsito que separa o
  // 5.124 do 5.125, e quem paga não define isso — essa pergunta continua de pé, e tem de continuar.
  const mp = entrada.materiaPrima?.de ?? null;
  if (mp === "CLIENTE" && escolha?.cfop?.familia === "Venda") {
    alertas.push({
      nivel: "alto",
      texto: `O Comercial registrou a obra inteira como Faturamento Direto — a matéria-prima é comprada pelo CLIENTE. `
           + `O CFOP ${escolha.cfop.codigoFormatado} é de venda de produção do estabelecimento, que pressupõe insumos da TORG. `
           + `Se a TORG só industrializou, o caminho costuma ser o da industrialização (5.124 / 5.125). Confirme antes de emitir.`,
    });
  }
  if (mp === "MISTO") {
    alertas.push({
      nivel: "atencao",
      texto: `Nesta obra o Comercial marcou ${entrada.materiaPrima.fd} de ${entrada.materiaPrima.itens} itens como Faturamento Direto. `
           + `Parte da matéria-prima é do cliente e parte é da TORG — as duas partes não saem no mesmo CFOP.`,
    });
  }

  // ⚠ Destinatário sem inscrição muda o tratamento do ICMS — e é dado que a OP já tem.
  if (entrada.destinatarioContribuinte === false) {
    alertas.push({ nivel: "atencao", texto: "Destinatário não contribuinte: o tratamento do ICMS na operação interestadual é diferente, e o diferencial de alíquota pode ser devido ao estado de destino." });
  }

  const valor = Number(entrada.valor) || 0;
  // ⚠ A estimativa do IPI é calculada UMA vez: o cartão e o resumo têm de mostrar o mesmo número,
  // e dois cálculos separados divergiriam no primeiro ajuste de arredondamento.
  const estimativaIpi = ipi.determinado && !ipi.inconclusivo && ipi.tipo === "PERCENTUAL" && valor > 0
    ? { base: r2(valor), aliquota: ipi.valor, valor: r2(valor * Number(ipi.valor) / 100) }
    : null;
  const pisCofins = estimarPisCofins(valor, escolha?.cfop ?? null);
  const icms = estimarIcms(entrada.ufOrigem, entrada.ufDestino, valor, escolha?.cfop ?? null);
  return {
    entrada: { ...entrada, ncm, ambito },
    ipi: {
      ...ipi,
      // ⚠ O valor é ESTIMATIVA sobre o que foi digitado — não base de cálculo apurada.
      // ⚠⚠ E ELA SOME QUANDO O RESULTADO É INCONCLUSIVO (achado do Codex, 22/09/2026). Eu tinha
      // tirado o `cstSugerido` no caso de Ex TIPI e ESQUECIDO o dinheiro: geral 3,25%, Ex 0% e
      // R$ 1.000 continuavam rendendo "R$ 32,50" na tela. Consertei a metade errada — o CST é o que
      // a pessoa lê, mas o VALOR é o que ela copia.
      estimativa: estimativaIpi,
      cstRotulo: ipi.cstSugerido ? CST_IPI[ipi.cstSugerido]?.rotulo ?? null : null,
      // ⚠⚠ cEnq NÃO É SUGERIDO. O briefing proíbe atribuir 999 automaticamente, e o portal não tem
      // tabela de enquadramentos aprovada — sugerir um código aqui seria inventar fundamento legal.
      cEnq: null,
      cEnqNota: "O código de enquadramento depende do fundamento legal da operação e não é sugerido automaticamente.",
    },
    cfop: {
      ambito,
      // ⚠ Qual dos dois o portal escolheu, e a partir de qual par — quem emite precisa poder
      // conferir a dedução, não só receber o código pronto.
      resolvidoDoPar: escolha?.doPar ?? null,
      parPendente: escolha?.pendente === "ambito" ? escolha.par.map((c) => c.codigoFormatado).join(" / ") : null,
      escolhido: escolha?.cfop
        ? { codigo: escolha.cfop.codigo, codigoFormatado: escolha.cfop.codigoFormatado, resumo: escolha.cfop.resumo, quando: escolha.cfop.quando ?? null, familia: escolha.cfop.familia, ambito: escolha.cfop.ambito, nota: escolha.cfop.nota ?? null }
        : null,
      // ⚠ Os exemplos reais em que esse CFOP aparece — contexto, não determinação.
      operacoes: (escolha?.operacoes ?? []).map((o) => ({ id: o.id, titulo: o.titulo, fluxo: o.fluxo, cliente: o.cliente })),
      // ⚠ Quantas notas, e quem emite cada uma — ver `notasDaOperacao`.
      sequencias: notasDaOperacao(escolha?.operacoes ?? []),
      ressalva: "A descrição é o resumo operacional da TORG, ainda pendente de conferência contra a tabela oficial do CONFAZ. O CFOP correto depende de quem é o autor da encomenda e de por onde os insumos transitaram.",
    },
    naoDeterminados: NAO_DETERMINADOS,
    // ⚠⚠ A PRÉVIA DOS IMPOSTOS, NUMA LINHA CADA. Matheus (23/09/2026): *"quando clicar em simular
    // ele me dê uma prévia dos valores de cada imposto, se tiver naquele caso"*. É o resumo que
    // alguém confere de relance antes de emitir — os detalhes continuam nos cartões abaixo.
    //
    // ⚠⚠ E O QUE NÃO TEM NÚMERO APARECE NA MESMA TABELA, COM O MOTIVO CURTO. Sumir com a linha
    // faria o total parecer o imposto inteiro da operação; deixá-la com "—" mantém à vista que
    // falta coisa ali.
    // ⚠⚠ A FICHA QUE O OPERADOR VAI DIGITAR NO OMIE. Matheus (23/09/2026) mandou o formato que a
    // contabilidade usa — "CFOP: … / CST ICMS: … / CST IPI: … / CBenef: … / Informações
    // adicionais: …". É o trabalho real de quem emite, e a simulação inteira existe para preencher
    // esses campos.
    ficha: fichaDeEmissao({ escolha, ipi, pisCofins, icms }),
    resumoTributos: resumoDeTributos({ valor, ipi: { ...ipi, estimativa: estimativaIpi }, pisCofins, icms }),
    // ⚠ Determinado a partir do regime DECLARADO (ver o cabeçalho e `lib/fiscal/regime.js`) — e
    // acompanhado das exceções que o portal não detecta.
    // ⚠⚠ REMESSA NÃO É RECEITA, E ELE ESTAVA COBRANDO PIS/COFINS DELA (achado do Codex,
    // 22/09/2026). Bastava um valor positivo para sair 1,65% e 7,6% — inclusive numa remessa para
    // industrialização, num retorno e até sem CFOP escolhido. As ressalvas diziam o certo e o
    // número dizia o contrário; num operador não contador, ganha o número.
    pisCofins: estimarPisCofins(valor, escolha?.cfop ?? null),
    // ⚠⚠ O CFOP ENTRA AQUI PELO MESMO MOTIVO DO PIS/COFINS: remessa e retorno não recebem alíquota
    // de referência (ver `lib/fiscal/icms.js`).
    icms: estimarIcms(entrada.ufOrigem, entrada.ufDestino, valor, escolha?.cfop ?? null),
    regime: { nome: REGIME.nome, crt: REGIME.crt, declaradoPor: REGIME.declaradoPor, declaradoEm: REGIME.declaradoEm, conferidoEm: REGIME.conferidoEm.map((c) => c.nf) },
    alertas,
    perguntas,
    referencia,
  };
}

/**
 * A FICHA DE EMISSÃO — os campos que vão ser digitados, na ordem em que aparecem no Omie.
 *
 * ⚠⚠ CAMPO SEM FUNDAMENTO SAI VAZIO, COM O MOTIVO — nunca preenchido "por padrão". O exemplo que
 * o Matheus mandou traz `CST ICMS: 41` e `CBenef: SP099999`, que são de uma operação NÃO
 * TRIBUTADA específica; repetir isso como sugestão seria o portal escolhendo tratamento de ICMS,
 * que é exatamente o que ele não tem base para fazer. Vazio manda perguntar; preenchido vai para
 * a nota.
 *
 * ⚠ O que o portal TEM fundamento para preencher ele preenche: CFOP (escolhido), CST de IPI (da
 * TIPI) e CST de PIS/COFINS (do regime declarado, quando a operação é receita).
 */
function fichaDeEmissao({ escolha, ipi, pisCofins, icms }) {
  const cfop = escolha?.cfop ?? null;
  // ⚠⚠ O CENÁRIO SAI DO CÓDIGO, NÃO SÓ DA FAMÍLIA (achado do Codex, 23/09/2026). "Remessa" junta
  // a remessa para industrialização (5.901, suspensão do art. 402) com a remessa por conta e ordem
  // da venda à ordem (5.923) — e o 5.923 recebia "CST 50, mais comum" com a justificativa da
  // suspensão colada. Ressalva em texto não desliga destaque.
  const cenario = cfop ? cenarioDoCfop(cfop) : null;
  const cstIpi = ipi?.inconclusivo ? null : ipi?.cstSugerido ?? null;
  const linhas = [
    { campo: "CFOP", valor: cfop?.codigoFormatado ?? null, descricao: cfop?.resumo ?? null,
      motivo: cfop ? null : "Escolha a operação." },
    // ⚠⚠ O PORTAL NÃO ESCOLHE O CST DE ICMS — mas agora ele sabe quais códigos cabem no cenário e
    // o que cada um exige que se prove (ver lib/fiscal/cenarios.js). Onze opções iguais faziam
    // alguém marcar "41 — não tributada" porque a nota "não tem imposto".
    { campo: "CST ICMS", valor: null, descricao: null,
      // ⚠ A ORIGEM é o primeiro dígito e o portal TEM ela declarada: na NF-e os dois saem grudados
      // ("0" + "41" = 041), e tratar só a segunda metade como "o CST" é o engano que faz peça
      // nacional e importada saírem com o mesmo código.
      prefixoOrigem: ORIGEM.find((o) => o.codigo === (icms?.origem?.codigo ?? "0")) ?? null,
      candidatos: cenario?.icms.candidatos ?? [],
      porque: cenario?.icms.porque ?? null,
      motivo: icms?.estado === "REFERENCIA"
        ? `Alíquota de referência ${icms.aliquota}% — o CST depende do tratamento da operação.`
        : (icms?.motivo ?? "Escolha o CFOP para o portal saber quais códigos cabem.") },
    { campo: "CST IPI", valor: cstIpi, descricao: cstIpi ? CST_IPI[cstIpi]?.rotulo ?? null : null,
      motivo: cstIpi ? null : (ipi?.inconclusivo ? "Este NCM tem Ex TIPI — o CST depende do enquadramento." : ipi?.motivo ?? "Informe o NCM.") },
  ];
  for (const t of ["PIS", "COFINS"]) {
    const l = pisCofins?.linhas?.find((x) => x.tributo === t);
    linhas.push({ campo: `CST ${t}`, valor: l?.cst ?? null, descricao: l?.rotulo ?? null,
      candidatos: l ? [] : cenario?.pisCofins.candidatos ?? [],
      porque: l ? null : cenario?.pisCofins.porque ?? null,
      motivo: l ? null : (pisCofins?.motivo ?? "Informe o valor dos produtos.") });
  }
  // ⚠⚠ CBenef É CÓDIGO DE BENEFÍCIO FISCAL DA UF, e o portal não tem a tabela nem como saber se a
  // operação se enquadra em algum. Sugerir um seria inventar fundamento legal — a mesma proibição
  // do cEnq 999.
  linhas.push({ campo: "CBenef", valor: null, descricao: null,
    motivo: "Só quando houver benefício fiscal identificado para a operação — o portal não determina." });

  return {
    linhas,
    cenario: cenario && { familia: cfop.familia, resumo: cenario.resumo },
    // ⚠ As "informações adicionais" saem do fundamento da cadeia quando ele existe: é o texto que
    // a nota precisa carregar para o tratamento se sustentar.
    informacoesAdicionais: (escolha?.operacoes ?? [])
      .flatMap((o) => (o.notas ?? []).filter((n) => n.quem === "TORG" && n.cfop?.includes(cfop?.codigo ?? "\u0000") && n.fundamento))
      .map((n) => n.fundamento),
  };
}

/**
 * O RESUMO QUE A TELA MOSTRA PRIMEIRO — uma linha por tributo.
 *
 * ⚠ `valor` é a estimativa quando há; `null` quando o portal não determina, sempre com o motivo em
 * UMA frase. O texto longo continua nos cartões: aqui é para conferir de relance.
 */
function resumoDeTributos({ valor, ipi, pisCofins, icms }) {
  const linhas = [];
  const base = Number(valor) || 0;

  linhas.push({
    tributo: "IPI",
    aliquota: ipi.determinado && ipi.tipo === "PERCENTUAL" ? ipi.valor : null,
    cst: ipi.inconclusivo ? null : ipi.cstSugerido ?? null,
    valor: ipi.estimativa?.valor ?? null,
    motivo: ipi.estimativa ? null
      : ipi.inconclusivo ? "Este NCM tem Ex TIPI — o tratamento depende do enquadramento."
      : ipi.determinado ? (base > 0 ? "A TIPI não traz alíquota percentual para este código." : "Informe o valor dos produtos.")
      : ipi.motivo,
  });

  linhas.push({
    tributo: "ICMS",
    aliquota: icms?.estado === "REFERENCIA" ? icms.aliquota : null,
    cst: null,
    valor: icms?.valor ?? null,
    // ⚠ A alíquota de referência sem valor ainda é informação: mostra que o portal tem o número,
    // mas não o valor porque falta a base.
    motivo: icms?.valor != null ? null : (icms?.motivo ?? "Informe o valor dos produtos."),
  });

  for (const t of pisCofins?.linhas ?? []) {
    linhas.push({ tributo: t.tributo, aliquota: t.aliquota, cst: t.cst, valor: t.valor, motivo: null });
  }
  if (!pisCofins?.linhas) {
    for (const t of ["PIS", "COFINS"]) {
      linhas.push({ tributo: t, aliquota: null, cst: null, valor: null,
        motivo: pisCofins?.motivo ?? "Informe o valor dos produtos." });
    }
  }

  linhas.push({ tributo: "IBS/CBS", aliquota: null, cst: null, valor: null,
    motivo: "As regras de transição da reforma ainda não estão estruturadas no portal." });

  const comValor = linhas.filter((l) => l.valor != null);
  return {
    base,
    linhas,
    total: r2(comValor.reduce((a, l) => a + l.valor, 0)),
    // ⚠⚠ QUANTOS FICARAM SEM NÚMERO — é o que impede o total de ser lido como "o imposto da
    // operação". Um total ao lado de três linhas vazias precisa dizer que são três.
    semNumero: linhas.length - comValor.length,
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
  // ⚠⚠ SÓ A PROPRIEDADE, NUNCA O TRÂNSITO. "Os insumos são da TORG?" e "de quem são os insumos?" o
  // FD responde; "transitaram pelo estabelecimento do encomendante?" e "vieram do fornecedor ou do
  // estabelecimento?" ele NÃO responde, e continuam na lista. Misto não responde nada: a obra tem
  // as duas naturezas.
  const mp = entrada.materiaPrima?.de ?? null;
  if ((mp === "TORG" || mp === "CLIENTE") && /insumos/.test(t) && !/transit|estabelecimento|fornecedor/.test(t)) return true;
  return false;
}
