import "server-only";
import { prisma } from "@/lib/prisma";

// Casa um e-mail da Engenharia com a OP/obra. Camadas determinísticas (Fase 2 v1):
//   1) nº da OP no assunto/corpo  ("OP105", "OP 115", "O.P. 0105")  → forte
//   2) refCliente (código da obra no cliente, ex "3311-STR-0002")   → forte
//   3) nome da obra contido no texto                                 → médio
//   4) remetente = contato/e-mail do cliente daquela OP              → fraco (desempate)
// Sem match seguro devolve null (melhor sem vínculo do que no OP errado). IA fica p/ depois.

const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
const soDigitos = (s) => String(s || "").replace(/\D/g, "");

/** Carrega o índice de OPs uma vez (reusado no loop de casamento). */
export async function carregarIndiceOPs() {
  const ops = await prisma.oP.findMany({
    select: { id: true, numero: true, obra: true, cliente: true, refCliente: true, clienteEmail: true, clienteContatos: true },
  });
  return ops.map((o) => {
    const emails = new Set();
    if (o.clienteEmail) emails.add(norm(o.clienteEmail));
    for (const c of Array.isArray(o.clienteContatos) ? o.clienteContatos : []) {
      if (c?.email) emails.add(norm(c.email));
    }
    return {
      id: o.id,
      numeroInt: Number(soDigitos(o.numero)) || null,
      obra: o.obra ? norm(o.obra) : null,
      ref: o.refCliente ? norm(o.refCliente) : null,
      emails,
    };
  });
}

/**
 * Tenta casar um e-mail com uma OP do índice.
 * @param {{assunto?:string, snippet?:string, de?:string}} email
 * @returns {{ opId:string, metodo:string, confianca:number } | null}
 */
export function casarEmailComOP(email, indice) {
  const texto = norm(`${email.assunto || ""} ${email.snippet || ""}`);
  const de = norm(email.de || "");

  // 1) nº da OP — "op" seguido (opcional espaço/ponto) de dígitos
  const nums = new Set();
  for (const m of texto.matchAll(/\bo\.?\s?p\.?\s*n?[.º]?\s*0*(\d{1,5})\b/gi)) nums.add(Number(m[1]));
  for (const m of texto.matchAll(/\bop\s*0*(\d{1,5})\b/gi)) nums.add(Number(m[1]));
  if (nums.size) {
    const alvo = indice.find((o) => o.numeroInt && nums.has(o.numeroInt));
    if (alvo) return { opId: alvo.id, metodo: "REGRA_OP", confianca: 0.95 };
  }

  // 2) refCliente (código da obra no cliente) contido no texto (≥4 chars, evita ruído)
  const porRef = indice.find((o) => o.ref && o.ref.length >= 4 && texto.includes(o.ref));
  if (porRef) return { opId: porRef.id, metodo: "CODIGO_OBRA", confianca: 0.9 };

  // 3) nome da obra contido no texto (≥6 chars)
  const porObra = indice.find((o) => o.obra && o.obra.length >= 6 && texto.includes(o.obra));
  if (porObra) return { opId: porObra.id, metodo: "NOME_OBRA", confianca: 0.7 };

  // 4) remetente é contato do cliente de UMA única OP (senão é ambíguo → ignora)
  if (de) {
    const comEsseContato = indice.filter((o) => o.emails.has(de));
    if (comEsseContato.length === 1) return { opId: comEsseContato[0].id, metodo: "DOMINIO", confianca: 0.55 };
  }
  return null;
}

/** Passa nos e-mails ainda sem OP e tenta casar. Atualiza opId/metodo/confiança + gatilho. */
export async function casarEmailsPendentes(limite = 500) {
  const pendentes = await prisma.obraEmailEvento.findMany({
    where: { opId: null, matchMetodo: null },
    orderBy: { recebidoEm: "desc" },
    take: limite,
    select: { id: true, assunto: true, snippet: true, de: true, direcao: true, temAnexoIfc: true },
  });
  if (pendentes.length === 0) return { casados: 0, analisados: 0 };

  const indice = await carregarIndiceOPs();
  let casados = 0;
  for (const e of pendentes) {
    const r = casarEmailComOP(e, indice);
    const data = {};
    if (r) { data.opId = r.opId; data.matchMetodo = r.metodo; data.matchConfianca = r.confianca; }
    else { data.matchMetodo = "SEM_MATCH"; } // marca como analisado (não reprocessa toda hora)
    // gatilho de start: IFC recebido (entrada com anexo .ifc)
    if (e.direcao === "ENTRADA" && e.temAnexoIfc) data.tipoGatilho = "IFC_RECEBIDO";
    await prisma.obraEmailEvento.update({ where: { id: e.id }, data }).catch(() => {});
    if (r) casados++;
  }
  return { casados, analisados: pendentes.length };
}
