import "server-only";
import { prisma } from "@/lib/prisma";

// Casa um e-mail da Engenharia com a OP/obra e classifica o MARCO/TAG do fluxo de projeto.
// Camadas de vínculo (determinísticas):
//   1) nº da OP no assunto/corpo  ("OP105", "OP 115", "O.P. 0105", "OP-105")  → forte
//   2) refCliente (código da obra no cliente, ex "3311-STR-0002")             → forte
//   3) nome da obra contido no texto                                          → médio
//   4) remetente = contato/e-mail do cliente daquela OP (única)               → fraco (desempate)
//   5) THREAD: herda a OP de um irmão da mesma conversa que já casou          → propagação
// Sem match seguro devolve null. A IA (classificar-email-ia.js) refina as TAGS depois.

const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
const soDigitos = (s) => String(s || "").replace(/\D/g, "");

// ── TAXONOMIA DE TAGS ─────────────────────────────────────────────────────────
export const TAGS = [
  "IFC_RECEBIDO", "LIBERACAO_INICIO", "PROJETO_ENVIADO", "APROVADO_CLIENTE",
  "REVISAO_CLIENTE", "REPROVADO_CLIENTE", "PENDENCIA_CLIENTE", "RFI_TECNICO", "OUTRO",
];

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
      refDig: o.refCliente ? soDigitos(o.refCliente) : null,
      emails,
    };
  });
}

/**
 * Tenta casar um e-mail com uma OP do índice (camadas 1–4; a thread é aplicada à parte).
 * @returns {{ opId:string, metodo:string, confianca:number } | null}
 */
export function casarEmailComOP(email, indice) {
  const texto = norm(`${email.assunto || ""} ${email.snippet || ""}`);
  // ⚠ o ASSUNTO em separado: é onde o cliente põe o código da obra. Regra que casa por número solto
  // precisa ficar restrita a ele — no corpo, qualquer nota fiscal ou telefone vira um match falso.
  const assunto = norm(email.assunto || "");
  const de = norm(email.de || "");

  // ⚠⚠ AMBÍGUO NÃO CASA. Vitor (29/08/2026): "da 328 temos a 78 que também é 328, e agora temos a
  // 112 que é 328 cobertura — são pastas de obras separadas, coisas distintas". É exatamente o
  // caso: a OP-078 tem obra "ENC 328" e a OP-112 tem ref "ENC 0328", as duas da DANPOWER. Com
  // `find`, quem casasse primeiro levava — e num registro que vai servir de PROVA contra o
  // cliente, atribuir o e-mail à obra errada é pior que não atribuir. Duas candidatas ⇒ nenhuma,
  // e o e-mail fica para alguém apontar a obra à mão.
  const unico = (lista) => (lista.length === 1 ? lista[0] : null);

  // 1) nº da OP — "op"/"o.p." seguido (opcional -, :, nº, espaço, ponto) de dígitos
  const nums = new Set();
  for (const m of texto.matchAll(/\bo\.?\s?p\.?\s*[-:nº.°]*\s*0*(\d{1,5})\b/gi)) nums.add(Number(m[1]));
  if (nums.size) {
    const alvo = unico(indice.filter((o) => o.numeroInt && nums.has(o.numeroInt)));
    if (alvo) return { opId: alvo.id, metodo: "REGRA_OP", confianca: 0.95 };
  }

  // 2) refCliente (código da obra no cliente) contido no texto (≥4 chars, evita ruído)
  const porRef = unico(indice.filter((o) => o.ref && o.ref.length >= 4 && texto.includes(o.ref)));
  if (porRef) return { opId: porRef.id, metodo: "CODIGO_OBRA", confianca: 0.9 };

  // ⚠⚠ 2b) SÓ O NÚMERO DO CÓDIGO. O `refDig` era calculado e nunca usado — código morto que
  // custava match de verdade: o refCliente da OP-112 é "ENC 0328" e o cliente escreve
  // "RE: 0328-Peso Plataforma". O texto não contém "enc 0328", contém "0328". Quem manda o e-mail
  // é o cliente, e ele usa o código dele do jeito dele.
  //
  // ⚠ COM FRONTEIRA, e ≥4 dígitos: sem isso "0328" casaria dentro de "20328" ou de um número de
  // nota fiscal, e um match errado aqui contamina o histórico da obra — que é justamente o que
  // precisa ser confiável.
  const porRefDig = unico(indice.filter((o) => {
    if (!o.refDig || o.refDig.length < 4) return false;
    // ⚠ SÓ NO ASSUNTO. Rodando contra os 122 e-mails sem match, buscar no corpo trouxe um
    // "LISTA DE MATERIAL" casado por um número qualquer do texto — match errado entra no histórico
    // da obra e é exatamente o que não pode acontecer num registro que serve de prova.
    return new RegExp(`(^|\\D)${o.refDig}(\\D|$)`).test(assunto);
  }));
  if (porRefDig) return { opId: porRefDig.id, metodo: "CODIGO_OBRA_NUM", confianca: 0.85 };

  // 3) nome da obra contido no texto (≥6 chars)
  const porObra = unico(indice.filter((o) => o.obra && o.obra.length >= 6 && texto.includes(o.obra)));
  if (porObra) return { opId: porObra.id, metodo: "NOME_OBRA", confianca: 0.7 };

  // 4) remetente é contato do cliente de UMA única OP (senão é ambíguo → ignora)
  if (de) {
    const comEsseContato = indice.filter((o) => o.emails.has(de));
    if (comEsseContato.length === 1) return { opId: comEsseContato[0].id, metodo: "DOMINIO", confianca: 0.55 };
  }
  return null;
}

