import "server-only";
import { prisma } from "@/lib/prisma";
import { FONTES, fontePorChave } from "@/lib/fiscal/fontes-legislacao";
import { textoDaPagina, corpoLegal, conferir, dispositivos, sha256 } from "@/lib/fiscal/texto-legislacao";

// ─── A COLETA DA LEGISLAÇÃO ──────────────────────────────────────────────────
//
// ⚠⚠ O BANCO É A FONTE OPERACIONAL; A PÁGINA OFICIAL É A EVIDÊNCIA. Mesma decisão do Matheus para
// a TIPI (*"não recomendo consultar a Receita a cada vez que alguém digitar um NCM; o método
// correto é sincronizar a base oficial com o banco do Workspace e consultar localmente"*). Ninguém
// bate no site da SEFAZ para ler o art. 406 — bate no Postgres, que guarda o texto com hash e data.
//
// ⚠⚠ E NADA É SOBRESCRITO. O briefing proíbe *"sobrescrever silenciosamente documentos já
// utilizados para fundamentar regras fiscais"*: mudou o hash, entra uma versão NOVA e a anterior
// vira SUPERADA — porque é ela que sustenta o apontamento que saiu ontem.

export const PARSER_VERSAO = "legislacao-1";

const AGENTE = "TorgWorkspace/1.0 (Inteligencia Fiscal; contato: compras@torg.com.br)";

/**
 * ⚠ 200 NÃO É SUCESSO AQUI. O SharePoint da SEFAZ devolve a página de erro com status 200; quem
 * decide é a conferência estrutural, não o código HTTP.
 */
export async function baixarNorma(fonte, { timeoutMs = 30000, ateMs = null } = {}) {
  // ⚠⚠ O TIMEOUT ENCOLHE PARA CABER NO ORÇAMENTO DA ROTA (achado do Codex, 23/09/2026). São 10
  // fontes numa rota de 60 s: dois downloads esgotando 30 s já estouravam o total, e a Vercel
  // matava a execução no meio do lote. Mesma lição do `ateMs` do `omieCall` nos Prazos das RMs —
  // timeout por tentativa não é orçamento de rodada.
  const restante = ateMs ? ateMs - Date.now() : timeoutMs;
  if (restante <= 1000) return { erro: "Sem tempo no orçamento desta execução para consultar a fonte." };
  // ⚠⚠ A LEITURA DO CORPO ENTRA NO MESMO try (achado do Codex, 23/09/2026). O `try` cobria só o
  // `fetch`: recebidos os cabeçalhos, o `resp.text()` ainda pode rejeitar — o AbortSignal dispara
  // no meio do streaming, ou a conexão cai. A exceção subia de `baixarNorma` até
  // `importarLegislacao`, **matando o lote inteiro**: sem relatório das fontes restantes e, no
  // cron, sem `registrarExecucao` — o monitor então alertaria por não ter notícia de uma execução
  // que rodou e morreu numa fonte só.
  let html;
  try {
    const resp = await fetch(fonte.url, { headers: { "user-agent": AGENTE }, signal: AbortSignal.timeout(Math.min(timeoutMs, restante)) });
    if (!resp.ok) return { erro: `A fonte respondeu HTTP ${resp.status} em ${fonte.url}.` };
    html = await resp.text();
  } catch (e) {
    return { erro: `Não foi possível baixar ${fonte.url}: ${e.message}` };
  }
  const texto = textoDaPagina(html);
  const corpo = corpoLegal(texto, fonte);
  if (!corpo) {
    return { erro: `A página não traz o início esperado do documento (${fonte.artigos?.[0] ? `Artigo ${fonte.artigos[0]}` : fonte.marcadores?.[0]}).` };
  }
  const c = conferir(corpo, fonte);
  return { corpo, conferido: c.valido, faltam: c.valido ? null : c.faltam, sha256: sha256(corpo), bytes: Buffer.byteLength(corpo, "utf8") };
}

/**
 * Importa UMA norma. Devolve sempre o que aconteceu — inclusive "sem mudança", que é resultado.
 *
 * ⚠⚠ DOCUMENTO QUE NÃO PASSA NA CONFERÊNCIA NÃO VIRA ATIVO. Ele é gravado (a coleta é prova de
 * que a verificação aconteceu) mas fica SUPERADA, e a versão boa anterior continua valendo. Deixar
 * uma página de erro tomar o lugar da lei seria pior do que não ter coletado.
 */
