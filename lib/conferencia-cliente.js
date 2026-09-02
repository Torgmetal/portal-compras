import "server-only";
import { prisma } from "./prisma";
import { conciliarRecebimentoCmr } from "./recebimento-cmr";
import { sincronizarCronogramaSyneco, avancosDasTarefas } from "./cronograma-syneco";

// ─── CONFERÊNCIA DO QUE O CLIENTE VÊ ──────────────────────────────────────────
//
// Vitor (02/09/2026), depois de descobrir sozinho, no portal do cliente, que o material aparecia
// como "Comprado" com data de chegada e R: **"e vou ter que pedir sempre para você verificar
// isso?"**. Não.
//
// ⚠⚠ O MONITOR DE CRONS NÃO PEGA ESTE TIPO DE ERRO, e é por isso que esta lib existe. Ele responde
// "o processo rodou?"; os três problemas desta semana responderam "sim" e mesmo assim estavam
// errados:
//
//   · o cronograma da 112 mostrava 22,1% onde o corte estava em 43,9% — a sincronização rodou
//     perfeitamente, o escopo é que contava a LE e a LPC como peças diferentes;
//   · a conciliação do CMR parou em 19/08 — o cron até rodava, mas a conciliação estava pendurada
//     dentro do download da planilha e nunca era alcançada;
//   · o portal exibia data de chegada em linha não recebida — nenhum processo falhou.
//
// A diferença é a pergunta. Monitor pergunta pelo PROCESSO; esta conferência pergunta pelo
// RESULTADO, e só naquilo que o cliente tem na tela agora. É o contrário de um relatório: silêncio
// é o estado normal, e cada achado tem que ser objetivo o bastante para valer um e-mail.
//
// ⚠ SÓ PORTAL PUBLICADO. Rascunho é trabalho em andamento — apontar inconsistência em rascunho
// treina a equipe a ignorar o alerta, e um alerta ignorado é pior que nenhum.

const DIA = 86400000;
const dISO = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);
const brl = (n) => Math.round(n).toLocaleString("pt-BR");

// Dias que uma fase pode ficar sem NENHUMA baixa depois da data prevista de início antes de virar
// achado. Cinco dias corridos ≈ uma semana de fábrica: cobre feriado e começo empurrado por um ou
// dois dias, que é normal, sem deixar passar obra parada.
const DIAS_SEM_APONTAR = 5;

/**
 * Confere a coerência do que os clientes veem nos portais publicados.
 * Nunca lança: cada checagem é isolada, e uma que falhe não pode calar as outras.
 * @returns {Promise<{achados: {titulo:string, detalhe:string, onde:string}[]}>}
 */
