import "server-only";
import { randomUUID } from "node:crypto";
import { prismaDirect } from "@/lib/prisma";
import { lerTipi, comCaminho, aliquotasConsultaveis, NIVEL } from "@/lib/fiscal/tipi-planilha";

// ─── A IMPORTAÇÃO DA TIPI: BAIXAR → VALIDAR → CARREGAR → PROMOVER ────────────
//
// ⚠⚠ NUNCA APAGAR A VIGENTE ANTES DE A NOVA ESTAR INTEIRA. A versão nova nasce `IMPORTANDO`, é
// carregada e validada, e só então a promoção troca a referência ativa numa transação CURTA. Uma
// leitura que caísse no meio da carga veria uma TIPI pela metade — e responderia "NCM não
// encontrado" sobre um código que existe.
//
// ⚠⚠ E "ATIVA" NÃO SIGNIFICA "VIGENTE". Ativa é a referência OPERACIONAL escolhida pelo portal.
// A validade normativa mora em `vigenciaInicio/Fim` e nasce NULA, porque o arquivo da Receita não
// a declara — ver o contrato no topo do bloco fiscal do `schema.prisma`.

/**
 * ⚠ A VERSÃO DO PARSER ENTRA NA IDENTIDADE DA IMPORTAÇÃO. O mesmo arquivo lido por outro código
 * pode dar outra leitura; sem isto, um apontamento de auditoria antigo não se reproduz. Suba este
 * número sempre que a leitura mudar de comportamento.
 */
export const PARSER_VERSAO = "tipi-3";

/** Quantas linhas por `INSERT`. ⚠ Pequeno de propósito: o Neon deste projeto satura de RAM em
 *  escrita em massa (ver o aviso do CLAUDE.md). 400 × ~28 colunas cabe folgado num statement. */
const LOTE = 400;

/**
 * O ARTEFATO — a evidência imutável, reaproveitada quando o conteúdo não mudou.
 *
 * ⚠⚠ MESMO SHA NÃO VIRA ARQUIVO NOVO. Sem isso, a verificação diária criaria uma versão por dia:
 * ~11 mil linhas × 365 = quatro milhões de linhas por ano para guardar o mesmo conteúdo.
 */
export async function guardarArtefato(baixado) {
  const achado = await prismaDirect.fiscalFonteArquivo.findUnique({
    where: { fonte_sha256: { fonte: baixado.fonte, sha256: baixado.sha256 } },
  });
  if (achado) return { arquivo: achado, jaExistia: true };
  const arquivo = await prismaDirect.fiscalFonteArquivo.create({
    data: {
      fonte: baixado.fonte, url: baixado.url, sha256: baixado.sha256,
      bytes: baixado.bytes, contentType: baixado.contentType ?? null,
      atoDeclarado: baixado.atoDeclarado ?? null,
    },
  });
  return { arquivo, jaExistia: false };
}

/**
 * A VALIDAÇÃO, antes de qualquer escrita de linha.
 *
 * ⚠⚠ MUDANÇA GRANDE DE VOLUME É SINAL DE LAYOUT DIFERENTE, não de a Receita ter reclassificado
 * metade do mundo. O baseline medido em 22/09/2026 é 11.103 NCMs; uma queda para 200 significa que
 * o parser leu outra coisa. O corte é FOLGADO de propósito (±40%): ele é rede contra desastre, não
 * controle de qualidade — reclassificações reais são de dezenas de códigos, não de milhares.
 */
export function validarLeitura(leitura, { ncmsAnteriores = 0 } = {}) {
  const recusas = [...leitura.problemas];
  const ncms = leitura.itens.filter((i) => i.nivel === NIVEL.NCM);
  if (!ncms.length) recusas.push({ linha: null, motivo: "Nenhum NCM de 8 dígitos foi lido — o layout da Receita mudou." });
  if (ncmsAnteriores > 0 && ncms.length > 0) {
    const variacao = Math.abs(ncms.length - ncmsAnteriores) / ncmsAnteriores;
    if (variacao > 0.4) {
      recusas.push({ linha: null, motivo: `A quantidade de NCMs saltou de ${ncmsAnteriores} para ${ncms.length} (${Math.round(variacao * 100)}%) — revise antes de promover.` });
    }
  }
  const { problemas: dosDuplicados } = aliquotasConsultaveis(leitura.itens);
  recusas.push(...dosDuplicados);
  return { ok: recusas.length === 0, recusas, totalNcm: ncms.length };
}

