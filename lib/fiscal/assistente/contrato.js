// ─── A FRONTEIRA DE EVIDÊNCIA ────────────────────────────────────────────────
//
// ⚠⚠⚠ "O LLM SÓ ORQUESTRA" NÃO BASTA, E ESSE ERA O FURO DO MEU PRIMEIRO DESENHO (parecer do Codex,
// 23/09/2026): *"uma ferramenta pode retornar o fato correto e o modelo aplicar esse fato à
// operação errada, trocar emitente/destinatário, ignorar condições ou acrescentar uma conclusão na
// narrativa"*. Conferir que uma citação EXISTE não prova que ela SUSTENTA a frase em volta dela.
//
// Por isso este módulo faz duas coisas, e as duas são do SERVIDOR:
//   1. `blocoDeResultado` monta o bloco fiscal decisivo — CFOP, alíquota, citação — a partir do
//      resultado ESTRUTURADO da ferramenta. O modelo não escreve esses valores; ele os comenta.
//   2. `conferirProsa` varre o texto do modelo atrás de código fiscal, NCM, artigo e alíquota que
//      não estejam entre as evidências coletadas — os quatro que o briefing proíbe inventar.
//
// ⚠ Módulo PURO de propósito: nada de Prisma, nada de rede. É o que permite testá-lo contra
// resultados forjados sem subir nada.

/** Os tipos de bloco que o servidor sabe renderizar. Ferramenta sem bloco não vira afirmação. */
export const BLOCO = {
  NCM: "NCM",
  CFOP: "CFOP",
  SIMULACAO: "SIMULACAO",
  LEGISLACAO: "LEGISLACAO",
  CLASSIFICACAO: "CLASSIFICACAO",
  REGRA: "REGRA",
  CADEIA: "CADEIA",
};

const texto = (v) => String(v ?? "").trim();

/**
 * ⚠⚠ A RESSALVA VIAJA DENTRO DO BLOCO, NUNCA NO RODAPÉ. Ressalva em rodapé é ressalva que ninguém
 * lê: quem copia o CFOP copia o bloco. É a mesma lição da tarja de procedência da Consulta NCM.
 */
const linha = (rotulo, valor, ressalva = null) => ({ rotulo, valor: texto(valor) || "—", ressalva });

/** ⚠ "ATIVA" NÃO É "VIGENTE" — e o Codex apontou que a resposta precisa considerar a DATA da
 *  operação, não só a referência ativa. Esta ressalva acompanha todo bloco que veio da TIPI. */
const RESSALVA_TIPI = "A TIPI não declara vigência dentro do arquivo: esta é a versão que o portal está servindo, não prova de qual redação vigorava numa data passada.";

export function blocoNcm(r) {
  if (!r || r.erro) return null;
  const linhas = [
    linha("NCM", r.ncmFormatado),
    linha("Descrição", r.descricaoCompleta),
    linha("IPI (alíquota geral)", r.geral?.ipi?.rotulo ?? "não declarada", RESSALVA_TIPI),
  ];
  if (r.excecoes?.length) {
    linhas.push(linha(
      `Ex TIPI (${r.excecoes.length})`,
      r.excecoes.map((e) => `Ex ${e.ex}: ${e.ipi?.rotulo ?? "—"}`).join(" · "),
      "Se o produto se enquadrar num Ex, a alíquota é outra — e com o NCM sozinho não dá para saber qual.",
    ));
  }
  return {
    tipo: BLOCO.NCM, titulo: `NCM ${r.ncmFormatado}`, linhas,
    fontes: [{ rotulo: "TIPI — Receita Federal", sha256: r.referencia?.tipi?.fonte?.sha256 ?? null, url: r.referencia?.tipi?.fonte?.url ?? null }],
  };
}

export function blocoCfop(c) {
  if (!c) return null;
  return {
    tipo: BLOCO.CFOP, titulo: `CFOP ${c.codigoFormatado}`,
    linhas: [
      linha("Operação", c.resumo),
      linha("Quando usar", c.quando),
      linha("Âmbito", c.ambito === "INTERNA" ? "Interna (dentro de SP)" : "Interestadual"),
      linha("Emitente", c.emitente),
    ],
    fontes: [{ rotulo: "Convênio s/nº de 15/12/1970, Anexo — tabela de CFOP", url: null, sha256: null }],
  };
}

