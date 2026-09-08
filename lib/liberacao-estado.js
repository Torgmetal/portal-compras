import "server-only";
import { prisma } from "./prisma";
import { CAMPO } from "./gantt-pcp";
import { lerProduzidoPorSetor } from "./produzido-setor";

/* QUANTO DE CADA LIBERAÇÃO AINDA NÃO FOI AGENDADO.
 *
 * ⚠⚠ Vitor (08/09/2026): "no aviso que criamos na tela do PCP, quando a Larissa liberar as peças o
 * aviso deve sair, mas caso fique alguma peça você deve deixar no histórico o que está faltando
 * ainda". Hoje o aviso não sai nunca: são 19 liberações abertas, a mais velha de 26/08, e QUATRO
 * delas já sem nenhuma peça pendente — ficam na tela porque ninguém marca a liberação como
 * concluída, e ninguém vai lembrar de marcar.
 *
 * ⚠ O QUE FECHA O AVISO É O DIA, escolha dele: "o agendamento é feito aqui no PCP" está escrito no
 * próprio aviso. Agendou tudo, o aviso sai; o que a fábrica ainda deve produzir é assunto do Gantt.
 * Por isso o histórico continua contando o NÃO PRODUZIDO — some do aviso, não da vista.
 *
 * ⚠ Estado DERIVADO, não gravado: nada aqui escreve `status`. Liberação some do aviso porque as
 * peças ganharam dia, não porque alguém lembrou de fechá-la — foi exatamente o que falhou.
 */
export async function estadoDasLiberacoes(libs) {
  const ids = [...new Set((libs || []).flatMap((l) => (Array.isArray(l.pecaIds) ? l.pecaIds : [])))];
  const out = new Map();
  if (!ids.length) {
    // ⚠ liberação sem peça nenhuma é liberação resolvida: não há o que agendar
    for (const l of libs || []) out.set(l.id, { total: 0, semDia: 0, semPosto: 0, naoFeitas: 0 });
    return out;
  }
  const campos = {};
  for (const c of Object.values(CAMPO)) { campos[c.dia] = true; campos[c.recurso] = true; }
  const pecas = await prisma.pecaConjunto.findMany({
    where: { id: { in: ids } },
    select: { id: true, opId: true, marca: true, qte: true, ...campos },
  });
  const porId = new Map(pecas.map((p) => [p.id, p]));
  const feito = await lerProduzidoPorSetor(pecas.map((p) => ({ opId: p.opId, marca: p.marca })), Object.keys(CAMPO));

  for (const l of libs || []) {
    const setor = (l.setores || [])[0];
    const c = CAMPO[setor];
    const meus = (Array.isArray(l.pecaIds) ? l.pecaIds : []).map((i) => porId.get(i)).filter(Boolean);
    if (!c) { out.set(l.id, { total: meus.length, semDia: meus.length, semPosto: 0, naoFeitas: meus.length }); continue; }
    out.set(l.id, {
      total: meus.length,
      semDia: meus.filter((p) => !p[c.dia]).length,
      semPosto: meus.filter((p) => p[c.dia] && !p[c.recurso]).length,
      naoFeitas: meus.filter((p) => feito({ opId: p.opId, marca: p.marca }, setor) < Math.max(1, p.qte || 1)).length,
    });
  }
  return out;
}
