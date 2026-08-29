// GET /api/engenharia/sequencia
//
// A SEQUÊNCIA do setor: as tarefas dos cronogramas, em ordem de prazo.
//
// Vitor (19/08/2026): "no portal da engenharia seria possível criarmos uma aba chamada Sequência?
// Lá teremos todas as tarefas de acordo com os cronogramas".
//
// ⚠ SÓ ENTRA CRONOGRAMA COM TAREFAS ENVIADAS (`tarefasEnviadasEm`). Enquanto o Planejamento não
// clicar em "Enviar tarefas", as linhas são rascunho — e rascunho publicado é pior que nada: o
// setor se organiza por uma tarefa que vai mudar e depois não confia mais na tela. O envio é
// deliberado justamente porque o modelo de cronograma não serve igual pra toda obra.
//
// Ordena por PRAZO, não por OP: a pergunta do setor é "o que eu faço primeiro", e isso atravessa
// as obras. Atrasada primeiro, depois o que vence antes.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { etapaDaTarefa, PROXIMA_ETAPA, emEspera } from "@/lib/etapa-projeto";
import { evidenciasDasTarefas } from "@/lib/etapa-evidencia";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(req) {
  try {
    await requireRole(["ADMIN", "ENGENHARIA", "PLANEJAMENTO", "PCP", "PRODUCAO", "COMERCIAL", "COMPRAS", "EXPEDICAO"]);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  const url = new URL(req.url);
  const setor = url.searchParams.get("setor") || "ENGENHARIA";
  const incluirConcluidas = url.searchParams.get("concluidas") === "1";

  const tarefas = await prisma.cronogramaTarefa.findMany({
    where: {
      isSummary: false,
      departamento: setor,
      dataFimPrevista: { not: null },
      ...(incluirConcluidas ? {} : { percentualRealizado: { lt: 100 } }),
      // ⚠⚠ O PORTÃO SAIU. Exigir `tarefasEnviadasEm` (o clique do Planejamento em "Enviar tarefas")
      // deixava a tela VAZIA: nenhum cronograma tem esse clique, e as 52 tarefas de Engenharia em
      // aberto — 50 delas vencidas — não apareciam para quem tinha de executá-las. A intenção era
      // não publicar rascunho; o efeito foi não publicar nada. Cronograma ATIVO já é o filtro certo,
      // e a tela marca o que ainda não foi formalmente liberado.
      cronograma: { ativo: true },
    },
    select: {
      id: true, nome: true, area: true, departamento: true,
      dataInicioPrevista: true, dataFimPrevista: true,
      dataInicioReal: true, dataFimReal: true,
      percentualRealizado: true, duracaoDias: true,
      antecessoraIds: true, motivoBloqueio: true, observacao: true,
      cronograma: {
        select: {
          id: true, titulo: true, opNumero: true, tarefasEnviadasEm: true, ativo: true,
          op: { select: { id: true, numero: true, cliente: true, obra: true } },
        },
      },
    },
  });

  // Antecessora ainda aberta = a tarefa está BLOQUEADA. É o que separa "posso começar" de "estou
  // esperando", e sem isso a sequência viraria só uma lista por data.
  const idsAntecessoras = [...new Set(tarefas.flatMap((t) => t.antecessoraIds || []))];
  const antecessoras = idsAntecessoras.length
    ? await prisma.cronogramaTarefa.findMany({
        where: { id: { in: idsAntecessoras } },
        select: { id: true, nome: true, departamento: true, percentualRealizado: true, dataFimPrevista: true },
      })
    : [];
  const porId = new Map(antecessoras.map((a) => [a.id, a]));

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const lista = tarefas.map((t) => {
    const fim = t.dataFimPrevista ? new Date(t.dataFimPrevista) : null;
    const concluida = (t.percentualRealizado || 0) >= 100;
    const diasParaPrazo = fim ? Math.round((fim - hoje) / 86400000) : null;
    const pendentes = (t.antecessoraIds || [])
      .map((id) => porId.get(id))
      .filter((a) => a && (a.percentualRealizado || 0) < 100)
      .map((a) => ({ nome: a.nome, setor: a.departamento }));

    return {
      id: t.id,
      nome: t.nome,
      area: t.area || null,
      setor: t.departamento,
      opNumero: t.cronograma?.op?.numero || t.cronograma?.opNumero || null,
      opId: t.cronograma?.op?.id || null,
      cliente: t.cronograma?.op?.cliente || null,
      obra: t.cronograma?.op?.obra || t.cronograma?.titulo || null,
      cronogramaId: t.cronograma?.id || null,
      inicio: t.dataInicioPrevista, fim: t.dataFimPrevista,
      inicioReal: t.dataInicioReal, fimReal: t.dataFimReal,
      percentual: t.percentualRealizado || 0,
      duracaoDias: t.duracaoDias,
      observacao: t.observacao || null,
      motivoBloqueio: t.motivoBloqueio || null,
      concluida,
      // ⚠⚠ ESPERA NÃO É ATRASO. Vitor (29/08/2026): "as tarefas em hold não podemos deixar como
      // atrasadas, pois isso é indefinição do projeto". A tarefa com motivo de bloqueio e sem
      // liberação sai do vermelho e vai para um grupo próprio — são 17 das 52, um terço do que a
      // Engenharia aparecia devendo. Os dias continuam contando, mas como espera de quem deve a
      // resposta, não como atraso do setor.
      emEspera: !concluida && emEspera(t),
      atrasada: !concluida && !emEspera(t) && diasParaPrazo != null && diasParaPrazo < 0,
      diasParaPrazo,
      diasEmEspera: emEspera(t) && diasParaPrazo != null && diasParaPrazo < 0 ? -diasParaPrazo : 0,
      // a etapa da esteira do projeto (Modelo → Aprovação → Detalhamento → Diagrama → Listas →
      // Liberação) e o que vem depois. Deduzida do nome enquanto não existe o campo.
      etapa: etapaDaTarefa(t.nome),
      proximaEtapa: PROXIMA_ETAPA[etapaDaTarefa(t.nome)] || null,
      // ainda não formalmente liberada pelo Planejamento (o antigo portão, agora só um aviso)
      naoLiberada: !t.cronograma?.tarefasEnviadasEm,
      // esperando outro setor terminar
      bloqueada: !concluida && pendentes.length > 0,
      esperando: pendentes,
    };
  });

  // ⚠⚠ A EVIDÊNCIA DO PORTAL. Vitor (29/08/2026): "mas LE e LPC não são enviadas por e-mail" — a
  // etapa de listas se comprova AQUI DENTRO, na importação, não na caixa de entrada. A tarefa "LE e
  // LPC" da OP-115 estava em 0% com as duas listas importadas desde 25/08.
  const evid = await evidenciasDasTarefas(lista);
  for (const t of lista) {
    const e = evid.get(t.id);
    if (e) t.evidencia = { ...e, etapa: "LISTAS" };
  }

  // atrasada → a fazer → aguardando outro setor → em espera do cliente → concluída;
  // dentro de cada grupo, o que vence antes
  const peso = (t) => (t.concluida ? 4 : t.emEspera ? 3 : t.atrasada ? 0 : t.bloqueada ? 2 : 1);
  lista.sort((a, b) => peso(a) - peso(b) || new Date(a.fim || 0) - new Date(b.fim || 0));

  return NextResponse.json({
    setor,
    tarefas: lista,
    resumo: {
      total: lista.length,
      atrasadas: lista.filter((t) => t.atrasada).length,
      liberadas: lista.filter((t) => !t.concluida && !t.atrasada && !t.bloqueada).length,
      bloqueadas: lista.filter((t) => t.bloqueada).length,
      emEspera: lista.filter((t) => t.emEspera).length,
      concluidas: lista.filter((t) => t.concluida).length,
    },
    geradoEm: new Date().toISOString(),
  });
}
