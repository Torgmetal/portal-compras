// ─── OS PDFs DA PASTA DE FABRICAÇÃO DA OP ────────────────────────────────────
//
// ⚠⚠ ISTO ERA UMA BUSCA DO GRAPH, E A BUSCA MORREU (22–23/09/2026). O modal de desenhos pedia
// `…/2.5.2 Fabricação:/search(q='{marca}')` e recebia HTTP 500 — medido na OP-105 e na OP-103 em
// 26/09, com `children` por caminho respondendo 200 nas mesmas pastas. O modal degradava QUIETO:
// as liberações de GRD já gravadas continuam vindo do banco, então marca que já tinha GRD parecia
// normal e só a lista de PDFs ficava vazia. Ver `docs/memoria-claude/torg_graph_busca_500.md`.
//
// Agora a pasta é VARRIDA por caminho (`lib/sharepoint-arvore.js`). Custo medido em 26/09:
// OP-105, 73 chamadas / 13,4 s / 303 PDF; OP-103, 39 chamadas / 6,5 s / 79 PDF.
//
// ⚠⚠ E É POR ISSO QUE EXISTE CACHE. A varredura é da OP INTEIRA, mas o modal abre por MARCA — sem
// cache, conferir dez marcas da mesma obra custaria dez varreduras. Com ele, a primeira abertura
// paga os ~13 s e as seguintes são instantâneas, o que sai melhor que a busca saía. O cache é por
// instância (serverless: cada lambda tem o seu) e só guarda SUCESSO — falha nunca vira retrato.
//
// ⚠⚠ E O CACHE TAMBÉM MORA NO BANCO (Matheus, 15/10/2026: o desenho da Corte e montagem "está
// demorando muito para carregar"). Na Vercel cada pedido pode cair numa lambda nova, com o Map
// vazio — a demora voltava toda hora. A tabela `DesenhoIndice` guarda a última varredura COMPLETA
// de cada pasta, para todas as lambdas. Desenho aprovado pelo Codex (consulta database, 15/10/2026):
//   • a validade conta da VARREDURA (`em`), nunca da leitura — memória herda o tempo que resta;
//   • só varredura completa é gravada; falha de leitura ou de gravação nunca derruba a resposta;
//   • ⚠⚠ ÍNDICE VENCIDO NUNCA SERVE, nem para só ver (achado do Codex, 15/10/2026, decidido pelo
//     Matheus): o vencido pode apontar para a revisão que já foi para OBSOLETOS, e o montador
//     montaria pelo desenho errado sem aviso. A rapidez vem do banco e do aquecimento, não daqui.
import "server-only";
import { prisma } from "./prisma";
import { log } from "./log";
import { casaMarca } from "./pasta-engenharia";
import { varrerPasta } from "./sharepoint-arvore";

export const SUBPASTA_FABRICACAO = "2. Engenharia/2.5 Projetos/2.5.2 Fabricação";

/** ⚠ 5 min: o desenho que a Engenharia acabou de subir precisa aparecer no mesmo turno de trabalho. */
export const TTL_MS = 5 * 60 * 1000;

/**
 * ⚠⚠ TETO PRÓPRIO, MENOR QUE O PADRÃO. Esta varredura roda DENTRO de um pedido do navegador, com
 * `maxDuration` contando. A 2.000 pastas ela passaria de dois minutos e a Vercel mataria a rota —
 * o operador receberia HTML no lugar de JSON, que é o erro mais difícil de ler que existe. Com 600
 * ela estoura com uma frase antes disso. Medido em 26/09: OP-105 usa 73 pastas, OP-103 usa 39.
 */
export const TETO_PASTAS_FAB = 600;


const cache = new Map(); // caminho da pasta → { em, promessa, varrendo? }
const registro = log("desenhos");

/**
 * ⚠⚠ O CARIMBADO NÃO É DESENHO PARA IMPRIMIR — é o RESULTADO de uma impressão. Vitor
 * (26/08/2026) viu "105A-P34 - RASTREADO 26-08 17-38.pdf" listado com botão de imprimir do lado do
 * croqui: imprimir aquilo criaria uma GRD de um arquivo que já É uma GRD, e a segunda via nasceria
 * como liberação nova em vez de somar na existente. O emitido se abre pelo "ver emitido" da
 * própria GRD, que é onde ele significa alguma coisa.
 */
export const ehCarimbado = (nome) => /\bRASTREADO\b/i.test(nome) || /^LOTE\s/i.test(nome);

/**
 * ⚠ O CAMINHO INTEIRO É TESTADO, não só a pasta-mãe. Antes, com a busca, só dava para olhar o pai
 * do arquivo; varrendo a árvore dá para ver que ele está sob `…/A/OBSOLETOS/algo/`, e desenho
 * obsoleto enterrado um nível a mais continuava aparecendo para imprimir.
 */
export const ehObsoleto = (relativo) => /obsolet/i.test(String(relativo || ""));