// ── Classificação de TAGS por palavra-chave (1ª camada; IA refina) ────────────
const RX_APROVADO = /\b(aprovad[oa]|aprovamos|projeto aprovado|aprovacao ok|liberado para fabrica|liberacao para fabrica|pode fabricar|de acordo com o projeto|liberado para producao)\b/;
const RX_REPROVADO = /\b(reprovad|nao aprovad|nao aprovamos|com ressalva|reprova|devolvid[oa] para (corre|ajus)|corrigir e reenviar)\b/;
const RX_REVISAO = /\b(revis[aã]o|revisar|alteracao|alterar|modificacao|mudanca no projeto|ajuste no projeto|refazer|nova versao|reenviar (o )?projeto|atualizacao do projeto|solicitamos alteracao|solicita alteracao|favor alterar)\b/;
const RX_LIBERACAO = /\b(liberacao para inicio|libera[cç]ao de projeto|pode iniciar|pode comecar|pode dar inicio|autorizad[oa] (o )?inicio|inicio (do|de) projeto|liberado para inicio|ordem de servico|ordem de compra|autorizacao de inicio)\b/;
const RX_ENVIO_APROVACAO = /\b(para (sua )?aprovacao|para aprovar|segue (o )?projeto|enviamos o projeto|segue para aprovacao|para (sua )?analise|para validacao|submet|encaminho o projeto|segue em anexo o projeto|segue projeto para)\b/;
const RX_PENDENCIA = /\b(aguardando|no aguardo|seguimos aguardando|ainda aguardamos|pendente de|em aberto|favor enviar|solicitamos o envio|ainda nao recebemos|previsao de envio|reiterando|cobranca|retorno sobre|gentileza enviar|no aguardo do)\b/;
const RX_RFI = /\b(duvida|rfi|esclarecer|esclarecimento|questionamento|consulta tecnica|poderia confirmar|poderiam confirmar|favor confirmar|gostaria de confirmar|qual (a|o)|como proceder)\b/;

/**
 * Marco/TAG por palavra-chave, respeitando a direção do e-mail.
 * ENTRADA (cliente→Torg): IFC, aprovado, reprovado, revisão, liberação, RFI.
 * SAIDA (Torg→cliente): projeto enviado, pendência (cobrança), RFI.
 */
export function classificarMarco(e) {
  const texto = norm(`${e.assunto || ""} ${e.snippet || ""}`);
  if (e.direcao === "ENTRADA") {
    if (e.temAnexoIfc || /\bifc\b/.test(texto)) return "IFC_RECEBIDO";
    if (RX_APROVADO.test(texto)) return "APROVADO_CLIENTE";
    if (RX_REPROVADO.test(texto)) return "REPROVADO_CLIENTE";
    if (RX_REVISAO.test(texto)) return "REVISAO_CLIENTE";
    if (RX_LIBERACAO.test(texto)) return "LIBERACAO_INICIO";
    if (RX_RFI.test(texto)) return "RFI_TECNICO";
    return "OUTRO";
  }
  if (e.direcao === "SAIDA") {
    if (RX_ENVIO_APROVACAO.test(texto)) return "PROJETO_ENVIADO";
    if (RX_PENDENCIA.test(texto)) return "PENDENCIA_CLIENTE";
    if (RX_RFI.test(texto)) return "RFI_TECNICO";
    return "OUTRO";
  }
  return "OUTRO";
}

// ── Propagação por THREAD ─────────────────────────────────────────────────────
// Se qualquer e-mail de uma conversa (conversationId) já casou com uma OP, os irmãos
// ainda sem OP herdam esse vínculo. Mantém a maior confiança por conversa.
export async function propagarPorThread() {
  const casados = await prisma.obraEmailEvento.findMany({
    where: { opId: { not: null }, conversationId: { not: null } },
    select: { conversationId: true, opId: true, matchConfianca: true },
  });
  const convOp = new Map(); // conversationId → { opId, conf }
  for (const e of casados) {
    const atual = convOp.get(e.conversationId);
    const conf = e.matchConfianca ?? 0.9;
    if (!atual || conf > atual.conf) convOp.set(e.conversationId, { opId: e.opId, conf });
  }
  if (convOp.size === 0) return { propagados: 0 };

  const orfaos = await prisma.obraEmailEvento.findMany({
    where: { opId: null, conversationId: { in: [...convOp.keys()] } },
    select: { id: true, conversationId: true },
  });
  let propagados = 0;
  for (const e of orfaos) {
    const alvo = convOp.get(e.conversationId);
    if (!alvo) continue;
    await prisma.obraEmailEvento.update({
      where: { id: e.id },
      data: { opId: alvo.opId, matchMetodo: "THREAD", matchConfianca: Math.min(0.6, alvo.conf) },
    }).catch(() => {});
    propagados++;
  }
  return { propagados };
}

