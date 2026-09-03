// ─── QUAIS OBRAS APARECEM NO PCP ───────────────────────────────────────────────
//
// ⚠⚠ SÓ O QUE O PLANEJAMENTO LIBEROU. Vitor (25/08/2026): "no painel do PCP o ideal seria não
// mostrar nenhuma obra por hora para não ficar confuso, e o planejamento cria a demanda para o PCP
// indicando as prioridades e fases das obras". E de novo em 03/09/2026, ao ver a OP-103 (que a
// fábrica já tinha praticamente terminado) no meio da tela: "praticamente a tela do PCP hoje era
// para mostrar apenas essas obras que mencionei".
//
// ⚠⚠ A RÉGUA NÃO É LISTA DE OBRA — é a FILA. Obra entra quando o Planejamento libera e sai quando
// ele para de liberar; uma lista fixa envelheceria na semana seguinte. E não dá para derivar isso
// do status da peça: em 03/09/2026 havia 21 OPs "ABERTA" com peça em CORTE, e a fábrica só estava
// tocando quatro. O status da PecaConjunto só é mantido até o corte (ver torg_peca_setor_real), e
// apontamento recente também não serve: a 103 apontou hoje e mesmo assim está terminando.
//
// ⚠ É A MESMA RÉGUA DA LISTA DE OBRAS de /api/pcp/producao (`liberacoes.length > 0`). Duas réguas
// deixariam a obra aparecer numa aba e sumir na de cima, na mesma tela.
import { prisma } from "@/lib/prisma";

export const LIBERACAO_ATIVA = ["LIBERADA", "EM_PRODUCAO"];

export async function opIdsNaFilaDoPcp() {
  const [libs, mont] = await Promise.all([
    prisma.liberacaoProducao.findMany({
      where: { status: { in: LIBERACAO_ATIVA } },
      select: { opId: true },
    }),
    // ⚠ conjunto com dia de montagem marcado segura a obra na tela mesmo depois de a liberação do
    // corte fechar: a montagem ainda tem trabalho combinado ali, e some-la seria esconder o que o
    // próprio PCP programou.
    prisma.pecaConjunto.findMany({
      where: { montagemDiaProgramado: { not: null } },
      select: { opId: true },
      distinct: ["opId"],
    }),
  ]);
  const ids = new Set();
  for (const l of libs) if (l.opId) ids.add(l.opId);
  for (const m of mont) if (m.opId) ids.add(m.opId);
  return ids;
}
