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

// ── Classificação de MARCOS do projeto (por palavra-chave) ────────────────────
// Identifica o "papel" do e-mail no fluxo de projeto, pra virar checklist no Resumo:
//   IFC_RECEBIDO     cliente enviou IFC (entrada, anexo .ifc ou "IFC" no texto)
//   LIBERACAO_INICIO cliente liberou/autorizou o início do projeto
//   PROJETO_ENVIADO  Engenharia enviou o projeto ao cliente p/ aprovação (saída)
//   APROVADO_CLIENTE cliente aprovou o projeto / liberou fabricação (entrada)
//   OUTRO            demais (troca comum)
const RX_LIBERACAO = /\b(liberacao|liberad[oa]|libera[cç]ao de projeto|pode iniciar|pode comecar|pode dar inicio|autorizad[oa]|inicio (do|de) projeto|liberado para inicio|ordem de servico|ordem de compra)\b/;
const RX_APROVADO = /\b(aprovad[oa]|projeto aprovado|aprovacao ok|liberado para fabrica|pode fabricar|de acordo com o projeto|aprovamos)\b/;
const RX_ENVIO_APROVACAO = /\b(para (sua )?aprovacao|para aprovar|segue (o )?projeto|enviamos o projeto|segue para aprovacao|para (sua )?analise|para validacao|submet|encaminho o projeto|segue em anexo o projeto)\b/;

export function classificarMarco(e) {
  const texto = norm(`${e.assunto || ""} ${e.snippet || ""}`);
  if (e.direcao === "ENTRADA") {
    if (e.temAnexoIfc || /\bifc\b/.test(texto)) return "IFC_RECEBIDO";
    if (RX_APROVADO.test(texto)) return "APROVADO_CLIENTE";
    if (RX_LIBERACAO.test(texto)) return "LIBERACAO_INICIO";
    return "OUTRO";
  }
  if (e.direcao === "SAIDA") {
    if (RX_ENVIO_APROVACAO.test(texto)) return "PROJETO_ENVIADO";
    return "OUTRO";
  }
  return "OUTRO";
}

/** (Re)classifica o marco de TODOS os e-mails (backfill / manutenção). */
export async function reclassificarMarcos(limite = 5000) {
  const eventos = await prisma.obraEmailEvento.findMany({
    take: limite,
    select: { id: true, assunto: true, snippet: true, direcao: true, temAnexoIfc: true },
  });
  let atualizados = 0;
  for (const e of eventos) {
    const marco = classificarMarco(e);
    await prisma.obraEmailEvento.update({ where: { id: e.id }, data: { tipoGatilho: marco } }).catch(() => {});
    atualizados++;
  }
  return { atualizados };
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
    data.tipoGatilho = classificarMarco(e); // marco do projeto (IFC / liberação / aprovação…)
    await prisma.obraEmailEvento.update({ where: { id: e.id }, data }).catch(() => {});
    if (r) casados++;
  }
  return { casados, analisados: pendentes.length };
}
