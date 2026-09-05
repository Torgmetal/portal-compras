// GET /api/comercial/op/{opNumero}/listas-status — a LPC e a LE desta obra têm itens importados?
//
// ⚠ EXISTE PARA UM AVISO, e o aviso existe por um caso real: a OP-112 publicava "LPC · 0 itens"
// com botão de baixar. Sem saber que a lista não foi importada, quem monta o portal recorre a
// publicar o xlsx cru da pasta — que é exatamente como o peso item a item vaza para o cliente.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { faseDaTarefa } from "@/lib/cronograma-syneco";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req, { params }) {
  try { await requireRole(["ADMIN", "COMERCIAL", "QUALIDADE", "PLANEJAMENTO", "ENGENHARIA"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const num = String((await params)?.id || "").replace(/\D/g, "").padStart(3, "0");
  const op = await prisma.oP.findFirst({ where: { numero: num }, select: { id: true } });
  if (!op) return NextResponse.json({ lpc: 0, le: 0 });

  // ⚠⚠ A LE SE CONTA NAS PEÇAS, NÃO NA `ListaExpedicao`. São coisas diferentes: `ListaExpedicao` é o
  // registro da Lista Avançada (peso contratado, controle de embarque) e pode não existir; o que o
  // portal PUBLICA são as peças com `fonte: "LE_IMPORT"` — é o que `pecasDaLista` lê.
  //
  // Contando a tabela errada, a OP-112 acusava "Lista de Expedição sem itens importados" com 46
  // peças importadas e a seção funcionando no portal. Aviso que mente sobre um dado correto é pior
  // que aviso nenhum: manda procurar problema onde não há, e a saída "óbvia" é publicar o xlsx cru
  // da pasta — que é exatamente o que este aviso existe para evitar.
  // ⚠⚠ CERTIFICADO LISTADO SEM ARQUIVO ATRÁS. Vitor (03/09/2026), sobre o portal do Davi (OP-089):
  // "ele não está conseguindo acessar os certificados para fazer o download".
  //
  // Medido em 03/09/2026: a OP-089 lista 41 certificados e 19 não têm PDF nenhum vinculado — e não
  // era só ela (114, 094, 113 e 112 estavam em 100%). A linha vem do CMR (importação de planilha),
  // que traz material, corrida e número do certificado; o PDF é casado depois, e o que não casou
  // fica sem arquivo. No portal isso não dá erro: a linha aparece e o botão de baixar simplesmente
  // não é desenhado — o cliente vê o certificado existir e não consegue pegá-lo.
  //
  // ⚠ O AVISO É INTERNO, de propósito. No portal a regra é não declarar furo nosso (a linha fica
  // sem botão e pronto); aqui, na tela de quem publica, o número tem de aparecer antes do envio.
  const [lpc, le, certs, certsSemArquivo] = await Promise.all([
    prisma.pecaConjunto.count({ where: { opId: op.id, fonte: "LPC_IMPORT" } }),
    prisma.pecaConjunto.count({ where: { opId: op.id, fonte: "LE_IMPORT" } }),
    prisma.documentoQualidade.count({ where: { opNumero: num, ativo: true, categoria: "MATERIAL" } }),
    prisma.documentoQualidade.count({
      where: { opNumero: num, ativo: true, categoria: "MATERIAL", sharepointItemId: null, arquivoUrl: null },
    }),
  ]);
  // ⚠⚠ CRONOGRAMA VELHO É NÚMERO VELHO NA CARA DO CLIENTE. Vitor (05/09/2026), montando o portal da
  // OP-085: "os avanços lá estão todos errados". Não estavam errados por defeito de conta — estavam
  // parados: a última sincronização daquele cronograma foi **31/05**, 96 dias antes. Tudo o que o
  // cliente leria ali foi digitado em maio.
  //
  // ⚠ E tem o segundo motivo, que só se enxerga olhando os NOMES: o avanço automático do Syneco só
  // casa linha cujo nome é uma FASE (Preparação, Montagem, Solda, Jato, Acabamento, Pintura). Na 085
  // as linhas de fabricação são pacotes — "Estrutura suporte, acessos e cobertura", "Guarda corpo",
  // "Galvanização a fogo" —, então nenhuma recebe medição e o cronograma inteiro depende de alguém
  // digitar. Quem publica precisa saber disso ANTES de mandar o link.
  //
  // ⚠ O aviso é INTERNO, como o dos certificados: no portal não se declara furo nosso.
  let cronograma = null;
  try {
    const cron = await prisma.cronograma.findFirst({
      where: { ativo: true, opId: op.id },
      orderBy: { ultimoSync: "desc" },
      select: { ultimoSync: true, tarefas: { select: { nome: true, departamento: true, isSummary: true, updatedAt: true } } },
    });
    if (cron) {
      const fab = (cron.tarefas || []).filter((t) => !t.isSummary && t.departamento === "FABRICACAO");
      // ⚠ ajuste à mão TAMBÉM é atualização: `ultimoSync` só marca a importação do arquivo, e quem
      // corrige o avanço na tela não mexe nele. Sem isto, obra acertada hoje continuaria acusada de
      // estar parada há 96 dias — e o aviso viraria ruído que se aprende a ignorar.
      const atualizadoEm = (cron.tarefas || []).reduce(
        (max, t) => (t.updatedAt && t.updatedAt > max ? t.updatedAt : max),
        cron.ultimoSync,
      );
      cronograma = {
        atualizadoEm,
        dias: Math.round((Date.now() - new Date(atualizadoEm)) / 86400000),
        fabricacao: fab.length,
        medidas: fab.filter((t) => faseDaTarefa(t.nome)).length,
      };
    }
  } catch { /* o aviso é acessório: falhar aqui não pode derrubar a tela de quem publica */ }

  return NextResponse.json({ lpc, le, certs, certsSemArquivo, cronograma });
}