/**
 * ⚠⚠ DISPOSITIVO SAI COM O RÓTULO E COM O TRECHO — e o trecho é RETIDO, não referenciado
 * (parecer do Codex: *"hash identifica; não preserva conteúdo"*, e `FiscalNormaVersao` tem
 * exclusão em cascata). Guardar só o id deixaria a resposta de hoje sem fundamento amanhã.
 */
export function blocoLegislacao(achados) {
  if (!achados?.length) return null;
  return {
    tipo: BLOCO.LEGISLACAO, titulo: "Fundamento legal",
    linhas: achados.map((a) => linha(a.rotulo, a.trecho, a.peso === "INTERPRETATIVO"
      ? "Entendimento do fisco sobre os fatos daquele consulente — não é lei, e não vale como regra universal."
      : null)),
    fontes: achados.map((a) => ({ rotulo: a.norma, url: a.url, sha256: a.sha256 })),
  };
}

/**
 * ⚠⚠ A SITUAÇÃO DA REGRA ENTRA NO BLOCO, e os CINCO estados são preservados (o Codex apontou que
 * eu tinha esquecido ALTERADA e INDISPONIVEL): PENDENTE e ALTERADA orientam com ressalva à vista;
 * CONTESTADA e INDISPONIVEL bloqueiam. É a mesma política que já vale no simulador.
 */
export function blocoRegra(situacao) {
  if (!situacao) return null;
  return {
    tipo: BLOCO.REGRA, titulo: situacao.titulo ?? situacao.id,
    bloqueio: situacao.bloqueada ? situacao.motivo : null,
    linhas: [
      linha("Situação", situacao.situacao),
      linha("Conferência", situacao.motivo),
      ...(situacao.fonte ? [linha("Conferida contra", situacao.fonte)] : []),
    ],
    fontes: [],
  };
}

export function blocoSimulacao(r) {
  if (!r) return null;
  const linhas = [];
  if (r.cfop) linhas.push(linha("CFOP indicado", `${r.cfop.codigoFormatado} — ${r.cfop.resumo}`));
  if (r.ipi) linhas.push(linha("IPI", r.ipi.determinado ? r.ipi.rotulo : (r.ipi.motivo ?? "não determinado"), RESSALVA_TIPI));
  if (r.icms) linhas.push(linha("ICMS", r.icms.rotulo ?? r.icms.motivo ?? "não determinado", r.icms.ressalva ?? null));
  for (const a of r.alertas ?? []) linhas.push(linha(a.nivel === "alto" ? "⚠ Alerta" : "Atenção", a.texto));
  return {
    tipo: BLOCO.SIMULACAO, titulo: "Simulação da operação",
    bloqueio: r.validacao?.bloqueada ? r.validacao.motivo : null,
    linhas, fontes: [],
    // ⚠ A ficha só sai quando nenhuma regra bloqueia — o simulador já decide isso, aqui só repassa.
    ficha: r.ficha ?? null,
  };
}

/**
 * ⚠⚠ OS NOMES DOS CAMPOS SÃO `status` E `candidatos`, e eu quase escrevi `classificacao`/`evidencias`
 * — que é o defeito que já me pegou no §14: a tela sairia com "undefined" no lugar do aprovador,
 * que é justamente o campo que dá sentido ao registro inteiro. Conferido contra
 * `lib/fiscal/classificacao-produto.js` antes de escrever este bloco, não depois.
 */
export function blocoClassificacao(r) {
  if (!r) return null;
  return {
    tipo: BLOCO.CLASSIFICACAO, titulo: "Classificação registrada",
    linhas: [
      linha("Resultado", r.status),
      linha("Por quê", r.motivo),
      ...(r.candidatos ?? []).map((e) => linha(
        e.ncm ? `NCM ${e.ncm}` : "Verbete",
        `${e.padrao} — aprovado por ${e.aprovadoPor ?? "—"}`,
        e.fundamento ?? null,
      )),
    ],
    fontes: [],
    // ⚠⚠ NUNCA PREENCHE NCM. Correspondência textual LOCALIZA a decisão; não prova que ela fala
    // desta peça. Quem enquadra é quem conhece a peça — a regra é do motor e vale aqui também.
    aviso: "Isto é evidência de decisão humana registrada, não enquadramento automático.",
  };
}

