import "server-only";
import { getAccessToken } from "./sharepoint";
import { getDoGraph, listarPasta, PARALELO, PAUSA_MS } from "./sharepoint-arvore";

// ─── AS LQC QUE JÁ EXISTEM NO SHAREPOINT ──────────────────────────────────────
// Vitor (29/08/2026): "em várias propostas mais recentes você vai encontrar a LQC, já poderíamos
// usar isso para termos o estudo e conseguirmos criar os cenários financeiros".
//
// São 93 planilhas, 74 delas de 2026, em 54 orçamentos distintos. Cada uma é o quantitativo de uma
// obra medido com o projeto na mão — horas de engenharia que já foram pagas. Redigitar isso no
// portal seria o retrabalho que o importador da LQC existe para evitar.
//
// ⚠⚠ O NOME DO ARQUIVO É O ÍNDICE. `LQC-283-26-BERMER-AENA-TORG-R00.xlsx` carrega número do
// orçamento (283-26), cliente, obra e revisão (R00). É o que permite amarrar cada planilha ao
// orçamento certo sem abrir nenhuma — e sem adivinhar por semelhança de nome de cliente, que é
// como "TMSA-INPASA" e "TMSA-BIANCHINI" acabariam na mesma obra.
//
// ⚠ CINCO NÃO SEGUEM O PADRÃO ("LQC-232-26-R0-INPASA-BIOMASSA", com o R antes do cliente). O
// segundo padrão cobre esses; o que não casar com nenhum dos dois fica de fora e é RELATADO, não
// chutado.

const GRAPH = "https://graph.microsoft.com/v1.0";

// LQC-283-26-BERMER-AENA-TORG-R00.xlsx        → num 283, ano 26, rev 0
// LQC-232-26-R0-INPASA-BIOMASSA.xlsx          → num 232, ano 26, rev 0 (R antes do cliente)
// LQC-244-26-KOZIKOSKI-PREDIO-COMERCIAL-R00   → num 244, ano 26, rev 0 (sem "TORG")
const PADROES = [
  /^LQC[-_ ]?(\d{3})[-_ ](\d{2})[-_ ].*?[-_ ]R(\d{1,2})/i,
  /^LQC[-_ ]?(\d{3})[-_ ](\d{2})[-_ ]R(\d{1,2})\b/i,
];
// e um sem revisão nenhuma no nome ("LQC-228-26-TECHNIK-GTF"): vale como R00 — a revisão zero é
// justamente a que ninguém escreve. Uma planilha a menos importada seria uma obra a menos medida.
const SEM_REVISAO = /^LQC[-_ ]?(\d{3})[-_ ](\d{2})[-_ ]/i;

/** Lê o nome do arquivo. Devolve null quando não é uma LQC identificável. */
export function lerNomeLqc(nome) {
  const limpo = String(nome || "").replace(/\.xlsx?$/i, "");
  for (const rx of PADROES) {
    const m = limpo.match(rx);
    if (m) {
      return {
        numero: Number(m[1]), ano: Number(m[2]), revisao: Number(m[3]),
        // "OPÇÃO A", "Copia", "MATHEUS" — o que vem depois da revisão distingue variantes da
        // mesma proposta, e é por isso que ele não pode ser jogado fora na hora de escolher.
        variante: limpo.replace(new RegExp(rx.source, "i"), "").replace(/^[\s-]+/, "").trim() || null,
      };
    }
  }
  const m = limpo.match(SEM_REVISAO);
  if (m) return { numero: Number(m[1]), ano: Number(m[2]), revisao: 0, variante: null };
  return null;
}

// ─── ONDE ESTÃO AS LQC (sem a busca do Graph) ────────────────────────────────
//
// ⚠⚠ ISTO ERA `root/search(q='LQC')`, E A BUSCA DEVOLVE HTTP 500 NESTE DRIVE DESDE 22–23/09/2026.
// O cron ficou 65 h sem sucesso. Escopar a busca na pasta de orçamentos falha igual — é o índice
// do SharePoint, não o escopo. Ver `docs/memoria-claude/torg_graph_busca_500.md`.
//
// ⚠⚠ E A CORREÇÃO DO CMR NÃO SERVIA AQUI, o que só apareceu medindo. `lib/cmr-localizar.js` varre
// a árvore inteira (teto de 600 pastas) e resolveu o CMR; a árvore `/Comercial/1. Orçamento` tem
// mais de 5.000 pastas, e a varredura cega ESTOUROU A COTA do tenant (`429 activityLimitReached`,
// ~1.370 respostas perdidas). O `delta` do drive também não: 328.592 itens em 301 páginas e 330 s
// sem terminar.
//
// O que serve é a REGULARIDADE da estrutura, conferida em 26/09:
//
//   ORÇAMENTOS_{ano}/
//     1. Solicitados/   (obra em andamento, pasta nomeada por data — 16 em 2026)
//     2. Concluidos/    (307, TODAS nomeadas `NNN-26-CLIENTE-OBRA`)
//     3. Declinados/    (11)
//     └── {pasta do orçamento}/
//           1.Emails | 2.Projetos | 3.Documentos | 4.Cotações | 5.Estudos | 6.Propostas | 7.Confidencialidade
//                                                  └── a LQC mora aqui
//
// Medido: 651 chamadas, 33,5 s, ZERO throttle → 110 arquivos, 90 LQC de 2026 em 83 orçamentos. A
// busca, em 29/08, achava 74 de 2026 em 54 orçamentos.
//
// ⚠⚠ PRECISA OLHAR OS DOIS NÍVEIS. 21 pastas (todas em `1. Solicitados`) não têm `5.*`, e QUATRO
// LQC estão soltas no nível da pasta do orçamento — olhar só `5.Estudos` perderia essas quatro.
//
// ⚠ NENHUM GRUPO É PULADO PELO NOME. `COTAÇÕES_2026` e `Workspace` não são orçamentos, mas
// excluí-los por regex seria uma heurística a errar quando alguém criar um grupo novo; a varredura
// para no segundo nível de qualquer jeito, então varrê-los custa ~6 chamadas e nenhum risco.

