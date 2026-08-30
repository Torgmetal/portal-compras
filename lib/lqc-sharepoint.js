import "server-only";
import { getAccessToken } from "./sharepoint";

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

/**
 * Todas as LQC do drive, já lidas pelo nome.
 * @returns {Promise<{lqcs: Array, ignorados: Array}>}
 */
export async function listarLqcs(ano = new Date().getFullYear()) {
  const token = await getAccessToken();
  const drive = process.env.SHAREPOINT_DRIVE_ID;
  const r = await fetch(`${GRAPH}/drives/${drive}/root/search(q='LQC')?$select=id,name,lastModifiedDateTime,size&$top=999`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error(`Busca no SharePoint falhou (${r.status})`);
  const { value = [] } = await r.json();

  const aa = Number(String(ano).slice(-2));
  const lqcs = [], ignorados = [];
  for (const it of value) {
    if (!/\.xlsx?$/i.test(it.name) || /^~\$/.test(it.name)) continue;
    const lido = lerNomeLqc(it.name);
    if (!lido) { ignorados.push({ nome: it.name, motivo: "nome fora do padrão LQC-nnn-aa" }); continue; }
    if (lido.ano !== aa) continue;
    // ⚠ o modelo em branco (LQC-000-00-CLIENTE-OBRA) não é proposta de ninguém
    if (!lido.numero) continue;
    lqcs.push({ id: it.id, nome: it.name, tamanho: it.size, modificado: it.lastModifiedDateTime, ...lido });
  }
  return { lqcs, ignorados };
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
