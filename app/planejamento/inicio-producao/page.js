// Início de Produção — o Planejamento lê a janela de Fabricação/Expedição do
// cronograma (necessidade do cliente) e define a data necessária por setor.
// Ao salvar, vira solicitação que aparece no PMP e no painel da Produção.
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import InicioProducaoClient from "./InicioProducaoClient";

export const metadata = { title: "Workspace Torg — Planejamento · Início de Produção" };
export const dynamic = "force-dynamic";

export default async function InicioProducaoPage() {
  await requireRole(["ADMIN", "PLANEJAMENTO", "COMERCIAL"]);

  const [cronogramas, tarefas, solicitacoes] = await Promise.all([
    prisma.cronograma.findMany({
      where: { ativo: true },
      select: {
        id: true, opNumero: true, opId: true, titulo: true,
        dataInicio: true, dataFim: true,
        op: { select: { numero: true, cliente: true, obra: true } },
      },
      orderBy: { dataFim: "asc" },
    }),
    prisma.cronogramaTarefa.findMany({
      where: { departamento: { in: ["FABRICACAO", "EXPEDICAO"] } },
      select: { cronogramaId: true, departamento: true, dataInicioPrevista: true, dataFimPrevista: true },
    }),
    prisma.solicitacaoProducao.findMany(),
  ]);

  // Janela de fabricação/expedição por cronograma
  const janela = {};
  for (const t of tarefas) {
    const j = (janela[t.cronogramaId] = janela[t.cronogramaId] || {});
    const dep = t.departamento;
    if (t.dataInicioPrevista) {
      const k = `${dep}_ini`;
      if (!j[k] || t.dataInicioPrevista < j[k]) j[k] = t.dataInicioPrevista;
    }
    if (t.dataFimPrevista) {
      const k = `${dep}_fim`;
      if (!j[k] || t.dataFimPrevista > j[k]) j[k] = t.dataFimPrevista;
    }
  }

  const solicMap = new Map(solicitacoes.map((s) => [s.opNumero, s]));

  const obras = cronogramas.map((c) => {
    const j = janela[c.id] || {};
    return {
      cronogramaId: c.id,
      opNumero: c.opNumero,
      opId: c.opId || null,
      titulo: c.titulo,
      cliente: c.op?.cliente || null,
      obra: c.op?.obra || null,
      cronoInicio: c.dataInicio,
      cronoFim: c.dataFim,
      fabInicio: j.FABRICACAO_ini || null,
      fabFim: j.FABRICACAO_fim || null,
      expInicio: j.EXPEDICAO_ini || null,
      expFim: j.EXPEDICAO_fim || null,
      solicitacao: solicMap.get(c.opNumero) || null,
    };
  });

  return <InicioProducaoClient obrasIniciais={JSON.parse(JSON.stringify(obras))} />;
}