/** Formato da folha = nome da pasta-mãe (A1..A4); croqui se identifica pelo nome do arquivo. */
export function formatoDaPasta(pasta, nome) {
  if (/^A[1-4]$/i.test(String(pasta || ""))) return String(pasta).toUpperCase();
  return /croqui/i.test(String(nome || "")) ? "A4 (croqui)" : null;
}

/**
 * Os PDFs de UMA marca, a partir da varredura já feita (puro — testável sem rede).
 * @param {Array<{id,name,size,pasta,relativo}>} arquivos saída de `varrerArvore`
 * @param {string} marca
 */
export function desenhosDaMarca(arquivos, marca) {
  return (arquivos || [])
    .filter((x) => /\.pdf$/i.test(x.name || "")
      && casaMarca(x.name, marca)
      && !ehObsoleto(x.relativo)
      && !ehCarimbado(x.name))
    .map((x) => ({
      itemId: x.id,
      nome: x.name,
      formato: formatoDaPasta(x.pasta, x.name),
      sizeKb: Math.round((x.size || 0) / 1024),
    }))
    .sort((a, b) => String(a.nome).localeCompare(String(b.nome)));
}

const caminhoFab = (pastaDaOp) => `${pastaDaOp}/${SUBPASTA_FABRICACAO}`;

/** O índice gravado no banco, ou null (sem linha, formato estranho ou banco fora). */
async function lerDoBanco(fab) {
  try {
    const l = await prisma.desenhoIndice.findUnique({ where: { pasta: fab } });
    const em = l?.em ? new Date(l.em).getTime() : NaN;
    // ⚠ conteúdo que não é a lista esperada vira "sem índice": melhor varrer que quebrar a rota
    if (!l || !Array.isArray(l.arquivos) || !Number.isFinite(em)) return null;
    return { arquivos: l.arquivos, em };
  } catch {
    return null; // banco fora não impede de achar o desenho — só custa a varredura
  }
}

/** Varre a pasta (uma varredura por pasta e por lambda de cada vez) e grava o resultado. */
function varrer(fab, agora) {
  const guardado = cache.get(fab);
  if (guardado?.varrendo) return guardado.promessa;
  // ⚠ GUARDA A PROMESSA, NÃO O RESULTADO. Abrir o modal de três marcas da mesma obra ao mesmo
  // tempo dispararia três varreduras idênticas contra o Graph — e a cota é compartilhada com
  // todos os crons. Assim, quem chega durante a varredura espera a que já está rodando.
  const promessa = varrerPasta(process.env.SHAREPOINT_DRIVE_ID, fab, {
    arquivo: (nome) => /\.pdf$/i.test(nome),
    teto: TETO_PASTAS_FAB,
  }).then(async (r) => {
    // ⚠ Pasta de fabricação inexistente é resposta, não erro: OP nova ainda não tem projeto. O que
    // NÃO pode acontecer é isso se confundir com falha do SharePoint — por isso `varrerPasta` lança
    // em qualquer outro caso, e o erro sobe até a tela.
    const arquivos = r ? r.arquivos : [];
    const em = new Date(agora);
    try {
      await prisma.desenhoIndice.upsert({ where: { pasta: fab }, create: { pasta: fab, arquivos, em }, update: { arquivos, em } });
    } catch (e) {
      // ⚠ registrado, não engolido: sem isto, o cache do banco parado pareceria cache funcionando
      registro.erro("índice da fabricação não gravado", fab, e?.message || e);
    }
    const atual = cache.get(fab);
    if (atual?.promessa === promessa) cache.set(fab, { em: agora, promessa });
    return arquivos;
  });
  // ⚠ FALHA NUNCA VIRA RETRATO: se a varredura quebrar, o cache solta a entrada para a próxima
  // tentativa não herdar o erro.
  promessa.catch(() => { if (cache.get(fab)?.promessa === promessa) cache.delete(fab); });
  cache.set(fab, { em: agora, promessa, varrendo: true });
  return promessa;
}

/**
 * Varre (ou reaproveita do cache) a pasta de fabricação da OP: memória → banco → varredura.
 * Sempre fresco: nada com mais de TTL_MS desde a última varredura completa.
 * @param {string} pastaDaOp caminho absoluto da pasta da OP no drive
 * @returns {Promise<Array>} arquivos da árvore; `[]` quando a OP não tem pasta de fabricação
 */
export async function arquivosDaFabricacao(pastaDaOp, { agora = Date.now() } = {}) {
  const fab = caminhoFab(pastaDaOp);
  const guardado = cache.get(fab);
  if (guardado && (guardado.varrendo || agora - guardado.em < TTL_MS)) return guardado.promessa;

  const doBanco = await lerDoBanco(fab);
  if (doBanco && agora - doBanco.em < TTL_MS) {
    // ⚠ a memória herda o `em` da varredura: o índice de 4 min vale aqui só pelo minuto que resta
    cache.set(fab, { em: doBanco.em, promessa: Promise.resolve(doBanco.arquivos) });
    return doBanco.arquivos;
  }
  return varrer(fab, agora);
}

/** Só para os testes: esvazia o cache entre casos. */
export function limparCacheFabricacao() { cache.clear(); }