export async function conferirOQueOClienteVe() {
  const achados = [];

  // ── 1. Material que chegou e o portal ainda mostra como "Comprado" ──────────
  //
  // ⚠ USA A PRÓPRIA CONCILIAÇÃO EM MODO SIMULAÇÃO, de propósito. Reimplementar aqui a regra de
  // casamento (descrição idêntica, ≥95%, FIFO, entrada posterior ao pedido) criaria uma segunda
  // versão dela para divergir da primeira — e o alerta passaria a apontar erro onde não há.
  // Simulando, o que esta conferência chama de pendência é exatamente o que a rotina lançaria.
  try {
    const { resumo } = await conciliarRecebimentoCmr({ simular: true });
    if (resumo?.itens > 0) {
      achados.push({
        titulo: `${resumo.itens} item(ns) de compra chegaram e o portal ainda mostra "Comprado"`,
        detalhe: `${brl(resumo.kg || 0)} kg em ${resumo.ops} OP(s). O Almoxarifado lançou no CMR e a baixa de recebimento não foi feita — no portal do cliente a linha sai com data de chegada e status de não recebido.`,
        onde: "Compras › Recebimento (CMR) — botão de conciliar",
      });
    }
  } catch (e) {
    achados.push({
      titulo: "Não consegui conferir o recebimento do CMR",
      detalhe: e?.message || "falhou",
      onde: "Compras › Recebimento (CMR)",
    });
  }

  // ── 2. Fase de fabricação que já devia ter começado e não tem nenhuma baixa ──
  //
  // O caso da OP-113: a Preparação estava prevista para 28/08, o material já tinha chegado, as
  // ordens estavam lançadas no Syneco — e no dia 02/09 não havia um único apontamento. O cliente
  // abre o cronograma e vê a barra parada; quem descobriu foi ele, não nós.
  //
  // ⚠ SÓ A PRIMEIRA FASE VENCIDA DE CADA OBRA. As seguintes estão em zero por consequência dessa,
  // e listar as quatro transformaria um problema em quatro linhas de e-mail.
  try {
    const portais = await prisma.portalCliente.findMany({
      where: { status: "PUBLICADO", opId: { not: null } },
      select: { opNumero: true, empresa: true, opId: true },
    });
    const limite = new Date(Date.now() - DIAS_SEM_APONTAR * DIA);

    for (const p of portais) {
      // ⚠ CASA POR opId, NÃO PELO NÚMERO. O cronograma guarda "T112" e o portal guarda "112" —
      // comparar os dois textos não acha nada e a conferência ficaria muda achando que está tudo bem.
      const cron = await prisma.cronograma.findFirst({
        where: { opId: p.opId, ativo: true },
        select: { id: true, opNumero: true, titulo: true },
      });
      if (!cron) continue;

      const tarefas = await prisma.cronogramaTarefa.findMany({
        where: { cronogramaId: cron.id },
        orderBy: { dataInicioPrevista: "asc" },
      });
      const sync = await sincronizarCronogramaSyneco(prisma, p.opId, cron.opNumero);
      const avancos = avancosDasTarefas(tarefas, sync);

      const medidas = tarefas.map((t) => ({ t, av: avancos.get(t.id) })).filter((x) => x.av && !x.av.ambigua);
      if (!medidas.length) continue;
      const quem = p.empresa ? ` (${p.empresa})` : "";

      // ⚠⚠ "SEM APONTAMENTO" E "SEM COMO MEDIR" SÃO PROBLEMAS DIFERENTES, e confundir os dois faz o
      // alerta mandar a pessoa para o lugar errado. A T094 (BRACELL) não tem NENHUMA peça
      // cadastrada: sem lista, o escopo é zero e nenhuma fase pode passar de 0% — o cliente vê a
      // fabricação inteira parada e não é a fábrica que está parada, é a lista que não subiu.
      if (medidas.every((x) => !(x.av.escopoKg > 0))) {
        achados.push({
          titulo: `${cron.opNumero} — cronograma publicado sem lista de peças`,
          detalhe: `Nenhuma peça cadastrada na OP, então nenhuma fase da fabricação consegue sair de 0%. O cliente${quem} vê a obra inteira parada no portal.`,
          onde: "Engenharia › Listas (LE / LPC) — importar a lista da OP",
        });
        continue;
      }

      // ⚠⚠ FRENTE INTEIRA SEM PEÇA — o caso da T089. A obra tem lista (as frentes A e C andam a
      // 68% e 96%), mas a frente B (TPR 803 - Estrutura Metálica de Acesso) não tem uma única peça
      // cadastrada. As quatro linhas dela ficam em 0% para sempre, e no portal isso lê como
      // "a Torg não começou o TPR 803" quando a verdade é que a lista daquela frente não subiu.
      //
      // ⚠ Sem esta checagem a frente sumiria do alerta: ela não entra em "OP sem lista" (a OP tem
      // lista) nem em "fase sem apontamento" (essa exige escopo, para não acusar o que não dá para
      // medir). Era um buraco exatamente entre as duas.
      const porArea = new Map();
      for (const m of medidas) {
        const k = m.t.area || "";
        if (!k) continue;                                // linha sem frente usa o escopo da OP toda
        (porArea.get(k) || porArea.set(k, []).get(k)).push(m);
      }
      const areaVazia = [...porArea.entries()].find(([, ms]) => ms.every((m) => !(m.av.escopoKg > 0)));
      if (areaVazia) {
        achados.push({
          titulo: `${cron.opNumero} — a frente "${areaVazia[0]}" não tem peça nenhuma na lista`,
          detalhe: `${areaVazia[1].length} linha(s) de fabricação dessa frente ficam travadas em 0% no portal. O cliente${quem} lê isso como obra parada; o que falta é a lista dessa frente.`,
          onde: "Engenharia › Listas (LE / LPC) — importar a lista dessa frente",
        });
        continue;
      }

      // ⚠ SÓ A PRIMEIRA FASE VENCIDA. As seguintes estão em zero por consequência dessa.
      const vencida = medidas.find(({ t, av }) => {
        if (!(av.escopoKg > 0)) return false;            // sem escopo é o caso de cima, não este
        if (!t.dataInicioPrevista || t.dataInicioPrevista > limite) return false;
        if (t.dataFimReal) return false;                 // já concluída na mão
        return !av.baixas?.length;                       // nenhuma baixa do Syneco: não começou
      });
      if (!vencida) continue;

      // ⚠⚠ A ÁREA VAI NO TÍTULO. A T089 tem TRÊS linhas chamadas "Preparação" — a (A) em 68%, a (C)
      // em 186% e a (B) em zero. Um alerta que diz só "Preparação" manda o Vitor abrir o cronograma,
      // ver duas delas andando e concluir que o alerta está errado. É a área que separa as frentes.
      const nome = vencida.t.area ? `${vencida.t.nome} · ${vencida.t.area}` : vencida.t.nome;
      const dias = Math.floor((Date.now() - new Date(vencida.t.dataInicioPrevista).getTime()) / DIA);
      achados.push({
        titulo: `${cron.opNumero} — "${nome}" devia ter começado há ${dias} dias e não tem nenhum apontamento`,
        detalhe: `Previsto para ${dISO(vencida.t.dataInicioPrevista)}, escopo de ${brl(vencida.av.escopoKg)} kg. O cliente${quem} vê essa linha em 0% no cronograma do portal.`,
        onde: `Planejamento › Cronogramas › ${cron.titulo}`,
      });
    }
  } catch (e) {
    achados.push({
      titulo: "Não consegui conferir o avanço dos cronogramas publicados",
      detalhe: e?.message || "falhou",
      onde: "Planejamento › Cronogramas",
    });
  }

  return { achados };
}