export async function importarNorma(chave, { ateMs = null } = {}) {
  const fonte = fontePorChave(chave);
  if (!fonte) return { chave, status: "FALHOU", mensagem: "Fonte desconhecida." };

  const baixada = await baixarNorma(fonte, { ateMs });
  if (baixada.erro) return { chave, status: "FALHOU", mensagem: baixada.erro };

  const norma = await prisma.fiscalNorma.upsert({
    where: { chave: fonte.chave },
    update: { tipo: fonte.tipo, peso: fonte.peso, orgao: fonte.orgao, titulo: fonte.titulo, norma: fonte.norma, url: fonte.url, assunto: fonte.assunto ?? null },
    create: { chave: fonte.chave, tipo: fonte.tipo, peso: fonte.peso, orgao: fonte.orgao, titulo: fonte.titulo, norma: fonte.norma, url: fonte.url, assunto: fonte.assunto ?? null },
  });

  const jaTem = await prisma.fiscalNormaVersao.findUnique({
    where: { normaId_sha256: { normaId: norma.id, sha256: baixada.sha256 } },
    select: { id: true, status: true },
  });
  if (jaTem) {
    // ⚠⚠ HASH CONHECIDO NÃO É AUTOMATICAMENTE "SEM MUDANÇA" (achado do Codex, 23/09/2026). Eu lia
    // o `status` da versão e devolvia SEM_MUDANCA sem olhar para ele, com duas consequências:
    //
    //   1. **Página reprovada que se repete sumia da lista de falhas.** No primeiro dia ela entra
    //      como REPROVADA e aparece; no segundo, mesmo hash → "sem mudança" → contada como
    //      sucesso. O portal passaria a dizer que está tudo em dia sobre uma norma que ele nunca
    //      conseguiu ler.
    //   2. **A → B → A deixava B ativo.** Se a fonte muda e depois VOLTA a um conteúdo válido que
    //      o banco já tem, o caminho de criação (que é quem promove) não roda — e a versão ativa
    //      continuaria sendo a intermediária, com o portal citando o texto errado.
    if (!baixada.conferido) {
      return { chave, status: "REPROVADA", sha256: baixada.sha256, versaoId: jaTem.id, conferido: false,
        faltam: baixada.faltam, mensagem: "A página continua sem passar na conferência estrutural." };
    }
    if (jaTem.status === "ATIVA") {
      return { chave, status: "SEM_MUDANCA", sha256: baixada.sha256, versaoId: jaTem.id, conferido: true };
    }
    // ⚠ A reativação é ATÔMICA: superar a outra e promover esta na mesma transação, senão o índice
    // parcial `uma_ativa` recusa o meio do caminho e a norma fica sem versão ativa nenhuma.
    await prisma.$transaction(async (tx) => {
      await tx.fiscalNormaVersao.updateMany({ where: { normaId: norma.id, status: "ATIVA" }, data: { status: "SUPERADA" } });
      await tx.fiscalNormaVersao.update({ where: { id: jaTem.id }, data: { status: "ATIVA" } });
    });
    return { chave, status: "REATIVADA", sha256: baixada.sha256, versaoId: jaTem.id, conferido: true,
      mensagem: "A fonte voltou a um conteúdo que o portal já tinha guardado." };
  }

  const ds = dispositivos(baixada.corpo);
  const versao = await prisma.$transaction(async (tx) => {
    // ⚠⚠ SUPERA A ANTERIOR ANTES DE CRIAR A NOVA — o índice parcial `uma_ativa` recusaria as duas.
    if (baixada.conferido) {
      await tx.fiscalNormaVersao.updateMany({ where: { normaId: norma.id, status: "ATIVA" }, data: { status: "SUPERADA" } });
    }
    const v = await tx.fiscalNormaVersao.create({
      data: {
        normaId: norma.id, sha256: baixada.sha256, bytes: baixada.bytes, corpo: baixada.corpo,
        conferido: baixada.conferido, faltam: baixada.faltam ?? undefined,
        status: baixada.conferido ? "ATIVA" : "SUPERADA",
      },
    });
    if (ds.length) {
      // ⚠⚠ SEM `skipDuplicates`. Ele estava engolindo rótulo repetido em silêncio — 138
      // dispositivos extraídos do art. 125 viravam 92 gravados. Agora o rótulo é desambiguado na
      // extração (ver `dispositivos`), e uma colisão que sobrar tem de ESTOURAR, não sumir.
      await tx.fiscalDispositivo.createMany({
        data: ds.map((d) => ({ versaoId: v.id, rotulo: d.rotulo, artigo: d.artigo ?? null, tipo: d.tipo, texto: d.texto, ordem: d.ordem })),
      });
    }
    return v;
  });

  return {
    chave, status: baixada.conferido ? "IMPORTADA" : "REPROVADA",
    sha256: baixada.sha256, versaoId: versao.id, dispositivos: ds.length,
    conferido: baixada.conferido, faltam: baixada.faltam,
  };
}

