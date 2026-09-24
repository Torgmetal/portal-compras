import { NextResponse } from "next/server";
import { requireAcesso } from "@/lib/session";
import { responder } from "@/lib/fiscal/assistente/orquestrador";
import { abrirExecucao, concluirExecucao, falharExecucao, lerConversa, gravarAnexo } from "@/lib/fiscal/assistente/conversas";
import { lerPedido, hashDaTentativa, CorpoRecusado } from "@/lib/fiscal/assistente/pedido";
import { PARSER_VERSAO } from "@/lib/fiscal/assistente/anexo-nfe";
import { reservar, conciliar, devolver } from "@/lib/fiscal/assistente/orcamento";
import { configurado } from "@/lib/fiscal/assistente/provedor";
import { log } from "@/lib/log";

// ─── UMA PERGUNTA AO ASSISTENTE FISCAL ───────────────────────────────────────
//
// ⚠⚠ A ROTA TRANSMITE PROGRESSO, NUNCA AFIRMAÇÃO FISCAL NÃO CONFERIDA (parecer do Codex,
// 23/09/2026). O que viaja durante a execução é "consultando a TIPI", "procurando o fundamento" —
// o texto só sai depois de passar pela conferência de prosa contra as evidências. Streaming de
// token adiantaria justamente o que ainda não foi verificado.
//
// ⚠⚠ ORDEM DAS QUATRO COISAS, E ELA NÃO É NEGOCIÁVEL:
//   1. reserva de orçamento (atômica, ANTES da chamada — senão duas simultâneas furam o teto)
//   2. abertura da execução EM_ANDAMENTO (transação curta)
//   3. chamada ao modelo (FORA de transação — 30 s de rede segurando o Neon é OOM 53200)
//   4. conclusão com o resultado + conciliação do custo real (transação curta)
const registro = log("api/fiscal/assistente");
export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const sse = (evento, dados) => `event: ${evento}\ndata: ${JSON.stringify(dados)}\n\n`;

/**
 * ⚠⚠ O RELÓGIO COMEÇA NA ENTRADA DA ROTA, NÃO NA CHAMADA AO MODELO (achado do Codex, 24/09/2026).
 * `maxDuration = 60` é da FUNÇÃO inteira: autenticação, reserva, abertura da execução e leitura do
 * histórico já gastam parte dele. O modelo recebe o que SOBRA até 50 s — os 10 s finais são de
 * gravar a resposta e conciliar o custo, e não podem ser disputados por uma chamada lenta.
 */
const PRAZO_MODELO_MS = 50_000;

