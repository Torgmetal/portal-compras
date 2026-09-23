import "server-only";
import { prisma } from "@/lib/prisma";
import { textoDeBusca } from "@/lib/fiscal/tipi-planilha";

// ─── A CONSULTA QUE A TELA FAZ ───────────────────────────────────────────────
//
// ⚠⚠ TODA RESPOSTA DECLARA DE ONDE VEIO E O QUE NÃO SABE. É o contrato do módulo: a IA pode
// explicar, a fonte é que decide, e o que a fonte não diz sai como pendência — nunca como um
// número plausível. Ver os três contratos no topo do bloco fiscal do `schema.prisma`.

const soDigitos = (v) => String(v ?? "").replace(/\D/g, "");

/** `84379000` → `8437.90.00`. ⚠ Só formata o que TEM 8 dígitos; o resto sai como veio. */
export const formatarNcm = (c) => {
  const d = soDigitos(c);
  return d.length === 8 ? `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6)}` : String(c ?? "");
};

/** A referência que o portal está servindo — e o que ela NÃO prova. */
export async function referenciaAtiva() {
  const [tipi, ncm] = await Promise.all([
    prisma.fiscalTipiVersao.findFirst({ where: { status: "ATIVA" }, include: { arquivo: true } }),
    prisma.fiscalNcmVersao.findFirst({ where: { status: "ATIVA" }, include: { arquivo: true } }),
  ]);
  return {
    tipi: tipi && {
      id: tipi.id, totalNcm: tipi.totalNcm, parserVersao: tipi.parserVersao,
      observadoEm: tipi.observadoEm, aprovadoEm: tipi.aprovadoEm,
      // ⚠⚠ ATIVA NÃO É VIGENTE — a TIPI não declara vigência dentro do arquivo, e a tela precisa
      // dizer isso em vez de deixar o leitor supor que o portal conferiu a data.
      vigenciaInicio: tipi.vigenciaInicio, vigenciaFundamento: tipi.vigenciaFundamento,
      vigenciaDeclarada: Boolean(tipi.vigenciaInicio),
      fonte: { url: tipi.arquivo.url, sha256: tipi.arquivo.sha256, bytes: tipi.arquivo.bytes, baixadoEm: tipi.arquivo.baixadoEm },
    },
    ncm: ncm && {
      id: ncm.id, totalCodigos: ncm.totalCodigos, observadoEm: ncm.observadoEm,
      // ⚠ A NCM, ao contrário da TIPI, DECLARA o ato e a vigência por código.
      atoDeclarado: ncm.atoDeclarado,
      fonte: { url: ncm.arquivo.url, sha256: ncm.arquivo.sha256, baixadoEm: ncm.arquivo.baixadoEm },
    },
  };
}

/**
 * A BUSCA — por código ou por descrição, sem o usuário escolher qual.
 *
 * ⚠ Dígito manda: quem digita "8437" quer o código, não as descrições que contenham o número.
 * ⚠⚠ A busca textual usa a coluna `busca` (caminho hierárquico, sem acento). A descrição da folha
 * sozinha não serve — 23% dos NCMs se descrevem só como "Outros". Ver `comCaminho`.
 */
/**
 * ⚠⚠ `plainto_tsquery` EXIGE PALAVRA INTEIRA, E ISSO MATA UM AUTOCOMPLETE. Medido em 22/09/2026
 * contra a produção: "constru" devolvia **0**; "constru:*" devolve **96**; "estrutur:*", **413**.
 * Quem digita progressivamente passa a maior parte do tempo com uma palavra pela metade — a lista
 * ficaria vazia justamente enquanto a pessoa está escrevendo, que é quando ela precisa da lista.
 *
 * ⚠⚠ E NÃO É SÓ TRUNCAR: o stem de "construções" é `construco`, não `constru`. Por isso o prefixo
 * vai no ÚLTIMO termo com `:*` (que o Postgres casa contra o stem indexado) e os anteriores entram
 * inteiros com `&` — quem já terminou de digitar uma palavra quis aquela palavra.
 *
 * ⚠ A entrada é saneada para `[a-z0-9]`: `to_tsquery` tem SINTAXE PRÓPRIA (`&`, `|`, `!`, `:`,
 * parênteses) e um apóstrofo ou dois-pontos do usuário viraria erro de sintaxe no banco, não
 * "nenhum resultado".
 *
 * ⚠ Exportada só para teste: ela não fala com banco, e testar a regra por `buscarNcm` exigiria
 * conexão — e nenhum teste deste projeto toca o banco (ver o aviso no CLAUDE.md).
 */