export const PASTA_DO_ANO = (ano) => `ORÇAMENTOS_${ano}`;
const PASTA_DE_ESTUDOS = /^5[.\s]/;
const EH_LQC = (nome) => /^LQC/i.test(nome) && /\.xlsx?$/i.test(nome) && !/^~\$/.test(nome);

/** Cada lote em paralelo, com pausa — a cota do Graph é compartilhada com todos os crons. */
async function emLotes(itens, fn, paralelo = PARALELO, pausaMs = PAUSA_MS) {
  const saida = [];
  for (let i = 0; i < itens.length; i += paralelo) {
    saida.push(...await Promise.all(itens.slice(i, i + paralelo).map(fn)));
    if (pausaMs) await new Promise((r) => setTimeout(r, pausaMs));
  }
  return saida;
}

/**
 * Os arquivos LQC do ano, achados LISTANDO as pastas de orçamento.
 *
 * ⚠ Qualquer pasta que falhe derruba a varredura: uma listagem parcial faria o importador achar
 * que a obra não tem LQC, e "não existe" é indistinguível de "não consegui ler".
 *
 * @returns {Promise<{arquivos: Array, semEstudos: Array<string>, pastas: number}>}
 */
export async function varrerPastasDeLqc(ano, { get, driveId } = {}) {
  const auth = get || getDoGraph(await getAccessToken());
  const drive = driveId || process.env.SHAREPOINT_DRIVE_ID;
  const base = (process.env.SHAREPOINT_ORCAMENTOS_BASE || "/Comercial/1. Orçamento").replace(/\/+$/, "");
  const raiz = `${base}/${PASTA_DO_ANO(ano)}`;

  const ler = (dir) => listarPasta(auth, drive, dir).then((itens) => ({ dir, itens }));

  const grupos = await listarPasta(auth, drive, raiz);
  if (grupos === null) throw new Error(`A pasta "${raiz}" não existe no SharePoint.`);

  const pastasDeGrupo = grupos.filter((x) => x.folder).map((g) => `${raiz}/${g.name}`);
  const pastasOrc = (await emLotes(pastasDeGrupo, ler))
    .flatMap(({ dir, itens }) => (itens || []).filter((x) => x.folder).map((p) => `${dir}/${p.name}`));

  const arquivos = [], semEstudos = [], comEstudos = [];
  const colher = ({ dir, itens }) => {
    for (const it of (itens || [])) {
      if (it.file && EH_LQC(it.name || "")) {
        arquivos.push({ id: it.id, nome: it.name, tamanho: it.size, modificado: it.lastModifiedDateTime, caminho: dir });
      }
    }
  };

  for (const achado of await emLotes(pastasOrc, ler)) {
    colher(achado);
    const est = (achado.itens || []).find((x) => x.folder && PASTA_DE_ESTUDOS.test(x.name || ""));
    if (est) comEstudos.push(`${achado.dir}/${est.name}`);
    else semEstudos.push(achado.dir.slice(raiz.length + 1));
  }
  (await emLotes(comEstudos, ler)).forEach(colher);

  return { arquivos, semEstudos, pastas: 1 + pastasDeGrupo.length + pastasOrc.length + comEstudos.length };
}

/**
 * Todas as LQC do ano, já lidas pelo nome.
 * @returns {Promise<{lqcs: Array, ignorados: Array, semEstudos: Array<string>, pastas: number}>}
 */
