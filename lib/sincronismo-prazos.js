// ─── SINCRONIZAR AGORA, SEM ESPERAR O CRON ───────────────────────────────────
//
// Matheus (17/09/2026): "crie um botão de sincronizar na tela de Prazos RMs para quando eu receber
// alguns pedidos e quiser sincronizar eu conseguir sem precisar esperar o cron."
//
// A tela `Compras › Prazos das RMs` é alimentada por DOIS crons, e o botão precisa dos dois —
// senão ele corrige metade do que a pessoa acabou de fazer no Omie:
//
//   1. `sync-entregas` (8,11,14,17h) → `statusEntrega` / `dataEntregaReal`: o que CHEGOU.
//   2. `omie-encerrados` (7h20)      → `encerradoOmieEm`: o que o comprador FECHOU.
//
// ⚠⚠ AS DUAS ETAPAS SÃO INDEPENDENTES E CADA UMA RELATA A SUA. O Omie fora do ar na primeira não
// pode impedir a segunda de rodar: são pesquisas diferentes, e meia sincronização informada é
// melhor que nenhuma sincronização explicada. O que elas compartilham é só o ORÇAMENTO de tempo.
//
// ⚠⚠ A ETAPA DE ENTREGAS CORRE SOB A MESMA TRAVA DO CRON (`comTravaDeCron`, chave `sync-entregas`).
// Sem isso o botão seria exatamente o cenário que a trava existe para evitar: a pessoa clica
// justamente quando desconfia do automático — ou seja, perto do horário dele — e duas varreduras
// gravariam retratos fora de ordem, a mais lenta por cima da mais nova.
//
// ⚠ Quem foi barrado pela trava NÃO é erro: é `ocupada`, e a tela diz para tentar em instantes.
import { comTravaDeCron } from "@/lib/cron-trava";
import { syncEntregas } from "@/lib/omie-recebimento";
import { reconciliarEncerramentos } from "@/lib/omie-encerramento";

/** Chave da reserva que segura o INTERVALO MÍNIMO entre dois disparos manuais. */
export const JOB_MANUAL = "sync-manual";

/**
 * Quanto tempo entre um disparo manual e o seguinte.
 *
 * ⚠⚠ A TRAVA IMPEDE SIMULTANEIDADE, NÃO REPETIÇÃO (achado do Codex, 17/09/2026): terminada uma
 * varredura, o clique seguinte passaria na hora. Cada rodada gasta dezenas de chamadas à API do
 * Omie, que tem limite de 3 req/s — dez cliques impacientes derrubariam o sync de todo mundo.
 *
 * ⚠ Vale só para o MANUAL. O cron nunca espera por causa de um clique.
 */
export const INTERVALO_MANUAL_MS = 2 * 60_000;

/**
 * Quanto a vez fica reservada ENQUANTO a rodada acontece.
 *
 * ⚠⚠ TEM DE SER MAIOR QUE A RODADA MAIS LONGA POSSÍVEL, E ESSA É A INVARIANTE QUE SEGURA A TRAVA
 * INTEIRA (achado do Codex, 17/09/2026). A reserva não guarda o dono: qualquer um que a encontre
 * vencida assume, e `renovarVez`/`soltarVez` mexem na linha sem perguntar de quem ela é. Com uma
 * reserva de 2 min e um orçamento de 2min30, existia este roteiro: A reserva em t=0, expira em
 * t=120, B assume, A termina em t=140 e RENOVA a reserva de B. Reservando por mais que o
 * `maxDuration`, a Vercel mata a função antes de a vez vencer — e dois donos nunca coexistem.
 *
 * ⚠ O intervalo mínimo de verdade é aplicado no FIM, por `renovarVez`. Este número é só a janela
 * de execução.
 */
export const RESERVA_DURANTE_MS = 200_000; // > maxDuration (180s) da rota

