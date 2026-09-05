// Monta o UPDATE de uma tarefa de cronograma a partir do corpo do PATCH.
//
// ⚠ POR QUE SAIU DA ROTA. O handler PATCH tinha complexidade 140 — a maior do
// repositório inteiro — e quase toda ela era uma cadeia de ~18 `if (campo !==
// undefined)`. Cada um decide três coisas ao mesmo tempo: o que vai pro banco
// (`data`), o que entra no AuditLog (`diffAntes`/`diffDepois`), e se o
// cronograma precisa ser recalculado (`antecessorasChanged`).
//
// ⚠ E POR QUE UMA TABELA. Metade desses `if` tinha a MESMA forma: mudou? grava
// o antes, grava o depois, grava o valor. Repetido, isso é ruído que esconde os
// campos que de fato têm regra própria — bloqueio, datas reais, duração. Com os
// idênticos numa tabela, o que sobra escrito por extenso é exatamente o que
// merece leitura.
//
// Separado, dá pra TESTAR campo a campo sem subir rota, sem sessão e sem banco —
// que é o que testes/lib/cronograma-tarefa-patch.teste.js faz. Junto, a única
// forma de exercitar um campo era um PATCH de verdade contra a produção.
import { calcularDefasagem, addWorkdays, addCalendarDays } from "@/lib/cronograma-recalcular";

/** Campos cuja regra é só "mudou? registra o diff e grava".
 *
 * ⚠ `sempreGrava` NÃO é detalhe de estilo. Sem ele, um campo inalterado entraria
 * no UPDATE — e para `duracaoDias` isso muda comportamento de verdade: quem
 * dispara `recomputarFimPelaDuracao` é a PRESENÇA de `data.duracaoDias`. Mandar
 * a mesma duração de novo passaria a mexer na data de término e a cascatear pras
 * sucessoras. Só `responsavelId` e `esperaDe` gravam sempre, como no original. */
const CAMPOS_SIMPLES = [
  { campo: "nome" },
  { campo: "percentualRealizado" },
  { campo: "qtdePlanejada" },
  { campo: "qtdeRealizada" },
  // duração mexe no encadeamento: mudar dispara o recálculo das sucessoras
  { campo: "duracaoDias", recalcula: true },
  // `|| null` porque "" e null são o mesmo "sem responsável" vindo do formulário
  { campo: "responsavelId", vazioEhNulo: true, sempreGrava: true },
  { campo: "esperaDe", vazioEhNulo: true, sempreGrava: true },
];

/** Campos que só copiam o valor, sem diff de auditoria e sem recálculo. */
const CAMPOS_DIRETOS = [
  // Área é só rótulo de agrupamento (Setor → Área → Tarefa) — não recalcula nada.
  { campo: "area", transforma: (v) => v?.trim() || null },
  { campo: "observacao" },
  { campo: "dataRealizacao", transforma: (v) => (v ? new Date(v) : null) },
  { campo: "dataInicioReal", transforma: (v) => (v ? new Date(v) : null) },
];

function aplicarSimples(ctx, entrada, tarefa) {
  for (const { campo, recalcula, vazioEhNulo, sempreGrava } of CAMPOS_SIMPLES) {
    if (entrada[campo] === undefined) continue;
    const novo = vazioEhNulo ? entrada[campo] || null : entrada[campo];
    const atual = vazioEhNulo ? tarefa[campo] || null : tarefa[campo];
    const mudou = novo !== atual;
    if (mudou) {
      ctx.diffAntes[campo] = atual;
      ctx.diffDepois[campo] = novo;
      if (recalcula) ctx.antecessorasChanged = true;
    }
    if (mudou || sempreGrava) ctx.data[campo] = novo;
  }
  for (const { campo, transforma } of CAMPOS_DIRETOS) {
    if (entrada[campo] === undefined) continue;
    ctx.data[campo] = transforma ? transforma(entrada[campo]) : entrada[campo];
  }
}

function aplicarAntecessoras(ctx, entrada, tarefa, id) {
  if (entrada.antecessoraIds === undefined) return;
  const ids = entrada.antecessoraIds.filter((aid) => aid !== id);
  const antes = (tarefa.antecessoraIds || []).sort().join(",");
  if (antes !== ids.sort().join(",")) {
    ctx.antecessorasChanged = true;
    ctx.diffAntes.antecessoraIds = tarefa.antecessoraIds || [];
    ctx.diffDepois.antecessoraIds = ids;
  }
  ctx.data.antecessoraIds = ids;
}

