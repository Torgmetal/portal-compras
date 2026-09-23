import "server-only";
import { prisma } from "@/lib/prisma";
import { ordenarDispositivos, expandir } from "@/lib/fiscal/assistente/ranking";

// ─── A RECUPERAÇÃO DA BASE JURÍDICA ──────────────────────────────────────────
//
// ⚠⚠ MUDEI DE IDEIA SOBRE O ÍNDICE GIN, E O MOTIVO É UM NÚMERO. Eu tinha proposto criar um índice
// GIN novo sobre `FiscalDispositivo` — e o Codex apontou a contradição: isso é ALTERAR TABELA
// EXISTENTE, justamente o que eu tinha dito que não faria. Medido na produção em 23/09/2026: o
// corpus jurídico inteiro são **298 dispositivos / 129.434 caracteres**. Isso cabe em memória com
// folga, então a recuperação é feita em JS sobre uma leitura cacheada, e o banco não ganha índice
// nenhum. Menos DDL, menos carga no Neon (que já deu OOM 53200), e o ranking vira função pura
// testável — que era impossível quando morava dentro de um `to_tsquery`.
//
// ⚠⚠ E CABER NA JANELA NÃO É O ARGUMENTO (parecer do Codex). Eu quase usei "cabe em 37 mil tokens,
// então mando tudo". Mandar o corpus inteiro a cada rodada é caro E pior: o modelo teria de achar o
// dispositivo sozinho no meio de 298. A recuperação continua existindo para ENTREGAR POUCO.

/** ⚠ TTL curto: a legislação muda por importação, e importação é rara. 5 min basta para não
 *  reler 298 linhas a cada mensagem sem deixar uma coleta nova esperando meia hora. */
const TTL_MS = 5 * 60 * 1000;
let cache = null;

/**
 * O corpus vigente: só dispositivos de versões ATIVAS.
 * ⚠⚠ VERSÃO SUPERADA NÃO ENTRA. O texto antigo continua no banco porque sustenta o apontamento que
 * saiu ontem — mas responder HOJE com a redação revogada seria o erro que o módulo inteiro existe
 * para evitar.
 */
export async function corpusVigente() {
  if (cache && Date.now() - cache.em < TTL_MS) return cache.itens;
  const versoes = await prisma.fiscalNormaVersao.findMany({
    where: { status: "ATIVA" },
    select: {
      id: true, sha256: true, coletadoEm: true,
      norma: { select: { chave: true, titulo: true, norma: true, url: true, tipo: true, peso: true, orgao: true } },
      dispositivos: { select: { id: true, rotulo: true, artigo: true, tipo: true, texto: true, ordem: true } },
    },
  });
  const itens = versoes.flatMap((v) => v.dispositivos.map((d) => ({
    id: d.id, rotulo: d.rotulo, artigo: d.artigo, tipo: d.tipo, texto: d.texto, ordem: d.ordem,
    versaoId: v.id, sha256: v.sha256, coletadoEm: v.coletadoEm,
    normaChave: v.norma.chave, norma: v.norma.titulo, normaCompleta: v.norma.norma,
    url: v.norma.url, normaTipo: v.norma.tipo, peso: v.norma.peso, orgao: v.norma.orgao,
  })));
  cache = { em: Date.now(), itens };
  return itens;
}

/** ⚠ Só para teste e para a rota de sincronização: a importação de norma nova invalida o cache. */
export const esquecerCorpus = () => { cache = null; };

/**
 * ⚠⚠ O INCISO SOZINHO PODE OMITIR A EXCEÇÃO DECISIVA (parecer do Codex, 23/09/2026):
 * *"recupere também caput, condicionantes e referências necessárias"*. O art. 406, II sem o caput
 * do 406 não diz A QUE operação o inciso se aplica — e é exatamente o artigo central do módulo.
 * Por isso todo achado que não seja ARTIGO arrasta o ARTIGO do mesmo número junto.
 */
function comCaput(escolhidos, corpus) {
  const saida = [];
  const vistos = new Set();
  const por = (x) => { if (!vistos.has(x.id)) { vistos.add(x.id); saida.push(x); } };
  for (const d of escolhidos) {
    if (d.tipo !== "ARTIGO" && d.artigo) {
      const caput = corpus.find((c) => c.versaoId === d.versaoId && c.artigo === d.artigo && c.tipo === "ARTIGO");
      if (caput) por({ ...caput, trazidoComo: "caput do dispositivo citado" });
    }
    por(d);
  }
  return saida;
}

/**
 * A busca que a ferramenta do assistente chama.
 *
 * ⚠⚠ RESULTADO VAZIO SIGNIFICA "NÃO ENCONTREI FUNDAMENTO NESTA BASE", NUNCA "NÃO EXISTE PREVISÃO
 * LEGAL" (parecer do Codex). São 10 normas — RICMS/SP, uma Decisão Normativa e três Respostas à
 * Consulta. Não há RIPI nem RICMS de outro estado. O campo `cobertura` diz isso na cara de quem lê,
 * porque a diferença entre "a lei não prevê" e "a minha estante não tem o livro" é a diferença
 * entre uma orientação e uma invenção.
 */
export async function buscarLegislacao(consulta, { limite = 6 } = {}) {
  const corpus = await corpusVigente();
  const achados = comCaput(ordenarDispositivos(corpus, consulta, { limite }), corpus);
  return {
    achados: achados.map((a) => ({
      rotulo: a.rotulo, trecho: a.texto, norma: a.norma, normaChave: a.normaChave,
      url: a.url, sha256: a.sha256, peso: a.peso, orgao: a.orgao,
      trazidoComo: a.trazidoComo ?? "correspondência com a pergunta",
    })),
    termosUsados: expandir(consulta),
    cobertura: {
      normas: new Set(corpus.map((c) => c.normaChave)).size,
      dispositivos: corpus.length,
      escopo: "RICMS/SP, Decisão Normativa CAT e Respostas à Consulta da SEFAZ-SP, além da TIPI federal.",
      naoCobre: "Não há RIPI nem regulamento de ICMS de outros estados nesta base — ausência aqui não é ausência de previsão legal.",
    },
  };
}