/** (Re)classifica a TAG de TODOS os e-mails, sem rebaixar o que a IA já marcou. */
export async function reclassificarMarcos(limite = 5000) {
  const eventos = await prisma.obraEmailEvento.findMany({
    take: limite,
    select: { id: true, assunto: true, snippet: true, direcao: true, temAnexoIfc: true, marcoFonte: true, tipoGatilho: true },
  });
  let atualizados = 0;
  for (const e of eventos) {
    // não sobrescreve marco achado pela IA
    if (e.marcoFonte === "IA" && e.tipoGatilho && e.tipoGatilho !== "OUTRO") continue;
    const marco = classificarMarco(e);
    await prisma.obraEmailEvento.update({ where: { id: e.id }, data: { tipoGatilho: marco, marcoFonte: marco === "OUTRO" ? null : "KEYWORD" } }).catch(() => {});
    atualizados++;
  }
  return { atualizados };
}

/** Passa nos e-mails ainda sem OP e tenta casar. Depois propaga por thread. */
export async function casarEmailsPendentes(limite = 500) {
  const pendentes = await prisma.obraEmailEvento.findMany({
    where: { opId: null, matchMetodo: null },
    orderBy: { recebidoEm: "desc" },
    take: limite,
    select: { id: true, assunto: true, snippet: true, de: true, direcao: true, temAnexoIfc: true, marcoFonte: true, tipoGatilho: true },
  });

  const indice = await carregarIndiceOPs();
  let casados = 0;
  for (const e of pendentes) {
    const r = casarEmailComOP(e, indice);
    const data = {};
    if (r) { data.opId = r.opId; data.matchMetodo = r.metodo; data.matchConfianca = r.confianca; }
    else { data.matchMetodo = "SEM_MATCH"; } // marca como analisado (não reprocessa toda hora)
    if (!(e.marcoFonte === "IA" && e.tipoGatilho && e.tipoGatilho !== "OUTRO")) {
      const marco = classificarMarco(e);
      data.tipoGatilho = marco;
      data.marcoFonte = marco === "OUTRO" ? null : "KEYWORD";
    }
    await prisma.obraEmailEvento.update({ where: { id: e.id }, data }).catch(() => {});
    if (r) casados++;
  }
  const prop = await propagarPorThread();
  return { casados, analisados: pendentes.length, propagados: prop.propagados };
}

/**
 * BACKFILL completo: re-avalia TODOS os e-mails (inclusive os SEM_MATCH antigos) com as
 * regras novas, reclassifica a TAG por palavra-chave (sem rebaixar IA) e propaga por thread.
 * Use quando as regras mudam. Não chama a IA (isso é separado / roda no cron da prod).
 */
export async function rematchTudo(limite = 10000) {
  const eventos = await prisma.obraEmailEvento.findMany({
    take: limite,
    orderBy: { recebidoEm: "desc" },
    select: { id: true, assunto: true, snippet: true, de: true, direcao: true, temAnexoIfc: true, opId: true, matchMetodo: true, marcoFonte: true, tipoGatilho: true },
  });
  const indice = await carregarIndiceOPs();
  let recasados = 0, reclass = 0;
  for (const e of eventos) {
    const data = {};
    // Só re-casa quem não tem vínculo forte (mantém REGRA_OP/CODIGO_OBRA/MANUAL já bons).
    const vinculoForte = e.opId && ["REGRA_OP", "CODIGO_OBRA", "MANUAL"].includes(e.matchMetodo);
    if (!vinculoForte) {
      const r = casarEmailComOP(e, indice);
      if (r) { data.opId = r.opId; data.matchMetodo = r.metodo; data.matchConfianca = r.confianca; recasados++; }
      else if (!e.opId) { data.matchMetodo = "SEM_MATCH"; }
    }
    // Reclassifica TAG por keyword (sem rebaixar IA)
    if (!(e.marcoFonte === "IA" && e.tipoGatilho && e.tipoGatilho !== "OUTRO")) {
      const marco = classificarMarco(e);
      data.tipoGatilho = marco;
      data.marcoFonte = marco === "OUTRO" ? null : "KEYWORD";
      reclass++;
    }
    if (Object.keys(data).length) await prisma.obraEmailEvento.update({ where: { id: e.id }, data }).catch(() => {});
  }
  const prop = await propagarPorThread();
  return { total: eventos.length, recasados, reclass, propagados: prop.propagados };
}