function aplicarEstimativa(ctx, entrada, tarefa) {
  if (entrada.diasParaConcluir === undefined) return;
  const novo = entrada.diasParaConcluir;
  if (novo !== tarefa.diasParaConcluir) {
    ctx.diffAntes.diasParaConcluir = tarefa.diasParaConcluir ?? null;
    ctx.diffDepois.diasParaConcluir = novo ?? null;
  }
  ctx.data.diasParaConcluir = novo ?? null;
  // ⚠ a data da estimativa anda junto: "faltam 5 dias" dito há três semanas não é previsão, é
  // história. É esse carimbo que deixa a tela avisar quando a estimativa envelheceu.
  ctx.data.estimativaEm = novo == null ? null : new Date();
}

function aplicarBloqueio(ctx, entrada, tarefa) {
  if (entrada.motivoBloqueio !== undefined) {
    if ((entrada.motivoBloqueio || null) !== (tarefa.motivoBloqueio || null)) {
      ctx.diffAntes.motivoBloqueio = tarefa.motivoBloqueio || null;
      ctx.diffDepois.motivoBloqueio = entrada.motivoBloqueio || null;
      ctx.antecessorasChanged = true; // bloqueio afeta as sucessoras
      // ⚠⚠ A ESPERA COMEÇA AGORA. Vitor (29/08/2026): "alguns eventos são de responsabilidade do
      // cliente e não medimos isso, e vários atrasos podem ser causados por isso". Sem a data de
      // início, o hold guarda o motivo mas não a duração — e "quantos dias o cliente segurou o
      // projeto" fica sendo memória de reunião. Só marca quando a espera NASCE; ao sair do
      // bloqueio, zera, para a próxima espera não herdar o relógio da anterior.
      if (entrada.motivoBloqueio) { if (!tarefa.esperaInicio) ctx.data.esperaInicio = new Date(); }
      else { ctx.data.esperaInicio = null; ctx.data.esperaDe = null; }
    }
    ctx.data.motivoBloqueio = entrada.motivoBloqueio;
  }
  // ⚠ liberar encerra a espera: o `dataLiberacao` é o fim do período que `esperaInicio` abriu.
  if (entrada.dataLiberacao !== undefined) {
    const novaLib = entrada.dataLiberacao ? new Date(entrada.dataLiberacao) : null;
    if (tarefa.dataLiberacao?.toISOString() !== novaLib?.toISOString()) {
      ctx.diffAntes.dataLiberacao = tarefa.dataLiberacao?.toISOString() || null;
      ctx.diffDepois.dataLiberacao = novaLib?.toISOString() || null;
      ctx.antecessorasChanged = true;
    }
    ctx.data.dataLiberacao = novaLib;
  }
}

function aplicarTerminoReal(ctx, entrada, tarefa) {
  if (entrada.dataFimReal === undefined) return;
  ctx.data.dataFimReal = entrada.dataFimReal ? new Date(entrada.dataFimReal) : null;
  // Mantém dataRealizacao em sincronia (consumida pelo recálculo de antecessoras
  // e pela exportação) quando o término real é informado.
  if (entrada.dataRealizacao === undefined) ctx.data.dataRealizacao = ctx.data.dataFimReal;

  // ⚠⚠ CONCLUIR = 100%. Vitor (29/08/2026): "sempre que for dado como concluído uma tarefa
  // precisa ser atualizado o % do cronograma". Informar o TÉRMINO REAL é dar a tarefa por
  // concluída; sem isto ela ficava com data de fim e progresso parado (às vezes em 0), e o
  // cronograma mostrava a obra mais atrasada do que está. Quem manda um percentual explícito
  // continua mandando — este preenchimento só cobre quem não mandou.
  if (ctx.data.dataFimReal && entrada.percentualRealizado === undefined && tarefa.percentualRealizado !== 100) {
    ctx.diffAntes.percentualRealizado = tarefa.percentualRealizado;
    ctx.diffDepois.percentualRealizado = 100;
    ctx.data.percentualRealizado = 100;
  }
}