/**
 * Carrega as linhas da versão.
 *
 * ⚠⚠ STATEMENT CONSTANTE COM `UNNEST` DE ARRAYS-LITERAIS DE TEXTO — é o padrão obrigatório deste
 * projeto para escrita em massa (`/api/mes/sync-ordens`). SQL com valores embutidos gera um plano
 * diferente por lote e estoura o `CachedPlanQuery` do Neon; array JS direto vai em binário e o
 * Postgres devolve `22P03`.
 */
async function carregarLinhas(versaoId, itens) {
  const lit = (vs) => `{${vs.map((v) => (v == null ? "NULL" : `"${String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`)).join(",")}}`;
  let gravadas = 0;
  for (let i = 0; i < itens.length; i += LOTE) {
    const fatia = itens.slice(i, i + LOTE);
    // ⚠⚠ `linhasDeOrigem` VAI COMO TEXTO E É CONVERTIDA NA PROJEÇÃO. `UNNEST` de `int[][]` no
    // Postgres ACHATA a matriz inteira — devolveria um número por linha, não um array por linha, e
    // a contagem de linhas do INSERT explodiria. Por isso cada valor viaja como o literal "{4,5}"
    // num `text[]` e só vira `int[]` no SELECT.
    await prismaDirect.$executeRaw`
      INSERT INTO "FiscalTipiLinha"
        ("id","versaoId","ordem","nivel","codigo","codigoFormatado","ex","descricao",
         "aliquotaTipo","aliquotaValor","aliquotaBruto","linhasDeOrigem","descricaoCompleta","busca")
      SELECT t.id, t.versao, t.ordem, t.nivel, t.codigo, t.formatado, t.ex, t.descricao,
             t.tipo, t.valor, t.bruto, t.origem::int[], t.completa, t.busca
      FROM UNNEST(
        ${lit(fatia.map(() => randomUUID()))}::text[],
        ${lit(fatia.map(() => versaoId))}::text[],
        ${lit(fatia.map((_, k) => i + k))}::int[],
        ${lit(fatia.map((x) => x.nivel))}::text[],
        ${lit(fatia.map((x) => x.codigo))}::text[],
        ${lit(fatia.map((x) => x.codigoFormatado))}::text[],
        ${lit(fatia.map((x) => x.ex))}::text[],
        ${lit(fatia.map((x) => x.descricao))}::text[],
        ${lit(fatia.map((x) => x.aliquota.tipo))}::text[],
        ${lit(fatia.map((x) => x.aliquota.valor))}::double precision[],
        ${lit(fatia.map((x) => x.aliquota.bruto))}::text[],
        ${lit(fatia.map((x) => `{${x.linhasDeOrigem.join(",")}}`))}::text[],
        ${lit(fatia.map((x) => x.descricaoCompleta))}::text[],
        ${lit(fatia.map((x) => x.busca))}::text[]
      ) AS t(id, versao, ordem, nivel, codigo, formatado, ex, descricao, tipo, valor, bruto, origem, completa, busca)`;
    gravadas += fatia.length;
  }
  return gravadas;
}

/**
 * A PROMOÇÃO — curta, condicionada, e a única coisa que muda o que o portal serve.
 *
 * ⚠⚠ A TROCA É CONDICIONADA NO PRÓPRIO UPDATE, não só na leitura: entre ler "quem está ativa" e
 * gravar, outra importação pode ter promovido a sua. O índice parcial `FiscalTipiVersao_uma_ativa`
 * é o backstop no banco; isto aqui é o que evita chegar lá com duas candidatas.
 *
 * ⚠ A versão anterior vira `SUBSTITUIDA`, nunca é apagada: é dela que sai a resposta sobre o
 * passado, e é ela que continua servindo se a próxima importação falhar.
 */