export async function listarLqcs(ano = new Date().getFullYear(), deps = {}) {
  const { arquivos, semEstudos, pastas } = await varrerPastasDeLqc(ano, deps);

  const aa = Number(String(ano).slice(-2));
  const lqcs = [], ignorados = [];
  const vistos = new Set();
  for (const it of arquivos) {
    // ⚠ A MESMA LQC APARECE EM DUAS PASTAS quando a obra sai de "Solicitados" para "Concluidos" e
    // a cópia velha fica para trás (medido: a LQC-295-26 está nas duas). O `id` do drive é único
    // por arquivo, então o de-dup é por id — e as duas cópias de VERDADE, com nomes diferentes,
    // continuam passando para `escolherPorOrcamento` decidir.
    if (vistos.has(it.id)) continue;
    vistos.add(it.id);
    const lido = lerNomeLqc(it.nome);
    if (!lido) { ignorados.push({ nome: it.nome, motivo: "nome fora do padrão LQC-nnn-aa" }); continue; }
    if (lido.ano !== aa) continue;
    // ⚠ o modelo em branco (LQC-000-00-CLIENTE-OBRA) não é proposta de ninguém
    if (!lido.numero) continue;
    lqcs.push({ id: it.id, nome: it.nome, tamanho: it.tamanho, modificado: it.modificado, caminho: it.caminho, ...lido });
  }
  return { lqcs, ignorados, semEstudos, pastas };
}

/**
 * Uma planilha por orçamento: a que vale.
 *
 * ⚠⚠ QUINZE ORÇAMENTOS TÊM MAIS DE UM ARQUIVO — revisões (R00…R04) e variantes ("OPÇÃO A" e
 * "OPÇÃO B" da RIDARP, "Copia" da BERMER). A escolha é: MAIOR REVISÃO; empatou, a sem variante
 * (o arquivo principal, não a cópia); empatou de novo, a modificada por último.
 *
 * ⚠ E as preteridas voltam na lista `outras`. Duas opções de preço numa proposta é decisão
 * comercial, não erro de arquivo — quem abrir o estudo precisa saber que existe uma OPÇÃO B.
 */
export function escolherPorOrcamento(lqcs) {
  const porNumero = new Map();
  for (const l of lqcs) {
    const atual = porNumero.get(l.numero);
    if (!atual) { porNumero.set(l.numero, { escolhida: l, outras: [] }); continue; }
    const vence =
      l.revisao !== atual.escolhida.revisao ? l.revisao > atual.escolhida.revisao
      : !l.variante !== !atual.escolhida.variante ? !l.variante
      : String(l.modificado) > String(atual.escolhida.modificado);
    if (vence) { atual.outras.push(atual.escolhida); atual.escolhida = l; }
    else atual.outras.push(l);
  }
  return porNumero;
}

/** Baixa o conteúdo de uma LQC pelo id do item no drive. */
export async function baixarLqc(itemId) {
  const token = await getAccessToken();
  const drive = process.env.SHAREPOINT_DRIVE_ID;
  const r = await fetch(`${GRAPH}/drives/${drive}/items/${itemId}/content`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error(`Download falhou (${r.status})`);
  return Buffer.from(await r.arrayBuffer());
}

const dataBR = (d) => { const x = d instanceof Date ? d : new Date(d || 0); return Number.isNaN(+x) ? "?" : x.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }); };

/**
 * O que a importação faz com UMA LQC diante do estudo que (talvez) já exista no portal.
 *
 * ⚠⚠ A PLANILHA SÓ PASSA POR CIMA SE FOR MAIS NOVA QUE A ÚLTIMA MEXIDA NO PORTAL. A guarda antiga
 * só poupava estudo NASCIDO no portal; um estudo importado do SharePoint e depois trabalhado aqui
 * dentro continuava carregando `origemSharePoint` e seria sobrescrito a cada importação — em
 * 16/09/2026 o 81 (TMSA Vale TR36) tinha 19 salvamentos do Vitor no mesmo dia e estava na lista de
 * "atualizar". Comparar a data do arquivo com `updatedAt` do estudo resolve os dois lados: arquivo
 * novo entra (alguém refez a LQC no Excel), arquivo velho não apaga o que foi feito aqui.
 *
 * @param {{ composicao?: object|null, updatedAt?: Date|string|null }|null|undefined} estudo
 * @param {{ modificado?: string|Date|null }} lqc
 * @returns {{ acao: "criar"|"atualizar"|"pulado", motivo: string|null }}
 */
export function decidirImportacao(estudo, lqc) {
  if (!estudo) return { acao: "criar", motivo: null };
  const comp = estudo.composicao;
  const feitoNoPortal = comp && typeof comp === "object" && Object.keys(comp).length > 0 && !comp.origemSharePoint;
  if (feitoNoPortal) return { acao: "pulado", motivo: "estudo montado no portal — a planilha não sobrescreve" };
  const arquivoEm = new Date(lqc?.modificado || 0);
  const mexidoEm = estudo.updatedAt ? new Date(estudo.updatedAt) : null;
  if (mexidoEm && !(arquivoEm > mexidoEm)) {
    return { acao: "pulado", motivo: `sem novidade: a planilha (${dataBR(arquivoEm)}) é anterior à última mexida no portal (${dataBR(mexidoEm)})` };
  }
  return { acao: "atualizar", motivo: null };
}
