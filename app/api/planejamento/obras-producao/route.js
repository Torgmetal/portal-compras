// GET /api/planejamento/obras-producao — solicitações enviadas (em acompanhamento),
// com o status de cada setor cruzando a DATA NECESSÁRIA (datasSetor) com o
// APONTAMENTO do Syneco: setor que passou da data sem apontar = ATRASADO.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { SETORES_SOLICITACAO } from "@/lib/solicitacao-producao-const";

// setor da solicitação → nome no Syneco (EXPEDICAO não tem setor no Syneco)
const SYN = { CORTE: "Corte", MONTAGEM: "Montagem", SOLDA: "Solda", ACABAMENTO: "Acabamento", JATO: "Jato", PINTURA: "Pintura" };

export async function GET() {
  try {
    await requireRole(["ADMIN", "PLANEJAMENTO", "COMERCIAL", "PCP", "PRODUCAO"]);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

  const solics = await prisma.solicitacaoProducao.findMany({
    where: { status: { in: ["SOLICITADA", "PROGRAMADA", "EM_PRODUCAO", "ATRASADA"] } },
    orderBy: [{ dataEntrega: "asc" }, { opNumero: "asc" }],
  });
  if (!solics.length) return NextResponse.json({ obras: [], hoje });

  const opNumeros = [...new Set(solics.map((s) => s.opNumero))];

  const [conjuntos, ops] = await Promise.all([
    prisma.pecaConjunto.findMany({
      where: { fonte: "LPC_IMPORT", tipoPeca: "CONJUNTO", opNumero: { in: opNumeros } },
      select: { opNumero: true, marca: true, qte: true, status: true },
    }),
    prisma.oP.findMany({ where: { numero: { in: opNumeros } }, select: { numero: true, cliente: true, obra: true } }),
  ]);

  // Por obra: marca→op, total de unidades e contagem por pipeline.
  // (Corte é apontado por CROQUI, não por conjunto — então corte/expedição saem
  // do pipeline dos conjuntos; montagem→pintura saem do apontamento do Syneco.)
  const marcaToOp = {};
  const porOp = {};
  for (const c of conjuntos) {
    marcaToOp[c.marca] = c.opNumero;
    const o = (porOp[c.opNumero] = porOp[c.opNumero] || { totalQte: 0, conjCount: 0, pastCorte: 0, expCount: 0 });
    o.totalQte += c.qte || 0;
    o.conjCount += 1;
    if (!["PENDENTE", "CORTE"].includes(c.status)) o.pastCorte += 1;
    if (c.status === "EXPEDIDO") o.expCount += 1;
  }

  const marcas = Object.keys(marcaToOp);
  const mesRows = marcas.length
    ? await prisma.mesOrdem.findMany({
        where: { setor: { in: Object.values(SYN) }, item: { in: marcas } },
        select: { setor: true, item: true, produzidoUn: true },
      })
    : [];

  // produzido por (opNumero, setorEnum)
  const synToEnum = Object.fromEntries(Object.entries(SYN).map(([k, v]) => [v, k]));
  const produzido = {};
  for (const r of mesRows) {
    const op = marcaToOp[r.item];
    const setorEnum = synToEnum[r.setor];
    if (!op || !setorEnum) continue;
    const k = `${op}|${setorEnum}`;
    produzido[k] = (produzido[k] || 0) + (r.produzidoUn || 0);
  }

  const opInfo = new Map(ops.map((o) => [o.numero, o]));

  const obras = solics.map((s) => {
    const o = porOp[s.opNumero] || { totalQte: 0, conjCount: 0, pastCorte: 0, expCount: 0 };
    const total = o.totalQte;
    const ds = s.datasSetor || {};
    const setores = SETORES_SOLICITACAO.map((setor) => {
      const data = ds[setor] || null;
      let prod = null, concluido, apontado;
      if (setor === "EXPEDICAO") {
        concluido = o.conjCount > 0 && o.expCount === o.conjCount;
        apontado = o.expCount > 0;
      } else if (setor === "CORTE") {
        // corte é apontado por croqui → usa o pipeline dos conjuntos
        concluido = o.conjCount > 0 && o.pastCorte === o.conjCount;
        apontado = o.pastCorte > 0;
      } else {
        prod = produzido[`${s.opNumero}|${setor}`] || 0;
        apontado = prod > 0;
        concluido = total > 0 && prod >= total;
      }
      let situacao = "SEM_DATA";
      if (data) {
        if (concluido) situacao = "CONCLUIDO";
        else if (data < hoje && !apontado) situacao = "ATRASADO";
        else if (apontado) situacao = "EM_ANDAMENTO";
        else situacao = "A_INICIAR";
      } else if (concluido) {
        situacao = "CONCLUIDO";
      } else if (apontado) {
        situacao = "EM_ANDAMENTO";
      }
      return { setor, data, prod, total: setor === "EXPEDICAO" ? null : total, situacao };
    });

    const atrasados = setores.filter((x) => x.situacao === "ATRASADO");
    const op = opInfo.get(s.opNumero);
    // status efetivo: reflete a produção real (não fica preso em Solicitada)
    const statusEfetivo = s.status === "CONCLUIDA" || (o.conjCount > 0 && o.expCount === o.conjCount)
      ? "CONCLUIDA"
      : o.pastCorte > 0 ? "EM_PRODUCAO" : s.status;
    return {
      id: s.id,
      opNumero: s.opNumero,
      cliente: op?.cliente || null,
      obra: op?.obra || null,
      status: statusEfetivo,
      dataEntrega: s.dataEntrega,
      prioridade: s.prioridade,
      setores,
      atrasados: atrasados.map((x) => x.setor),
      aderente: atrasados.length === 0,
    };
  });

  return NextResponse.json({ obras, hoje });
}
