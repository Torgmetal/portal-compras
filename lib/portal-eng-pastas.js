// ─── AS PASTAS DE CADA TIPO DE DOCUMENTO DA ENGENHARIA ────────────────────────
// Resolve, dentro da pasta da OP, onde mora cada um dos quatro tipos que o portal do cliente
// aceita (ver TIPOS_ENGENHARIA em lib/portal-cliente).
//
// ⚠ SEM ESTE MÓDULO A TRAVA NÃO EXISTE. A tela pode mandar qualquer `caminho`; é aqui que se
// responde se aquele caminho está dentro de uma pasta permitida — e a resposta é sempre pelo que o
// servidor tem hoje, não por uma string fixa no código.
import { TIPO_ENG, TIPOS_ENGENHARIA, tipoDoDocEng, combinaComTipo } from "./portal-cliente";

// ⚠ PASTA QUE SERVE A MAIS DE UM TIPO. "2.5.5 › Memorial de Cálculo e ART" guarda os dois
// documentos juntos — é a via que vai ao cliente, e lá eles moram no mesmo lugar. Sem tratar isso,
// a caixa da ART mostra o memorial e a do memorial mostra a ART, e a escolha errada é um clique.
const assinatura = (segs) => segs.join("|").toLowerCase();
const CONTAGEM = new Map();
for (const t of TIPOS_ENGENHARIA) {
  for (const segs of t.pastas) {
    const k = assinatura(segs);
    CONTAGEM.set(k, (CONTAGEM.get(k) || 0) + 1);
  }
}

const semAcento = (s) =>
  String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

/** O código da pasta: "2.5.3 Modelo 3D" → "2.5.3"; "1 - ART" → "1"; "Obsoleto" → null. */
export const codigoDaPasta = (nome) => (String(nome || "").match(/^\s*(\d+(?:\.\d+)*)/) || [])[1] || null;

// Segmento numérico casa por CÓDIGO (o número é o que não muda entre obras); segmento em texto casa
// por nome sem acento — é o caso de "Memorial de Cálculo e ART", que não tem número.
const casaSegmento = (seg, nome) =>
  /^\d+(\.\d+)*$/.test(seg) ? codigoDaPasta(nome) === seg : semAcento(nome).includes(semAcento(seg));

/**
 * Onde este tipo existe NESTA obra.
 *
 * `listar(rel)` devolve os filhos de um caminho relativo à pasta da OP (ou null se não existe).
 * Devolve só as pastas que realmente existem — obra sem Data Book montado simplesmente tem uma
 * raiz a menos, e isso não é erro: é obra no começo.
 */
export async function raizesDoTipo(tipoId, listar) {
  const tipo = TIPO_ENG[tipoId];
  if (!tipo) return [];
  const achadas = [];
  for (const segs of tipo.pastas) {
    let rel = "";
    let ok = true;
    for (const seg of segs) {
      const filhos = await listar(rel);
      const alvo = (filhos || []).find((x) => x.folder && casaSegmento(seg, x.name));
      if (!alvo) { ok = false; break; }
      rel = rel ? `${rel}/${alvo.name}` : alvo.name;
    }
    if (ok && rel && !achadas.some((r) => r.rel === rel)) {
      achadas.push({ rel, mista: (CONTAGEM.get(assinatura(segs)) || 0) > 1 });
    }
  }
  return achadas;
}

export const caminhosDasRaizes = (raizes) => (raizes || []).map((r) => r.rel);

/** O caminho pedido está dentro de alguma das raízes? Devolve a raiz, ou null. */
export function raizDe(rel, raizes) {
  const alvo = String(rel || "");
  return (raizes || []).find((r) => alvo === r.rel || alvo.startsWith(`${r.rel}/`)) || null;
}

/**
 * O conteúdo do tipo: a soma das raízes quando se está no topo, uma pasta só quando se desceu.
 *
 * ⚠ ARQUIVO REPETIDO APARECE UMA VEZ. A ART da OP-112 está no Data Book e na cópia do cliente, com
 * o mesmo nome e ids diferentes — mostrar as duas faria escolher duas linhas do mesmo documento, e
 * o cliente receberia a ART em duplicidade sem ninguém entender por quê. Vence a primeira raiz, que
 * é a ordem em que TIPOS_ENGENHARIA declara (onde o documento é arquivado vem antes da cópia).
 */
export async function conteudoDoTipo(tipoId, raizes, caminho, listar) {
  const dentro = caminho ? raizDe(caminho, raizes) : null;
  if (caminho && !dentro) return { erro: "fora", pastas: [], arquivos: [] };

  const alvos = caminho ? [{ rel: caminho, mista: dentro?.mista }] : raizes;
  const pastas = [];
  const arquivos = [];
  const vistos = new Set();
  for (const alvo of alvos) {
    const filhos = await listar(alvo.rel);
    if (!filhos) continue;
    for (const x of filhos) {
      if (x.folder) {
        pastas.push({ nome: x.name, caminho: `${alvo.rel}/${x.name}`, itens: x.folder?.childCount ?? null });
        continue;
      }
      // ⚠ na pasta compartilhada, cada caixa mostra o que é dela. O que o nome não permite
      // classificar continua aparecendo — esconder por dúvida seria pior que mostrar a mais.
      // documento que combina com os dois (um "Memorial de Cálculo e ART") aparece nas duas caixas
      if (alvo.mista && !combinaComTipo(x.name, tipoId) && tipoDoDocEng({ nome: x.name })) continue;
      const chave = semAcento(x.name);
      if (vistos.has(chave)) continue;
      vistos.add(chave);
      arquivos.push({ item: x, pasta: alvo.rel });
    }
  }
  return { erro: null, pastas, arquivos, raiz: dentro?.rel || null };
}
