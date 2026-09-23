// ─── O MOTOR DE AUDITORIA ────────────────────────────────────────────────────
//
// Recebe o documento já lido (`lib/fiscal/xml-nfe.js`) e as linhas da TIPI de referência, e devolve
// ACHADOS. Não fala com banco, não lê arquivo, não decide nada sobre a nota — por isso é testável
// linha a linha com fixtures.
//
// ⚠⚠ TRÊS REGRAS QUE VALEM PARA TODO ACHADO, e que vêm do parecer de arquitetura:
//
//   1. **O SISTEMA APONTA, NÃO CONDENA.** Nenhum achado diz "está errado": diz o que a nota
//      declarou, o que a fonte oficial diz, e por que os dois discordam. Quem conclui é a
//      contabilidade — e o briefing é explícito em não gerar NF complementar automaticamente.
//   2. **CAMPO AUSENTE PRODUZ "NÃO AVALIÁVEL", NUNCA CONFORMIDADE.** Cada verificação declara de
//      que campos precisa; faltando um, ela se abstém e DIZ que se absteve. Silêncio por falta de
//      dado é indistinguível de silêncio por estar tudo certo, e essa é a pior ambiguidade possível
//      numa ferramenta de auditoria.
//   3. **Ex DESCONHECIDO NÃO SIGNIFICA GERAL.** Se o NCM tem exceções na TIPI e a nota não diz em
//      qual se enquadra, a comparação com a alíquota geral é INCONCLUSIVA, não um veredito.

export const GRAVIDADE = { ALTA: "ALTA", MEDIA: "MEDIA", INFO: "INFO" };

/**
 * ⚠⚠ O QUE CADA CST DE IPI AFIRMA — e é a afirmação, não o valor zero, que a auditoria compara.
 *
 * "Não destacou IPI" não é um fato fiscal; é o efeito de uma DECLARAÇÃO. O CST 53 afirma que o
 * produto está FORA do campo de incidência; o 51 afirma que a alíquota é zero; o 55, que há
 * suspensão com fundamento legal. Comparar só `vIPI == 0` com a TIPI trataria os três como a mesma
 * coisa — e eles exigem provas diferentes.
 */
export const CST_IPI = {
  "50": { rotulo: "Saída tributada", tributa: true, exigeFundamento: false },
  "51": { rotulo: "Saída tributada com alíquota zero", tributa: false, exigeFundamento: false, afirma: "que a alíquota do produto é zero" },
  "52": { rotulo: "Saída isenta", tributa: false, exigeFundamento: true, afirma: "que há isenção" },
  "53": { rotulo: "Saída não tributada", tributa: false, exigeFundamento: true, afirma: "que o produto está fora do campo de incidência" },
  "54": { rotulo: "Saída imune", tributa: false, exigeFundamento: true, afirma: "que há imunidade" },
  "55": { rotulo: "Saída com suspensão", tributa: false, exigeFundamento: true, afirma: "que há suspensão" },
  "99": { rotulo: "Outras saídas", tributa: false, exigeFundamento: true, afirma: "uma situação não enquadrada nas anteriores" },
};

/** ⚠ 999 é "Outros" — não é enquadramento, é a ausência dele com um código no lugar. */
const ENQUADRAMENTO_GENERICO = "999";

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const pct = (v) => `${String(v).replace(".", ",")}%`;

const achado = (o) => ({ gravidade: GRAVIDADE.MEDIA, ...o });

/**
 * A alíquota da TIPI para um NCM — com a ressalva do Ex quando ela existe.
 *
 * @param {Map<string, {geral:object|null, excecoes:object[]}>} tipi
 */
function daTipi(tipi, ncm) {
  const e = tipi.get(ncm);
  if (!e) return { ausente: true };
  return { geral: e.geral ?? null, excecoes: e.excecoes ?? [] };
}

/**
 * AUDITA UM DOCUMENTO.
 *
 * @param {object} doc              saída de `lerNfe`
 * @param {Map} tipi                NCM → { geral, excecoes }, da versão de referência
 * @param {{versaoId?:string, sha256?:string, vigenciaDeclarada?:boolean}} referencia
 */