async function aplicarDatasPrevistas(ctx, entrada, tarefa, id) {
  if (entrada.dataInicioPrevista !== undefined) {
    const novo = entrada.dataInicioPrevista ? new Date(entrada.dataInicioPrevista) : null;
    if (tarefa.dataInicioPrevista?.toISOString() !== novo?.toISOString()) {
      ctx.diffAntes.dataInicioPrevista = tarefa.dataInicioPrevista?.toISOString() || null;
      ctx.diffDepois.dataInicioPrevista = novo?.toISOString() || null;
      ctx.data.dataInicioPrevista = novo;
      // Data digitada à mão numa tarefa com antecessora: guarda a defasagem
      // (lead/lag) que ela representa. Negativa = antecipação (começou antes da
      // anterior terminar). Sem isso o recálculo logo em seguida jogaria a data
      // de volta pro dia seguinte ao fim da antecessora.
      if (novo && tarefa.antecessoraIds?.length) {
        ctx.data.defasagemDias = await calcularDefasagem(tarefa.cronogramaId, id, novo);
      }
    }
  }
  if (entrada.dataFimPrevista !== undefined) {
    const novo = entrada.dataFimPrevista ? new Date(entrada.dataFimPrevista) : null;
    if (tarefa.dataFimPrevista?.toISOString() !== novo?.toISOString()) {
      ctx.diffAntes.dataFimPrevista = tarefa.dataFimPrevista?.toISOString() || null;
      ctx.diffDepois.dataFimPrevista = novo?.toISOString() || null;
      ctx.data.dataFimPrevista = novo;
    }
  }
}

// Duração alterada → recomputa o FIM desta tarefa (início + duração, mesma
// convenção do motor), a menos que um fim explícito tenha vindo no mesmo request.
// Sem isto, mudar a duração ("dias úteis trabalhados") não movia a data de término
// nem cascateava pras sucessoras: o recálculo automático só recomputa o fim quando o
// INÍCIO desloca (e pula tarefa sem antecessora). Com o fim atualizado aqui, o
// recalcularCronograma propaga o deslocamento pras sucessoras (finish-to-start).
function recomputarFimPelaDuracao(ctx, tarefa) {
  if (ctx.data.duracaoDias === undefined || ctx.data.dataFimPrevista !== undefined) return;
  const inicioBase = ctx.data.dataInicioPrevista !== undefined ? ctx.data.dataInicioPrevista : tarefa.dataInicioPrevista;
  if (!inicioBase) return;
  const isDU = (tarefa.cronograma.tipoDias || "DU") === "DU";
  const inicioDate = new Date(inicioBase);
  const dur = ctx.data.duracaoDias;
  const novoFim = dur > 0
    ? (isDU ? addWorkdays(inicioDate, dur) : addCalendarDays(inicioDate, dur))
    : inicioDate;
  if (!tarefa.dataFimPrevista || new Date(tarefa.dataFimPrevista).getTime() !== novoFim.getTime()) {
    ctx.data.dataFimPrevista = novoFim;
    ctx.diffAntes.dataFimPrevista = tarefa.dataFimPrevista?.toISOString() || null;
    ctx.diffDepois.dataFimPrevista = novoFim.toISOString();
  }
}

/**
 * @param {object} entrada  o `parsed.data` do schema Zod do PATCH
 * @param {object} tarefa   a tarefa como está hoje no banco (com `cronograma`)
 * @param {string} id       id da tarefa (pra ela não virar antecessora de si mesma)
 * @returns {Promise<{data: object, diffAntes: object, diffDepois: object, antecessorasChanged: boolean}>}
 */
export async function montarAtualizacaoDaTarefa(entrada, tarefa, id) {
  const ctx = { data: {}, diffAntes: {}, diffDepois: {}, antecessorasChanged: false };
  // ⚠ A ORDEM IMPORTA em dois pontos: `aplicarTerminoReal` só sabe que não deve
  // sobrescrever um percentual explícito porque olha `entrada`, não `ctx.data`;
  // e `recomputarFimPelaDuracao` precisa das datas previstas já resolvidas.
  aplicarSimples(ctx, entrada, tarefa);
  aplicarAntecessoras(ctx, entrada, tarefa, id);
  aplicarEstimativa(ctx, entrada, tarefa);
  aplicarBloqueio(ctx, entrada, tarefa);
  aplicarTerminoReal(ctx, entrada, tarefa);
  await aplicarDatasPrevistas(ctx, entrada, tarefa, id);
  recomputarFimPelaDuracao(ctx, tarefa);
  return ctx;
}
