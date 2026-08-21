import "server-only";
import { prisma } from "@/lib/prisma";
import { lerDeltaMensagens, lerAnexos, extrairEndereco } from "@/lib/graph-mail";

// Caixas da Engenharia (o app só consegue ler estas — travado por
// ApplicationAccessPolicy). Override por env ENG_MAILBOXES (lista separada por vírgula).
const CAIXAS_DEFAULT = [
  "engenharia@torg.com.br", "engenharia1@torg.com.br", "engenharia2@torg.com.br",
  "engenharia3@torg.com.br", "engenharia4@torg.com.br", "engenharia5@torg.com.br",
];
const PASTAS = [
  { pasta: "inbox", direcao: "ENTRADA" },
  { pasta: "sentItems", direcao: "SAIDA" },
];

export function caixasEngenharia() {
  const env = (process.env.ENG_MAILBOXES || "").trim();
  const lista = env ? env.split(",").map((s) => s.trim()).filter(Boolean) : CAIXAS_DEFAULT;
  return lista.map((s) => s.toLowerCase());
}

const ehIfc = (nome) => /\.ifc$/i.test(String(nome || "").trim());
const MAX_ANEXOS_POR_RODADA = 25; // teto de chamadas de anexo por caixa/pasta (evita timeout)

/** Ingestão de uma caixa+pasta: lê um bloco, grava eventos novos, guarda onde retomar. */
async function ingerirCaixaPasta(caixa, pasta, direcao) {
  const sync = await prisma.obraEmailSync.findUnique({ where: { caixa_pasta: { caixa, pasta } } }).catch(() => null);
  const { mensagens, ligacao, concluido } = await lerDeltaMensagens(caixa, pasta, sync?.deltaLink || null);

  let gravados = 0;
  let anexosLidos = 0;
  for (const m of mensagens) {
    const internetMessageId = m.internetMessageId;
    if (!internetMessageId) continue; // sem id não dá pra deduplicar
    if (m["@removed"]) continue; // mensagem removida no delta — ignora

    const from = extrairEndereco(m.from);
    const para = (m.toRecipients || []).map(extrairEndereco).map((x) => x.endereco).filter(Boolean);
    const cc = (m.ccRecipients || []).map(extrairEndereco).map((x) => x.endereco).filter(Boolean);

    // Anexos: só busca (p/ detectar IFC) até o teto por rodada — o resto fica com
    // temAnexo=true e IFC pendente (repuxado numa próxima sincronização).
    let anexos = [];
    let temAnexoIfc = false;
    if (m.hasAttachments && m.id && anexosLidos < MAX_ANEXOS_POR_RODADA) {
      anexos = await lerAnexos(caixa, m.id);
      temAnexoIfc = anexos.some((a) => ehIfc(a.nome));
      anexosLidos++;
    }

    const dados = {
      caixa, pasta, direcao,
      conversationId: m.conversationId || null,
      graphId: m.id || null,
      de: from.endereco || null,
      deNome: from.nome || null,
      para, cc,
      assunto: m.subject || null,
      snippet: m.bodyPreview ? String(m.bodyPreview).slice(0, 500) : null,
      recebidoEm: m.receivedDateTime ? new Date(m.receivedDateTime) : null,
      enviadoEm: m.sentDateTime ? new Date(m.sentDateTime) : null,
      temAnexo: !!m.hasAttachments,
      temAnexoIfc,
      anexos,
    };

    // upsert por internetMessageId (idempotente — reprocessar não duplica)
    await prisma.obraEmailEvento.upsert({
      where: { internetMessageId },
      create: { internetMessageId, ...dados },
      update: dados,
    }).then(() => { gravados++; }).catch(() => {});
  }

  // bookkeeping do delta (não-fatal). Guarda a "ligação" pra retomar: se for nextLink,
  // a próxima rodada continua o histórico; se for deltaLink, passa a ser incremental.
  await prisma.obraEmailSync.upsert({
    where: { caixa_pasta: { caixa, pasta } },
    create: { caixa, pasta, deltaLink: ligacao || null, ultimoEm: new Date(), totalEventos: gravados, ultimoErro: null },
    update: { deltaLink: ligacao || sync?.deltaLink || null, ultimoEm: new Date(), totalEventos: { increment: gravados }, ultimoErro: null },
  }).catch(() => {});

  return { caixa, pasta, lidos: mensagens.length, gravados, concluido };
}

/** Sincroniza todas as caixas da Engenharia (todas as pastas). Resiliente por caixa. */
export async function sincronizarEmailsEngenharia() {
  const resultados = [];
  for (const caixa of caixasEngenharia()) {
    for (const { pasta, direcao } of PASTAS) {
      try {
        resultados.push(await ingerirCaixaPasta(caixa, pasta, direcao));
      } catch (e) {
        resultados.push({ caixa, pasta, erro: e.message });
        await prisma.obraEmailSync.upsert({
          where: { caixa_pasta: { caixa, pasta } },
          create: { caixa, pasta, ultimoErro: String(e.message).slice(0, 300) },
          update: { ultimoErro: String(e.message).slice(0, 300), atualizadoEm: new Date() },
        }).catch(() => {});
      }
    }
  }
  const gravados = resultados.reduce((s, r) => s + (r.gravados || 0), 0);
  // "pendente" = alguma caixa/pasta ainda tem histórico a puxar (não chegou no deltaLink).
  const pendente = resultados.some((r) => r.concluido === false && !r.erro);
  return { gravados, pendente, resultados };
}