/**
 * Orçamento de cada etapa, em ms desde o início da requisição. Ver a rota (`maxDuration` 180s).
 *
 * ⚠ MEDIDO em 17/09/2026 contra a produção: a rodada inteira leva ~110 s. Com 70 s a etapa de
 * entregas batia o teto em 46 de 54 pedidos (rodada `parcial`); com 90 s ela fecha os 54. Os
 * encerrados varrem 274 pedidos em ~40 s. Os 30 s que sobram do `maxDuration` são para gravar,
 * auditar, soltar as travas e devolver o JSON — estourar o teto faz a Vercel responder uma página
 * de ERRO EM HTML, e aí o navegador quebra em vez de mostrar o resultado.
 */
export const ORCAMENTO = { entregas: 90_000, total: 150_000 };

const falha = (e) => ({ estado: "falhou", motivo: e?.message || "falha desconhecida" });

/** Etapa 1 — o que chegou. `null` da trava vira `ocupada`; timebox vira `parcial`. */
async function etapaEntregas(prisma, ateMs) {
  try {
    const r = await comTravaDeCron(prisma, "sync-entregas", () => syncEntregas(prisma, {
      // ⚠ Igual ao botão do Cronograma, e pelo mesmo motivo: só os pedidos SEM entrega (os
      // únicos que podem mudar) e SEM a varredura de NFs, que é o maior custo de tempo. O
      // `Recebimento` com a NF associada continua saindo do cron diário.
      apenasPendentes: true, pularNF: true, ateMs,
    }));
    if (r === null) return { estado: "ocupada" };
    return {
      estado: r.timeboxed ? "parcial" : "concluida",
      sincronizados: r.sincronizados, processados: r.processados, total: r.total, erros: r.erros,
    };
  } catch (e) {
    return falha(e);
  }
}

/** Etapa 2 — o que o comprador fechou no Omie. A trava já mora dentro de `reconciliar`. */
async function etapaEncerrados(prisma, ateMs) {
  try {
    const r = await reconciliarEncerramentos(prisma, { ateMs });
    if (r.pulou) return { estado: "ocupada" };
    return {
      // ⚠ Coleta incompleta é `parcial`, nunca sucesso mudo: nessa rodada nada foi desmarcado
      // de propósito, e quem clicou precisa saber que o retrato do Omie veio pela metade.
      estado: r.completa ? "concluida" : "parcial",
      marcados: r.marcados, desmarcados: r.desmarcados,
      indefinidos: r.indefinidos, total: r.total, motivo: r.motivo,
    };
  } catch (e) {
    return falha(e);
  }
}

/**
 * Roda as duas etapas em sequência, dentro do orçamento, e devolve o estado de cada uma.
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {{ t0?: number }} [opts] instante de início (para o orçamento); default: agora
 */
export async function sincronizarPrazos(prisma, opts = {}) {
  const t0 = Number(opts.t0) > 0 ? Number(opts.t0) : Date.now();
  const entregas = await etapaEntregas(prisma, t0 + ORCAMENTO.entregas);
  // ⚠⚠ O SEGUNDO PRAZO É ABSOLUTO, NÃO "MAIS TANTO". Se as entregas gastaram os 70s, sobram 70
  // para os encerrados — não 140. Somar as duas janelas era o jeito de a Vercel matar a rota e o
  // navegador receber a página de erro em HTML no lugar do JSON.
  const encerrados = await etapaEncerrados(prisma, t0 + ORCAMENTO.total);
  return { entregas, encerrados };
}

// ⚠⚠ A LEITURA DO RESULTADO MORA EM OUTRO ARQUIVO, E ISSO NÃO É ORGANIZAÇÃO — É NECESSIDADE.
// Este módulo importa `omie-recebimento`, que importa `recebimento-fonte`, que é `server-only`:
// o botão (client component) precisa de `houveMudanca` e, importando daqui, arrastaria a cadeia
// inteira e quebraria o build da página com "You're importing a component that needs server-only"
// (mesma armadilha já vista em `lib/linha-de-total.js`).
export * from "@/lib/sincronismo-resultado";