/**
 * ⚠⚠ SEQUENCIAL E COM PAUSA, DE PROPÓSITO. São 9 páginas do mesmo servidor público; disparar tudo
 * junto é o tipo de coleta que faz um site oficial bloquear o IP da empresa. O briefing pede
 * *"coleta controlada"* e *"respeitar restrições técnicas"* — aqui isso é uma pausa de 800 ms.
 */
export async function importarLegislacao({ chaves = null, pausaMs = 800, ateMs = null } = {}) {
  const alvos = chaves?.length ? FONTES.filter((f) => chaves.includes(f.chave)) : FONTES;
  const resultados = [];
  const naoProcessadas = [];
  for (const [i, f] of alvos.entries()) {
    // ⚠⚠ FONTE NÃO CONSULTADA É DITA POR NOME, NUNCA OMITIDA. Sem isso, um lote cortado pelo
    // limite da rota devolveria "5 importadas, 0 falhas" — indistinguível de uma rodada completa,
    // e as 5 últimas normas envelheceriam em silêncio.
    if (ateMs && Date.now() >= ateMs - 1500) {
      naoProcessadas.push(...alvos.slice(i).map((x) => x.chave));
      break;
    }
    // ⚠ Rede de segurança POR FONTE: o download já trata as suas falhas, mas gravação e parsing
    // também podem estourar, e uma fonte não pode derrubar as outras nove.
    try {
      resultados.push(await importarNorma(f.chave, { ateMs }));
    } catch (e) {
      resultados.push({ chave: f.chave, status: "FALHOU", mensagem: e.message?.slice(0, 300) ?? String(e) });
    }
    // ⚠ A pausa também respeita o orçamento: dormir 800 ms no fim da janela é gastar a última
    // fonte para não fazer nada.
    if (pausaMs && (!ateMs || Date.now() + pausaMs < ateMs - 1500)) {
      await new Promise((r) => setTimeout(r, pausaMs));
    }
  }
  return {
    total: alvos.length,
    processadas: resultados.length,
    importadas: resultados.filter((r) => r.status === "IMPORTADA").length,
    reativadas: resultados.filter((r) => r.status === "REATIVADA").length,
    semMudanca: resultados.filter((r) => r.status === "SEM_MUDANCA").length,
    falhas: resultados.filter((r) => r.status === "FALHOU" || r.status === "REPROVADA"),
    naoProcessadas,
    resultados,
  };
}

/**
 * O DISPOSITIVO CITADO POR UM FUNDAMENTO — é o que transforma "art. 406, II" numa citação
 * verificável em vez de uma frase que eu escrevi.
 *
 * ⚠ Só olha versões ATIVAS: o texto superado continua no banco, mas não é o que o portal afirma
 * hoje.
 */
export async function dispositivoPorRotulo(chaveNorma, rotulo) {
  const v = await prisma.fiscalNormaVersao.findFirst({
    where: { status: "ATIVA", norma: { chave: chaveNorma } },
    select: { id: true, sha256: true, coletadoEm: true, norma: { select: { titulo: true, url: true, peso: true, norma: true } } },
  });
  if (!v) return null;
  const d = await prisma.fiscalDispositivo.findUnique({
    where: { versaoId_rotulo: { versaoId: v.id, rotulo } },
    select: { rotulo: true, texto: true, tipo: true },
  });
  return d ? { ...d, sha256: v.sha256, coletadoEm: v.coletadoEm, ...v.norma } : null;
}