export async function POST(req) {
  const ateModelo = Date.now() + PRAZO_MODELO_MS;
  let user;
  try {
    user = await requireAcesso({ modulos: ["FISCAL", "FINANCEIRO"] });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  if (!configurado()) {
    return NextResponse.json({ success: false, error: "O assistente fiscal está desligado: a chave da API de IA não está configurada neste ambiente." }, { status: 503 });
  }

  // ⚠⚠ O CORPO É LIDO E O XML É VALIDADO ANTES DO ORÇAMENTO: arquivo inválido ou grande demais é
  // recusado sem tocar no teto de ninguém. E com teto de BYTES de verdade — ver `multipart.js`.
  let body;
  let anexo;
  try {
    ({ corpo: body, anexo } = await lerPedido(req));
  } catch (e) {
    if (e instanceof CorpoRecusado) return NextResponse.json({ success: false, error: e.message }, { status: e.status });
    throw e;
  }

  // 1. O ORÇAMENTO PRIMEIRO. ⚠ Recusar depois de chamar não desfaz a chamada.
  const vez = await reservar(user.id);
  if (!vez.ok) return NextResponse.json({ success: false, error: vez.motivo }, { status: 429 });

  // 2. A EXECUÇÃO, em transação curta.
  const aberta = await abrirExecucao({
    conversaId: body.conversaId ?? null, userId: user.id,
    userNome: user.name ?? user.email, pergunta: body.pergunta, chave: body.chave,
    tentativaHash: hashDaTentativa(body, anexo),
  });
  // ⚠⚠ MESMA CHAVE, OUTRO CONTEÚDO: 409, e a reserva volta — nenhuma chamada foi feita.
  if (aberta.conflito) {
    await devolver(user.id, { dia: vez.dia, micros: vez.reservado });
    return NextResponse.json({ success: false, conflito: true, error: "Esta tentativa já foi usada com outro conteúdo. Envie de novo." }, { status: 409 });
  }
  // ⚠⚠⚠ OS DOIS CAMINHOS ABAIXO SAEM SEM CHAMAR O MODELO, E POR ISSO DEVOLVEM A RESERVA (achado do
  // Codex, 24/09/2026). Antes, um 404 de conversa apagada e — pior — cada reenvio da MESMA chave
  // retinham R$ 0,25 do teto de quem não tinha perguntado nada de novo. Numa rede instável, o
  // navegador reenvia várias vezes: a pessoa seria barrada pelo próprio mecanismo que existe para
  // não cobrá-la duas vezes, e o teto do portal se esgotaria sem uma única consulta à IA.
  //
  // ⚠ Devolver AQUI é seguro e no `finally` do fluxo não seria: aqui é certo que `responder()`
  // nunca foi chamado.
  if (aberta.erro) {
    await devolver(user.id, { dia: vez.dia, micros: vez.reservado });
    return NextResponse.json({ success: false, error: aberta.erro }, { status: 404 });
  }

  // ⚠⚠ REENVIO DA MESMA CHAVE NÃO COBRA DE NOVO — devolve o que já existe, concluído ou em curso.
  if (aberta.repetida) {
    await devolver(user.id, { dia: vez.dia, micros: vez.reservado });
    const c = await lerConversa(aberta.conversa.id, user.id);
    return NextResponse.json({ success: true, repetida: true, conversaId: aberta.conversa.id, conversa: c });
  }

  const historico = (await lerConversa(aberta.conversa.id, user.id))?.mensagens
    ?.filter((m) => m.estado === "CONCLUIDA" && m.conteudo && m.id !== aberta.resposta.id)
    ?.slice(-12) ?? [];
  // ⚠ A última é a própria pergunta que acabou de ser gravada — o orquestrador a recebe à parte.
  const anteriores = historico.filter((m) => m.conteudo !== body.pergunta || m.papel !== "USUARIO");

  // ⚠ O XML fica guardado (privado, no Postgres) ANTES da chamada: se ela falhar, o documento que a
  // pessoa anexou continua recuperável. Falha ao gravar não derruba a resposta — vai para o carimbo.
  const guardado = anexo ? await gravarAnexo({
    userId: user.id, nome: anexo.nome, tamanho: anexo.tamanho, sha256: anexo.sha256,
    conteudo: anexo.conteudo, parserVersao: PARSER_VERSAO, chaveNfe: anexo.doc.chave,
  }) : null;
  // ⚠ O orquestrador NÃO recebe o texto cru do XML — só o documento já lido e validado.
  const anexoParaModelo = anexo ? { doc: anexo.doc, problemas: anexo.problemas, suspeito: anexo.suspeito, nome: anexo.nome, tamanho: anexo.tamanho, sha256: anexo.sha256, guardado } : null;

  const fluxo = new ReadableStream({
    async start(ctrl) {
      const env = (e, d) => { try { ctrl.enqueue(new TextEncoder().encode(sse(e, d))); } catch { /* cliente saiu */ } };
      env("etapa", { etapa: "inicio", conversaId: aberta.conversa.id });
      try {
        // 3. A CHAMADA — fora de qualquer transação.
        const r = await responder({
          historico: anteriores, pergunta: body.pergunta,
          aoProgredir: (p) => env("etapa", p),
          ateMs: ateModelo,
          anexo: anexoParaModelo,
        });
        if (r.referencias?.anexo) r.referencias.anexo.guardado = guardado;
        // 4. CONCLUSÃO E CONCILIAÇÃO.
        await concluirExecucao(aberta.resposta.id, { ...r, conversaId: aberta.conversa.id });
        await conciliar(user.id, { dia: vez.dia, reservado: vez.reservado, micros: r.custoMicros, tokensEntrada: r.uso.entrada, tokensSaida: r.uso.saida });
        registro.info(`${user.email}: ${r.ferramentas.length} ferramenta(s), ${r.uso.entrada}+${r.uso.saida} tokens, ${r.avisos.length} aviso(s) de prosa`);
        // ⚠ Só DEPOIS de gravado o evento final sai — senão a tela mostraria o que o banco não tem.
        env("pronta", {
          conversaId: aberta.conversa.id, mensagemId: aberta.resposta.id,
          conteudo: r.conteudo, blocos: r.blocos, evidencias: r.evidencias,
          avisos: r.avisos, ferramentas: r.ferramentas.map((f) => f.nome), referencias: r.referencias,
        });
      } catch (e) {
        await falharExecucao(aberta.resposta.id, e.message);
        registro.erro(`${user.email}: ${e.message}`);
        env("erro", { erro: "Não foi possível consultar o assistente agora. A pergunta ficou gravada na conversa." });
      } finally {
        try { ctrl.close(); } catch { /* já fechado */ }
      }
    },
  });

  return new Response(fluxo, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
    },
  });
}
