// Início de Produção — SÓ obras com a LPC subida (regra do Vitor). Para cada
// obra lê a janela de Fabricação/Expedição do cronograma (casado por dígitos),
// deixa o planejador definir a data por setor e valida o prazo (esforço do
// comercial ou capacidade real do Syneco + lead-time medido) contra a janela.
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import {
  leadTimeMedianas, capacidadePorSetor, calcularPrazo, diasUteis, digitosObra,
} from "@/lib/prazo-producao";
import InicioProducaoClient from "./InicioProducaoClient";

export const metadata = { title: "Workspace Torg — Planejamento · Início de Produção" };
export const dynamic = "force-dynamic";

export default async function InicioProducaoPage() {
  const user = await requireRole(["ADMIN", "PLANEJAMENTO", "COMERCIAL"]);
  const isAdmin = user.tipo === "ADMIN";

  const [lpcAgg, cronogramas, tarefas, ops, orcamentos, estudos, solicitacoes, lead, capKgDia] =
    await Promise.all([
      // Obras com LPC subida (gate) — peso = soma dos conjuntos
      prisma.pecaConjunto.groupBy({
        by: ["opNumero"],
        where: { fonte: "LPC_IMPORT", tipoPeca: "CONJUNTO" },
        _sum: { pesoTotalKg: true },
        _count: { id: true },
      }),
      prisma.cronograma.findMany({
        where: { ativo: true },
        select: { id: true, opNumero: true, titulo: true, dataInicio: true, dataFim: true, op: { select: { cliente: true, obra: true } } },
      }),
      prisma.cronogramaTarefa.findMany({
        where: { departamento: { in: ["FABRICACAO", "EXPEDICAO"] } },
        select: { cronogramaId: true, departamento: true, dataInicioPrevista: true, dataFimPrevista: true },
      }),
      prisma.oP.findMany({ select: { id: true, numero: true, cliente: true, obra: true } }),
      prisma.orcamento.findMany({ select: { id: true, opId: true } }),
      prisma.propostaEstudo.findMany({ where: { hhPorTon: { not: null } }, select: { orcamentoId: true, hhPorTon: true } }),
      prisma.solicitacaoProducao.findMany(),
      leadTimeMedianas(),
      capacidadePorSetor(),
    ]);

  // Janela fab/exp por cronograma → mapa por dígitos da obra
  const janela = {};
  for (const t of tarefas) {
    const j = (janela[t.cronogramaId] = janela[t.cronogramaId] || {});
    if (t.dataInicioPrevista) { const k = `${t.departamento}_ini`; if (!j[k] || t.dataInicioPrevista < j[k]) j[k] = t.dataInicioPrevista; }
    if (t.dataFimPrevista) { const k = `${t.departamento}_fim`; if (!j[k] || t.dataFimPrevista > j[k]) j[k] = t.dataFimPrevista; }
  }
  const cronoPorDig = {};
  for (const c of cronogramas) {
    const dig = digitosObra(c.opNumero);
    if (!dig) continue;
    const j = janela[c.id] || {};
    cronoPorDig[dig] = {
      cronogramaId: c.id, titulo: c.titulo,
      cliente: c.op?.cliente || null, obra: c.op?.obra || null,
      fabInicio: j.FABRICACAO_ini || null, fabFim: j.FABRICACAO_fim || null,
      expFim: j.EXPEDICAO_fim || c.dataFim || null,
    };
  }

  // OP por dígitos (cliente/obra/opId) e hhPorTon por dígitos (OP→orçamento→estudo)
  const opPorDig = {};
  for (const op of ops) { const d = digitosObra(op.numero); if (d && !opPorDig[d]) opPorDig[d] = op; }
  const opIdPorOrc = new Map(orcamentos.map((o) => [o.id, o.opId]));
  const numeroPorOpId = new Map(ops.map((o) => [o.id, o.numero]));
  const hhPorDig = {};
  for (const e of estudos) {
    const opId = opIdPorOrc.get(e.orcamentoId);
    const numero = opId ? numeroPorOpId.get(opId) : null;
    const d = numero ? digitosObra(numero) : null;
    if (d && hhPorDig[d] == null) hhPorDig[d] = e.hhPorTon;
  }

  const solicMap = new Map(solicitacoes.map((s) => [s.opNumero, s]));

  const obras = lpcAgg.map((a) => {
    const dig = digitosObra(a.opNumero);
    const crono = cronoPorDig[dig] || null;
    const op = opPorDig[dig] || null;
    const solic = solicMap.get(a.opNumero) || null;
    const hhComercial = hhPorDig[dig] ?? null;
    const hhManual = solic?.hhPorTonManual ?? null;
    const hhEfetivo = hhManual ?? hhComercial;
    const pesoKg = a._sum.pesoTotalKg || 0;
    const janelaDiasUteis = crono ? diasUteis(crono.fabInicio, crono.fabFim) : null;
    const prazo = calcularPrazo({ pesoKg, hhPorTon: hhEfetivo, lead, capKgDia, janelaDiasUteis });
    return {
      opNumero: a.opNumero,
      opId: op?.id || null,
      cronogramaId: crono?.cronogramaId || null,
      conjuntos: a._count.id,
      pesoKg,
      hhPorTon: hhEfetivo,
      hhComercial,
      hhManual,
      hhFonte: hhManual != null ? "manual" : hhComercial != null ? "comercial" : null,
      cliente: op?.cliente || crono?.cliente || null,
      obra: op?.obra || crono?.obra || null,
      titulo: crono?.titulo || null,
      fabInicio: crono?.fabInicio || null,
      fabFim: crono?.fabFim || null,
      expFim: crono?.expFim || null,
      prazo,
      solicitacao: solic,
    };
  }).sort((x, y) => x.opNumero.localeCompare(y.opNumero));

  return (
    <InicioProducaoClient
      obrasIniciais={JSON.parse(JSON.stringify(obras))}
      lead={lead}
      capacidade={capKgDia}
      isAdmin={isAdmin}
    />
  );
}