export async function promover(versaoId, { aprovadoPorId = null } = {}) {
  return prismaDirect.$transaction(async (tx) => {
    const nova = await tx.fiscalTipiVersao.findUnique({ where: { id: versaoId } });
    if (!nova) return { erro: "Versão não encontrada." };
    if (nova.status === "ATIVA") return { jaEstava: true, versao: nova };
    if (nova.status !== "VALIDADA") return { erro: `Só uma versão VALIDADA pode ser promovida (esta está ${nova.status}).` };

    await tx.fiscalTipiVersao.updateMany({ where: { status: "ATIVA" }, data: { status: "SUBSTITUIDA" } });
    const { count } = await tx.fiscalTipiVersao.updateMany({
      where: { id: versaoId, status: "VALIDADA" },
      data: { status: "ATIVA", aprovadoEm: new Date(), aprovadoPorId },
    });
    if (!count) return { erro: "A versão mudou de estado durante a promoção — nada foi trocado." };
    return { versao: await tx.fiscalTipiVersao.findUnique({ where: { id: versaoId } }) };
  }, { maxWait: 10_000, timeout: 20_000 });
}

/**
 * A importação inteira, do arquivo já baixado até a versão pronta para promover.
 *
 * ⚠ Ela NÃO promove sozinha: devolve a versão `VALIDADA` e quem chamou decide. O cron promove
 * quando a validação passou limpa; o painel do ADMIN mostra as recusas quando não.
 */
export async function importarTipi({ baixado, linhasDaPlanilha }) {
  const { arquivo, jaExistia } = await guardarArtefato(baixado);

  // ⚠ Mesmo conteúdo E já importado por este parser: nada a fazer. Dizer "sem mudança" é resultado,
  // não falha — e é o caminho da esmagadora maioria das verificações diárias.
  if (jaExistia) {
    const anterior = await prismaDirect.fiscalTipiVersao.findFirst({
      where: { arquivoId: arquivo.id, parserVersao: PARSER_VERSAO, status: { in: ["ATIVA", "VALIDADA", "SUBSTITUIDA"] } },
      orderBy: { observadoEm: "desc" },
    });
    if (anterior) return { semMudanca: true, arquivo, versao: anterior };
  }

  const bruta = lerTipi(linhasDaPlanilha);
  // ⚠ O caminho hierárquico entra AQUI: é ele que a busca textual indexa.
  const leitura = { ...bruta, itens: comCaminho(bruta.itens) };
  const ativa = await prismaDirect.fiscalTipiVersao.findFirst({ where: { status: "ATIVA" } });
  const validacao = validarLeitura(leitura, { ncmsAnteriores: ativa?.totalNcm ?? 0 });

  const versao = await prismaDirect.fiscalTipiVersao.create({
    data: {
      arquivoId: arquivo.id, parserVersao: PARSER_VERSAO, status: "IMPORTANDO",
      totalLinhas: leitura.itens.length,
      totalNcm: validacao.totalNcm,
      totalHierarquia: leitura.itens.filter((i) => i.nivel === NIVEL.HIERARQUIA).length,
      problemas: validacao.recusas.length ? validacao.recusas.slice(0, 200) : undefined,
    },
  });

  if (!validacao.ok) {
    await prismaDirect.fiscalTipiVersao.update({ where: { id: versao.id }, data: { status: "REJEITADA" } });
    return { rejeitada: true, arquivo, versao, recusas: validacao.recusas };
  }

  const gravadas = await carregarLinhas(versao.id, leitura.itens);
  const conferida = await prismaDirect.fiscalTipiLinha.count({ where: { versaoId: versao.id } });
  // ⚠ Conferir o que o BANCO tem, não o que o laço achou que gravou — carga parcial promovida é
  // referência incompleta servida como completa.
  if (conferida !== leitura.itens.length) {
    await prismaDirect.fiscalTipiVersao.update({ where: { id: versao.id }, data: { status: "REJEITADA", problemas: [{ linha: null, motivo: `Carga incompleta: ${conferida} de ${leitura.itens.length} linhas.` }] } });
    return { rejeitada: true, arquivo, versao, recusas: [{ motivo: `Carga incompleta: ${conferida} de ${leitura.itens.length}.` }] };
  }

  const validada = await prismaDirect.fiscalTipiVersao.update({ where: { id: versao.id }, data: { status: "VALIDADA" } });
  return { arquivo, versao: validada, gravadas };
}
