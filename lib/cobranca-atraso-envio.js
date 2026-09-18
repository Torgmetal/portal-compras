// ─── DISPARAR AS COBRANÇAS, UMA POR FORNECEDOR ───────────────────────────────
//
// ⚠⚠ E-MAIL NÃO TEM DESFAZER, E É POR ISSO QUE ESTE ARQUIVO É MAIS CHATO DO QUE PARECE PRECISAR.
// Tudo aqui existe para que uma rodada que falha no meio não vire "manda tudo de novo": a lista de
// quem já foi cobrado tem de sobreviver à falha, e o resultado tem de ser POR FORNECEDOR, nunca um
// erro global (achados do Codex, 17/09/2026).
import { reservarVez, soltarVez } from "@/lib/cron-trava";
import { gerarEmailCobranca } from "@/lib/cobranca-atraso-email";
import { MOTIVO_BLOQUEIO } from "@/lib/cobranca-atraso";
import { log } from "@/lib/log";

const registro = log("cobranca-atraso");

/** Quanto tempo depois de cobrar um fornecedor a tela passa a pedir confirmação. */
export const INTERVALO_COBRANCA_MS = 2 * 24 * 60 * 60_000;

/** O que aconteceu com cada fornecedor. A tela precisa distinguir todos. */
export const ESTADOS = {
  ACEITO: "aceito",              // o provedor aceitou — não é o mesmo que "entregue"
  FALHOU: "falhou",              // recusado no envio; pode tentar de novo
  INDETERMINADO: "indeterminado", // pode ter saído: NUNCA reenviar sozinho
  BLOQUEADO: "bloqueado",        // identidade ambígua ou sem e-mail
  RECENTE: "recente",            // cobrado há menos de 2 dias, sem confirmar
  OCUPADO: "ocupado",            // outra pessoa está cobrando este mesmo fornecedor
  DESCONHECIDO: "desconhecido",  // chave que não está na lista de atrasados
};

const CC_PADRAO = "matheus@torg.com.br,compras@torg.com.br";
const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Os endereços em cópia, do ambiente, validados e sem repetição. */
export function copiasInternas(env = process.env) {
  const brutos = String(env.COBRANCA_ATRASO_CC ?? CC_PADRAO).split(/[,;]/);
  // ⚠ Valida e deduplica: um endereço torto na variável derrubaria o envio inteiro por causa de
  // uma cópia, e o mesmo endereço duas vezes faz a pessoa receber duas.
  return [...new Set(brutos.map((e) => e.trim().toLowerCase()).filter((e) => EMAIL_VALIDO.test(e)))];
}

/** Para onde o fornecedor responde. Caixa da área, não a pessoa que clicou. */
export const respostaPara = (env = process.env) =>
  String(env.COBRANCA_ATRASO_REPLY_TO || "compras@torg.com.br").trim();

/**
 * O token público daquele pedido, criando um se ainda não existe.
 *
 * ⚠⚠ A CRIAÇÃO É CONDICIONAL (achado do Codex, 17/09/2026). Ler nulo e gravar sem condição deixa
 * duas execuções sobrescreverem o token uma da outra — e o link que já saiu num e-mail anterior
 * passa a dar 404 na cara do fornecedor. O `where` com `tokenEntrega: null` faz o Postgres decidir
 * quem cria; quem perdeu relê o que ficou.
 */
export async function garantirToken(prisma, pedidoId, gerar) {
  const atual = await prisma.pedidoOmie.findUnique({
    where: { id: pedidoId }, select: { tokenEntrega: true },
  });
  if (atual?.tokenEntrega) return atual.tokenEntrega;

  const novo = gerar();
  const r = await prisma.pedidoOmie.updateMany({
    where: { id: pedidoId, tokenEntrega: null }, data: { tokenEntrega: novo },
  });
  if (r.count === 1) return novo;

  const relido = await prisma.pedidoOmie.findUnique({
    where: { id: pedidoId }, select: { tokenEntrega: true },
  });
  return relido?.tokenEntrega || null;
}

/**
 * Quando cada fornecedor foi cobrado pela última vez. `Map<chave, Date>`.
 *
 * ⚠ Só para MOSTRAR na tela. A decisão de enviar relê dentro da reserva (ver `ultimaCobrancaDe`):
 * um retrato tirado antes da fila decidiria com dado velho.
 */