export function auditar(doc, tipi, referencia = {}) {
  const achados = [];
  const porNcm = new Map();

  for (const it of doc.itens ?? []) {
    const onde = { item: it.item, ncm: it.ncm, descricao: it.descricaoItem || it.descricao };
    const t = daTipi(tipi, it.ncm);

    // ── NCM que não existe na tabela de referência ──────────────────────────
    if (t.ausente) {
      achados.push(achado({
        tipo: "NCM_FORA_DA_TIPI", gravidade: GRAVIDADE.ALTA, ...onde,
        titulo: `NCM ${it.ncm || "(vazio)"} não existe na TIPI de referência`,
        detalhe: "Não é possível comparar a tributação declarada — antes disso, a classificação precisa ser revista.",
      }));
      continue;
    }

    const cst = it.ipi?.cst;
    const regra = cst ? CST_IPI[cst] : null;

    // ── Campo ausente: a verificação se ABSTÉM e diz que se absteve (regra 2) ─
    if (!cst) {
      achados.push(achado({
        tipo: "NAO_AVALIAVEL", gravidade: GRAVIDADE.INFO, ...onde,
        titulo: "Item sem CST de IPI declarado",
        detalhe: "Sem o CST não dá para saber o que a nota afirmou sobre o IPI. Verificação não realizada.",
        faltam: ["IPI/CST"],
      }));
      continue;
    }

    // ── Ex TIPI: com exceções na tabela, a geral não decide sozinha (regra 3) ─
    const temEx = t.excecoes.length > 0;
    const geral = t.geral;

    if (!geral) {
      achados.push(achado({
        tipo: "NAO_AVALIAVEL", gravidade: GRAVIDADE.INFO, ...onde,
        titulo: `NCM ${it.ncm} não tem alíquota geral na TIPI`,
        detalhe: temEx ? "Só há tratamentos de Ex TIPI. É preciso saber em qual o produto se enquadra." : "A TIPI não declara alíquota para este código.",
        faltam: ["Ex TIPI aplicável"],
      }));
      continue;
    }

    const tributadaNaTipi = geral.aliquotaTipo === "PERCENTUAL" && Number(geral.aliquotaValor) > 0;

    // ── O coração: a nota AFIRMOU não tributar algo que a TIPI tributa ──────
    if (tributadaNaTipi && regra && !regra.tributa) {
      achados.push(achado({
        tipo: "IPI_NAO_DESTACADO", gravidade: GRAVIDADE.ALTA, ...onde,
        titulo: `CST ${cst} (${regra.rotulo}) num NCM que a TIPI tributa a ${pct(geral.aliquotaValor)}`,
        detalhe: `A nota afirma ${regra.afirma ?? "ausência de tributação"}; a TIPI de referência diz ${pct(geral.aliquotaValor)} para o ${it.ncm}.`
          + (temEx ? ` ⚠ Este NCM tem ${t.excecoes.length} tratamento(s) de Ex TIPI — se o produto se enquadra em algum, a comparação muda.` : "")
          + (regra.exigeFundamento && (!it.ipi.cEnq || it.ipi.cEnq === ENQUADRAMENTO_GENERICO)
            ? ` ⚠⚠ O CST ${cst} exige fundamento legal, e o enquadramento informado é "${it.ipi.cEnq || "vazio"}" (genérico).` : ""),
        // ⚠ ESTIMATIVA, e rotulada como tal: é a conta óbvia, não uma apuração.
        estimativa: { base: r2(it.valor), aliquota: geral.aliquotaValor, ipi: r2(Number(it.valor) * Number(geral.aliquotaValor) / 100) },
        inconclusivo: temEx,
        exigeDecisao: true,
      }));
    }

    // ── Alíquota declarada diferente da tabela ──────────────────────────────
    if (regra?.tributa && geral.aliquotaTipo === "PERCENTUAL" && it.ipi.aliquota != null
        && r2(it.ipi.aliquota) !== r2(geral.aliquotaValor)) {
      achados.push(achado({
        tipo: "ALIQUOTA_DIVERGENTE", gravidade: GRAVIDADE.ALTA, ...onde,
        titulo: `Alíquota de IPI declarada ${pct(it.ipi.aliquota)} × TIPI ${pct(geral.aliquotaValor)}`,
        detalhe: temEx ? "⚠ O NCM tem Ex TIPI: a diferença pode ser legítima se o produto se enquadrar num deles." : "A alíquota declarada não é a da tabela de referência.",
        inconclusivo: temEx,
      }));
    }

    // ── Enquadramento genérico onde o CST exige fundamento ──────────────────
    if (regra?.exigeFundamento && it.ipi.cEnq === ENQUADRAMENTO_GENERICO && !tributadaNaTipi) {
      achados.push(achado({
        tipo: "ENQUADRAMENTO_GENERICO", gravidade: GRAVIDADE.MEDIA, ...onde,
        titulo: `CST ${cst} com enquadramento 999 (Outros)`,
        detalhe: `O CST ${cst} afirma ${regra.afirma ?? "um tratamento especial"} e exige fundamento legal. "999" não é enquadramento — é a ausência dele com um código no lugar.`,
      }));
    }

    // Guarda para a conferência de coerência interna, logo abaixo.
    const chave = it.ncm;
    if (!porNcm.has(chave)) porNcm.set(chave, new Map());
    const m = porNcm.get(chave);
    if (!m.has(cst)) m.set(cst, []);
    m.get(cst).push(it.item);
  }

  // ── A nota contra ELA MESMA ────────────────────────────────────────────────
  // ⚠⚠ ESTE É O ACHADO MAIS FORTE QUE EXISTE, porque não depende de interpretar a lei: o mesmo NCM,
  // no mesmo documento, tratado de dois jeitos. Um dos dois está errado por construção, e quem
  // emitiu tinha as duas informações à mão.
  for (const [ncm, porCst] of porNcm) {
    if (porCst.size < 2) continue;
    const partes = [...porCst.entries()].map(([cst, itens]) => `CST ${cst} em ${itens.length} item(ns)`);
    achados.push(achado({
      tipo: "CONTRADICAO_INTERNA", gravidade: GRAVIDADE.ALTA, ncm,
      titulo: `O NCM ${ncm} recebeu tratamentos diferentes na mesma nota`,
      detalhe: `${partes.join(" e ")}. Sem um Ex TIPI ou uma característica do produto que separe os grupos, um dos dois tratamentos está incorreto.`,
      itens: [...porCst.values()].flat(),
      exigeDecisao: true,
    }));
  }

  const comEstimativa = achados.filter((a) => a.estimativa);
  return {
    chave: doc.chave,
    numero: doc.numero,
    emitidaEm: doc.emitidaEm,
    destinatario: doc.destinatario?.nome ?? null,
    itens: doc.itens?.length ?? 0,
    achados,
    resumo: {
      alta: achados.filter((a) => a.gravidade === GRAVIDADE.ALTA).length,
      media: achados.filter((a) => a.gravidade === GRAVIDADE.MEDIA).length,
      naoAvaliaveis: achados.filter((a) => a.tipo === "NAO_AVALIAVEL").length,
      // ⚠⚠ "DIFERENÇA ESTIMADA", NUNCA "IMPOSTO DEVIDO". É a soma das contas óbvias dos achados,
      // para dimensionar o problema — não uma apuração, e não base de cálculo de nada.
      diferencaEstimada: r2(comEstimativa.reduce((s, a) => s + a.estimativa.ipi, 0)),
      baseDaEstimativa: r2(comEstimativa.reduce((s, a) => s + a.estimativa.base, 0)),
    },
    referencia: {
      ...referencia,
      // ⚠⚠ O APONTAMENTO CARREGA A RESSALVA DA REFERÊNCIA. Sem vigência declarada, ele vale contra a
      // tabela que o portal está usando HOJE — não contra a que vigia na data da emissão.
      ressalva: referencia.vigenciaDeclarada
        ? null
        : "A TIPI de referência não tem vigência declarada. Este apontamento compara com a tabela ativa no portal, não com a comprovadamente vigente na data de emissão.",
    },
  };
}

/** O índice que `auditar` consome, montado a partir das linhas da versão ativa. */
export function indiceDaTipi(linhas) {
  const m = new Map();
  for (const l of linhas) {
    if (!m.has(l.codigo)) m.set(l.codigo, { geral: null, excecoes: [] });
    const e = m.get(l.codigo);
    if (l.ex) e.excecoes.push(l); else e.geral = l;
  }
  return m;
}