export function prefixoTsquery(termo) {
  const termos = textoDeBusca(termo).split(/[^a-z0-9]+/).filter(Boolean);
  if (!termos.length) return null;
  return {
    // Palavra inteira, com radical: resolve singular/plural ("construção" acha "construções").
    estemado: termos.join(" & "),
    // ⚠⚠ PREFIXO EM TODOS OS TERMOS, contra `simple`. Em `portuguese` o `:*` não passa pelo
    // stemmer: "metalicas" vira o lexema `metal`, e `metalic:*` procura algo começando em
    // "metalic" — nunca casa. Em `simple` não há radical, e o prefixo funciona letra a letra.
    // ⚠ E o prefixo vai em TODOS, não só no último: "estrutura metalic" precisa casar
    // "estruturas metalicas", e `estrutura` sozinho já não é prefixo de nada em `simple`.
    literal: termos.map((t) => `${t}:*`).join(" & "),
  };
}

export async function buscarNcm(termo, { limite = 25 } = {}) {
  const t = String(termo ?? "").trim();
  if (t.length < 2) return { termo: t, resultados: [], motivo: "Digite ao menos 2 caracteres." };

  const ref = await referenciaAtiva();
  if (!ref.tipi) return { termo: t, resultados: [], motivo: "Nenhuma versão da TIPI foi importada ainda." };

  const digitos = soDigitos(t);
  const porCodigo = digitos.length >= 2 && digitos.length >= t.replace(/[\s.]/g, "").length;

  const linhas = porCodigo
    ? await prisma.$queryRaw`
        SELECT "codigo","codigoFormatado","ex","descricao","descricaoCompleta","aliquotaTipo","aliquotaValor","aliquotaBruto"
        FROM "FiscalTipiLinha"
        WHERE "versaoId" = ${ref.tipi.id} AND "nivel" = 'NCM' AND "codigo" LIKE ${`${digitos}%`}
        ORDER BY "codigo", "ex" LIMIT ${limite}`
    : await buscarPorTexto(ref.tipi.id, t, limite);

  return { termo: t, porCodigo, resultados: linhas.map(paraTela), referencia: ref };
}

/**
 * ⚠⚠ ORDENAR PELA POSIÇÃO NA TIPI É ORDENAR POR NADA. Visto na validação do autocomplete
 * (22/09/2026): digitando "constru", o primeiro resultado era **2515.11.00 — mármores e granitos**,
 * porque a palavra "construção" aparece na descrição dele e o 25 vem antes do 94 na tabela. Quem
 * digita "constru" quer o 9406 ou o 7308. Numa lista de oito linhas, a ordem É o resultado.
 *
 * ⚠ `ts_rank` pesa frequência e proximidade dos termos; a ordem da TIPI fica como desempate, para
 * a saída continuar estável entre chamadas iguais.
 */
async function buscarPorTexto(versaoId, t, limite) {
  const q = prefixoTsquery(t);
  if (!q) return [];
  // ⚠⚠ UNION, NÃO `OR`. Medido em 22/09/2026: com os dois `@@` num `OR`, o planejador ABANDONA os
  // dois GIN e varre as 11.103 linhas calculando `to_tsvector` em cada uma — 548 ms. Em UNION cada
  // ramo é uma consulta indexável por si, e os dois índices entram: **0,4 ms**.
  return prisma.$queryRaw`
    WITH casaram AS (
      SELECT "id" FROM "FiscalTipiLinha"
       WHERE "versaoId" = ${versaoId} AND "nivel" = 'NCM'
         AND to_tsvector('simple', "busca") @@ to_tsquery('simple', ${q.literal})
      UNION
      SELECT "id" FROM "FiscalTipiLinha"
       WHERE "versaoId" = ${versaoId} AND "nivel" = 'NCM'
         AND to_tsvector('portuguese', "busca") @@ to_tsquery('portuguese', ${q.estemado})
    )
    SELECT l."codigo", l."codigoFormatado", l."ex", l."descricao", l."descricaoCompleta",
           l."aliquotaTipo", l."aliquotaValor", l."aliquotaBruto"
    FROM "FiscalTipiLinha" l JOIN casaram c ON c."id" = l."id"
    ORDER BY ts_rank(to_tsvector('simple', l."busca"), to_tsquery('simple', ${q.literal})) DESC,
             ts_rank(to_tsvector('portuguese', l."busca"), to_tsquery('portuguese', ${q.estemado})) DESC,
             l."ordem"
    LIMIT ${limite}`;
}

const paraTela = (l) => ({
  ncm: l.codigo,
  ncmFormatado: l.codigoFormatado,
  ex: l.ex || null,
  descricao: l.descricao,
  descricaoCompleta: l.descricaoCompleta,
  ipi: aliquotaParaTela(l),
});

/**
 * ⚠⚠ A ALÍQUOTA SAI COM O TIPO, SEMPRE. `NT` (não tributado — fora do campo de incidência), `0%`
 * (tributado a zero) e ausência são TRÊS coisas diferentes, e a tela precisa poder distingui-las.
 * Devolver só o número faria as três aparecerem como "0%".
 */
function aliquotaParaTela(l) {
  if (l.aliquotaTipo === "NT") return { tipo: "NT", valor: null, rotulo: "NT — não tributado", bruto: l.aliquotaBruto };
  if (l.aliquotaTipo === "PERCENTUAL") return { tipo: "PERCENTUAL", valor: l.aliquotaValor, rotulo: `${String(l.aliquotaValor).replace(".", ",")}%`, bruto: l.aliquotaBruto };
  return { tipo: "AUSENTE", valor: null, rotulo: "não declarada na TIPI", bruto: l.aliquotaBruto };
}