export async function ultimasCobrancas(prisma, chaves) {
  if (!chaves?.length) return new Map();
  const linhas = await prisma.auditLog.findMany({
    where: { action: "COBRAR_ATRASO_FORNECEDOR", entityId: { in: chaves } },
    select: { entityId: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  }).catch(() => []);
  const m = new Map();
  for (const l of linhas) if (!m.has(l.entityId)) m.set(l.entityId, l.createdAt);
  return m;
}

/**
 * A última cobrança de UM fornecedor, lida na hora de decidir.
 *
 * ⚠⚠ FALHAR A LEITURA NÃO PODE VALER "NUNCA FOI COBRADO" (achado do Codex, 18/09/2026). O
 * `.catch(() => [])` da listagem serve à tela, onde o pior caso é um rótulo a menos; aqui o pior
 * caso é cobrar de novo quem foi cobrado há uma hora. Sem leitura, não envia.
 */
export async function ultimaCobrancaDe(prisma, chave) {
  try {
    const [l] = await prisma.auditLog.findMany({
      where: { action: "COBRAR_ATRASO_FORNECEDOR", entityId: chave },
      select: { createdAt: true }, orderBy: { createdAt: "desc" }, take: 1,
    });
    return { ok: true, em: l?.createdAt || null };
  } catch (e) {
    return { ok: false, erro: e?.message || "não consegui ler o histórico de cobrança" };
  }
}

/** Os links públicos de previsão, um por pedido do grupo. */
async function linksDoGrupo(prisma, grupo, baseUrl, gerarToken) {
  const links = {};
  for (const l of grupo.pedidos) {
    const token = await garantirToken(prisma, l.id, gerarToken);
    if (token) links[l.id] = `${baseUrl}/fornecedores/entrega/${token}`;
  }
  return links;
}

/**
 * ⚠⚠ A TENTATIVA É GRAVADA ANTES DO ENVIO, E FALHAR AQUI IMPEDE O ENVIO (achado do Codex).
 * Gravando só depois, um erro na auditoria apagaria a prova de que o e-mail saiu — e a trava de
 * 2 dias, que lê justamente daí, mandaria tudo de novo na próxima tentativa. Transação de banco
 * não desfaz e-mail; a ordem é a única proteção que existe.
 *
 * ⚠ O token NUNCA entra no registro: é credencial de acesso público, e log não é lugar de guardar
 * credencial.
 */
async function abrirTentativa(prisma, { grupo, userId, destino, copias }) {
  return prisma.auditLog.create({
    data: {
      userId, action: "COBRAR_ATRASO_FORNECEDOR", entity: "Fornecedor", entityId: grupo.chave,
      diff: {
        estado: "ENVIANDO", fornecedor: grupo.nome, destino, copias,
        pedidos: grupo.pedidos.map((l) => ({
          numeroPedido: l.numeroPedido, rm: l.rmNumero, diasAtraso: l.diasAtraso, parcial: l.parcial,
        })),
      },
    },
    select: { id: true, diff: true },
  });
}

async function fecharTentativa(prisma, tentativa, estado, extra = {}) {
  await prisma.auditLog.update({
    where: { id: tentativa.id },
    data: { diff: { ...tentativa.diff, estado, ...extra, fechadoEm: new Date().toISOString() } },
  }).catch((e) => registro.erro("não consegui fechar a tentativa:", e?.message));
}

/** O envio em si, já com a tentativa aberta. Traduz o retorno do provedor em estado. */
/** O que gravar e devolver quando o provedor não aceitou. */
async function recusa(prisma, tentativa, r) {
  const erro = r?.error || "recusado no envio";
  const duvidoso = r?.indeterminado === true;
  await fecharTentativa(prisma, tentativa, duvidoso ? "INDETERMINADO" : "FALHOU", { erro });
  return { estado: duvidoso ? ESTADOS.INDETERMINADO : ESTADOS.FALHOU, motivo: erro };
}

async function despachar(prisma, { grupo, ctx, tentativa, mensagem }) {
  let r;
  try {
    r = await ctx.enviar(mensagem);
  } catch (e) {
    // ⚠⚠ EXCEÇÃO NO ENVIO É INDETERMINADO, NÃO FALHA. Timeout depois de o provedor ter aceitado é
    // indistinguível de recusa daqui — e reenviar "por garantia" é como o fornecedor recebe a
    // mesma cobrança duas vezes. Fica registrado para uma pessoa decidir.
    await fecharTentativa(prisma, tentativa, "INDETERMINADO", { erro: e?.message || "sem resposta" });
    return { estado: ESTADOS.INDETERMINADO, motivo: e?.message || "o envio não respondeu" };
  }

  if (!r || r.ok !== true) {
    // ⚠⚠ O ADAPTADOR MARCA O QUE FOI EXCEÇÃO. `sendEmail` engole a exceção e devolve `ok:false`
    // nos dois casos; sem `indeterminado`, um timeout depois da aceitação viraria "falhou" e a
    // tela ofereceria reenvio (achado do Codex, 18/09/2026).
    return recusa(prisma, tentativa, r);
  }

  await fecharTentativa(prisma, tentativa, "ENVIADO", { resendId: r.id || null });
  return { estado: ESTADOS.ACEITO, destino: grupo.email, pedidos: grupo.pedidos.length };
}

/** Um fornecedor: reserva, confere o intervalo, grava a tentativa, envia, fecha. */
async function cobrarUm(prisma, grupo, ctx) {
  const chaveVez = `cobranca:${grupo.chave}`;
  const vez = await reservarVez(prisma, chaveVez, 120_000);
  // ⚠ `confirmar` vence o intervalo de 2 dias, mas NUNCA vence uma cobrança em andamento: são
  // coisas diferentes — uma é "eu sei que cobrei ontem", a outra é "alguém está cobrando agora".
  if (!vez.ok) return { chave: grupo.chave, nome: grupo.nome, estado: ESTADOS.OCUPADO };

  const etiqueta = { chave: grupo.chave, nome: grupo.nome };
  try {
    // ⚠⚠ RELÊ DENTRO DA RESERVA. Duas requisições que lessem o histórico ANTES da fila veriam as
    // duas "nunca cobrado", e a segunda enviaria logo depois da primeira terminar.
    const ultima = await ultimaCobrancaDe(prisma, grupo.chave);
    if (!ultima.ok) return { ...etiqueta, estado: ESTADOS.FALHOU, motivo: ultima.erro };
    if (ultima.em && !ctx.confirmar && Date.now() - new Date(ultima.em).getTime() < INTERVALO_COBRANCA_MS) {
      return { ...etiqueta, estado: ESTADOS.RECENTE, ultimaCobranca: ultima.em };
    }

    const links = await linksDoGrupo(prisma, grupo, ctx.baseUrl, ctx.gerarToken);
    const { assunto, html, texto } = gerarEmailCobranca(grupo, links);

    let tentativa;
    try {
      tentativa = await abrirTentativa(prisma, { grupo, userId: ctx.userId, destino: grupo.email, copias: ctx.copias });
    } catch (e) {
      registro.erro(`[${grupo.nome}] não consegui registrar a tentativa — não enviei:`, e?.message);
      return { ...etiqueta, estado: ESTADOS.FALHOU, motivo: "não foi possível registrar o envio; nada foi enviado" };
    }

    const r = await despachar(prisma, { grupo, ctx, tentativa, mensagem: {
      to: grupo.email, cc: ctx.copias, subject: assunto, html, text: texto, replyTo: ctx.replyTo,
    } });
    return { ...etiqueta, ...r };
  } finally {
    await soltarVez(prisma, chaveVez);
  }
}

const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── PRÉVIA PARA QUEM ESTÁ OLHANDO ───────────────────────────────────────────
//
// ⚠⚠ TEMPORÁRIO — Matheus (18/09/2026): "acrescente um enviar teste pra mim só para eu testar,
// depois removemos". Para tirar: apague deste marcador até o fim de `enviarTeste`, o `teste` do
// schema e do POST em `app/api/compras/prazos-rm/cobrar/route.js`, e o botão "Enviar teste para
// mim" no `ModalCobrarAtrasados.jsx`. Nada mais depende disto.
//
// ⚠⚠ O DESTINO VEM DA SESSÃO, NUNCA DO CORPO DA REQUISIÇÃO. Um "mande o teste para este
// endereço" seria um jeito de usar o portal para mandar e-mail com a marca da Torg para qualquer
// um. Aqui só existe um destinatário possível: quem clicou.
//
// ⚠⚠ NÃO ENCOSTA NAS TRAVAS DO CAMINHO REAL. Sem reserva, sem intervalo de 2 dias e com AÇÃO
// PRÓPRIA no AuditLog (`COBRAR_ATRASO_TESTE`) — se a prévia gravasse `COBRAR_ATRASO_FORNECEDOR`,
// ver como ficou bloquearia a cobrança de verdade por dois dias.
export const MAX_TESTE = 3;

/**
 * Manda para quem está logado o MESMO e-mail que o fornecedor receberia.
 *
 * @param {{grupos:object[], chaves:string[], para:string, baseUrl:string, enviar:Function,
 *          gerarToken:Function, userId:string}} opts
 */
/** Um grupo, enviado para quem está olhando. Nunca para o fornecedor. */
async function testarUm(prisma, grupo, ctx) {
  const etiqueta = { chave: grupo.chave, nome: grupo.nome, teste: true, destino: ctx.para };
  try {
    const links = await linksDoGrupo(prisma, grupo, ctx.baseUrl, ctx.gerarToken);
    const { assunto, html, texto } = gerarEmailCobranca(grupo, links);
    // ⚠ O corpo sai IDÊNTICO ao do fornecedor — é o que está sendo avaliado. O prefixo fica só no
    // assunto, para a prévia não ser confundida com uma cobrança de verdade na caixa de entrada
    // (nem encaminhada como se fosse).
    const r = await ctx.enviar({ to: ctx.para, subject: `[PRÉVIA] ${assunto}`, html, text: texto });

    await prisma.auditLog.create({
      data: { userId: ctx.userId, action: "COBRAR_ATRASO_TESTE", entity: "Fornecedor", entityId: grupo.chave,
        diff: { fornecedor: grupo.nome, destino: ctx.para, pedidos: grupo.pedidos.length, ok: !!r?.ok } },
    }).catch(() => {}); // a prévia não precisa de prova durável: nenhum fornecedor foi tocado

    if (r?.ok) return { ...etiqueta, estado: ESTADOS.ACEITO };
    return { ...etiqueta,
      estado: r?.indeterminado ? ESTADOS.INDETERMINADO : ESTADOS.FALHOU,
      motivo: r?.error || "recusado no envio" };
  } catch (e) {
    return { ...etiqueta, estado: ESTADOS.FALHOU, motivo: e?.message || "falha no teste" };
  }
}

/**
 * Manda para quem está logado o MESMO e-mail que o fornecedor receberia.
 *
 * @param {{grupos:object[], chaves:string[], para:string, baseUrl:string, enviar:Function,
 *          gerarToken:Function, userId:string}} opts
 */
export async function enviarTeste(prisma, { grupos, chaves, para, baseUrl, enviar, gerarToken, userId }) {
  if (!para) throw new Error("sem destinatário de teste na sessão");
  const porChave = new Map(grupos.map((g) => [g.chave, g]));
  const ctx = { para, baseUrl, enviar, gerarToken, userId };
  const resultados = [];

  // ⚠ Teto baixo de propósito: a prévia serve para OLHAR, e marcar os oito enche a caixa de quem
  // clicou com oito mensagens quase iguais — o mesmo defeito que o agrupamento existe para evitar.
  for (const chave of chaves.slice(0, MAX_TESTE)) {
    const grupo = porChave.get(chave);
    if (!grupo) { resultados.push({ chave, estado: ESTADOS.DESCONHECIDO }); continue; }
    if (grupo.bloqueio) {
      resultados.push({ chave, nome: grupo.nome, estado: ESTADOS.BLOQUEADO,
        motivo: MOTIVO_BLOQUEIO[grupo.bloqueio] || grupo.bloqueio });
      continue;
    }
    resultados.push(await testarUm(prisma, grupo, ctx));
    await pausa(600);
  }
  return resultados;
}
// ─── FIM DO TRECHO TEMPORÁRIO ────────────────────────────────────────────────

/**
 * Cobra os fornecedores escolhidos, um e-mail para cada.
 *
 * ⚠⚠ EM SEQUÊNCIA, COM PAUSA. O Resend aceita ~2 req/s e o `sendEmailBatch` deste projeto DESCARTA
 * `cc` e `replyTo` — usá-lo mandaria a cobrança sem as cópias internas, em silêncio.
 *
 * ⚠ Nenhum fornecedor derruba os outros: cada um volta com o seu estado, e quem não chegou a ser
 * processado volta como `nao_processado` em vez de sumir.
 */
export async function enviarCobrancas(prisma, { grupos, chaves, userId, confirmar, baseUrl, enviar, gerarToken, env }) {
  const porChave = new Map(grupos.map((g) => [g.chave, g]));
  const ctx = {
    confirmar: confirmar === true, baseUrl, enviar, gerarToken, userId,
    copias: copiasInternas(env), replyTo: respostaPara(env),
  };

  const resultados = [];
  for (const chave of chaves) {
    const grupo = porChave.get(chave);
    // ⚠ Chave que não está entre os atrasados não vira busca nova: é recusa. Sem isso, o corpo da
    // requisição escolheria quem cobrar.
    if (!grupo) { resultados.push({ chave, estado: ESTADOS.DESCONHECIDO }); continue; }
    if (grupo.bloqueio) {
      resultados.push({ chave, nome: grupo.nome, estado: ESTADOS.BLOQUEADO,
        motivo: MOTIVO_BLOQUEIO[grupo.bloqueio] || grupo.bloqueio });
      continue;
    }
    try {
      resultados.push(await cobrarUm(prisma, grupo, ctx));
    } catch (e) {
      // ⚠⚠ UM FORNECEDOR NÃO DERRUBA A RODADA (achado do Codex, 18/09/2026). Uma exceção na
      // reserva ou na geração dos links escapava daqui e matava a resposta inteira — depois de
      // alguns e-mails já terem saído, e sem dizer quais.
      registro.erro(`[${grupo.nome}] quebrou antes do envio:`, e?.message);
      resultados.push({ chave, nome: grupo.nome, estado: ESTADOS.FALHOU,
        motivo: e?.message || "falha antes do envio" });
    }
    await pausa(600); // rate limit do Resend
  }
  return resultados;
}
