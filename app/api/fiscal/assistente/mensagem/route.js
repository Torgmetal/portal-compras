import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAcesso } from "@/lib/session";
import { responder } from "@/lib/fiscal/assistente/orquestrador";
import { abrirExecucao, concluirExecucao, falharExecucao, lerConversa } from "@/lib/fiscal/assistente/conversas";
import { reservar, conciliar } from "@/lib/fiscal/assistente/orcamento";
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

const schema = z.object({
  pergunta: z.string().trim().min(2, "Escreva a sua pergunta.").max(4000, "A pergunta passou de 4.000 caracteres."),
  conversaId: z.string().max(40).optional().nullable(),
  // ⚠⚠ UMA CHAVE POR TENTATIVA, gerada pelo navegador. Reenvio com a MESMA chave devolve a
  // execução que já existe em vez de cobrar outra chamada — cada tentativa aqui é dinheiro.
  chave: z.string().trim().min(8).max(64),
});

const sse = (evento, dados) => `event: ${evento}\ndata: ${JSON.stringify(dados)}\n\n`;

export async function POST(req) {
  let user;
  try {
    user = await requireAcesso({ modulos: ["FISCAL", "FINANCEIRO"] });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  if (!configurado()) {
    return NextResponse.json({ success: false, error: "O assistente fiscal está desligado: a chave da API de IA não está configurada neste ambiente." }, { status: 503 });
  }

  let body;
  try {
    body = schema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ success: false, error: e.issues?.[0]?.message ?? "Dados inválidos." }, { status: 400 });
  }

  // 1. O ORÇAMENTO PRIMEIRO. ⚠ Recusar depois de chamar não desfaz a chamada.
  const vez = await reservar(user.id);
  if (!vez.ok) return NextResponse.json({ success: false, error: vez.motivo }, { status: 429 });

  // 2. A EXECUÇÃO, em transação curta.
  const aberta = await abrirExecucao({
    conversaId: body.conversaId ?? null, userId: user.id,
    userNome: user.name ?? user.email, pergunta: body.pergunta, chave: body.chave,
  });
  if (aberta.erro) return NextResponse.json({ success: false, error: aberta.erro }, { status: 404 });

  // ⚠⚠ REENVIO DA MESMA CHAVE NÃO COBRA DE NOVO — devolve o que já existe, concluído ou em curso.
  if (aberta.repetida) {
    const c = await lerConversa(aberta.conversa.id, user.id);
    return NextResponse.json({ success: true, repetida: true, conversaId: aberta.conversa.id, conversa: c });
  }

  const historico = (await lerConversa(aberta.conversa.id, user.id))?.mensagens
    ?.filter((m) => m.estado === "CONCLUIDA" && m.conteudo && m.id !== aberta.resposta.id)
    ?.slice(-12) ?? [];
  // ⚠ A última é a própria pergunta que acabou de ser gravada — o orquestrador a recebe à parte.
  const anteriores = historico.filter((m) => m.conteudo !== body.pergunta || m.papel !== "USUARIO");

  const fluxo = new ReadableStream({
    async start(ctrl) {
      const env = (e, d) => { try { ctrl.enqueue(new TextEncoder().encode(sse(e, d))); } catch { /* cliente saiu */ } };
      env("etapa", { etapa: "inicio", conversaId: aberta.conversa.id });
      try {
        // 3. A CHAMADA — fora de qualquer transação.
        const r = await responder({
          historico: anteriores, pergunta: body.pergunta,
          aoProgredir: (p) => env("etapa", p),
        });
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