/**
 * O DETALHE DE UM NCM — todas as linhas dele (a geral e cada Ex), mais o que a NCM oficial diz.
 *
 * ⚠⚠ Ex DESCONHECIDO NÃO SIGNIFICA GERAL (contrato 2). Com o código sozinho não dá para escolher
 * entre a alíquota geral e a de uma exceção — o `1211.20.00` é `NT` na geral e `0%` no `Ex 01`. Por
 * isso vêm TODAS, e a tela mostra lado a lado em vez de eleger uma.
 */
export async function detalharNcm(codigo) {
  const d = soDigitos(codigo);
  if (d.length !== 8) return { erro: "O NCM tem 8 dígitos." };
  const ref = await referenciaAtiva();
  if (!ref.tipi) return { erro: "Nenhuma versão da TIPI foi importada ainda." };

  const [linhas, oficial, hierarquia] = await Promise.all([
    prisma.fiscalTipiLinha.findMany({
      where: { versaoId: ref.tipi.id, codigo: d, nivel: "NCM" }, orderBy: { ex: "asc" },
    }),
    ref.ncm ? prisma.fiscalNcmCodigo.findUnique({ where: { versaoId_codigo: { versaoId: ref.ncm.id, codigo: d } } }) : null,
    // Capítulo, posição e subposição — o caminho que dá sentido à folha.
    ref.ncm ? prisma.fiscalNcmCodigo.findMany({
      where: { versaoId: ref.ncm.id, codigo: { in: [d.slice(0, 2), d.slice(0, 4), d.slice(0, 6)] } },
      orderBy: { codigo: "asc" },
    }) : [],
  ]);

  if (!linhas.length) {
    return { erro: `O NCM ${formatarNcm(d)} não existe na TIPI ativa.`, referencia: ref, existeNaNcmOficial: Boolean(oficial) };
  }

  return {
    ncm: d,
    ncmFormatado: formatarNcm(d),
    descricaoCompleta: linhas[0].descricaoCompleta,
    capitulo: hierarquia.find((h) => h.codigo.length === 2) ?? null,
    posicao: hierarquia.find((h) => h.codigo.length === 4) ?? null,
    subposicao: hierarquia.find((h) => h.codigo.length === 6) ?? null,
    // ⚠ Geral e Ex vêm separados e rotulados: a tela NUNCA escolhe uma por conta própria.
    geral: linhas.filter((l) => !l.ex).map(paraTela)[0] ?? null,
    excecoes: linhas.filter((l) => l.ex).map(paraTela),
    oficialNcm: oficial && {
      descricao: oficial.descricao,
      // ⚠⚠ ESTA vigência é da NOMENCLATURA, não da alíquota. A NCM declara; a TIPI não.
      vigenciaInicio: oficial.vigenciaInicio, vigenciaFim: oficial.vigenciaFim,
      ato: [oficial.atoTipo, oficial.atoNumero, oficial.atoAno].filter(Boolean).join(" "),
    },
    referencia: ref,
  };
}

/**
 * ⚠⚠ A CONSULTA HISTÓRICA RESPONDE "INDISPONÍVEL", E ISSO É O CERTO (parecer do Codex, 22/09/2026).
 *
 * "Qual era o IPI em 14/09/2026?" só tem resposta se alguma versão declarar cobertura para aquela
 * data — e a TIPI não declara vigência dentro do arquivo. Resolver pela data de IMPORTAÇÃO
 * fabricaria uma conclusão temporal sem fundamento, que é pior que não responder: quem audita uma
 * nota antiga levaria um número com cara de oficial.
 */
export async function ipiNaData(codigo, data) {
  const d = soDigitos(codigo);
  const quando = data instanceof Date ? data : new Date(data);
  const versao = await prisma.fiscalTipiVersao.findFirst({
    where: {
      status: { in: ["ATIVA", "SUBSTITUIDA"] },
      vigenciaInicio: { not: null, lte: quando },
      OR: [{ vigenciaFim: null }, { vigenciaFim: { gte: quando } }],
    },
    orderBy: { vigenciaInicio: "desc" },
  });
  if (!versao) {
    return {
      indisponivel: true,
      motivo: "Nenhuma versão da TIPI tem vigência declarada que cubra esta data. O arquivo da Receita não declara vigência, e o portal não deduz — a validade precisa ser registrada por quem tem o fundamento legal.",
    };
  }
  const linhas = await prisma.fiscalTipiLinha.findMany({ where: { versaoId: versao.id, codigo: d, nivel: "NCM" }, orderBy: { ex: "asc" } });
  return { versaoId: versao.id, vigenciaInicio: versao.vigenciaInicio, fundamento: versao.vigenciaFundamento, linhas: linhas.map(paraTela) };
}
