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
  DOCUMENTO: "DOCUMENTO",
  AUDITORIA: "AUDITORIA",
};

/**
 * ⚠⚠⚠ DE ONDE VEIO CADA CÓDIGO — e isto separa TRANSCREVER de RECOMENDAR (parecer de segurança do
 * Codex, 24/09/2026). Com um XML anexado, o CFOP da própria nota entra na conversa. Se ele valesse
 * como lastro igual ao de uma regra, o modelo poderia recomendar o CFOP da REMESSA para o RETORNO e
 * nada acusaria — que é exatamente o erro que o §16 do briefing proíbe: *"não recomendar o mesmo
 * CFOP de retorno para operações distintas apenas porque ambas são chamadas de remessa"*.
 *
 * DOCUMENTO respalda "a nota declara X"; só REGRA, LEI e TIPI respaldam "use X".
 */
export const ORIGEM = { REGRA: "REGRA", LEI: "LEI", TIPI: "TIPI", DOCUMENTO: "DOCUMENTO" };

/** Normaliza alíquota para comparar "5", "5,00" e "5.0" como o mesmo número. */
export const numeroDeAliquota = (v) => {
  const n = Number.parseFloat(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? String(n) : null;
};

/**
 * ⚠⚠ O LASTRO É TIPADO E EXPLÍCITO — preenchido a partir dos CAMPOS de cada resultado, nunca de um
 * `JSON.stringify` do bloco. Varrendo o JSON, qualquer número dentro do TEXTO de um artigo de lei
 * ou da descrição livre de uma nota virava "comprovado": o art. 406 cita o 407 no corpo, e o modelo
 * que citasse o 407 sem tê-lo recuperado passava limpo.
 */
export const lastro = (origem, { cfops = [], ncms = [], artigos = [], aliquotas = [], csts = [] } = {}) => ({
  origem,
  cfops: cfops.map((c) => String(c ?? "").replace(/\D/g, "")).filter((c) => c.length === 4),
  ncms: ncms.map((c) => String(c ?? "").replace(/\D/g, "")).filter((c) => c.length === 8),
  artigos: artigos.map((a) => String(a ?? "").replace(/\D/g, "")).filter(Boolean),
  aliquotas: aliquotas.map(numeroDeAliquota).filter(Boolean),
  csts: csts.map((c) => String(c ?? "").replace(/\D/g, "")).filter(Boolean),
});

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
    lastro: lastro(ORIGEM.TIPI, {
      ncms: [r.ncm ?? r.ncmFormatado],
      aliquotas: [r.geral?.ipi?.valor, ...(r.excecoes ?? []).map((e) => e.ipi?.valor)],
    }),
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
    lastro: lastro(ORIGEM.REGRA, { cfops: [c.codigo] }),
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
    // ⚠ O artigo sai do RÓTULO ("Artigo 406, II" → 406), não do corpo: citação cruzada dentro do
    // texto ("nos termos do artigo 407") não prova que o 407 foi recuperado.
    lastro: lastro(ORIGEM.LEI, { artigos: achados.map((a) => /artigo\s*(\d+)/i.exec(a.rotulo ?? "")?.[1]) }),
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
    lastro: lastro(ORIGEM.REGRA, { cfops: [/^cfop:(\d{4})$/.exec(situacao.id ?? "")?.[1]] }),
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
    lastro: lastro(ORIGEM.REGRA, {
      cfops: [r.cfop?.codigo],
      aliquotas: [r.ipi?.determinado ? r.ipi.valor : null, r.icms?.aliquota],
    }),
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
    lastro: lastro(ORIGEM.REGRA, { ncms: (r.candidatos ?? []).map((e) => e.ncm) }),
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
// ⚠ CST só quando vem ROTULADO ("CST 50", "CST IPI 53"): dois dígitos soltos são quantidade de peça,
// dia do mês, número de item — varrer isso acusaria metade de qualquer resposta.
const CST_NA_PROSA = /\bCST\s*(?:de\s+)?(?:IPI|ICMS|PIS|COFINS)?\s*(\d{2,3})\b/gi;

const TIPOS = ["cfops", "ncms", "artigos", "aliquotas", "csts"];

/**
 * Tudo que as ferramentas realmente devolveram, com a ORIGEM de cada código.
 * ⚠⚠ Lê SÓ o campo `lastro` de cada bloco — nunca o JSON inteiro (ver `lastro()` acima).
 * Devolve, por tipo, um Map código → Set de origens.
 */
export function lastroDosBlocos(blocos = []) {
  const saida = Object.fromEntries(TIPOS.map((t) => [t, new Map()]));
  for (const b of blocos ?? []) {
    const l = b?.lastro;
    if (!l) continue;
    for (const t of TIPOS) {
      for (const cod of l[t] ?? []) {
        if (!saida[t].has(cod)) saida[t].set(cod, new Set());
        saida[t].get(cod).add(l.origem);
      }
    }
  }
  return saida;
}

const ROTULO_TIPO = { cfops: "CFOP", ncms: "NCM", artigos: "artigo", aliquotas: "alíquota", csts: "CST" };

/**
 * ⚠⚠ UM NÚMERO SEM LASTRO É UM ACHADO, NÃO UM ERRO FATAL. A resposta continua saindo — com os
 * blocos do servidor, que são o que vale — e o aviso diz qual citação não tem fonte.
 *
 * ⚠⚠⚠ E UM NÚMERO QUE SÓ EXISTE NO DOCUMENTO ANEXADO VIRA AVISO PRÓPRIO (`soDocumento`). Ele pode
 * estar sendo TRANSCRITO ("a nota foi emitida com o 5.915") — legítimo — ou RECOMENDADO ("use o
 * 5.915 no retorno") — o erro do §16. Regex não distingue as duas frases; por isso o portal não
 * cala nem acusa de invenção: ele avisa que aquele código vem da nota, não de uma regra consultada,
 * e quem lê decide se era transcrição.
 */
export function conferirProsa(prosa, blocos = []) {
  const t = texto(prosa);
  if (!t) return { avisos: [] };
  const l = lastroDosBlocos(blocos);
  const avisos = [];
  const vistos = new Set();
  const conferir = (tipo, codigo, citado) => {
    const chave = `${tipo}:${codigo}`;
    if (vistos.has(chave)) return;
    vistos.add(chave);
    const origens = l[tipo].get(codigo);
    if (!origens) { avisos.push({ tipo: ROTULO_TIPO[tipo], citado }); return; }
    if (origens.size === 1 && origens.has(ORIGEM.DOCUMENTO)) {
      avisos.push({ tipo: ROTULO_TIPO[tipo], citado, soDocumento: true });
    }
  };

  for (const m of t.matchAll(NCM_NA_PROSA)) conferir("ncms", m[1] + m[2] + m[3], `${m[1]}.${m[2]}.${m[3]}`);
  // ⚠ O NCM é varrido ANTES do CFOP e removido: "5101.00.00" contém "5101", e sem isso todo NCM
  // legítimo viraria um CFOP inventado.
  const semNcm = t.replace(NCM_NA_PROSA, " ");
  for (const m of semNcm.matchAll(CFOP_NA_PROSA)) conferir("cfops", m[1] + m[2], `${m[1]}.${m[2]}`);
  for (const m of t.matchAll(ARTIGO_NA_PROSA)) conferir("artigos", m[1].replace(/\D/g, ""), `art. ${m[1]}`);
  for (const m of t.matchAll(ALIQUOTA_NA_PROSA)) {
    const n = numeroDeAliquota(m[1]);
    if (n) conferir("aliquotas", n, `${m[1]}%`);
  }
  for (const m of t.matchAll(CST_NA_PROSA)) conferir("csts", m[1], `CST ${m[1]}`);
  return { avisos };
}