// ─── A CONFERÊNCIA DA PROSA ──────────────────────────────────────────────────
//
// ⚠⚠⚠ O BRIEFING PROÍBE QUATRO INVENÇÕES POR NOME: alíquota, artigo legal, CFOP e NCM. Esta função
// procura exatamente essas quatro no texto do modelo e cobra que cada uma apareça nas evidências
// que as ferramentas devolveram. Não é redação: é conferência. O que não casa vira aviso na tela,
// porque apagar no meio da frase produziria um texto mutilado que ninguém entende — e o leitor
// precisa saber QUAL número não tem lastro, não receber um buraco.

const CFOP_NA_PROSA = /\b([1-7])[.\s]?(\d{3})\b/g;
const NCM_NA_PROSA = /\b(\d{4})[.\s]?(\d{2})[.\s]?(\d{2})\b/g;
const ARTIGO_NA_PROSA = /\bart(?:igo|\.)?\s*(\d{1,4})\b/gi;
const ALIQUOTA_NA_PROSA = /\b(\d{1,3}(?:[.,]\d{1,2})?)\s*%/g;

const soDigitos = (v) => String(v ?? "").replace(/\D/g, "");

/**
 * Tudo que as ferramentas realmente devolveram, achatado em conjuntos comparáveis.
 * ⚠ A evidência entra pelo CONTEÚDO dos blocos, não por uma lista paralela: lista paralela
 * desatualiza, e aí a conferência passa a aprovar o que não foi consultado.
 */
export function lastroDosBlocos(blocos = []) {
  const cru = JSON.stringify(blocos ?? []);
  const cfops = new Set();
  const ncms = new Set();
  const artigos = new Set();
  const aliquotas = new Set();
  for (const m of cru.matchAll(CFOP_NA_PROSA)) cfops.add(m[1] + m[2]);
  for (const m of cru.matchAll(NCM_NA_PROSA)) ncms.add(m[1] + m[2] + m[3]);
  for (const m of cru.matchAll(ARTIGO_NA_PROSA)) artigos.add(soDigitos(m[1]));
  for (const m of cru.matchAll(ALIQUOTA_NA_PROSA)) aliquotas.add(m[1].replace(",", "."));
  return { cfops, ncms, artigos, aliquotas };
}

/**
 * ⚠⚠ UM NÚMERO SEM LASTRO É UM ACHADO, NÃO UM ERRO FATAL. A resposta continua saindo — com os
 * blocos do servidor, que são o que vale — e o aviso diz qual citação não tem fonte. Derrubar a
 * resposta inteira faria o assistente parecer quebrado justamente quando ele está sendo honesto.
 */
export function conferirProsa(prosa, blocos = []) {
  const t = texto(prosa);
  if (!t) return { avisos: [] };
  const lastro = lastroDosBlocos(blocos);
  const avisos = [];
  const acusar = (o, q) => avisos.push({ tipo: o, citado: q });

  for (const m of t.matchAll(NCM_NA_PROSA)) {
    const n = m[1] + m[2] + m[3];
    if (!lastro.ncms.has(n)) acusar("NCM", `${m[1]}.${m[2]}.${m[3]}`);
  }
  // ⚠ O NCM é conferido ANTES do CFOP porque "8437.90.00" contém "8437", que casaria como CFOP.
  const semNcm = t.replace(NCM_NA_PROSA, " ");
  for (const m of semNcm.matchAll(CFOP_NA_PROSA)) {
    const c = m[1] + m[2];
    if (!lastro.cfops.has(c)) acusar("CFOP", `${m[1]}.${m[2]}`);
  }
  for (const m of t.matchAll(ARTIGO_NA_PROSA)) {
    if (!lastro.artigos.has(soDigitos(m[1]))) acusar("artigo", `art. ${m[1]}`);
  }
  for (const m of t.matchAll(ALIQUOTA_NA_PROSA)) {
    const a = m[1].replace(",", ".");
    if (!lastro.aliquotas.has(a)) acusar("alíquota", `${m[1]}%`);
  }
  return { avisos };
}
